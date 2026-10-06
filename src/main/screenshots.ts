/**
 * Dev-only screenshot capture. Triggered by `TLACHIALONI_SCREENSHOTS=1`, it walks
 * a window through the shell's states and writes a PNG per state so the app can be
 * shown without a person at the screen.
 *
 * The pixels come from the window server, not from a webContents. A window is a
 * `BaseWindow` holding two stacked `WebContentsView`s and it has no `capturePage`
 * at all; and even `webContents.capturePage()` could never show the traffic
 * lights, the window's rounded corners or the docked DevTools panel, because none
 * of them belongs to a webContents. `screencapture -o -x -l <windowID>` captures
 * the whole window, chrome included, so that is the primary backend:
 *
 *   - `-l` takes a CGWindowID, resolved from `GetWindowID` when that helper is
 *     installed and from Electron's own `getMediaSourceId()` otherwise;
 *   - `-o` omits the drop shadow;
 *   - `-x` silences the shutter.
 *
 * A layer-compositing backend is kept as a fallback for when Screen Recording
 * access is unavailable — chosen automatically when macOS reports the access is
 * denied, or when the first window frame does not even cover the window — and can
 * be forced with `TLACHIALONI_SCREENSHOTS_CAPTURE=contents`.
 *
 * Nothing here is reachable in a packaged build (index.ts gates the entry point on
 * the env var).
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import {
  app,
  nativeTheme,
  screen,
  systemPreferences,
  BrowserWindow,
  type NativeImage,
  type WebContents,
} from "electron";
import { THEME_VARIANTS } from "@shared/commands";
import type { DockMode, VariantSlug } from "./state/schema";
import type { AppWindow } from "./shell/window";

const SHELL_TIMEOUT_MS = 10_000;
const SHELL_POLL_MS = 100;
/** A beat after a state change, so entrance motion has settled before capture. */
const SETTLE_MS = 700;
/** DevTools takes noticeably longer to lay itself out than a shell surface. */
const DEVTOOLS_SETTLE_MS = 1_800;
/** Committed images are capped to this width so they stay shareable. */
const MAX_OUTPUT_WIDTH = 1440;
const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 900;

const SCREENCAPTURE = "/usr/sbin/screencapture";
const GET_WINDOW_ID = "/opt/homebrew/bin/GetWindowID";
const SIPS = "/usr/bin/sips";
const SRGB_PROFILE = "/System/Library/ColorSync/Profiles/sRGB Profile.icc";

const exec = promisify(execFile);

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const trace = (message: string): void => {
  if (process.env.TLACHIALONI_SCREENSHOTS_DEBUG === "1")
    process.stderr.write(`[shots] ${message}\n`);
};

/**
 * Writes a state document into the (temporary) userData directory before the
 * store is built, so every shot runs against one fixed frame and the palette's
 * Location and Extensions groups have something real to list. Only ever called
 * with the throwaway directory the capture env vars select.
 */
export function seedScreenshotState(userDataDir: string): void {
  const now = Date.now();
  const state = {
    schemaVersion: 3,
    recents: [
      { url: "http://localhost:5173/dashboard", lastOpenedAt: now - 60_000 },
      { url: "http://localhost:5173/settings/profile", lastOpenedAt: now - 180_000 },
      { url: "http://localhost:5173/", lastOpenedAt: now - 900_000 },
      { url: "http://localhost:3000/api/health", lastOpenedAt: now - 120_000 },
      { url: "http://127.0.0.1:8080/", lastOpenedAt: now - 240_000 },
    ],
    extensions: [
      {
        slug: "react-developer-tools",
        id: "fmkadmapgofadopljbjfkapdkoienihi",
        name: "React Developer Tools",
        version: "5.3.1",
        source: "store",
        enabled: true,
        installedAt: now - 86_400_000,
        // Badges the row `MV3` (specs/018).
        mv3ServiceWorker: true,
        mv2Shimmed: false,
      },
      {
        slug: "vue-js-devtools",
        id: "nhdogjmejiglipccpnnnanhbledajbpd",
        name: "Vue.js devtools",
        version: "6.6.1",
        source: "store",
        enabled: false,
        installedAt: now - 172_800_000,
        // Badges the row `MV3→MV2` (specs/019).
        mv3ServiceWorker: true,
        mv2Shimmed: true,
      },
      {
        slug: "axe-devtools",
        id: "lhdoppojpmngadmnindnejefpokejbdd",
        name: "axe DevTools - Web Accessibility Testing",
        version: "4.10.3",
        source: "folder",
        enabled: true,
        installedAt: now - 259_200_000,
        mv3ServiceWorker: false,
        mv2Shimmed: false,
      },
    ],
    windows: [
      {
        id: randomUUID(),
        // Blank: the window shows the watermark and arms the location palette.
        target: null,
        bounds: { x: 120, y: 120, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
        dockMode: "bottom",
        devtoolsOpen: false,
        stripVisible: false,
        titlebarMode: false,
        variant: "obsidian",
        colorMode: "dark",
      },
    ],
  };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "state.json"), JSON.stringify(state, null, 2));
}

