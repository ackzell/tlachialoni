import fs from "node:fs";
import type { WebContentsView } from "electron";
import type { AppWindow } from "./shell/window";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the DevTools front-end dock state (undocumented but stable API). */
async function dockState(wc: Electron.WebContents): Promise<string | null> {
  const devtools = wc.devToolsWebContents;
  if (!devtools) return null;
  try {
    const state = await devtools.executeJavaScript(
      "(() => { try { return EUI.DockController.DockController.instance().state(); } catch (e) { try { return SDK.DockController.DockController.instance().state(); } catch (e2) { return null; } } })()",
    );
    return typeof state === "string" ? state : null;
  } catch {
    return null;
  }
}

interface Measurement {
  innerHeight: number;
  innerWidth: number;
}

/**
 * M0 spike gate. Proves DevTools dock *inside* the window: a docked panel shrinks
 * the page viewport, a detached one does not. Also reads the DevTools front-end
 * dock state as a second signal. Run with LOCALBROWSER_DOCK_TEST=1.
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

    // Picker overlay lifecycle (FR-013): injected only while armed.
    const count = () =>
      wc.executeJavaScript(
        "document.querySelectorAll('[data-localbrowser-picker]').length",
      ) as Promise<number>;
    appWindow.pickerArm();
    await wait(300);
    const overlayArmed = await count();
    appWindow.pickerDisarm();
    await wait(300);
    const overlayDisarmed = await count();
    log.picker = { overlayArmed, overlayDisarmed };

    log.pass =
      bottom.innerHeight < baseline.innerHeight &&
      right.innerWidth < baseline.innerWidth &&
      overlayArmed === 1 &&
      overlayDisarmed === 0;
  } catch (error) {
    log.error = String(error);
    log.pass = false;
  }

  process.stdout.write(`DOCK_TEST ${JSON.stringify(log)}\n`);
}

export type { WebContentsView };

/**
 * Captures the shell surfaces to PNGs so the UI can be reviewed without a human
 * at the screen. Run with LOCALBROWSER_UI_SNAPSHOT=1.
 */
export async function runUiSnapshot(appWindow: AppWindow): Promise<void> {
  const out = process.env.LOCALBROWSER_SNAPSHOT_DIR ?? "/tmp";
  const shell = appWindow.shellView.webContents;

  for (let i = 0; i < 50 && !appWindow.isShellReady(); i++) await wait(100);

  // Load a live target so the failure view does not mask the other surfaces.
  appWindow.navigate(process.env.LOCALBROWSER_SNAPSHOT_TARGET ?? "http://localhost:4321");
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
  fs.writeFileSync(`${out}/localbrowser-palette.png`, (await shell.capturePage()).toPNG());
  const paletteMounted = await probe(".palette");

  // Strip only.
  await appWindow.runCommand("palette.close");
  await wait(300);
  await appWindow.runCommand("strip.toggle");
  await wait(500);
  fs.writeFileSync(`${out}/localbrowser-strip.png`, (await shell.capturePage()).toPNG());
  const stripMounted = await probe(".strip");
  const stripText = (await shell.executeJavaScript(
    "document.querySelector('.strip__host') ? document.querySelector('.strip__host').textContent : null",
  )) as string | null;

  // Light mode strip.
  appWindow.setColorMode("light");
  await wait(500);
  fs.writeFileSync(`${out}/localbrowser-strip-light.png`, (await shell.capturePage()).toPNG());
  appWindow.setColorMode("dark");

  // Failure view: point at a port with nothing listening.
  appWindow.navigate("http://localhost:4599");
  await wait(2200);
  fs.writeFileSync(`${out}/localbrowser-failure.png`, (await shell.capturePage()).toPNG());
  const failureMounted = await probe(".failure");

  process.stdout.write(
    `UI_SNAPSHOT ${JSON.stringify({
      dir: out,
      paletteResult,
      paletteMounted,
      stripMounted,
      failureMounted,
      mainTargetAfterNavigate: mainTarget,
      stripText,
    })}\n`,
  );
}
