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
  /** The service worker script the background page now loads. */
  workerScript: string;
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
 * MV2 manifest already, or a module worker, which MV2's classic `scripts`
 * cannot load with the same import semantics.
 *
 * Anything the rewrite cannot express (a `declarative_net_request` block, say)
 * is left in place rather than half-translated. If the MV2 parser then rejects
 * the manifest, the caller falls back to loading the authored copy, so an
 * extension we cannot help is never made worse than it already was.
 */
export function shimMv3ToMv2(source: ExtensionManifest): Mv2Shim | null {
  const original = source.raw;
  if (original.manifest_version !== 3) return null;

  const background = original.background;
  if (!isRecord(background)) return null;

  const workerScript = background.service_worker;
  if (typeof workerScript !== "string" || !workerScript) return null;
  if (background.type === "module") return null;

  const manifest: Record<string, unknown> = { ...original };

  manifest.manifest_version = 2;
  // `persistent: true` matters: an event page suspends after 30s idle, and a
  // long-lived port is the only thing keeping a multiplexer's ports alive. A
  // suspended background is the exact failure this rewrite exists to remove.
  manifest.background = { scripts: [workerScript], persistent: true };

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

  // `world: "MAIN"` is MV3-only. Dropping it costs a content script its
  // main-world view of the page; keeping it makes the MV2 parser unhappy.
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
