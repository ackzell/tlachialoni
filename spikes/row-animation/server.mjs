/**
 * Static server for the row-animation spike harness.
 *
 * Serves spikes/row-animation/ plus the app's real row model and Vue from
 * node_modules, so candidate pages exercise `buildRows` exactly as the app does
 * (spec FR-001).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

/** Maps a request path to a file on disk, or null. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean === "/" || clean === "/index.html") return path.join(here, "index.html");
  // /app/* -> repo source tree (the real row model)
  if (clean.startsWith("/app/")) return path.join(repoRoot, clean.slice("/app/".length));
  // /vue -> Vue ESM build from node_modules
  if (clean === "/vue.js") return path.join(repoRoot, "node_modules/vue/dist/vue.esm-browser.js");
  return path.join(here, clean.replace(/^\//, ""));
}

export function createServer() {
  return http.createServer((req, res) => {
    const file = resolveFile(req.url ?? "/");
    if (!file) {
      res.writeHead(404).end("not found");
      return;
    }
    fs.readFile(file, async (error, data) => {
      if (error) {
        res.writeHead(404).end("not found");
        return;
      }
      // The app's real modules are TypeScript; Chromium can only run JS.
      if (file.endsWith(".ts")) {
        try {
          const { code } = await transform(String(data), {
            loader: "ts",
            format: "esm",
            target: "es2022",
          });
          // The app uses the "@shared/*" alias; point it at the served source.
          const resolved = code.replace(
            /(["'])@shared\/([^"']+)\1/g,
            (_match, quote, rest) => `${quote}/app/src/shared/${rest}.ts${quote}`,
          );
          res.writeHead(200, { "content-type": "text/javascript" });
          res.end(resolved);
        } catch (transformError) {
          res.writeHead(500).end(String(transformError));
        }
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      });
      res.end(data);
    });
  });
}

export function listen(port = 0) {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await listen(Number(process.env.PORT ?? 4330));
  process.stdout.write(`spike harness on ${url}\n`);
}
