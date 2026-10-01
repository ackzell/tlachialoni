import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { WebContentsView } from "electron";
import { STRIP_HEIGHT } from "@shared/shell";
import type { AppWindow } from "./shell/window";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the DevTools front-end dock side (undocumented but reachable). */
async function dockState(wc: Electron.WebContents): Promise<unknown> {
  const devtools = wc.devToolsWebContents;
  if (!devtools) return null;
  const expression = `(() => {
    const dc = EUI.DockController.DockController.instance();
    return JSON.stringify({ dockSide: dc.dockSide(), isVertical: dc.isVertical() });
  })()`;
  try {
    return await devtools.executeJavaScript(expression);
  } catch (error) {
    return `EXEC_ERR:${String(error)}`;
  }
}

interface Measurement {
  innerHeight: number;
  innerWidth: number;
}

/**
 * M0 spike gate. Proves DevTools dock *inside* the window: a docked panel shrinks
 * the page viewport, a detached one does not. Also reads the DevTools front-end
 * dock state as a second signal. Run with TLACHIALONI_DOCK_TEST=1.
 */
export async function runDockSelfTest(appWindow: AppWindow): Promise<void> {
  const wc = appWindow.siteView.webContents;
  const log: Record<string, unknown> = {};

  const measure = async (): Promise<Measurement> => ({
    innerHeight: (await wc.executeJavaScript("window.innerHeight")) as number,
    innerWidth: (await wc.executeJavaScript("window.innerWidth")) as number,
  });

  try {
    // Use an isolated test target so real dev state is untouched.
    appWindow.navigate("http://localhost:4321");
    for (let i = 0; i < 80 && wc.isLoading(); i++) await wait(100);
    await wait(500);

    // Closed baseline.
    wc.closeDevTools();
    await wait(600);
    const baseline = await measure();

    // Dock bottom -> height must shrink.
    wc.openDevTools({ mode: "bottom" });
    await wait(1200);
    const bottom = await measure();
    const bottomState = await dockState(wc);

    // Dock right -> width must shrink.
    wc.closeDevTools();
    await wait(600);
    wc.openDevTools({ mode: "right" });
    await wait(1200);
    const right = await measure();
    const rightState = await dockState(wc);

    log.open = wc.isDevToolsOpened();
    log.baseline = baseline;
    log.bottom = {
      innerHeight: bottom.innerHeight,
      delta: baseline.innerHeight - bottom.innerHeight,
      state: bottomState,
    };
    log.right = {
      innerWidth: right.innerWidth,
      delta: baseline.innerWidth - right.innerWidth,
      state: rightState,
    };

    // Shortcuts must work from the page and from the DevTools panel.
    const pressKey = (target: Electron.WebContents | null, code: string): void => {
      if (!target || target.isDestroyed()) return;
      target.focus();
      target.sendInputEvent({ type: "keyDown", keyCode: code, modifiers: ["meta"] });
      target.sendInputEvent({ type: "keyUp", keyCode: code, modifiers: ["meta"] });
    };
    const siteStripBefore = appWindow.getState().stripVisible;
    pressKey(wc, "b");
    await wait(400);
    const siteStripAfter = appWindow.getState().stripVisible;
    const devtoolsContents = wc.devToolsWebContents;
    const devtoolsInputEvents: string[] = [];
    devtoolsContents?.on("before-input-event", (_event, input) => {
      devtoolsInputEvents.push(`${input.type}:${input.code}`);
    });
    pressKey(devtoolsContents, "b");
    await wait(400);
    const devtoolsStripAfter = appWindow.getState().stripVisible;
    log.devtoolsInputEvents = devtoolsInputEvents;
    log.shortcutSite = {
      before: siteStripBefore,
      after: siteStripAfter,
      toggled: siteStripBefore !== siteStripAfter,
    };
    log.shortcutFromDevTools = {
      before: siteStripAfter,
      after: devtoolsStripAfter,
      toggled: siteStripAfter !== devtoolsStripAfter,
    };

    // Picker overlay lifecycle (FR-013): injected only while armed.
    const count = () =>
      wc.executeJavaScript(
        "document.querySelectorAll('[data-tlachialoni-picker]').length",
      ) as Promise<number>;
    appWindow.pickerArm();
    await wait(300);
    const overlayArmed = await count();
    appWindow.pickerDisarm();
    await wait(300);
    const overlayDisarmed = await count();
    log.picker = { overlayArmed, overlayDisarmed };

    // Titlebar mode (specs/016): the strip docks and pushes the guest content
    // below it. The page must reflow (innerHeight drops by the inset), must not
    // reload, and the strip must mount; toggling back restores the overlay.
    wc.closeDevTools();
    await wait(600);
    const heightBeforeTitlebar = await measure();
    await wc.executeJavaScript("window.__tlachialoniTitlebarSentinel = 42");
    let titlebarReloaded = false;
    const onTitlebarLoad = (): void => {
      titlebarReloaded = true;
    };
    wc.on("did-start-loading", onTitlebarLoad);

    await appWindow.runCommand("titlebar.toggle");
    await wait(700);
    const heightInTitlebar = await measure();
    const siteBounds = appWindow.siteView.getBounds();
    const sentinel = await wc.executeJavaScript("window.__tlachialoniTitlebarSentinel");
    const titlebarStripMounted = (await appWindow.shellView.webContents.executeJavaScript(
      "Boolean(document.querySelector('.strip'))",
    )) as boolean;
    wc.off("did-start-loading", onTitlebarLoad);

    log.titlebar = {
      siteTop: siteBounds.y,
      siteHeight: siteBounds.height,
      innerHeight: heightInTitlebar.innerHeight,
      heightDrop: heightBeforeTitlebar.innerHeight - heightInTitlebar.innerHeight,
      sentinel,
      reloaded: titlebarReloaded,
      stripMounted: titlebarStripMounted,
    };

    await appWindow.runCommand("titlebar.toggle");
    await wait(700);
    const restoredBounds = appWindow.siteView.getBounds();
    log.titlebarRestored = { siteTop: restoredBounds.y, siteHeight: restoredBounds.height };

    const titlebar = log.titlebar as {
      siteTop: number;
      heightDrop: number;
      sentinel: unknown;
      reloaded: boolean;
      stripMounted: boolean;
    };
    const restored = log.titlebarRestored as { siteTop: number };

    log.pass =
      bottom.innerHeight < baseline.innerHeight &&
      right.innerWidth < baseline.innerWidth &&
      overlayArmed === 1 &&
      overlayDisarmed === 0 &&
      Boolean((log.shortcutSite as { toggled: boolean }).toggled) &&
      titlebar.siteTop === STRIP_HEIGHT &&
      titlebar.heightDrop === STRIP_HEIGHT &&
      titlebar.sentinel === 42 &&
      titlebar.reloaded === false &&
      titlebar.stripMounted === true &&
      restored.siteTop === 0;
  } catch (error) {
    log.error = String(error);
    log.pass = false;
  }

  process.stdout.write(
    `DOCK_TEST ${JSON.stringify({ ...log, userData: app.getPath("userData") })}\n`,
  );
}

