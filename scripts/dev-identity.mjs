/**
 * Gives the development run its own macOS identity.
 *
 * `npm run dev` executes `node_modules/electron/dist/Electron.app`, whose
 * Info.plist still reads "Electron" / `com.github.Electron`. `src/main/index.ts`
 * overrides the Dock icon, so the dev run *looks* like the installed app while
 * macOS still files it under a different bundle id and a different name: the
 * app menu and the ⌘Tab switcher both show "Electron" next to a Tlachialoni
 * icon. `app.setName()` cannot fix that, because AppKit reads `CFBundleName`
 * from the bundle rather than from Electron at runtime — the plist itself has
 * to change.
 *
 * Editing the plist invalidates the ad-hoc signature npm ships: `codesign
 * --verify` afterwards reports "code has no resources but signature indicates
 * they must be present". The bundle is therefore re-signed ad-hoc, which is
 * also the signing level this project already builds at (`identity: null` in
 * electron-builder.yml).
 *
 * Reinstalling `electron` restores the original plist. Rather than a
 * `postinstall` hook that silently mutates dependencies, this script is cheap
 * and idempotent: it compares the three keys first and exits without touching
 * `plutil` or `codesign` when they already match, so it can run before every
 * unpackaged launch. A reverted plist is detected and re-patched.
 *
 * macOS-only; elsewhere there is no Info.plist and nothing to do.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** The plist keys AppKit reads the visible name and bundle id from. */
const IDENTITY_KEYS = {
  CFBundleName: "name",
  CFBundleDisplayName: "displayName",
  CFBundleIdentifier: "bundleId",
};

function repoRoot() {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

/**
 * The development identity, derived from the same declaration sites the shipped
 * app uses (see specs/003-standalone-packaging/contracts/app-identity.md):
 * `productName` from package.json, `appId` from electron-builder.yml. Neither
 * value is re-spelled here, so renaming the product or re-homing the bundle id
 * moves the development identity with it.
 */
function devIdentity() {
  const { productName } = JSON.parse(readFileSync(path.join(repoRoot(), "package.json"), "utf8"));
  if (!productName) throw new Error("package.json is missing `productName`");

  const builderConfig = readFileSync(path.join(repoRoot(), "electron-builder.yml"), "utf8");
  const appId = /^appId:\s*(\S+)\s*$/m.exec(builderConfig)?.[1];
  if (!appId) throw new Error("electron-builder.yml is missing a top-level `appId`");

  return {
    name: `${productName} Dev`,
    displayName: `${productName} Dev`,
    bundleId: `${appId}.dev`,
  };
}

/** The `electron` package resolves to `…/Electron.app/Contents/MacOS/Electron`. */
function electronAppBundle() {
  const binary = require("electron");
  return path.resolve(path.dirname(binary), "..", "..");
}

/** `plutil -extract … raw -o -` appends a newline, which would break the
 * already-patched comparison below and re-sign on every single run. */
function readPlistValue(plist, key) {
  return execFileSync("plutil", ["-extract", key, "raw", "-o", "-", plist], {
    encoding: "utf8",
  }).trim();
}

function main() {
  if (process.platform !== "darwin") return;

  const appBundle = electronAppBundle();
  const plist = path.join(appBundle, "Contents", "Info.plist");
  const identity = devIdentity();

  const alreadySet = Object.entries(IDENTITY_KEYS).every(
    ([key, field]) => readPlistValue(plist, key) === identity[field],
  );
  if (alreadySet) return;

  for (const [key, field] of Object.entries(IDENTITY_KEYS)) {
    execFileSync("plutil", ["-replace", key, "-string", identity[field], plist]);
  }

  // Best-effort: a previously-copied bundle under a different path does not need
  // deregistering here, because only this in-tree bundle is ever renamed.
  process.stdout.write(`dev identity: renamed ${appBundle} to "${identity.name}"\n`);
  try {
    execFileSync("codesign", ["--force", "--sign", "-", appBundle], { stdio: "pipe" });
    execFileSync("codesign", ["--verify", appBundle], { stdio: "pipe" });
  } catch (error) {
    // A broken signature makes Electron fail to launch with a message that
    // says nothing about the cause, so fail here instead, loudly.
    throw new Error(
      `re-signing ${appBundle} failed; the dev run will not launch until this succeeds\n` +
        `${error.stderr ?? error.message}`,
    );
  }
}

main();