/**
 * The compositor, evaluated in the shell renderer. It decodes the captured
 * layers as data URLs (which keep the canvas untainted), derives the device
 * pixel ratio from the shell layer — the shell always spans the full window
 * width — and draws the stack in window order. Returns a PNG data URL.
 */
const COMPOSITOR_SOURCE = `async (spec) => {
  const decode = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("screenshot layer failed to decode"));
    img.src = src;
  });
  // A layer may be absent: a window that has never loaded a page captures to an
  // empty image, which is dropped rather than composited over the backdrop.
  const shell = spec.shell ? await decode(spec.shell) : null;
  const site = spec.site ? await decode(spec.site) : null;
  const devtools = spec.devtools ? await decode(spec.devtools) : null;

  const ratio = shell?.naturalWidth
    ? shell.naturalWidth / spec.width
    : site?.naturalWidth
      ? site.naturalWidth / spec.width
      : 1;

  const wholeWindow = { x: 0, y: 0, w: spec.width, h: spec.height };
  const layers = [];
  if (site) layers.push({ img: site, rect: spec.page ?? wholeWindow });
  if (devtools && spec.dock) layers.push({ img: devtools, rect: spec.dock });
  // The shell is anchored top-left at its natural size: it is full-window when a
  // surface owns the window and a thin band the rest of the time.
  if (shell) {
    layers.push({
      img: shell,
      rect: { x: 0, y: 0, w: shell.naturalWidth / ratio, h: shell.naturalHeight / ratio },
    });
  }

  const renderedWidth = spec.width * ratio;
  const scale = renderedWidth > spec.maxWidth ? spec.maxWidth / renderedWidth : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(spec.width * ratio * scale));
  canvas.height = Math.max(1, Math.round(spec.height * ratio * scale));
  const ctx = canvas.getContext("2d");
  // The window's own backdrop, so a blank page reads as it does on screen.
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const unit = ratio * scale;
  for (const layer of layers) {
    const { x, y, w, h } = layer.rect;
    ctx.drawImage(layer.img, x * unit, y * unit, w * unit, h * unit);
  }

  // The macOS traffic lights are real AppKit controls, so they exist in no
  // webContents and never reach a capture. Draw them back where the OS puts them,
  // measured from a real window: 12px buttons on a 20px pitch, centred 14.5px in
  // from the left edge and 15px down — i.e. centred in the 30px strip, whose 68px
  // left inset reserves room for them. They grey out when the window is not key.
  if (spec.trafficLights) {
    const active = spec.trafficLights === "active";
    const colors = active ? ["#ff5f57", "#febc2e", "#28c840"] : ["#262626", "#262626", "#262626"];
    ctx.lineWidth = Math.max(0.5, unit);
    ctx.strokeStyle = active ? "rgba(0, 0, 0, 0.12)" : "rgba(0, 0, 0, 0.35)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc((14.5 + i * 20) * unit, 15 * unit, 6 * unit, 0, Math.PI * 2);
      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.stroke();
    }
  }

  return canvas.toDataURL("image/png");
}`;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CompositeSpec {
  width: number;
  height: number;
  background: string;
  maxWidth: number;
  site?: string;
  shell?: string;
  devtools?: string;
  /** Where the page sits inside the window; defaults to the whole window. */
  page?: Rect;
  /** Where the docked DevTools panel sits, when one is open. */
  dock?: Rect;
  /**
   * Draws the macOS traffic lights. They are native AppKit controls and so are
   * absent from every webContents capture; the strip reserves room for them, and
   * they grey out when the window is not key.
   */
  trafficLights?: "active" | "inactive";
}

