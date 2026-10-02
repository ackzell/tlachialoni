/**
 * Manifest rewriting for extensions Electron cannot host as authored.
 *
 * Electron does not run Manifest V3 background service workers. Registration
 * fails outright, so an MV3 extension still loads but its background context
 * never starts. Framework developer tools are the painful case: they relay
 * every message between their DevTools panel and the inspected page through
 * that background, so with it dead the panel sits there reporting that no
 * application was found — while the page in front of it is an Angular or Vue
 * app the extension's own content script can see perfectly well.
 *
 * The workaround is to declare the extension as MV2 with a persistent
 * background page. Electron does host those, and once the background is a real
 * declared context Chromium delivers `runtime.onConnect` ports to it natively,
 * which is the part no amount of our own plumbing could have reproduced.
 *
 * Only the manifest changes. No extension code is patched, and the rewrite is
 * written to a sibling directory so the installed copy stays byte-identical to
 * what the store served.
 *
 * Pure module (no Electron, no `node:fs`) so it is unit-testable.
 */

import type { ExtensionManifest } from "./crx";

/** A manifest rewritten into the MV2 background-page shape. */
export interface Mv2Shim {
  /** The rewritten manifest, ready to serialize as `manifest.json`. */
  manifest: Record<string, unknown>;
  /**
   * The authored `background.service_worker`, carried through for provenance.
   * Not necessarily what `background.scripts` ends up naming — see
   * {@link workerScriptsFor}.
   */
  workerScript: string;
}

/**
 * The scripts an MV2 background page must declare, given an MV3 worker's source.
 *
 * A service worker may load its real code with `importScripts`, which is a
 * `WorkerGlobalScope` method. An MV2 background *page* is a DOM document and has
 * no `importScripts`, so a worker built that way dies on its first statement
 * under a rewrite — the manifest loads, the background page starts, and every
 * later feature of the extension is missing for no visible reason. axe DevTools
 * ships exactly this: a 60-byte worker whose whole body is
 * `importScripts("browser-polyfill.js","background.bundle.js")`.
 *
 * MV2 expresses the same thing directly, because `background.scripts` loads its
 * entries in order into one shared global — which is what the worker was using
 * `importScripts` to achieve. So the imports become the `scripts` list.
 *
 * Returns `{ kind: "self-contained" }` when the worker needs no help, and
 * `{ kind: "imports", scripts }` when its imports must be hoisted. Only a worker
 * that uses `importScripts` *and* cannot be translated returns
 * `{ kind: "untranslatable" }`, and the caller declines the whole rewrite: a
 * worker that mixes `importScripts` with other top-level code, passes a
 * non-literal argument, or nests an `importScripts` inside a callback.
 * Half-translating would produce a background page that loads and then
 * misbehaves, which is harder to diagnose than not converting at all.
 *
 * The three cases are distinct values rather than one nullable list on purpose:
 * "this worker does not use importScripts" and "this worker uses it and I cannot
 * translate it" both want different outcomes, and collapsing them into `null`
 * silently declines every self-contained worker — which is most of them.
 *
 * Import paths are resolved against the worker's own directory, because that is
 * where `importScripts` resolves them from. Manifest paths are always
 * POSIX-separated, so this does not need `node:path`.
 */
export type WorkerScripts =
  | { kind: "self-contained" }
  | { kind: "imports"; scripts: string[] }
  | { kind: "untranslatable" };

