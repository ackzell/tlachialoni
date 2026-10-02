/**
 * Static audit of an unpacked extension folder.
 *
 * Answers one question: if the developer installs this, what will not work, and
 * how confident can we be about that? Every finding here is derived from the
 * manifest and the background worker file — no Electron, no network, no
 * installing anything.
 *
 * Deliberately does NOT re-implement the manifest rewrite. It reports what the
 * worker needs; `src/main/extensions/mv2-shim.ts` decides what to do about it.
 * Two answers drifting apart is the failure mode this file exists to prevent, so
 * this one stays declarative.
 *
 * The honest limit, and the reason `--json` exists: a static audit can say an
 * extension *uses* a capability, never whether it *needs* it. Whether a
 * `world: "MAIN"` script is the whole feature or one incidental flag is a
 * judgement about the extension, not a fact about its files, so it is reported
 * as `needs-human` rather than guessed. See README.md.
 *
 * Run standalone:  node spikes/extension-audit/audit.mjs <extension-dir>...
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Extension API namespaces absent from Electron. Verified by scanning the
 * Electron Framework binary for its compiled API tables (`"namespace":"…"`),
 * which is the same method `spikes/mv2-background-shim/results.md` used to show
 * `debugger` is missing outright while `scripting` is present.
 *
 * Kept as data with the method recorded, because this is a fact about a specific
 * Electron build that will change. `probe.mjs` re-derives it at runtime, which is
 * the authoritative check.
 */
export const KNOWN_ABSENT_NAMESPACES = ["debugger"];

/** MV3-only manifest keys the shipped rewrite does not translate. */
const UNTRANSLATED_KEYS = ["declarative_net_request", "sandbox"];

const SEVERITY = { ok: "ok", warn: "warn", blocked: "blocked", human: "needs-human" };

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

/** Every permission string an extension asks for, across MV3's split fields. */
function requestedPermissions(manifest) {
  return [
    ...(manifest.permissions ?? []),
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ].filter((value) => typeof value === "string");
}

/**
 * Classifies the background worker the way `mv2-shim.ts` has to.
 * Returns null when the manifest has no classic service worker to reason about.
 */
