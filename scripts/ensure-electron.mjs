/**
 * Makes sure the Electron binary matches the installed `electron` package.
 *
 * The `electron` package ships `install.js` but declares no `scripts` key, so
 * pnpm never runs it as a package lifecycle. The binary comes from the root
 * `postinstall` instead, but pnpm does not run that hook on `pnpm update`. After
 * an Electron upgrade the package is present and `dist/` is not, so `pnpm dev`
 * fails with an error that names neither cause.
 *
 * This script runs before every unpackaged launch. It mirrors electron's own
 * `isInstalled()` check and is cheap when the binary is already current: one
 * package lookup, two small file reads, and no child process. The download
 * itself stays in `install.js`, which also honours
 * `ELECTRON_SKIP_BINARY_DOWNLOAD`.
 *
 * A missing `electron` package is not an error. A production-only install has
 * no dev dependencies, and there is no binary to fetch.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** The `electron` package resolves through the pnpm virtual store. */
function electronDir() {
  try {
    return path.dirname(require.resolve("electron/package.json"));
  } catch {
    return null;
  }
}

function readTrimmed(file) {
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

function main() {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) return;

  const dir = electronDir();
  if (!dir) return;

  const { version } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const binary = readTrimmed(path.join(dir, "dist", "version"))?.replace(/^v/, "");

  if (binary === version) return;

  process.stdout.write(`electron: fetching ${version} binary\n`);
  execFileSync(process.execPath, [path.join(dir, "install.js")], {
    cwd: dir,
    stdio: "inherit",
  });
}

main();