export function workerScriptsFor(workerScript: string, source: string): WorkerScripts {
  // Strip comments before deciding, so a file whose only mention of
  // `importScripts` is inside a doc comment is still self-contained.
  const body = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .trim();
  // No `importScripts` anywhere: an ordinary self-contained worker, which is the
  // common case and needs nothing from us.
  if (!/\bimportScripts\s*\(/.test(body)) return { kind: "self-contained" };
  // A whole-file importScripts shim, so the scripts list is the entire behaviour
  // of the worker and nothing is dropped.
  if (!body.startsWith("importScripts(")) return { kind: "untranslatable" };

  const scripts: string[] = [];
  let rest = body;
  // Each pass consumes one `importScripts("a", "b");` call.
  for (;;) {
    const call = /^importScripts\(\s*((?:"[^"]*"\s*,\s*)*"[^"]*")\s*\)\s*;?/.exec(rest);
    if (!call) return { kind: "untranslatable" };
    for (const match of call[1].matchAll(/"([^"]*)"/g)) {
      const target = match[1];
      if (!target || target.startsWith("/")) return { kind: "untranslatable" };
      scripts.push(joinPosix(dirnamePosix(workerScript), target));
    }
    rest = rest.slice(call[0].length).trim();
    if (!rest) return { kind: "imports", scripts };
  }
}

function dirnamePosix(p: string): string {
  const cut = p.lastIndexOf("/");
  return cut < 0 ? "" : p.slice(0, cut);
}

/** Joins a worker-relative import to the extension root, resolving `.` and `..`. */
function joinPosix(dir: string, target: string): string {
  const segments = (dir ? `${dir}/${target}` : target).split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/**
 * Extensions whose MAIN-world content script is load-bearing, so the rewrite
 * MUST be declined even where it would otherwise apply.
 *
 * Manifest V2 has no `world` key: Chromium's parser rejects it outright — "The
 * 'world' property is restricted to extensions with 'manifest_version' set to 3
 * or higher", verified against the string table in Electron 44's own binary. A
 * rewrite therefore *silently demotes* every main-world content script to the
 * isolated world, where it writes to a global the page cannot see. For most
 * extensions that costs nothing worth keeping. For these it costs the feature:
 *
 * - **Vue.js devtools** installs `window.__VUE_DEVTOOLS_GLOBAL_HOOK__` and the
 *   `__VUE_DEVTOOLS_KIT_*` RPC channels from `dist/prepare.js`, a main-world
 *   script at `document_start`. `pages/devtools-background.html` then polls
 *   `chrome.devtools.inspectedWindow.eval` for that hook and only calls
 *   `chrome.devtools.panels.create` once it appears, so demoted, the Vue panel
 *   is never created at all.
 *
 * Declining is the right trade for it, because Vue does not need the background
 * the rewrite would hand it. Its panel reaches the page over
 * `inspectedWindow.eval`, not a port; the one path that *does* use the
 * background (`runtime.connect` paired with `chrome.scripting.executeScript` of
 * `dist/proxy.js`) cannot work in Electron either way, since `chrome.scripting`
 * is not compiled in. So before this feature Vue worked with a dead worker, and
 * the rewrite removed the one thing it needed in order to supply the one thing
 * it did not.
 *
 * Keyed on `name` because that is the one field stable across versions and
 * install paths — an unpacked extension's ID is derived from the directory it
 * loads from, so the same extension gets a different ID in the `.shim` copy. A
 * localized `__MSG_*` name will not match, and is rewritten: rewriting is the
 * default, and declining is the exception that needs evidence.
 */
const MAIN_WORLD_REQUIRED = new Set(["Vue.js devtools"]);

/**
 * True when this extension's main-world content script is what makes it work, so
 * the rewrite is declined deliberately rather than by a parser rejection.
 *
 * Callers use this to tell the developer *which* of the two things happened: a
 * deliberate trade still leaves a dead background, but not a broken extension.
 */
export function requiresMainWorld(manifest: ExtensionManifest): boolean {
  return MAIN_WORLD_REQUIRED.has(manifest.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Rewrites an MV3 manifest that relies on a background service worker into the
 * MV2 equivalent Electron can host, or returns `null` when there is nothing to
 * rewrite.
 *
 * `null` means "leave this extension alone", which is the right answer for
 * every case where MV2 cannot express the MV3 manifest: no service worker, an
 * MV2 manifest already, a module worker, which MV2's classic `scripts` cannot
 * load with the same import semantics, a worker that loads its code through
 * `importScripts`, which an MV2 background page has no equivalent for (see
 * {@link workerScriptsFor}), or one whose main-world content script is
 * load-bearing (see {@link MAIN_WORLD_REQUIRED}).
 *
 * `options.workerSource` is the worker's file contents. It is optional so the
 * transform stays pure and usable without touching disk, but callers that are
 * about to write a rewrite MUST pass it: without it a worker that depends on
 * `importScripts` is rewritten into a background page that cannot run it.
 *
 * A worker with no `importScripts` is unaffected either way, and is the common
 * case — Angular DevTools and Vue's workers are both self-contained.
 *
 * Anything the rewrite cannot express (a `declarative_net_request` block, say)
 * is left in place rather than half-translated. If the MV2 parser then rejects
 * the manifest, the caller falls back to loading the authored copy, so an
 * extension we cannot help is never made worse than it already was.
 */
export function shimMv3ToMv2(
  source: ExtensionManifest,
  options: { workerSource?: string } = {},
): Mv2Shim | null {
  const original = source.raw;
  if (original.manifest_version !== 3) return null;

  const background = original.background;
  if (!isRecord(background)) return null;

  const workerScript = background.service_worker;
  if (typeof workerScript !== "string" || !workerScript) return null;
  if (background.type === "module") return null;
  // Checked before any work, because this one is a decision rather than a
  // limitation: MV2 cannot host a main-world content script at all, so
  // rewriting would trade a working extension for a dead background.
  if (requiresMainWorld(source)) return null;

  // A worker that pulls its code in with `importScripts` cannot run as an MV2
  // background page, which has no such function. Those imports become the
  // `scripts` list instead; a worker mixing them with other top-level code is
  // declined, because there is no faithful `scripts` list for it.
  let scripts = [workerScript];
  if (options.workerSource !== undefined) {
    const resolved = workerScriptsFor(workerScript, options.workerSource);
    if (resolved.kind === "untranslatable") return null;
    if (resolved.kind === "imports") scripts = resolved.scripts;
  }

  const manifest: Record<string, unknown> = { ...original };

  manifest.manifest_version = 2;
  // `persistent: true` matters: an event page suspends after 30s idle, and a
  // long-lived port is the only thing keeping a multiplexer's ports alive. A
  // suspended background is the exact failure this rewrite exists to remove.
  manifest.background = { scripts, persistent: true };

  // MV3 keys the policy object by context; MV2 takes the extension-pages string.
  if (isRecord(original.content_security_policy)) {
    const pages = original.content_security_policy.extension_pages;
    if (typeof pages === "string") manifest.content_security_policy = pages;
    else delete manifest.content_security_policy;
  }

  // MV3 renamed `browser_action` to `action`.
  if (isRecord(original.action) && !original.browser_action) {
    manifest.browser_action = original.action;
    delete manifest.action;
  }

  // MV3 wraps each entry with its own matches/extension_ids; MV2 wants a flat
  // list of paths. Accept both shapes so an already-flat manifest round-trips.
  if (original.web_accessible_resources !== undefined) {
    const entries = Array.isArray(original.web_accessible_resources)
      ? original.web_accessible_resources
      : [];
    manifest.web_accessible_resources = unique([
      ...strings(original.web_accessible_resources),
      ...entries.filter(isRecord).flatMap((entry) => strings(entry.resources)),
    ]);
  }

  // MV2 folds host patterns into `permissions` rather than separating them.
  const permissions = unique([
    ...strings(original.permissions),
    ...strings(original.host_permissions),
  ]);
  if (permissions.length) manifest.permissions = permissions;
  delete manifest.host_permissions;

  const optional = unique([
    ...strings(original.optional_permissions),
    ...strings(original.optional_host_permissions),
  ]);
  if (optional.length) manifest.optional_permissions = optional;
  delete manifest.optional_host_permissions;

  // `world: "MAIN"` is MV3-only, and the MV2 parser rejects the key outright
  // rather than ignoring it. Stripping it costs a content script its main-world
  // view of the page — free for an extension that gets its main-world access
  // another way, and fatal for one that does not, which is why those are
  // declined above rather than rewritten.
  if (Array.isArray(original.content_scripts)) {
    manifest.content_scripts = original.content_scripts.filter(isRecord).map((script) => {
      if (!("world" in script)) return script;
      const copy = { ...script };
      delete copy.world;
      return copy;
    });
  }

  return { manifest, workerScript };
}