/** The stub page the page-backed shots use until a real dev server is supplied. */
const STUB_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stub Dev App</title>
    <style>
      :root { color-scheme: dark light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        padding: 48px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f6f8;
        color: #1a1a1f;
      }
      header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; }
      .brand { font-weight: 700; letter-spacing: -0.01em; font-size: 20px; }
      nav a { margin-left: 20px; color: #5b5b68; text-decoration: none; font-size: 14px; }
      h1 { font-size: 40px; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 12px; max-width: 22ch; }
      p.lead { color: #5b5b68; font-size: 17px; line-height: 1.6; max-width: 56ch; }
      .actions { display: flex; gap: 12px; margin: 28px 0 48px; }
      button {
        font: inherit; font-size: 14px; font-weight: 600; padding: 10px 18px;
        border-radius: 8px; border: 1px solid #d6d6de; background: #fff; color: #1a1a1f; cursor: pointer;
      }
      button.primary { background: #3b5bdb; border-color: #3b5bdb; color: #fff; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 960px; }
      .card { padding: 20px; border: 1px solid #e2e2e8; border-radius: 12px; background: #fff; }
      .card h2 { font-size: 15px; margin: 0 0 6px; }
      .card p { margin: 0; color: #5b5b68; font-size: 13px; line-height: 1.5; }
      form { margin-top: 40px; display: flex; gap: 10px; max-width: 420px; }
      input {
        flex: 1; font: inherit; font-size: 14px; padding: 10px 12px;
        border: 1px solid #d6d6de; border-radius: 8px; background: #fff; color: inherit;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #131316; color: #ecedf1; }
        nav a, p.lead, .card p { color: #9a9aa8; }
        button { background: #1d1d22; border-color: #2e2e36; color: #ecedf1; }
        button.primary { background: #4c6ef5; border-color: #4c6ef5; color: #fff; }
        .card { background: #191920; border-color: #26262e; }
        input { background: #191920; border-color: #2e2e36; }
      }
    </style>
  </head>
  <body>
    <header>
      <span class="brand">Stub Dev App</span>
      <nav><a href="#">Docs</a><a href="#">Changelog</a><a href="#">Settings</a></nav>
    </header>
    <h1>A placeholder page for the screenshot pass</h1>
    <p class="lead">
      This page exists only so the docked DevTools and the element picker have
      something real to render. It is served in-process by the capture runner.
    </p>
    <div class="actions">
      <button class="primary">Primary action</button>
      <button>Secondary</button>
    </div>
    <section class="grid">
      <article class="card"><h2>Renders locally</h2><p>Served on loopback for the capture run.</p></article>
      <article class="card"><h2>Inspects cleanly</h2><p>Elements and styles resolve in DevTools.</p></article>
      <article class="card"><h2>Hovers for the picker</h2><p>Distinct blocks make the highlight legible.</p></article>
    </section>
    <form><input placeholder="Email address" /><button class="primary">Subscribe</button></form>
  </body>
</html>`;

async function startStubServer(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(STUB_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => server.close(),
  };
}

/** Runs a snippet in the shell renderer and resolves its value. */
async function evalInShell<T>(shell: WebContents, code: string): Promise<T> {
  return (await shell.executeJavaScript(code)) as T;
}

/**
 * Resolves the CGWindowID that `screencapture -l` takes.
 *
 * `GetWindowID` is the helper the editor captures use, and returns a real
 * CGWindowID, so it is preferred — but it needs Homebrew and the window's title.
 * Electron's own `getMediaSourceId()` needs neither, and gives the same number as
 * long as Chromium's window number is the CGWindowID. Both are resolved and logged
 * together, so a run settles that assumption instead of leaving it implicit.
 *
 * The helper matches on the app's macOS bundle name, which
 * `scripts/dev-identity.mjs` renames for unpackaged runs — so it is derived here
 * rather than hard-coded.
 */
async function resolveWindowId(win: AppWindow): Promise<number | null> {
  const mediaSourceId = win.win.isDestroyed() ? "" : win.win.getMediaSourceId();
  const fromElectron = Number(mediaSourceId.split(":")[1]);

  let fromHelper: number | null = null;
  try {
    const bundle = app.isPackaged ? app.getName() : `${app.getName()} Dev`;
    const title = win.win.isDestroyed() ? "" : win.win.getTitle();
    const { stdout } = await exec(GET_WINDOW_ID, [bundle, title], { timeout: 5_000 });
    const parsed = Number(String(stdout).trim());
    if (Number.isInteger(parsed) && parsed > 0) fromHelper = parsed;
  } catch {
    // Helper not installed, or it found no matching window.
  }

  trace(
    `window id: electron="${mediaSourceId}" (${fromElectron}) helper=${fromHelper ?? "unavailable"}`,
  );
  if (fromHelper !== null) return fromHelper;
  return Number.isInteger(fromElectron) && fromElectron > 0 ? fromElectron : null;
}

/** Captures one window into `file`, at the display's pixel density. */
async function captureWindow(windowId: number, file: string): Promise<void> {
  await exec(SCREENCAPTURE, ["-o", "-x", "-l", String(windowId), file], { timeout: 20_000 });
}

/**
 * Caps the long edge so the committed images stay shareable, and normalises the
 * colour profile so a capture taken on a P3 display matches the rest of the set.
 */
async function normaliseImage(file: string): Promise<void> {
  await exec(SIPS, ["-Z", String(MAX_OUTPUT_WIDTH), file], { timeout: 20_000 });
  try {
    await exec(SIPS, ["-m", SRGB_PROFILE, file], { timeout: 20_000 });
  } catch {
    // Profile conversion is best-effort; the PNG is still perfectly usable.
  }
}

/** `sips` pixel dimensions, for the sanity check on the first window capture. */
async function imagePixelSize(file: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await exec(SIPS, ["-g", "pixelWidth", "-g", "pixelHeight", file], {
      timeout: 10_000,
    });
    const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

/**
 * Renders `url` in a hidden window at an exact size and captures it. Hidden
 * windows still paint (the `paintWhenInitiallyHidden` default), which is what
 * makes `capturePage` work for them.
 *
 * This exists for the docked-DevTools shots: the inspected view's own
 * `capturePage` returns the DevTools surface once DevTools is docked, so the
 * page layer is re-rendered at the docked viewport instead.
 */
async function capturePageAt(
  url: string,
  width: number,
  height: number,
): Promise<NativeImage | null> {
  if (!url || width < 1 || height < 1) return null;
  const mirror = new BrowserWindow({
    show: false,
    width: Math.round(width),
    height: Math.round(height),
    frame: false,
    // A hidden window is throttled by default; both flags keep it painting so
    // `capturePage` has a fresh frame to read.
    paintWhenInitiallyHidden: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  try {
    await mirror.loadURL(url);
    // A real dev app may paint well after `did-finish-load` (client-rendered
    // apps hydrate late); give it room.
    await wait(1_600);
    const image = await mirror.webContents.capturePage();
    if (image.isEmpty()) {
      trace(`mirror captured empty (${Math.round(width)}x${Math.round(height)})`);
      return null;
    }
    return image;
  } catch (error) {
    trace(`mirror capture failed: ${String(error)}`);
    return null;
  } finally {
    if (!mirror.isDestroyed()) mirror.destroy();
  }
}

export async function runScreenshots(primary: AppWindow): Promise<void> {
  const outDir =
    process.env.TLACHIALONI_SCREENSHOTS_DIR ?? path.join(process.cwd(), "docs/screenshots");
  fs.mkdirSync(outDir, { recursive: true });

  const win = primary;
  const shell = win.shellView.webContents;
  const site = win.siteView.webContents;
  const stub = await startStubServer();
  const shots: string[] = [];
  const errors: string[] = [];

  // DevTools draws itself in the OS theme, and the guest page reads
  // `prefers-color-scheme`; pin both so the page-backed shots are consistent.
  const previousThemeSource = nativeTheme.themeSource;
  nativeTheme.themeSource = "dark";

  const background = async (): Promise<string> =>
    (await evalInShell<string>(
      shell,
      "getComputedStyle(document.documentElement).getPropertyValue('--tb-bg').trim()",
    )) || "#000000";

  // Which backend supplies the pixels: the window server (default), or the
  // composited webContents layers, which need no Screen Recording access.
  const requestedBackend = process.env.TLACHIALONI_SCREENSHOTS_CAPTURE ?? "window";
  const screenAccess = systemPreferences.getMediaAccessStatus("screen");
  const accessBlocked = screenAccess === "denied" || screenAccess === "restricted";
  if (accessBlocked && requestedBackend !== "contents") {
    trace(
      `Screen Recording access is "${screenAccess}"; using the composited backend. ` +
        `Grant it to "${app.getName()} Dev" in System Settings → Privacy & Security → Screen Recording.`,
    );
  }
  let windowId =
    requestedBackend === "contents" || accessBlocked ? null : await resolveWindowId(win);
  let backend: "window" | "contents" = windowId === null ? "contents" : "window";
  trace(`capture backend: ${backend} (screen access "${screenAccess}")`);

  // A window capture is whatever the window server shows, so put the window at a
  // known place, sized to the display, and keep it in front for the whole run. The
  // pointer-reveal sampler is frozen too: a cursor resting near the top edge would
  // otherwise add the strip to every frame.
  win.freezeProximity(true);
  if (!win.win.isDestroyed()) {
    if (backend === "window") {
      const area = screen.getPrimaryDisplay().workArea;
      const width = Math.min(WINDOW_WIDTH, Math.max(480, area.width - 80));
      const height = Math.min(WINDOW_HEIGHT, Math.max(360, area.height - 120));
      win.win.setBounds({ x: area.x + 40, y: area.y + 60, width, height });
      win.win.setAlwaysOnTop(true, "floating");
    } else {
      win.win.setBounds({ x: 120, y: 120, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
    }
  }
  if (backend === "window") {
    app.focus({ steal: true });
    if (!win.win.isDestroyed()) win.win.focus();
  }

  const openPalette = async (): Promise<void> => {
    const open = await evalInShell<boolean>(shell, "Boolean(document.querySelector('.palette'))");
    if (!open) await win.runCommand("palette.open");
  };

  const closePalette = async (): Promise<void> => {
    const open = await evalInShell<boolean>(shell, "Boolean(document.querySelector('.palette'))");
    if (open) await win.runCommand("palette.close");
  };

  const chooseScope = async (label: string): Promise<void> => {
    await evalInShell<boolean>(
      shell,
      `(() => {
        const chip = [...document.querySelectorAll('.palette__chip')]
          .find((el) => el.textContent.trim() === ${JSON.stringify(label)});
        if (!chip) return false;
        chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return true;
      })()`,
    );
  };

  const typeQuery = async (value: string): Promise<void> => {
    await evalInShell<void>(
      shell,
      `(() => {
        const input = document.querySelector('.palette__input');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`,
    );
  };

  const pressInPalette = async (key: string): Promise<void> => {
    await evalInShell<void>(
      shell,
      `document.querySelector('.palette__input')
        .dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`,
    );
  };

  const expandFirstHost = async (): Promise<void> => {
    await evalInShell<void>(shell, "document.querySelector('.palette__chevron')?.click()");
  };

  /**
   * Waits for the DevTools front-end to report the requested dock side, so a
   * capture never lands while the panel is still moving into place.
   */
  const waitForDock = async (mode: DockMode): Promise<boolean> => {
    for (let i = 0; i < 50; i++) {
      const devtools = site.devToolsWebContents;
      if (devtools && !devtools.isDestroyed()) {
        try {
          const side = await devtools.executeJavaScript(
            "EUI.DockController.DockController.instance().dockSide()",
          );
          if (side === mode) return true;
        } catch {
          // The front-end is not reachable until it has loaded.
        }
      }
      await wait(200);
    }
    return false;
  };

  /**
   * Polls the window's composed state until `predicate` holds, so a layout change
   * is confirmed applied rather than assumed after a sleep.
   */
  const waitForState = async (
    predicate: (state: { titlebarMode: boolean; stripVisible: boolean }) => boolean,
  ): Promise<boolean> => {
    for (let i = 0; i < 30; i++) {
      if (predicate(win.getState())) return true;
      await wait(100);
    }
    return false;
  };

  /**
   * Finds a small, text-bearing element to hover for the picker shot. The page
   * here may be a client-rendered app, so nothing about it is known ahead of
   * time; picking the first element under a fixed point tends to select the whole
   * body.
   */
  const findPickerTarget = async (): Promise<{ x: number; y: number; label: string } | null> => {
    const found = (await site.executeJavaScript(`(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const interactiveTags = ["button", "a", "input", "select", "textarea"];
      const interactiveRoles = ["button", "link", "tab", "menuitem", "checkbox", "radio"];
      const candidates = [];
      const nodes = document.querySelectorAll(
        "button, a, input, select, textarea, label, summary, [role], img, svg, p, h1, h2, h3, li",
      );
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 12) continue;
        if (rect.width > 320 || rect.height > 96) continue;
        if (rect.right < 24 || rect.bottom < 24) continue;
        if (rect.left > viewportWidth - 24 || rect.top > viewportHeight - 24) continue;
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number(style.opacity) < 0.35) continue;
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute("role") ?? "";
        candidates.push({
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          area: rect.width * rect.height,
          tag,
          // Prefer a real control over a stray text node.
          control: interactiveTags.includes(tag) || interactiveRoles.includes(role) ? 0 : 1,
          text: (
            (node.textContent ?? "").trim() ||
            node.getAttribute("aria-label") ||
            node.getAttribute("placeholder") ||
            ""
          )
            .replace(/\\s+/g, " ")
            .slice(0, 28),
        });
      }
      const labelled = candidates.filter((entry) => entry.text.length > 0);
      const pool = labelled.length > 0 ? labelled : candidates;
      if (pool.length === 0) return null;
      pool.sort((a, b) => a.control - b.control || a.area - b.area);
      return pool[0];
    })()`)) as { x: number; y: number; label?: string; tag?: string; text?: string } | null;
    return found ? { x: found.x, y: found.y, label: `${found.tag} "${found.text}"` } : null;
  };

  /**
   * Captures a web contents into a `NativeImage`. A window that has never
   * painted captures to an empty image, which is returned as `null` so it is
   * dropped rather than composited.
   */
  const captureImage = async (
    contents: WebContents,
    label: string,
  ): Promise<NativeImage | null> => {
    try {
      const image = await contents.capturePage();
      if (image.isEmpty()) {
        trace(`${label} captured empty`);
        return null;
      }
      return image;
    } catch (error) {
      trace(`${label} capture failed: ${String(error)}`);
      return null;
    }
  };

  /**
   * The fallback backend: takes a webContents snapshot of each layer and draws the
   * stack in the shell renderer. Needs no Screen Recording access, but cannot show
   * anything the window server owns, so the traffic lights are drawn back in.
   */
  const composeContents = async (
    name: string,
    mode: "window" | DockMode = "window",
  ): Promise<void> => {
    const { width, height } = win.win.getContentBounds();
    const spec: CompositeSpec = {
      width,
      height,
      background: await background(),
      maxWidth: MAX_OUTPUT_WIDTH,
      shell: (await captureImage(shell, "shell"))?.toDataURL(),
      // The strip is the only place the traffic lights show, and they grey out
      // when the window is not the key window.
      trafficLights: win.getState().stripVisible
        ? win.win.isFocused()
          ? "active"
          : "inactive"
        : undefined,
    };

    if (mode === "window") {
      spec.site = (await captureImage(site, "site"))?.toDataURL();
    } else {
      const devtoolsWebContents = site.devToolsWebContents;
      const panel =
        devtoolsWebContents && !devtoolsWebContents.isDestroyed()
          ? await captureImage(devtoolsWebContents, "devtools")
          : null;
      if (panel) {
        spec.devtools = panel.toDataURL();
        // A docked panel spans the window on its perpendicular axis, so its size
        // in CSS pixels follows from its aspect ratio — which is the same in
        // pixels and, unlike `getSize()`, is DPR-independent.
        const size = panel.getSize();
        const aspect = size.width / size.height;
        spec.dock =
          mode === "bottom"
            ? { x: 0, y: height - width / aspect, w: width, h: width / aspect }
            : mode === "right"
              ? { x: width - height * aspect, y: 0, w: height * aspect, h: height }
              : { x: 0, y: 0, w: height * aspect, h: height };
        spec.page =
          mode === "bottom"
            ? { x: 0, y: 0, w: width, h: height - spec.dock.h }
            : mode === "right"
              ? { x: 0, y: 0, w: width - spec.dock.w, h: height }
              : { x: spec.dock.w, y: 0, w: width - spec.dock.w, h: height };
      }
      // The inspected view's own capture returns the DevTools surface once
      // DevTools is docked, so the page is re-rendered at the docked viewport in
      // a hidden window and placed in the page rect.
      const page = spec.page ?? { x: 0, y: 0, w: width, h: height };
      spec.site = (await capturePageAt(site.getURL(), page.w, page.h))?.toDataURL();
    }

    const dataUrl = await evalInShell<string>(
      shell,
      `(${COMPOSITOR_SOURCE})(${JSON.stringify(spec)})`,
    );
    trace(`composed ${name} (${dataUrl.length} bytes)`);
    fs.writeFileSync(
      path.join(outDir, `${name}.png`),
      Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
    );
  };

  /**
   * Captures one state. The window backend takes the whole window, chrome and all,
   * so `mode` only matters to the compositing fallback.
   */
  const shot = async (name: string, mode: "window" | DockMode = "window"): Promise<void> => {
    if (backend === "window" && windowId !== null) {
      const file = path.join(outDir, `${name}.png`);
      await captureWindow(windowId, file);
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
        throw new Error("screencapture produced no image");
      }

      const expected = win.win.getContentBounds();
      const size = await imagePixelSize(file);
      if (shots.length === 0) {
        trace(
          `first window capture: ${size ? `${size.width}x${size.height}` : "unknown"} px ` +
            `(window ${expected.width}x${expected.height} DIP)`,
        );
      }
      // A capture taken without screen access can still "succeed" while holding
      // nothing but the desktop. If the first frame does not even cover the
      // window, stop trusting the backend rather than write out a set of wrong
      // images.
      if (size && (size.width < expected.width * 0.5 || size.height < expected.height * 0.5)) {
        trace("window capture is implausibly small; using the composited backend from here");
        backend = "contents";
      } else {
        await normaliseImage(file);
        shots.push(name);
        return;
      }
    }
    await composeContents(name, mode);
    shots.push(name);
  };

  /**
   * Waits for a state to be on screen before capturing it — the same
   * verify-then-capture the editor captures do — so a frame is never taken
   * mid-transition, or from a state that silently failed to apply.
   */
  const capture = async (
    name: string,
    expect?: { shell?: string; site?: string },
  ): Promise<void> => {
    try {
      await wait(SETTLE_MS);
      for (const [where, selector] of Object.entries(expect ?? {})) {
        const contents = where === "site" ? site : shell;
        let mounted = false;
        for (let i = 0; i < 30; i++) {
          mounted = await contents
            .executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)
            .catch(() => false);
          if (mounted) break;
          await wait(100);
        }
        if (!mounted) trace(`${name}: expected ${where} selector ${selector} was not on screen`);
      }
      trace(`capturing ${name}`);
      await shot(name);
    } catch (error) {
      errors.push(`${name}: ${String(error)}`);
      trace(`failed ${name}: ${String(error)}`);
    }
  };

  try {
    for (let i = 0; i < SHELL_TIMEOUT_MS / SHELL_POLL_MS && !win.isShellReady(); i++) {
      await wait(SHELL_POLL_MS);
    }
    await wait(SETTLE_MS);
    trace("shell ready");

    // ---- blank window -----------------------------------------------------
    // A fresh blank window arms the location palette on its own.
    await capture("01-blank-location-armed", { shell: ".palette" });
    await closePalette();
    await capture("02-blank-watermark-dark", { shell: ".blank" });
    win.setColorMode("light");
    await capture("03-blank-watermark-light", { shell: ".blank" });
    win.setColorMode("dark");
    await wait(SETTLE_MS);

    // ---- command palette groups -------------------------------------------
    await openPalette();
    await wait(SETTLE_MS);
    await chooseScope("All");
    await capture("04-palette-all", { shell: ".palette" });

    await chooseScope("Location");
    await expandFirstHost();
    await capture("05-palette-location-recents", { shell: ".palette" });

    await chooseScope("DevTools");
    await capture("06-palette-devtools", { shell: ".palette" });

    await chooseScope("View");
    await capture("07-palette-view", { shell: ".palette" });

    await chooseScope("Theme");
    await capture("08-palette-theme", { shell: ".palette" });

    await chooseScope("Extensions");
    await capture("09-palette-extensions", { shell: ".palette" });

    await chooseScope("Other");
    await capture("10-palette-other", { shell: ".palette" });

    // A query with no in-group match widens to every group. Location can never
    // be empty (a typed-target row is always offered), so this is scoped to a
    // command group and typed with a query that only matches elsewhere.
    await chooseScope("DevTools");
    await typeQuery("reload");
    await capture("11-palette-fallback", { shell: ".palette__hint" });

    // A rejected target reports inline instead of navigating.
    await chooseScope("All");
    await typeQuery("example.com");
    await pressInPalette("Enter");
    await capture("12-palette-error", { shell: ".palette__error" });
    await closePalette();
    await wait(SETTLE_MS);

    // ---- theme sweep ------------------------------------------------------
    await openPalette();
    await wait(SETTLE_MS);
    for (const [index, variant] of THEME_VARIANTS.entries()) {
      win.setVariant(variant.slug as VariantSlug);
      await capture(`${String(13 + index).padStart(2, "0")}-theme-${variant.slug}`, {
        shell: ".palette",
      });
    }
    await closePalette();
    win.setVariant("obsidian");
    await wait(SETTLE_MS);

    // ---- transient surfaces ----------------------------------------------
    win.previewLoadingVeil();
    await capture("21-loading-veil", { shell: ".veil" });
    win.stopSurfacePreview();
    await wait(SETTLE_MS);

    win.previewFailureView();
    await capture("22-failure", { shell: ".failure" });
    win.stopSurfacePreview();
    await wait(SETTLE_MS);

    const statuses: Array<[string, Parameters<AppWindow["setExtensionStatus"]>[0]]> = [
      [
        "23-status-resolving",
        {
          phase: "resolving",
          name: "fmkadmapgofadopljbjfkapdkoienihi",
          message: "Looking up the extension",
        },
      ],
      [
        "24-status-downloading",
        {
          phase: "downloading",
          name: "React Developer Tools",
          message: "Downloading from the Chrome Web Store",
          progress: { received: 420_000, total: 670_658 },
        },
      ],
      [
        "25-status-verifying",
        {
          phase: "verifying",
          name: "React Developer Tools",
          message: "Verifying the package",
        },
      ],
      ["26-status-done", { phase: "done", message: "Installed React Developer Tools" }],
      [
        "27-status-error",
        {
          phase: "error",
          name: "React Developer Tools",
          message: "Couldn't install React Developer Tools",
          error: "The store returned HTTP 404",
        },
      ],
      [
        "28-status-warning",
        {
          phase: "warning",
          name: "React Developer Tools",
          message:
            "React Developer Tools keeps its Manifest V3 service worker, which Tlachialoni tears down if it hits an API the app doesn't compile. Its background runs as authored and may not survive, but the rest of it does.",
        },
      ],
    ];
    for (const [name, status] of statuses) {
      win.setExtensionStatus(status);
      await capture(name, { shell: ".status" });
      await wait(SETTLE_MS);
    }
    win.dismissExtensionStatus();
    await wait(SETTLE_MS);

    // ---- a loaded page ----------------------------------------------------
    win.navigate(process.env.TLACHIALONI_SCREENSHOTS_URL ?? stub.url);
    for (let i = 0; i < 120 && site.isLoading(); i++) await wait(100);
    // Client-rendered apps are still hydrating when `did-stop-loading` fires.
    await wait(1_500);
    await capture("29-page-loaded");

    win.runCommand("strip.toggle");
    await capture("30-strip-dark", { shell: ".strip" });
    win.setColorMode("light");
    await capture("31-strip-light", { shell: ".strip" });
    win.setColorMode("dark");
    win.runCommand("strip.toggle");
    await wait(SETTLE_MS);

    // ---- titlebar mode (016) ----------------------------------------------
    // The strip docks permanently and the guest page is laid out below it. The
    // class and the state flag are both checked, so a half-applied toggle cannot
    // be captured as if it were the layout.
    await win.runCommand("titlebar.toggle");
    await waitForState((state) => state.titlebarMode);
    await capture("32-titlebar-mode", { shell: ".shell-root.is-titlebar .strip" });
    await win.runCommand("titlebar.toggle");
    await waitForState((state) => !state.titlebarMode);
    await wait(SETTLE_MS);

    // ---- DevTools, docked on each side ------------------------------------
    // With the window backend the panel is simply part of the window; `mode` is
    // only passed on for the compositing fallback.
    for (const [index, mode] of (["bottom", "right", "left"] as DockMode[]).entries()) {
      await win.runCommand(`devtools.dock.${mode}`);
      const landed = await waitForDock(mode);
      await wait(DEVTOOLS_SETTLE_MS);
      trace(`devtools dock ${mode} landed=${landed}`);
      await shot(`${String(33 + index).padStart(2, "0")}-devtools-${mode}`, mode);
    }
    await win.runCommand("devtools.toggle");
    await wait(SETTLE_MS);

    // ---- element picker ---------------------------------------------------
    win.pickerArm();
    await wait(300);
    const target = await findPickerTarget();
    const point = target ?? { x: Math.round(WINDOW_WIDTH / 2), y: Math.round(WINDOW_HEIGHT / 2) };
    trace(
      `picker target: ${target ? target.label : "centre fallback"} at (${point.x}, ${point.y})`,
    );
    site.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    await wait(400);
    await capture("36-picker-hover", { site: "[data-tlachialoni-picker]" });
    win.pickerDisarm();

    // ---- history overlay (015) --------------------------------------------
    // The real detector is a native trackpad addon, so the surface is driven by
    // the dev preview and each direction is shot only once it is actually up.
    win.previewHistoryArm();
    await capture("37-history-overlay-back", { shell: ".history-overlay--back" });
    await capture("38-history-overlay-forward", { shell: ".history-overlay--forward" });
    win.stopSurfacePreview();
  } finally {
    win.freezeProximity(false);
    if (!win.win.isDestroyed()) win.win.setAlwaysOnTop(false);
    nativeTheme.themeSource = previousThemeSource;
    stub.close();
  }

  const report = {
    dir: outDir,
    backend,
    screenAccess,
    count: shots.length,
    shots,
    errors,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`SCREENSHOTS ${JSON.stringify(report)}\n`);
}
