import { app } from "electron";
import fs from "node:fs";
import type { WebContentsView } from "electron";
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

    log.pass =
      bottom.innerHeight < baseline.innerHeight &&
      right.innerWidth < baseline.innerWidth &&
      overlayArmed === 1 &&
      overlayDisarmed === 0 &&
      Boolean((log.shortcutSite as { toggled: boolean }).toggled);
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
