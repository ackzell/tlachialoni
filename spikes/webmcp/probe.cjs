/**
 * WebMCP probe. Runs the real Electron binary with a WebMCP switch and reports
 * whether a localhost page exposes `document.modelContext`.
 *
 * Usage:
 *   electron spikes/webmcp/probe.cjs [features|experimental]
 *
 *   features      (default)  --enable-features=WebMCP,DevToolsWebMCPSupport
 *   experimental             --enable-experimental-web-platform-features
 *
 * A raw `data:` URL is not a secure context, so the probe serves a page from
 * `127.0.0.1` (localhost is a secure context). WebMCP is only exposed in a
 * secure context.
 */

const { app, BrowserWindow } = require("electron");
const http = require("node:http");

const recipe = process.argv[2] ?? "features";

// The switch must be appended before the app is ready.
if (recipe === "experimental") {
  app.commandLine.appendSwitch("enable-experimental-web-platform-features");
} else {
  app.commandLine.appendSwitch("enable-features", "WebMCP,DevToolsWebMCPSupport");
}

const HTML = '<!doctype html><meta charset="utf-8"><title>webmcp probe</title>';

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(HTML);
});

// Fail loudly instead of hanging if the load never settles.
const timeout = setTimeout(() => {
  process.stderr.write('{"error":"probe timed out"}\n');
  app.exit(1);
}, 15000);

function check() {
  return (
    "JSON.stringify({" +
    '"documentModelContext": "modelContext" in document,' +
    '"navigatorModelContext": "modelContext" in navigator,' +
    '"modelContextType": typeof document.modelContext' +
    "})"
  );
}

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();

  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false });
    try {
      await win.loadURL(`http://127.0.0.1:${port}/`);
      const result = await win.webContents.executeJavaScript(check());
      process.stdout.write(result + "\n");
    } catch (error) {
      const message = error && error.stack ? error.stack : String(error);
      process.stderr.write(`{"error":${JSON.stringify(message)}}\n`);
      app.exit(1);
    } finally {
      clearTimeout(timeout);
      win.destroy();
      server.close();
      app.quit();
    }
  });
});