export type { WebContentsView };

/**
 * Verifies extension support end-to-end. Run with TLACHIALONI_EXTENSION_TEST=1;
 * override the store target with TLACHIALONI_EXTENSION_URL / _ID.
 *
 * Two checks: (1) the store install command the palette dispatches actually
 * downloads, loads, and persists; (2) an extension loaded into the guest session
 * injects into the guest page but never into a page in the shell's session.
 */
export async function runExtensionSelfTest(appWindow: AppWindow): Promise<void> {
  const id = process.env.TLACHIALONI_EXTENSION_ID ?? "fmkadmapgofadopljbjfkapdkoienihi";
  const url =
    process.env.TLACHIALONI_EXTENSION_URL ??
    `https://chromewebstore.google.com/detail/react-developer-tools/${id}`;
  const log: Record<string, unknown> = { url };
  const cleanups: Array<() => void> = [];

  try {
    // (1) The exact command the palette dispatches for a store install.
    const result = await appWindow.runCommand("extensions.install", id);
    const record = appWindow.getState().extensions.find((entry) => entry.id === id) ?? null;
    const guestLoaded = appWindow.siteView.webContents.session.extensions
      .getAllExtensions()
      .map((entry) => `${entry.name}@${entry.version}`);
    log.install = { result, record, guestLoaded };

    // (2) Injection isolation: a content-script extension loaded into the guest
    // session must run in the guest but not in a page in the shell's session.
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "tlachialoni-isolation-"));
    fs.writeFileSync(
      path.join(probeDir, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Isolation Probe",
        version: "1.0.0",
        content_scripts: [{ matches: ["http://127.0.0.1/*"], js: ["probe.js"] }],
      }),
    );
    fs.writeFileSync(
      path.join(probeDir, "probe.js"),
      "document.documentElement.setAttribute('data-tlachialoni-probe','1');",
    );
    cleanups.push(() => fs.rmSync(probeDir, { recursive: true, force: true }));

    const guestSession = appWindow.siteView.webContents.session;
    await guestSession.extensions.loadExtension(probeDir);

    const server = http.createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end("<h1>probe</h1>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => server.close());
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const target = `http://127.0.0.1:${port}/`;

    const guestWindow = new BrowserWindow({
      show: false,
      webPreferences: { session: guestSession },
    });
    cleanups.push(() => guestWindow.destroy());
    await guestWindow.loadURL(target);
    const guestInjected = await guestWindow.webContents.executeJavaScript(
      "document.documentElement.getAttribute('data-tlachialoni-probe')",
    );

    const shellSession = appWindow.shellView.webContents.session;
    const shellWindow = new BrowserWindow({
      show: false,
      webPreferences: { session: shellSession },
    });
    cleanups.push(() => shellWindow.destroy());
    await shellWindow.loadURL(target);
    const shellInjected = await shellWindow.webContents.executeJavaScript(
      "document.documentElement.getAttribute('data-tlachialoni-probe')",
    );

    log.isolation = { guestInjected, shellInjected };
    log.pass = Boolean(
      result.ok && record?.enabled === true && guestInjected === "1" && shellInjected === null,
    );
  } catch (error) {
    log.error = String(error);
    log.pass = false;
  } finally {
    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch {
        // best-effort teardown
      }
    }
  }

  process.stdout.write(`EXTENSION_TEST ${JSON.stringify(log)}\n`);
  app.exit(0);
}

