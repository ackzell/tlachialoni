/**
 * Runs the static audit against every installed extension, then cross-checks the
 * one fact the static pass cannot know: which `chrome.*` namespaces actually
 * exist at runtime.
 *
 *   ./node_modules/.bin/electron spikes/extension-audit/probe.mjs
 *
 * The namespace list is derived from Electron itself rather than trusted from
 * `KNOWN_ABSENT_NAMESPACES`, so this either agrees with the static pass or says
 * why not. That disagreement is the interesting output: it means the hardcoded
 * list has drifted from the binary.
 *
 * Nothing is installed, loaded, or written. This only reads files.
 *
 * Quit Tlachialoni first if you want the on-disk state to be settled, but this
 * does not touch the extension folders, so it is safe either way.
 */

import { app } from "electron";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { auditExtension, formatReport, KNOWN_ABSENT_NAMESPACES } from "./audit.mjs";

const ROOT = join(process.env.HOME, "Library/Application Support/Tlachialoni/extensions");

app.whenReady().then(async () => {
  if (!existsSync(ROOT)) {
    console.log(`no extensions installed at ${ROOT}`);
    app.exit(0);
    return;
  }

  const dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => join(ROOT, e.name));

  if (!dirs.length) {
    console.log(`no extensions installed at ${ROOT}`);
    app.exit(0);
    return;
  }

  console.log("=== static audit ===\n");
  const reports = dirs.map(auditExtension);
  for (const report of reports) console.log(`${formatReport(report)}\n`);

  // The runtime cross-check. `chrome` in the main process is not the extension
  // `chrome`, so this is only meaningful as a *second opinion on the list*, not
  // as a measurement of any extension's view. See README.md for why.
  console.log("=== runtime namespace cross-check ===\n");
  const observed = typeof chrome === "object" && chrome !== null ? Object.keys(chrome) : [];
  console.log(`  electron main process exposes: ${observed.length} chrome.* namespaces`);
  console.log(
    `  static audit claims absent:     ${KNOWN_ABSENT_NAMESPACES.join(", ") || "(none)"}`,
  );

  const alsoPresent = KNOWN_ABSENT_NAMESPACES.filter((n) => observed.includes(n));
  if (alsoPresent.length) {
    console.log(
      `\n  MISMATCH: ${alsoPresent.join(", ")} is on the absent list but the runtime has it.\n` +
        "  KNOWN_ABSENT_NAMESPACES needs updating — this is what this probe is for.",
    );
  } else {
    console.log("\n  consistent: nothing on the absent list appears at runtime.");
  }

  app.exit(0);
});
