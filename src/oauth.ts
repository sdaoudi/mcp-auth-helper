import * as crypto from "crypto";

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type: string;
}

async function fetchJSON(url: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} from ${url}${body ? `: ${body}` : ""}`
    );
  }
  return res.json();
}

export async function discoverOAuthEndpoints(
  serverUrl: string
): Promise<OAuthEndpoints> {
  const base = new URL(serverUrl);

  // Try RFC 8414 well-known first
  const wellKnownUrl = new URL(
    "/.well-known/oauth-authorization-server",
    base.origin
  ).href;

  try {
    const metadata = (await fetchJSON(wellKnownUrl)) as Record<string, unknown>;
    const authorizationEndpoint = metadata.authorization_endpoint as
      | string
      | undefined;
    const tokenEndpoint = metadata.token_endpoint as string | undefined;

    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new Error(
        "OAuth metadata missing required fields (authorization_endpoint, token_endpoint)"
      );
    }

    return {
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint: metadata.registration_endpoint as
        | string
        | undefined,
    };
  } catch (err) {
    throw new Error(
      `Failed to discover OAuth endpoints from ${wellKnownUrl}: ${err instanceof Error ? err.message : err}`
    );
  }
}

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string
): Promise<RegisteredClient> {
  const body = {
    redirect_uris: [redirectUri],
    client_name: clientName,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };

  const result = (await fetchJSON(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as Record<string, unknown>;

  const clientId = result.client_id as string | undefined;
  if (!clientId) {
    throw new Error("Client registration did not return a client_id");
  }

  return {
    clientId,
    clientSecret: result.client_secret as string | undefined,
    clientIdIssuedAt: result.client_id_issued_at as number | undefined,
    clientSecretExpiresAt: result.client_secret_expires_at as
      | number
      | undefined,
  };
}

export function generatePKCE(): PKCEPair {
  // Generate 32 random bytes, base64url encode for code_verifier
  const verifierBytes = crypto.randomBytes(32);
  const codeVerifier = verifierBytes
    .toString("base64url")
    .replace(/[^a-zA-Z0-9\-._~]/g, "");

  // SHA-256 hash, base64url encode for code_challenge
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = hash.toString("base64url");

  return { codeVerifier, codeChallenge };
}

export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.href;
}

export async function exchangeCodeForTokens(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  });

  const result = (await fetchJSON(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })) as Record<string, unknown>;

  const accessToken = result.access_token as string | undefined;
  if (!accessToken) {
    throw new Error("Token response missing access_token");
  }

  return {
    access_token: accessToken,
    refresh_token: result.refresh_token as string | undefined,
    expires_in: result.expires_in as number | undefined,
    scope: result.scope as string | undefined,
    token_type: (result.token_type as string) || "Bearer",
  };
}
