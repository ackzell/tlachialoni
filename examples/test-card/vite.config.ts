import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

/**
 * Serves the pages the frame demo embeds. Registered before Vite's own
 * middlewares so the SPA fallback never answers these paths (which would send
 * `index.html` out with a framing policy attached and block the whole demo).
 *
 * These are guest pages for the frame status demo (specs/028), not app code.
 */
function frameDemoEndpoints() {
  return {
    name: "test-card-frame-endpoints",
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: { url?: string },
            res: {
              setHeader: (name: string, value: string) => void;
              end: (body: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];

        if (url === "/frames/refused") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
          res.end(page("Refused by frame-ancestors", "This page refuses every ancestor."));
          return;
        }

        if (url === "/frames/xfo") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("X-Frame-Options", "DENY");
          res.end(page("Refused by X-Frame-Options", "This page sets X-Frame-Options: DENY."));
          return;
        }

        if (url === "/frames/live") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(page("Framed successfully", "This page allows framing."));
          return;
        }

        next();
      });
    },
  };
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; display: grid; place-content: center; gap: .5rem;
         min-height: 100vh; background: #101014; color: #e8e8ea;
         font: 14px/1.5 system-ui, sans-serif; text-align: center; }
  h1 { margin: 0; font-size: 1rem; }
  p { margin: 0; color: #9a9aa2; font-size: .85rem; }
</style></head>
<body><h1>${title}</h1><p>${body}</p></body></html>`;
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // The Tlachialoni renderer is a second Vite server rooted at this repository.
  // Give the example its own optimize cache so the two servers cannot replace
  // each other's dependency files and return 504 Outdated Optimize Dep.
  cacheDir: fileURLToPath(new URL("../../node_modules/.vite-test-card", import.meta.url)),
  plugins: [vue(), frameDemoEndpoints()],
  server: {
    port: 3000,
    strictPort: false,
  },
});
