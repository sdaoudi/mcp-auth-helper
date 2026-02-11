# mcp-auth-helper

## Goal

A standalone CLI tool that authenticates with remote MCP servers that use OAuth client allowlists (e.g., Figma MCP). Once authenticated, tokens are saved to `~/.opencode/mcp-auth.json` and work with vanilla OpenCode — no fork needed.

## Problem

Some MCP servers (like Figma) only allow known OAuth clients to register. OpenCode registers as "OpenCode" and gets rejected. The workaround is to register as "Codex" (which is on the allowlist).

## Implementation

### Tech Stack
- **Runtime:** Node.js (no bun dependency)
- **Language:** TypeScript, compiled to JS
- **Dependencies:** Minimal — only what's needed for OAuth + HTTP server
- **Package manager:** npm

### CLI Interface

```bash
npx mcp-auth-helper auth <server-name> --url <mcp-server-url>
# or after global install:
mcp-auth-helper auth <server-name> --url <mcp-server-url>
```

Options:
- `--url <url>` — MCP server URL (required)
- `--client-name <name>` — OAuth client name to use (default: "Codex")
- `--callback-port <port>` — Local callback port (default: 19876)
- `--output <path>` — Token output path (default: `~/.opencode/mcp-auth.json`)

### OAuth Flow

1. Read existing `mcp-auth.json` if it exists
2. Discover OAuth endpoints from the MCP server (RFC 8414 / `.well-known/oauth-authorization-server`)
3. Register as dynamic OAuth client with metadata:
   ```json
   {
     "redirect_uris": ["http://localhost:19876/callback"],
     "client_name": "Codex",
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none"
   }
   ```
4. Generate PKCE code_verifier + code_challenge
5. Open browser to authorization URL
6. Start local HTTP server on port 19876, listen for `/callback`
7. Exchange auth code for tokens
8. Save tokens + client info to `~/.opencode/mcp-auth.json` (merge with existing entries)
9. Print success message and exit

### Token Storage Format

Match OpenCode's expected format in `~/.opencode/mcp-auth.json`. Inspect the MCP SDK's `NodeOAuthClientProvider` to match the exact structure. The file stores per-server entries keyed by server URL hash or name.

### Error Handling
- Timeout after 120 seconds if no callback received
- Clear error messages for common issues (port in use, server unreachable, etc.)
- Graceful cleanup of HTTP server

## File Structure

```
mcp-auth-helper/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # CLI entry point
│   ├── oauth.ts          # OAuth flow logic
│   ├── server.ts         # Local callback HTTP server
│   └── storage.ts        # Token storage read/write
└── bin/
    └── mcp-auth-helper   # CLI bin entry
```

## README

Include:
- What problem it solves
- Installation (`npm install -g mcp-auth-helper` or `npx`)
- Usage examples (especially Figma MCP)
- How it works (brief)
- Credit to connorads/opencode workaround
