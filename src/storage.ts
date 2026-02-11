import * as fs from "fs";
import * as path from "path";

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface ClientInfo {
  clientId: string;
  clientSecret?: string;
  clientIdIssuedAt?: number;
  clientSecretExpiresAt?: number;
}

export interface AuthEntry {
  tokens?: Tokens;
  clientInfo?: ClientInfo;
  codeVerifier?: string;
  oauthState?: string;
  serverUrl?: string;
}

export type AuthFile = Record<string, AuthEntry>;

const DEFAULT_PATH = path.join(
  process.env.XDG_DATA_HOME ||
    path.join(process.env.HOME || process.env.USERPROFILE || "~", ".local", "share"),
  "opencode",
  "mcp-auth.json"
);

export function getDefaultPath(): string {
  return DEFAULT_PATH;
}

export function readAuthFile(filePath: string = DEFAULT_PATH): AuthFile {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as AuthFile;
  } catch {
    return {};
  }
}

export function writeAuthFile(
  data: AuthFile,
  filePath: string = DEFAULT_PATH
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
}
