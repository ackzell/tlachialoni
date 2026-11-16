/**
 * WebMCP browser-side probe (CDP). Verifies the WebMCP DevTools protocol domain
 * end-to-end: enables the domain, lists tools, and invokes a registered tool.
 *
 * Usage:
 *   electron spikes/webmcp/probe-cdp.cjs [features|pageonly]
 *
 *   features  (default)  --enable-features=WebMCP,DevToolsWebMCPSupport
 *   pageonly             --enable-features=WebMCP
 */

const { app, BrowserWindow } = require("electron");
const http = require("node:http");

const recipe = process.argv[2] ?? "features";

if (recipe === "pageonly") {
  app.commandLine.appendSwitch("enable-features", "WebMCP");
} else {
  app.commandLine.appendSwitch("enable-features", "WebMCP,DevToolsWebMCPSupport");
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>webmcp page</title>
<script>
  (async () => {
    window.__probe = {};
    window.__probe.hasModelContext = 'modelContext' in document;
    try {
      await document.modelContext.registerTool({
        name: 'greet',
        description: 'Say hello',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
        execute: async (args) => ({ message: 'Hello ' + (args.name || 'nobody') })
      });
      window.__probe.registered = true;
    } catch (e) {
      window.__probe.registered = false;
      window.__probe.regError = String(e && e.message || e);
    }
  })();
</script>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

const timeout = setTimeout(() => {
  process.stderr.write('{"error":"probe timed out"}\n');
  app.exit(1);
}, 20000);

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();

  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false });
    const wc = win.webContents;
    try {
      await win.loadURL(`http://127.0.0.1:${port}/`);
      await new Promise((resolve) => setTimeout(resolve, 800));

      const pageProbe = await wc.executeJavaScript("JSON.stringify(window.__probe)");

      wc.debugger.attach("1.3");
      const tools = [];
      const events = [];
      wc.debugger.on("message", (_event, method, params) => {
        if (method === "WebMCP.toolsAdded") {
          for (const tool of params?.tools ?? []) {
            tools.push({
              id: tool.toolId,
              name: tool.name,
              frameId: tool.frameId,
              keys: Object.keys(tool),
            });
          }
        }
        if (method.startsWith("WebMCP.")) events.push(method);
      });

      const enableResult = await wc.debugger.sendCommand("WebMCP.enable");
      await new Promise((resolve) => setTimeout(resolve, 800));

      let invoke = null;
      const tool = tools[0];
      if (tool) {
        const args = { input: { name: "World" } };
        if (tool.frameId) args.frameId = tool.frameId;
        if (tool.id) args.toolId = tool.id;
        else args.toolName = tool.name;
        try {
          const inv = await wc.debugger.sendCommand("WebMCP.invokeTool", args);
          invoke = { error: inv?.error ?? null, invocationId: inv?.invocationId ?? null };
        } catch (error) {
          invoke = { error: String(error && error.message ? error.message : error) };
        }
      }

      process.stdout.write(
        JSON.stringify({
          recipe,
          pageProbe: JSON.parse(pageProbe),
          enableError: enableResult?.error ?? null,
          tools,
          events,
          invoke,
        }) + "\n",
      );
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
