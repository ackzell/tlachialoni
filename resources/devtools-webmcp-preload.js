// DevTools WebMCP support preload (runs only in the DevTools front-end).
//
// Electron's DevTools host returns a host config that omits
// `devToolsWebMCPSupport` (Chrome fills that in from its own DevTools bindings).
// The DevTools front-end hides the WebMCP pane behind
// `Root.Runtime.hostConfig.devToolsWebMCPSupport?.enabled`, and — earlier, in the
// Target constructor — grants targets the WEB_MCP capability from the same flag.
// Both reads happen during boot, before any injected script can run, so this
// preload intercepts the `InspectorFrontendHost` binding and augments
// `getHostConfig` with the missing flag *before* the front-end reads it.
if (location.protocol === "devtools:") {
  let realHost;
  Object.defineProperty(globalThis, "InspectorFrontendHost", {
    configurable: true,
    get() {
      return realHost;
    },
    set(value) {
      realHost = value;
      if (value && typeof value.getHostConfig === "function" && !value.getHostConfig.__webmcp) {
        const original = value.getHostConfig.bind(value);
        value.getHostConfig = function (callback) {
          return original(function (config) {
            config = config || {};
            config.devToolsWebMCPSupport = { enabled: true };
            return callback(config);
          });
        };
        value.getHostConfig.__webmcp = true;
      }
    },
  });
}