function inspectWorker(manifest, dir) {
  const background = manifest.background;
  if (typeof background !== "object" || background === null) return null;
  const worker = background.service_worker;
  if (typeof worker !== "string" || !worker) return null;

  if (background.type === "module") {
    return {
      kind: "module",
      finding:
        "module service worker — MV2 classic `scripts` cannot load it, so no rewrite is possible",
      severity: SEVERITY.blocked,
    };
  }

  const file = join(dir, ...worker.split("/"));
  if (!existsSync(file)) {
    return {
      kind: "missing-file",
      finding: `worker file ${worker} is not in the folder — cannot verify it`,
      severity: SEVERITY.human,
    };
  }

  const source = readFileSync(file, "utf8");
  const body = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .trim();

  if (!/\bimportScripts\s*\(/.test(body)) {
    return { kind: "self-contained", finding: null, severity: SEVERITY.ok };
  }
  if (!body.startsWith("importScripts(")) {
    return {
      kind: "importScripts-mixed",
      finding:
        "worker mixes importScripts with other top-level code — no faithful MV2 scripts list, so the rewrite is declined",
      severity: SEVERITY.blocked,
    };
  }

  const imports = [...body.matchAll(/^importScripts\(\s*((?:"[^"]*"\s*,\s*)*"[^"]*")/gm)].flatMap(
    (call) => [...call[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]),
  );

  return {
    kind: "importScripts-shim",
    scripts: imports,
    finding: `worker is an importScripts shim over ${imports.length} script(s) — rewritten into background.scripts`,
    severity: SEVERITY.ok,
  };
}

/**
 * Audits one extension folder. Never throws: a folder we cannot read is itself a
 * finding, not a crash.
 */
export function auditExtension(dir) {
  const manifestPath = join(dir, "manifest.json");
  const findings = [];

  if (!existsSync(manifestPath)) {
    return {
      dir,
      name: basename(dir),
      ok: false,
      findings: [
        {
          severity: SEVERITY.blocked,
          area: "manifest",
          finding: "no manifest.json — this is not an extension folder",
        },
      ],
    };
  }

  const manifest = readJson(manifestPath);
  if (manifest.__error) {
    return {
      dir,
      name: basename(dir),
      ok: false,
      findings: [
        {
          severity: SEVERITY.blocked,
          area: "manifest",
          finding: `manifest.json is not readable JSON: ${manifest.__error}`,
        },
      ],
    };
  }

  const mv = manifest.manifest_version;
  const mainWorldScripts = (manifest.content_scripts ?? [])
    .filter((script) => script && script.world === "MAIN")
    .flatMap((script) => script.js ?? []);

  const worker = inspectWorker(manifest, dir);

  // -- background ---------------------------------------------------------
  if (worker?.finding) {
    findings.push({ severity: worker.severity, area: "background", finding: worker.finding });
  }
  if (mv === 3 && !worker) {
    findings.push({
      severity: SEVERITY.warn,
      area: "background",
      finding: "MV3 with no background service worker — nothing to rewrite, loads as authored",
    });
  }

  // -- main world ---------------------------------------------------------
  if (mainWorldScripts.length) {
    findings.push({
      severity: SEVERITY.human,
      area: "main-world",
      finding:
        `content script(s) run in the page's own world (${mainWorldScripts.join(", ")}). ` +
        "MV2 cannot express this, so rewriting demotes them to the isolated world, where the page cannot see what they set. " +
        "Whether that is fatal depends on the extension, not on the manifest — needs a human to decide",
    });
  }

  // -- absent APIs --------------------------------------------------------
  const permissions = requestedPermissions(manifest);
  const absent = permissions.filter((p) => KNOWN_ABSENT_NAMESPACES.includes(p));
  for (const permission of absent) {
    findings.push({
      severity: SEVERITY.blocked,
      area: "api",
      finding:
        `requests chrome.${permission}, which Electron does not ship at all. ` +
        "Any feature that depends on it cannot work here and no manifest change can provide it",
    });
  }

  // MV3-only APIs that exist but are gated behind MV3, so the rewrite removes them.
  if (permissions.includes("scripting")) {
    findings.push({
      severity: SEVERITY.warn,
      area: "api",
      finding:
        "requests chrome.scripting, which needs manifest_version 3 — available on the authored copy, unavailable after a rewrite. " +
        "If the extension injects scripts with it, that injection stops working",
    });
  }

  // -- manifest shapes ----------------------------------------------------
  for (const key of UNTRANSLATED_KEYS) {
    if (manifest[key] !== undefined) {
      findings.push({
        severity: SEVERITY.warn,
        area: "manifest",
        finding: `declares \`${key}\`, which the rewrite does not translate — the MV2 parser may reject the manifest and the authored copy is loaded instead`,
      });
    }
  }
  if (mv === 3 && manifest.host_permissions) {
    findings.push({
      severity: SEVERITY.ok,
      area: "manifest",
      finding: `host_permissions folded into permissions (${manifest.host_permissions.length} pattern(s))`,
    });
  }

  // -- verdict ------------------------------------------------------------
  const blocked = findings.filter((f) => f.severity === SEVERITY.blocked);
  const needsHuman = findings.filter((f) => f.severity === SEVERITY.human);
  const warns = findings.filter((f) => f.severity === SEVERITY.warn);

  return {
    dir,
    name: manifest.name ?? basename(dir),
    version: manifest.version ?? "unknown",
    manifestVersion: mv,
    ok: true,
    workerKind: worker?.kind ?? null,
    mainWorldScripts,
    absentApis: absent,
    findings,
    verdict: blocked.length
      ? "will-load-but-parts-wont-work"
      : needsHuman.length
        ? "needs-a-human-decision"
        : warns.length
          ? "should-work"
          : "should-work",
  };
}

/** A fingerprint of what the audit concluded, for change detection between runs. */
export function fingerprint(report) {
  return JSON.stringify({
    name: report.name,
    version: report.version,
    workerKind: report.workerKind ?? null,
    mainWorldScripts: report.mainWorldScripts ?? [],
    absentApis: report.absentApis ?? [],
  });
}

export function formatReport(report) {
  const lines = [];
  const head = report.ok
    ? `${report.name} ${report.version} (MV${report.manifestVersion})`
    : `${report.name}`;
  lines.push(head);
  lines.push(`  ${report.verdict ?? "unreadable"}`);
  for (const finding of report.findings ?? []) {
    const mark = finding.severity === SEVERITY.ok ? "+" : "!";
    lines.push(`  ${mark} ${finding.area.padEnd(10)} ${finding.finding}`);
  }
  if (!report.findings?.length) lines.push("  (nothing to report)");
  return lines.join("\n");
}

// ---- CLI ------------------------------------------------------------------

function main(argv) {
  const dirs = argv.filter((a) => !a.startsWith("-"));
  if (!dirs.length) {
    console.error("usage: node audit.mjs <extension-dir>...");
    process.exit(2);
  }
  const reports = dirs.map(auditExtension);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) console.log(formatReport(report));
  }
}

// Only run when invoked directly, so `probe.mjs` can import this.
if (process.argv[1] && process.argv[1].endsWith("audit.mjs")) {
  main(process.argv.slice(2));
}
