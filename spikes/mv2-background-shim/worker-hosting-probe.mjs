/**
 * Does Electron host an MV3 background service worker, and what actually kills
 * one? This is the experiment behind the correction at the top of `results.md`.
 *
 * Five fixtures, differing only in background shape and in whether they touch
 * `chrome.debugger`:
 *
 *   A2  MV3 service worker, no `chrome.*` access at all
 *   A3  MV3 service worker, `chrome.storage` only
 *   B   MV3 service worker, unguarded `chrome.debugger`
 *   D   MV3 service worker, `chrome.debugger` guarded by `try`/`catch`
 *   C   MV2 background page, unguarded `chrome.debugger`
 *
 * Expected on Electron 44.x: A2, A3 and D register and stay running; B runs to
 * the throw and dies, with the registration reported failed; C loads without
 * tearing the context down. If A2 or D ever fails to run, the correction in
 * `results.md` is wrong and this is the place to find out.
 *
 * Run from the repo root (needs a GUI session):
 *
 *   ./node_modules/.bin/electron spikes/mv2-background-shim/worker-hosting-probe.mjs
 *
 * Installs nothing and touches nothing in the app's profile: every fixture is
 * written to a scratch directory and loaded fresh. Quit Tlachialoni first, only
 * so its extension folders are not held open — this probe does not read them.
 *
 * API shapes are Electron 44's: `getAllRunning()` returns a Record keyed by
 * version ID (not an array), `console-message` carries a `MessageDetails`
 * object, and `ServiceWorkerMain` exposes `startTask()`/`isDestroyed()` but no
 * `evaluate()`.
 */

import { app, session } from "electron";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRATCH = join(tmpdir(), "tlachialoni-worker-hosting");

const FIXTURES = [
  {
    dir: "A2",
    label: "MV3 worker, no chrome.*",
    manifest: {
      manifest_version: 3,
      name: "A2 no chrome",
      version: "1.0",
      background: { service_worker: "bg.js", type: "classic" },
    },
    body: [
      "globalThis.__reached_top_level = true;",
      "chrome.runtime.onMessage.addListener((m, s, send) => { send({ pong: m }); return true; });",
    ].join("\n"),
  },
  {
    dir: "A3",
    label: "MV3 worker, chrome.storage",
    manifest: {
      manifest_version: 3,
      name: "A3 storage",
      version: "1.0",
      permissions: ["storage"],
      background: { service_worker: "bg.js", type: "classic" },
    },
    body: [
      "chrome.storage.local.set({ probe: 'A3 ran' });",
      "chrome.runtime.onMessage.addListener((m, s, send) => { send({ pong: m }); return true; });",
    ].join("\n"),
  },
  {
    dir: "B",
    label: "MV3 worker, unguarded chrome.debugger",
    manifest: {
      manifest_version: 3,
      name: "B unguarded",
      version: "1.0",
      permissions: ["debugger", "storage"],
      background: { service_worker: "bg.js", type: "classic" },
    },
    body: [
      "const mux = { connect() { chrome.runtime.onConnect.addListener(() => {}); } };",
      "mux.connect();",
      "chrome.debugger.onEvent.addListener(() => {});",
    ].join("\n"),
  },
  {
    dir: "D",
    label: "MV3 worker, guarded chrome.debugger",
    manifest: {
      manifest_version: 3,
      name: "D guarded",
      version: "1.0",
      permissions: ["debugger", "storage"],
      background: { service_worker: "bg.js", type: "classic" },
    },
    body: [
      "const mux = { connect() { chrome.runtime.onConnect.addListener(() => {}); } };",
      "mux.connect();",
      "try { chrome.debugger.onEvent.addListener(() => {}); } catch (e) { console.log('D: guarded'); }",
      "chrome.storage.local.set({ probe: 'D survived' });",
    ].join("\n"),
  },
  {
    dir: "C",
    label: "MV2 page, unguarded chrome.debugger",
    manifest: {
      manifest_version: 2,
      name: "C MV2 page",
      version: "1.0",
      permissions: ["debugger", "storage"],
      background: { scripts: ["bg.js"], persistent: true },
    },
    body: [
      "const mux = { connect() { chrome.runtime.onConnect.addListener(() => {}); } };",
      "mux.connect();",
      "chrome.debugger.onEvent.addListener(() => {});",
    ].join("\n"),
  },
];

/** Writes every fixture to the scratch directory, replacing anything there. */
function stageFixtures() {
  rmSync(SCRATCH, { recursive: true, force: true });
  for (const fixture of FIXTURES) {
    const dir = join(SCRATCH, fixture.dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(fixture.manifest, null, 2));
    writeFileSync(join(dir, "bg.js"), fixture.body);
  }
}

async function runFixture(fixture, log) {
  const s = session.defaultSession;
  const dir = join(SCRATCH, fixture.dir);
  const line = (text) => console.log(`  ${text}`);

  console.log(`\n${fixture.dir}  ${fixture.label}`);

  let ext;
  try {
    ext = await s.extensions.loadExtension(dir);
  } catch (error) {
    line(`LOAD FAILED: ${error.message}`);
    return { dir: fixture.dir, hosted: false, note: "load failed" };
  }
  line(`loaded ${ext.name} (${ext.id})`);

  await new Promise((resolve) => setTimeout(resolve, 2500));

  const workerLog = log.filter((entry) => entry.source.includes(ext.id));
  for (const entry of workerLog) line(`worker log: ${entry.message}`);

  const running = Object.values(s.serviceWorkers.getAllRunning() ?? {});
  const mine = running.filter((worker) => worker.scope === `chrome-extension://${ext.id}/`);
  line(`running service workers: ${mine.length}`);
  for (const worker of mine) line(`  scope=${worker.scope}  script=${worker.scriptUrl}`);

  let startable = false;
  try {
    const worker = await s.serviceWorkers.startWorkerForScope(`chrome-extension://${ext.id}/`);
    const task = worker.startTask();
    startable = !worker.isDestroyed();
    task.end();
    line(`startWorkerForScope: STARTED (alive after task: ${startable})`);
  } catch (error) {
    line(`startWorkerForScope: FAILED (${error.message})`);
  }

  const hosted = mine.length > 0 || startable;
  return {
    dir: fixture.dir,
    hosted,
    note: mine.length ? "running" : startable ? "started on demand" : "not running",
  };
}

app.whenReady().then(async () => {
  console.log(`electron ${process.versions.electron} / chromium ${process.versions.chrome}`);
  stageFixtures();

  // Console output from any worker, tagged with its source so a fixture can be
  // matched to its own lines.
  const log = [];
  session.defaultSession.serviceWorkers.on("console-message", (_event, details) => {
    log.push({ source: details.sourceId ?? "", message: details.message ?? "" });
  });

  const results = [];
  for (const fixture of FIXTURES) {
    results.push(await runFixture(fixture, log));
  }

  console.log("\nsummary");
  for (const result of results) {
    console.log(
      `  ${result.dir.padEnd(3)} ${result.hosted ? "HOSTED " : "NOT RUN"} ${result.note}`,
    );
  }
  console.log(
    "\nA2/A3/D hosted and B not is the expected shape: Electron runs MV3 workers,\n" +
      "and an unguarded chrome.debugger access is what kills one.",
  );

  app.exit(0);
});