/**
 * Captures the shell surfaces to PNGs so the UI can be reviewed without a human
 * at the screen. Run with TLACHIALONI_UI_SNAPSHOT=1.
 */
export async function runUiSnapshot(appWindow: AppWindow): Promise<void> {
  const out = process.env.TLACHIALONI_SNAPSHOT_DIR ?? "/tmp";
  const shell = appWindow.shellView.webContents;

  for (let i = 0; i < 50 && !appWindow.isShellReady(); i++) await wait(100);

  // Load a live target so the failure view does not mask the other surfaces.
  appWindow.navigate(process.env.TLACHIALONI_SNAPSHOT_TARGET ?? "http://localhost:4321");
  await wait(1600);
  const mainTarget = appWindow.getState().target;

  const probe = (selector: string) =>
    shell.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    ) as Promise<boolean>;

  // Palette, in the jade variant to prove theming.
  appWindow.setVariant("jade");
  const paletteResult = await appWindow.runCommand("palette.open");
  await wait(1200);
  fs.writeFileSync(`${out}/tlachialoni-palette.png`, (await shell.capturePage()).toPNG());
  const paletteMounted = await probe(".palette");

  // Strip only.
  await appWindow.runCommand("palette.close");
  await wait(300);
  await appWindow.runCommand("strip.toggle");
  await wait(500);
  fs.writeFileSync(`${out}/tlachialoni-strip.png`, (await shell.capturePage()).toPNG());
  const stripMounted = await probe(".strip");
  const stripText = (await shell.executeJavaScript(
    "document.querySelector('.strip__host') ? document.querySelector('.strip__host').textContent : null",
  )) as string | null;

  // Light mode strip.
  appWindow.setColorMode("light");
  await wait(500);
  fs.writeFileSync(`${out}/tlachialoni-strip-light.png`, (await shell.capturePage()).toPNG());
  appWindow.setColorMode("dark");

  // Failure view: point at a port with nothing listening.
  appWindow.navigate("http://localhost:4599");
  await wait(2200);
  fs.writeFileSync(`${out}/tlachialoni-failure.png`, (await shell.capturePage()).toPNG());
  const failureMounted = await probe(".failure");

  // Dev-only preview driver (008): capture a surface kept on screen for styling.
  const preview = process.env.TLACHIALONI_SNAPSHOT_STATUS;
  if (preview === "demo" || preview === "veil" || preview === "failure") {
    if (preview === "demo") appWindow.startExtensionStatusDemo();
    else if (preview === "veil") appWindow.previewLoadingVeil();
    else appWindow.previewFailureView();
    await wait(preview === "demo" ? 1600 : 700);
    fs.writeFileSync(
      `${out}/tlachialoni-preview-${preview}.png`,
      (await shell.capturePage()).toPNG(),
    );
    appWindow.stopSurfacePreview();
    await wait(300);
  }

  // Extension status surface (007): a determinate download, then a terminal
  // error. The page's inner height must not change while it is visible.
  const siteHeight = () =>
    appWindow.siteView.webContents.executeJavaScript("window.innerHeight") as Promise<number>;
  const heightBeforeStatus = await siteHeight();
  appWindow.extensions.onStatus?.({
    phase: "downloading",
    name: "React Developer Tools",
    message: "Downloading from the Chrome Web Store",
    progress: { received: 420000, total: 670658 },
  });
  await wait(700);
  fs.writeFileSync(`${out}/tlachialoni-extension-status.png`, (await shell.capturePage()).toPNG());
  const statusMounted = await probe(".status");
  const statusTitle = (await shell.executeJavaScript(
    "document.querySelector('.status__title')?.textContent ?? null",
  )) as string | null;
  const statusFill = (await shell.executeJavaScript(
    "document.querySelector('.status__fill')?.style.width ?? null",
  )) as string | null;
  const heightDuringStatus = await siteHeight();

  appWindow.extensions.onStatus?.({
    phase: "error",
    name: "React Developer Tools",
    message: "Couldn't install React Developer Tools",
    error: "The store returned HTTP 404",
  });
  await wait(400);
  fs.writeFileSync(`${out}/tlachialoni-extension-error.png`, (await shell.capturePage()).toPNG());
  await appWindow.runCommand("extensions.dismissStatus");
  await wait(400);
  const statusDismissed = !(await probe(".status"));

  process.stdout.write(
    `UI_SNAPSHOT ${JSON.stringify({
      dir: out,
      paletteResult,
      paletteMounted,
      stripMounted,
      failureMounted,
      mainTargetAfterNavigate: mainTarget,
      stripText,
      extensionStatus: {
        mounted: statusMounted,
        title: statusTitle,
        fill: statusFill,
        dismissed: statusDismissed,
        heightUnchanged: heightBeforeStatus === heightDuringStatus,
      },
    })}\n`,
  );
}
