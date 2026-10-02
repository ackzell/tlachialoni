/**
 * Spike: can Electron host an extension background at all, and does declaring
 * it as an MV2 background page get a framework DevTools panel working?
 *
 * Run from the repo root with your Angular app already serving on :4200:
 *
 *   ./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs
 *
 * Reads the already-installed Angular DevTools from the app's own extension
 * folder, copies it to a scratch directory, optionally rewrites the manifest to
 * MV2, and loads it. Pass `mv2` to try the rewrite:
 *
 *   ./node_modules/.bin/electron spikes/mv2-background-shim/probe.mjs mv2
 *
 * With no argument it loads the authored copy, which is the baseline: the panel
 * will show "Angular application not detected."
 *
 * Quit Tlachialoni first — two processes cannot hold the same extension folder.
 *
 * See README.md in this directory for what each outcome means.
 */

import { app, session, BrowserWindow } from "electron";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EXT_ID = "ienfalfjdbdpebioblfackkekamfmbnh"; // Angular DevTools
const SCRATCH = join(homedir(), ".tlachialoni-mv2spike");
const APP_URL = process.env.SPIKE_APP_URL ?? "http://localhost:4200/";
const wantMv2 = process.argv[2] === "mv2";

/**
 * Rewrites an MV3 manifest into the MV2 background-page shape. Deliberately a
 * literal transcription of what the app does in `src/main/extensions/mv2-shim.ts`
 * rather than an import, so the spike stays runnable against a released build.
 */
function rewriteToMv2(raw) {
  const m = { ...raw };
  m.manifest_version = 2;
  m.background = { scripts: [raw.background.service_worker], persistent: true };
  // MV3 keys the policy by context; MV2 takes the extension-pages string, and
  // Electron rejects the object form outright.
  if (raw.content_security_policy && typeof raw.content_security_policy === "object") {
    m.content_security_policy = raw.content_security_policy.extension_pages;
  }
  if (m.action) {
    m.browser_action = m.action;
    delete m.action;
  }
  if (raw.web_accessible_resources) {
    m.web_accessible_resources = [
      ...new Set(
        raw.web_accessible_resources.flatMap((r) =>
          typeof r === "string" ? [r] : (r.resources ?? []),
        ),
      ),
    ];
  }
  m.permissions = [...new Set([...(raw.permissions ?? []), ...(raw.host_permissions ?? [])])];
  delete raw.host_permissions;
  delete m.host_permissions;
  for (const cs of m.content_scripts ?? []) delete cs.world;
  return m;
}

app.whenReady().then(async () => {
  const source = join(homedir(), "Library/Application Support/Tlachialoni/extensions", EXT_ID);
  const dir = join(SCRATCH, wantMv2 ? "mv2" : "authored");

  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(source, dir, { recursive: true, dereference: true });

  if (wantMv2) {
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(rewriteToMv2(JSON.parse(readFileSync(manifestPath, "utf8"))), null, 2),
    );
    console.log("rewrote manifest to MV2 background page");
  } else {
    console.log("loading the authored MV3 manifest (baseline)");
  }

  let extension;
  try {
    extension = await session.defaultSession.extensions.loadExtension(dir);
    console.log(`LOADED ${extension.name} ${extension.version} (${extension.id})`);
  } catch (error) {
    console.error(`LOAD FAILED: ${error.message}`);
    app.exit(1);
    return;
  }

  const win = new BrowserWindow({ width: 1200, height: 800 });
  await win.loadURL(APP_URL);
  setTimeout(() => {
    win.webContents.openDevTools({ mode: "detach" });
    console.log("select the Angular panel in the DevTools that just opened");
  }, 1000);
});
