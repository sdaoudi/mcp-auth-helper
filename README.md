# mcp-auth-helper

> ⚠️ **Temporary workaround** — This tool exists because Figma's MCP server currently uses an OAuth client allowlist that doesn't include OpenCode. Once Figma adds OpenCode to their allowlist (tracked in [sst/opencode#5636](https://github.com/sst/opencode/issues/5636) and [sst/opencode#5583](https://github.com/sst/opencode/issues/5583)), this tool will no longer be needed.

A standalone CLI tool that authenticates with remote MCP servers that use OAuth client allowlists (e.g., Figma MCP). Once authenticated, tokens are saved to `~/.local/share/opencode/mcp-auth.json` and work with vanilla OpenCode — no fork needed.

## Problem

Some MCP servers (like Figma) only allow known OAuth clients to register. OpenCode registers as "OpenCode" and gets rejected because it's not on the allowlist. This tool registers as "Codex" (which is on the allowlist) and saves the tokens in the format OpenCode expects.

This approach is based on [this workaround commit](https://github.com/connorads/opencode/commit/cbc7df7ceab07780934e2fc8825ad40147dadbc8) by [@connorads](https://github.com/connorads), packaged as a standalone tool so you don't need to fork OpenCode.

## Installation

```bash
git clone https://github.com/sdaoudi/mcp-auth-helper.git
cd mcp-auth-helper
npm install
npm run build
```

## Usage

### Figma MCP

```bash
node dist/index.js auth figma --url https://mcp.figma.com/mcp
```

This will:
1. Discover OAuth endpoints from the Figma MCP server
2. Register as a "Codex" OAuth client (which is on Figma's allowlist)
3. Open your browser to authorize
4. Save tokens to `~/.local/share/opencode/mcp-auth.json`

After authenticating, add the Figma MCP server to your OpenCode config (`opencode.json`) and it will pick up the saved tokens automatically:

```json
{
  "mcp": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    }
  }
}
```

### Options

```
--url <url>             MCP server URL (required)
--client-name <name>    OAuth client name (default: "Codex")
--callback-port <port>  Local callback port (default: 19876)
--output <path>         Token output path (default: ~/.local/share/opencode/mcp-auth.json)
```

### Multiple Servers

You can authenticate with multiple MCP servers. Each one is saved as a separate entry in `mcp-auth.json`:

```bash
node dist/index.js auth figma --url https://mcp.figma.com/mcp
node dist/index.js auth another --url https://another-mcp.example.com/mcp
```

## How It Works

1. Discovers the server's OAuth endpoints via RFC 8414 (`/.well-known/oauth-authorization-server`)
2. Registers a dynamic OAuth client with the name "Codex" (configurable)
3. Initiates an OAuth authorization code flow with PKCE (S256)
4. Starts a local HTTP server to receive the callback
5. Exchanges the authorization code for access/refresh tokens
6. Saves everything to `~/.local/share/opencode/mcp-auth.json` in OpenCode's expected format

## Requirements

- Node.js 18+

## Credits

Based on the [workaround commit](https://github.com/connorads/opencode/commit/cbc7df7ceab07780934e2fc8825ad40147dadbc8) by [@connorads](https://github.com/connorads), repackaged as a standalone CLI tool.

Related issues:
- [sst/opencode#5636](https://github.com/sst/opencode/issues/5636) — MCP OAuth allowlist support
- [sst/opencode#5583](https://github.com/sst/opencode/issues/5583) — Figma MCP authentication

## License

MIT
