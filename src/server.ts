import * as http from "http";
import { URL } from "url";

export interface CallbackResult {
  code: string;
  state: string;
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Authorization Successful</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f0f0">
<div style="text-align:center;padding:2rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
<h1 style="color:#22c55e">Authorization Successful</h1>
<p>You can close this window and return to your terminal.</p>
</div></body></html>`;

const ERROR_HTML = `<!DOCTYPE html>
<html><head><title>Authorization Failed</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f0f0">
<div style="text-align:center;padding:2rem;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
<h1 style="color:#ef4444">Authorization Failed</h1>
<p>An error occurred during authorization. Check the terminal for details.</p>
</div></body></html>`;

export function startCallbackServer(
  port: number,
  timeoutMs: number = 120_000
): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(ERROR_HTML);
        cleanup();
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `Authorization error: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`
            )
          );
        }
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);
      cleanup();

      if (!settled) {
        settled = true;
        resolve({ code, state });
      }
    });

    const timeout = setTimeout(() => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error("Timed out waiting for authorization callback (120s)"));
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      server.close();
    }

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        if (err.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${port} is already in use. Try a different port with --callback-port`
            )
          );
        } else {
          reject(new Error(`Failed to start callback server: ${err.message}`));
        }
      }
    });

    server.listen(port, "127.0.0.1", () => {
      // Server is ready
    });
  });
}
