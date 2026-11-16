import { session } from "electron";
import path from "node:path";

/**
 * Registers the DevTools WebMCP preload on the default session.
 *
 * Electron's DevTools host returns a host config that omits
 * `devToolsWebMCPSupport`, so the front-end hides the Application-panel WebMCP
 * pane and never grants targets the WEB_MCP capability. Both reads happen during
 * DevTools boot, before an injected script can run, so the fix is a preload that
 * augments `getHostConfig` before the front-end reads it (see
 * resources/devtools-webmcp-preload.js). The preload is a no-op for non-DevTools
 * pages.
 */
export function registerDevToolsWebMcpPreload(): void {
  session.defaultSession.registerPreloadScript({
    type: "frame",
    filePath: path.join(__dirname, "../../resources/devtools-webmcp-preload.js"),
  });
}
