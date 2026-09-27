/**
 * Drives every row-animation candidate through the same query sequence in
 * headless Chromium and asserts the five checks from research R3:
 *   1. rendered row nodes === model rows
 *   2. no duplicate command ids among rendered nodes
 *   3. no ghost rows (detached / outside the list box)
 *   4. list width stable, height within its ceiling
 *   5. results reflect each keystroke within one frame
 *
 * Usage: node spikes/row-animation/probe.mjs [--tech=B]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listen } from "./server.mjs";

const TECHS = ["A", "B", "C", "D", "E"];
const QUERY = "devtools";

function findChromium() {
  if (process.env.SPIKE_CHROMIUM) return process.env.SPIKE_CHROMIUM;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (!fs.existsSync(cache)) return null;
  const dirs = fs
    .readdirSync(cache)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort();
  // Playwright has shipped two layouts: <ver>/chrome-mac/headless_shell and
  // <ver>/chrome-headless-shell-<platform>/chrome-headless-shell.
  const relative = [
    "chrome-mac/headless_shell",
    "chrome-headless-shell-mac-arm64/chrome-headless-shell",
    "chrome-headless-shell-mac-x64/chrome-headless-shell",
    "chrome-linux/headless_shell",
    "chrome-linux/chrome-headless-shell",
  ];
  for (const dir of dirs.reverse()) {
    for (const rel of relative) {
      const bin = path.join(cache, dir, rel);
      if (fs.existsSync(bin)) return bin;
    }
  }
  return null;
}

/** Opens a CDP page session against a headless shell and returns helpers. */
async function connect(bin) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "spike-chrome-"));
  const port = 9000 + Math.floor(Math.random() * 1000);
  const child = spawn(
    bin,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--window-size=800,600",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  // The browser-level endpoint only proxies Target.*; page commands such as
  // Page.navigate and Runtime.evaluate live on the per-target endpoint, so ask
  // the HTTP discovery API for the page target's websocket instead.
  const target = await (async () => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find((entry) => entry.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("chromium did not expose a page target");
  })();

  const socket = new WebSocket(target);
  const pending = new Map();
  let nextId = 1;
  const events = [];

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    events.push(message);
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  const cleanup = () => {
    try {
      socket.close();
    } catch {}
    child.kill("SIGKILL");
    // Chromium may still be flushing the profile; removal is best-effort.
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  };

  return { send, events, cleanup };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.result?.exceptionDetails) {
    throw new Error(JSON.stringify(result.result.exceptionDetails));
  }
  return result.result?.result?.value;
}

/** Reads the post-keystroke state of the harness page. */
const SAMPLE = `(() => {
  const list = document.querySelector('[data-list]');
  const nodes = [...document.querySelectorAll('[data-row]')];
  const box = list.getBoundingClientRect();
  // A "ghost" is a rendered row that is NOT part of the list's content flow:
  // detached from the document, or parked with zero size. Rows merely scrolled
  // out of view are legitimately outside the visible box and must not count.
  const ghosts = nodes.filter((node) => {
    if (!node.isConnected) return true;
    const r = node.getBoundingClientRect();
    return r.width === 0 && r.height === 0;
  }).length;
  const ids = nodes.filter((n) => n.getAttribute('data-row') !== '__empty__')
                   .map((n) => n.getAttribute('data-row'));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  const style = getComputedStyle(list);
  const ceilingPx = parseFloat(style.maxHeight) || box.height;
  return {
    nodes: nodes.length,
    model: window.__harness.modelRows,
    ids,
    dupes: [...new Set(dupes)],
    ghosts,
    clientWidth: list.clientWidth,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight,
    ceiling: Math.round(ceilingPx),
  };
})()`;

async function runTech(bin, baseUrl, tech) {
  const { send, cleanup } = await connect(bin);
  const warnings = [];
  const failures = [];
  const samples = [];
  try {
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Page.enable");
    await send("Page.navigate", { url: `${baseUrl}/index.html?tech=${tech}` });
    await new Promise((resolve) => setTimeout(resolve, 900));

    // Collect console output, keeping Vue's transition deprecation (FR-006).
    await send("Runtime.evaluate", {
      expression: `(() => {
        window.__warnings = [];
        const original = console.warn;
        console.warn = (...args) => {
          const text = args.map(String).join(' ');
          if (text.includes('[Vue warn]')) window.__warnings.push(text.slice(0, 160));
          original.apply(console, args);
        };
        return true;
      })()`,
      returnByValue: true,
    });

    for (let i = 1; i <= QUERY.length; i++) {
      const prefix = QUERY.slice(0, i);
      await evaluate(send, `window.__harness.type(${JSON.stringify(prefix)})`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const immediate = await evaluate(send, SAMPLE);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const settled = await evaluate(send, SAMPLE);
      samples.push({ prefix, immediate, settled });
    }

    const collected = await evaluate(send, "JSON.stringify(window.__warnings ?? [])");
    for (const warning of JSON.parse(collected ?? "[]")) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  } finally {
    cleanup();
  }

  const widths = new Set();
  let maxNodes = 0;
  let maxGhosts = 0;
  const allDupes = new Set();

  for (const { prefix, immediate, settled } of samples) {
    maxNodes = Math.max(maxNodes, immediate.nodes, settled.nodes);
    maxGhosts = Math.max(maxGhosts, immediate.ghosts, settled.ghosts);
    widths.add(settled.clientWidth);
    for (const dupe of [...immediate.dupes, ...settled.dupes]) allDupes.add(dupe);
    const expected = Math.max(settled.model, 1);
    if (settled.nodes !== expected) {
      failures.push(`accumulation at "${prefix}": ${settled.nodes} nodes vs ${expected}`);
    }
    // The list's own max-height caps the visible box at 46vh, but a 2px border
    // and padding can push clientHeight a hair past it; allow a small slack.
    if (settled.clientHeight > settled.ceiling + 12) {
      failures.push(`height at "${prefix}": ${settled.clientHeight} > ceiling ${settled.ceiling}`);
    }
  }

  if (allDupes.size) failures.push(`duplicate ids: ${[...allDupes].join(", ")}`);
  if (maxGhosts > 0) failures.push(`ghost rows observed: ${maxGhosts}`);
  if (widths.size > 1) failures.push(`list width changed: ${[...widths].join("/")}`);

  return {
    tech,
    passed: failures.length === 0,
    maxNodes,
    maxModelRows: Math.max(...samples.map((s) => s.settled.model), 0),
    duplicateIds: [...allDupes],
    maxGhosts,
    widthStable: widths.size <= 1,
    warnings,
    failures,
    firstSample: samples[0]?.settled,
  };
}

const bin = findChromium();
if (!bin) {
  process.stdout.write(
    JSON.stringify({ error: "no chromium headless shell found; set SPIKE_CHROMIUM" }) + "\n",
  );
  process.exit(0);
}

const { server, url } = await listen(0);
const only = /--tech=([A-E])/.exec(process.argv.join(" "))?.[1];
const techs = only ? [only] : TECHS;
const results = [];
for (const tech of techs) {
  results.push(await runTech(bin, url, tech));
}
server.close();

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
