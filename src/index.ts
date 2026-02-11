import * as crypto from "crypto";
import { exec } from "child_process";
import {
  discoverOAuthEndpoints,
  registerClient,
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
} from "./oauth.js";
import { startCallbackServer } from "./server.js";
import {
  readAuthFile,
  writeAuthFile,
  getDefaultPath,
  type AuthEntry,
} from "./storage.js";

function usage(): never {
  console.log(`Usage: mcp-auth-helper auth <server-name> --url <mcp-server-url>

Options:
  --url <url>             MCP server URL (required)
  --client-name <name>    OAuth client name (default: "Codex")
  --callback-port <port>  Local callback port (default: 19876)
  --output <path>         Token output path (default: ~/.opencode/mcp-auth.json)
  --help                  Show this help message`);
  process.exit(1);
}

function parseArgs(args: string[]): {
  serverName: string;
  url: string;
  clientName: string;
  callbackPort: number;
  output: string;
} {
  // Expect: auth <server-name> --url <url> [options]
  if (args.length < 2 || args[0] !== "auth") {
    usage();
  }

  const serverName = args[1];
  let url = "";
  let clientName = "Codex";
  let callbackPort = 19876;
  let output = getDefaultPath();

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        url = args[++i] || "";
        break;
      case "--client-name":
        clientName = args[++i] || "Codex";
        break;
      case "--callback-port":
        callbackPort = parseInt(args[++i] || "19876", 10);
        break;
      case "--output":
        output = args[++i] || output;
        break;
      case "--help":
        usage();
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        usage();
    }
  }

  if (!url) {
    console.error("Error: --url is required");
    usage();
  }

  if (isNaN(callbackPort) || callbackPort < 1 || callbackPort > 65535) {
    console.error("Error: --callback-port must be a valid port number");
    process.exit(1);
  }

  return { serverName, url, clientName, callbackPort, output };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;

  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || echo "Open this URL in your browser:"`;
  }

  exec(cmd, (err) => {
    if (err) {
      // Browser open failed silently — URL is already printed to console
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
  }

  const config = parseArgs(args);
  const redirectUri = `http://localhost:${config.callbackPort}/callback`;

  console.log(`Authenticating "${config.serverName}" with ${config.url}`);
  console.log();

  // Step 1: Read existing auth file
  const authData = readAuthFile(config.output);

  // Step 2: Discover OAuth endpoints
  console.log("Discovering OAuth endpoints...");
  const endpoints = await discoverOAuthEndpoints(config.url);
  console.log(`  Authorization: ${endpoints.authorizationEndpoint}`);
  console.log(`  Token:         ${endpoints.tokenEndpoint}`);
  if (endpoints.registrationEndpoint) {
    console.log(`  Registration:  ${endpoints.registrationEndpoint}`);
  }
  console.log();

  // Step 3: Register dynamic client
  if (!endpoints.registrationEndpoint) {
    throw new Error(
      "Server does not support dynamic client registration (no registration_endpoint in metadata)"
    );
  }

  console.log(`Registering as "${config.clientName}"...`);
  const client = await registerClient(
    endpoints.registrationEndpoint,
    redirectUri,
    config.clientName
  );
  console.log(`  Client ID: ${client.clientId}`);
  console.log();

  // Step 4: Generate PKCE
  const pkce = generatePKCE();
  const state = crypto.randomUUID();

  // Save intermediate state (codeVerifier, clientInfo) in case flow is interrupted
  const entry: AuthEntry = {
    clientInfo: {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      clientIdIssuedAt: client.clientIdIssuedAt,
      clientSecretExpiresAt: client.clientSecretExpiresAt,
    },
    codeVerifier: pkce.codeVerifier,
    oauthState: state,
    serverUrl: config.url,
  };
  authData[config.serverName] = entry;
  writeAuthFile(authData, config.output);

  // Step 5: Build authorization URL and open browser
  const authUrl = buildAuthorizationUrl(
    endpoints.authorizationEndpoint,
    client.clientId,
    redirectUri,
    pkce.codeChallenge,
    state
  );

  console.log("Opening browser for authorization...");
  console.log();
  console.log(`  ${authUrl}`);
  console.log();
  console.log("If the browser doesn't open, copy the URL above and open it manually.");
  console.log("Waiting for authorization callback (timeout: 120s)...");
  console.log();

  openBrowser(authUrl);

  // Step 6: Start callback server and wait for code
  const callback = await startCallbackServer(config.callbackPort);

  if (callback.state !== state) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  // Step 7: Exchange code for tokens
  console.log("Exchanging authorization code for tokens...");
  const tokenResponse = await exchangeCodeForTokens(
    endpoints.tokenEndpoint,
    callback.code,
    pkce.codeVerifier,
    client.clientId,
    redirectUri
  );

  // Step 8: Save tokens
  const now = Math.floor(Date.now() / 1000);
  entry.tokens = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_in
      ? now + tokenResponse.expires_in
      : undefined,
    scope: tokenResponse.scope,
  };
  // Clear transient PKCE state
  delete entry.codeVerifier;
  delete entry.oauthState;

  authData[config.serverName] = entry;
  writeAuthFile(authData, config.output);

  // Step 9: Success
  console.log();
  console.log(`Authentication successful!`);
  console.log(`  Server:  ${config.serverName}`);
  console.log(`  Tokens saved to: ${config.output}`);
  console.log();
  console.log(
    "You can now use this MCP server with OpenCode — no additional configuration needed."
  );
}

main().catch((err) => {
  console.error();
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
