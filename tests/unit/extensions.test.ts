import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { parseExtensionId } from "@shared/extension-id";
import {
  crxZipOffset,
  detectMv3ServiceWorker,
  extractCrxToDir,
  extractZipToDir,
  isCrx,
  readManifest,
} from "../../src/main/extensions/crx";
import {
  requiresMainWorld,
  shimMv3ToMv2,
  workerScriptsFor,
} from "../../src/main/extensions/mv2-shim";
import { isActivePhase, shouldAutoDismiss } from "@shared/extensions";
import { crxDownloadUrl, downloadCrx } from "../../src/main/extensions/store";
import { sanitizeExtensions } from "../../src/main/state/schema";

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tlachialoni-ext-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

/** Builds a CRX3 buffer whose payload is `zip`. */
function crx3(zip: Uint8Array, headerLength = 8): Buffer {
  const header = Buffer.alloc(headerLength, 0xab);
  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0, "ascii");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(headerLength, 8);
  return Buffer.concat([prefix, header, Buffer.from(zip)]);
}

/** Builds a CRX2 buffer with dummy key/signature bytes. */
function crx2(zip: Uint8Array, keyLength = 4, signatureLength = 6): Buffer {
  const prefix = Buffer.alloc(16);
  prefix.write("Cr24", 0, "ascii");
  prefix.writeUInt32LE(2, 4);
  prefix.writeUInt32LE(keyLength, 8);
  prefix.writeUInt32LE(signatureLength, 12);
  return Buffer.concat([
    prefix,
    Buffer.alloc(keyLength, 1),
    Buffer.alloc(signatureLength, 2),
    Buffer.from(zip),
  ]);
}

describe("parseExtensionId", () => {
  const id = "fmkadmapgofadopljbjfkapdkoienihi";

  it("accepts a raw ID", () => {
    expect(parseExtensionId(id)).toBe(id);
  });

  it("accepts current and legacy store URLs", () => {
    expect(parseExtensionId(`https://chromewebstore.google.com/detail/react-devtools/${id}`)).toBe(
      id,
    );
    expect(
      parseExtensionId(`https://chrome.google.com/webstore/detail/react-devtools/${id}?hl=en`),
    ).toBe(id);
  });

  it("rejects non-store URLs, other schemes, and near-miss IDs", () => {
    expect(parseExtensionId("https://example.com/detail/abc")).toBeNull();
    expect(parseExtensionId("file:///tmp/x")).toBeNull();
    expect(parseExtensionId("not-an-id")).toBeNull();
    expect(parseExtensionId("z".repeat(32))).toBeNull();
  });
});

describe("crx container", () => {
  it("locates the ZIP payload in CRX3 and CRX2", () => {
    const zip = zipSync({ "manifest.json": strToU8("{}") });
    expect(isCrx(crx3(zip, 8))).toBe(true);
    expect(crxZipOffset(crx3(zip, 8))).toBe(20);
    expect(crxZipOffset(crx2(zip, 4, 6))).toBe(26);
  });

  it("rejects a non-CRX buffer", () => {
    expect(() => crxZipOffset(Buffer.from("hello world!!"))).toThrow();
  });

  it("extracts a CRX into a directory", () => {
    const zip = zipSync({
      "manifest.json": strToU8(JSON.stringify({ name: "Demo", version: "1.0" })),
      "src/content.js": strToU8("console.log(1)"),
    });
    const dir = tmpDir();
    extractCrxToDir(crx3(zip), dir);
    expect(readManifest(dir)).toMatchObject({ name: "Demo", version: "1.0" });
    expect(fs.readFileSync(path.join(dir, "src/content.js"), "utf8")).toBe("console.log(1)");
  });

  it("refuses archive entries that escape the destination", () => {
    const zip = zipSync({ "../evil.txt": strToU8("bad") });
    expect(() => extractZipToDir(zip, tmpDir())).toThrow(/unsafe path/i);
  });

  it("reports a missing or invalid manifest", () => {
    const empty = tmpDir();
    expect(() => readManifest(empty)).toThrow(/manifest/i);
    fs.writeFileSync(path.join(empty, "manifest.json"), "{ not json");
    expect(() => readManifest(empty)).toThrow(/JSON/i);
  });
});

describe("store download", () => {
  it("builds an update-endpoint URL with the id and version", () => {
    const url = crxDownloadUrl("abc", "130.0.0.0");
    expect(url).toContain("prodversion=130.0.0.0");
    expect(decodeURIComponent(url)).toContain("id=abc&uc");
  });

  it("streams a body and reports byte progress", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-length": "4" },
      })) as typeof fetch;
    try {
      const seen: number[] = [];
      const buffer = await downloadCrx("https://example.test/crx", (received, total) => {
        seen.push(received);
        expect(total).toBe(4);
      });
      expect(buffer.length).toBe(4);
      expect(seen.at(-1)).toBe(4);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("shouldAutoDismiss", () => {
  it("leaves only a done status on its own", () => {
    // Removal emits `done` as the first and only status of a fresh surface
    // mount, so this has to hold for the value present on arrival, not just for
    // a transition into it.
    expect(shouldAutoDismiss("done")).toBe(true);
    // `warning` also carries the MV3→MV2 rewrite notice, which must survive a
    // glance (specs/019, FR-011). It uses the phase for "needs your attention",
    // not for severity.
    expect(shouldAutoDismiss("warning")).toBe(false);
    expect(shouldAutoDismiss("error")).toBe(false);
    for (const phase of [
      "resolving",
      "downloading",
      "verifying",
      "extracting",
      "loading",
    ] as const) {
      expect(shouldAutoDismiss(phase)).toBe(false);
    }
  });

  it("never marks a phase that is still in flight as auto-dismissable", () => {
    // The two predicates describe opposite sides of one state: a phase that is
    // still running must not be dismissable, or a click would cancel an install
    // that cannot be cancelled.
    for (const phase of [
      "resolving",
      "downloading",
      "verifying",
      "extracting",
      "loading",
    ] as const) {
      expect(isActivePhase(phase)).toBe(true);
      expect(shouldAutoDismiss(phase)).toBe(false);
    }
  });
});

describe("isActivePhase", () => {
  it("treats a warning as finished, so it can be dismissed and never cancels work", () => {
    // A warning is terminal like done/error: Esc and click dismiss it rather
    // than being swallowed, and no progress bar is implied (FR-006).
    expect(isActivePhase("warning")).toBe(false);
    expect(isActivePhase("done")).toBe(false);
    expect(isActivePhase("error")).toBe(false);
    for (const phase of [
      "resolving",
      "downloading",
      "verifying",
      "extracting",
      "loading",
    ] as const) {
      expect(isActivePhase(phase)).toBe(true);
    }
  });
});

describe("detectMv3ServiceWorker", () => {
  /** A manifest built from `raw`, as `readManifest` would return it. */
  function manifest(raw: Record<string, unknown>) {
    // Mirrors `readManifest`, including deriving the top-level `name` from the
    // manifest — callers that key on the extension name depend on that.
    const name = typeof raw.name === "string" ? raw.name : "Demo";
    return {
      name,
      version: "1.0",
      raw: { name, version: "1.0", ...raw },
    };
  }

  it("flags an MV3 manifest with a background service worker", () => {
    expect(detectMv3ServiceWorker(manifest({ manifest_version: 3, background: {} }))).toBe(false);
    expect(
      detectMv3ServiceWorker(manifest({ manifest_version: 3, background: { scripts: ["bg.js"] } })),
    ).toBe(false);
    expect(
      detectMv3ServiceWorker(
        manifest({ manifest_version: 3, background: { service_worker: "bg.js" } }),
      ),
    ).toBe(true);
  });

  it("does not flag MV2, or MV3 without a background", () => {
    expect(
      detectMv3ServiceWorker(manifest({ manifest_version: 2, background: { scripts: ["bg.js"] } })),
    ).toBe(false);
    expect(
      detectMv3ServiceWorker(
        manifest({ manifest_version: 2, background: { service_worker: "bg.js" } }),
      ),
    ).toBe(false);
    expect(detectMv3ServiceWorker(manifest({ manifest_version: 3 }))).toBe(false);
  });

  it("ignores a non-object background", () => {
    for (const background of ["bg.js", 3, null, true]) {
      expect(detectMv3ServiceWorker(manifest({ manifest_version: 3, background }))).toBe(false);
    }
  });

  it("treats any service_worker key as present, whatever its value", () => {
    // Presence is the signal: a manifest declaring the key is asking for a
    // service worker, and whether Electron honours the value is not our call.
    expect(
      detectMv3ServiceWorker(manifest({ manifest_version: 3, background: { service_worker: "" } })),
    ).toBe(true);
  });
});

describe("shimMv3ToMv2", () => {
  /** A manifest built from `raw`, as `readManifest` would return it. */
  function manifest(raw: Record<string, unknown>) {
    // Mirrors `readManifest`, including deriving the top-level `name` from the
    // manifest — callers that key on the extension name depend on that.
    const name = typeof raw.name === "string" ? raw.name : "Demo";
    return {
      name,
      version: "1.0",
      raw: { name, version: "1.0", ...raw },
    };
  }

  const mv3Worker = { manifest_version: 3, background: { service_worker: "bg.js" } };

  it("declares a persistent MV2 background page from the worker script", () => {
    const shim = shimMv3ToMv2(manifest(mv3Worker));
    expect(shim).not.toBeNull();
    expect(shim!.manifest.manifest_version).toBe(2);
    // Persistent, not an event page: a 30s-suspending background drops the very
    // ports this rewrite exists to keep alive.
    expect(shim!.manifest.background).toEqual({ scripts: ["bg.js"], persistent: true });
    expect(shim!.workerScript).toBe("bg.js");
  });

  it("declines manifests MV2 cannot express", () => {
    // Already MV2, MV3 with no worker, and a module worker — `scripts` loads
    // classic scripts, so a module worker has no equivalent.
    expect(
      shimMv3ToMv2(manifest({ manifest_version: 2, background: { scripts: ["bg.js"] } })),
    ).toBeNull();
    expect(shimMv3ToMv2(manifest({ manifest_version: 3 }))).toBeNull();
    expect(shimMv3ToMv2(manifest({ manifest_version: 3, background: {} }))).toBeNull();
    expect(
      shimMv3ToMv2(
        manifest({ manifest_version: 3, background: { service_worker: "bg.js", type: "module" } }),
      ),
    ).toBeNull();
    expect(shimMv3ToMv2(manifest({ manifest_version: 3, background: "bg.js" }))).toBeNull();
    expect(
      shimMv3ToMv2(manifest({ manifest_version: 3, background: { service_worker: "" } })),
    ).toBeNull();
  });

  it("flattens the MV3 content security policy object into a string", () => {
    // Electron rejects the MV3 object form outright: "Invalid value for
    // 'content_security_policy'". This was the first real failure in the spike.
    const shim = shimMv3ToMv2(
      manifest({
        ...mv3Worker,
        content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
      }),
    );
    expect(shim!.manifest.content_security_policy).toBe("script-src 'self'; object-src 'self'");
  });

  it("drops a content security policy with no usable extension_pages string", () => {
    const shim = shimMv3ToMv2(
      manifest({ ...mv3Worker, content_security_policy: { sandbox: "sandbox allow-scripts" } }),
    );
    expect(shim!.manifest.content_security_policy).toBeUndefined();
  });

  it("renames the MV3 action to the MV2 browser_action", () => {
    const shim = shimMv3ToMv2(manifest({ ...mv3Worker, action: { default_popup: "p.html" } }));
    expect(shim!.manifest.browser_action).toEqual({ default_popup: "p.html" });
    expect(shim!.manifest.action).toBeUndefined();
  });

  it("flattens wrapped web_accessible_resources and deduplicates", () => {
    const shim = shimMv3ToMv2(
      manifest({
        ...mv3Worker,
        web_accessible_resources: [
          { resources: ["a.js", "b.js"], matches: ["<all_urls>"], extension_ids: [] },
          { resources: ["b.js", "c.js"], matches: ["<all_urls>"] },
        ],
      }),
    );
    expect(shim!.manifest.web_accessible_resources).toEqual(["a.js", "b.js", "c.js"]);
  });

  it("accepts an already-flat web_accessible_resources list", () => {
    const shim = shimMv3ToMv2(manifest({ ...mv3Worker, web_accessible_resources: ["a.js"] }));
    expect(shim!.manifest.web_accessible_resources).toEqual(["a.js"]);
  });

  it("merges host patterns into permissions and drops the MV3 keys", () => {
    const shim = shimMv3ToMv2(
      manifest({
        ...mv3Worker,
        permissions: ["storage", "<all_urls>"],
        host_permissions: ["http://localhost/*", "storage"],
        optional_host_permissions: ["https://example.com/*"],
        optional_permissions: ["idle"],
      }),
    );
    expect(shim!.manifest.permissions).toEqual(["storage", "<all_urls>", "http://localhost/*"]);
    expect(shim!.manifest.host_permissions).toBeUndefined();
    expect(shim!.manifest.optional_permissions).toEqual(["idle", "https://example.com/*"]);
    expect(shim!.manifest.optional_host_permissions).toBeUndefined();
  });

  it("drops the MV3-only content script world and keeps the rest", () => {
    const shim = shimMv3ToMv2(
      manifest({
        ...mv3Worker,
        content_scripts: [
          { matches: ["<all_urls>"], js: ["a.js"], run_at: "document_start", world: "MAIN" },
          { matches: ["<all_urls>"], js: ["b.js"] },
        ],
      }),
    );
    expect(shim!.manifest.content_scripts).toEqual([
      { matches: ["<all_urls>"], js: ["a.js"], run_at: "document_start" },
      { matches: ["<all_urls>"], js: ["b.js"] },
    ]);
  });

  it("expands an importScripts worker into the background scripts list", () => {
    // axe DevTools' worker is 60 bytes and its whole body is this call.
    // `importScripts` is a WorkerGlobalScope method: an MV2 background page is a
    // DOM document, has no such function, and dies on the first statement — which
    // is why axe reported "BackgroundRecorder is not running in a known context"
    // rather than anything about a background.
    expect(
      workerScriptsFor(
        "background-worker.bundle.js",
        'importScripts("browser-polyfill.js","background.bundle.js");',
      ),
    ).toEqual({
      kind: "imports",
      scripts: ["browser-polyfill.js", "background.bundle.js"],
    });

    // A worker in a subdirectory resolves its imports relative to itself.
    expect(workerScriptsFor("app/sw.js", 'importScripts("polyfill.js", "./bg.js");')).toEqual({
      kind: "imports",
      scripts: ["app/polyfill.js", "app/bg.js"],
    });

    // Tolerates what bundlers and minifiers emit around the call.
    expect(
      workerScriptsFor("sw.js", '// prelude\n/* header */\nimportScripts( "a.js" , "b.js" ) ;\n'),
    ).toEqual({ kind: "imports", scripts: ["a.js", "b.js"] });
  });

  it("tells a self-contained worker apart from one it cannot translate", () => {
    // This distinction is the whole point of the three-way result. Reporting both
    // as "no rewrite" silently declined every self-contained worker, which is how
    // Angular DevTools stopped being rewritten at all.
    expect(workerScriptsFor("app/bg.js", "(()=>{var g=class{tabs;runtime};})();")).toEqual({
      kind: "self-contained",
    });
    expect(workerScriptsFor("sw.js", "")).toEqual({ kind: "self-contained" });
    expect(workerScriptsFor("sw.js", "// only a comment\n")).toEqual({ kind: "self-contained" });
    // Mentions `importScripts` only in a comment: still self-contained.
    expect(workerScriptsFor("sw.js", "/* calls importScripts() in the worker */\nfoo();")).toEqual({
      kind: "self-contained",
    });

    // Uses it, and cannot be translated faithfully.
    for (const source of [
      "importScripts(x);", // not a literal
      'importScripts("/rooted.js");', // absolute, would not resolve
      'importScripts("a.js"); doSomethingElse();', // not a pure shim
      'console.log("hi"); importScripts("a.js");', // leading code
      'addEventListener("install", () => importScripts("a.js"));', // nested
      'importScripts("a.js"', // unterminated
      'importScripts("a.js"); importScripts(x);', // second call untranslatable
    ]) {
      expect(workerScriptsFor("sw.js", source)).toEqual({ kind: "untranslatable" });
    }
  });

  it("still rewrites a self-contained worker once its source is supplied", () => {
    // The regression guard for Angular DevTools: passing `workerSource` must not
    // cost an ordinary extension its rewrite.
    const shim = shimMv3ToMv2(manifest(mv3Worker), {
      workerSource: "(()=>{var g=class{tabs;runtime};})();",
    });
    expect(shim).not.toBeNull();
    expect(shim!.manifest.background).toEqual({ scripts: ["bg.js"], persistent: true });
  });

  it("declines a worker that mixes importScripts with other top-level code", () => {
    // Half-translating would give an extension that loads and is silently missing
    // the half we dropped, which is worse than not converting it.
    expect(
      shimMv3ToMv2(manifest(mv3Worker), {
        workerSource: 'importScripts("bg-real.js");\nregisterSomething();',
      }),
    ).toBeNull();
  });

  it("rewrites a store extension that builds its background with importScripts", () => {
    // Replayed from axe DevTools 4.138, whose worker delegates to two scripts.
    const axe = manifest({
      name: "axe DevTools - Web Accessibility Testing",
      version: "4.138.0",
      manifest_version: 3,
      background: { service_worker: "background-worker.bundle.js" },
      content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
      devtools_page: "devtools.html",
      permissions: ["tabs", "debugger", "storage", "unlimitedStorage"],
      action: { default_popup: "popup.html" },
    });

    const shim = shimMv3ToMv2(axe, {
      workerSource: 'importScripts("browser-polyfill.js","background.bundle.js");',
    });
    expect(shim).not.toBeNull();
    expect(shim!.manifest.background).toEqual({
      scripts: ["browser-polyfill.js", "background.bundle.js"],
      persistent: true,
    });
    // Provenance still names what the store actually shipped.
    expect(shim!.workerScript).toBe("background-worker.bundle.js");
  });

  it("declines an extension whose main-world content script is load-bearing", () => {
    // The regression this guards: MV2 has no `world` key at all, so rewriting
    // demotes `prepare.js` into the isolated world, where the hook it installs
    // is invisible to the page — and Vue's DevTools page only creates its panel
    // once `inspectedWindow.eval` can see that hook.
    const vue = manifest({
      name: "Vue.js devtools",
      version: "7.7.7",
      manifest_version: 3,
      background: { service_worker: "dist/background.js" },
      devtools_page: "pages/devtools-background.html",
      host_permissions: ["<all_urls>"],
      permissions: ["scripting"],
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["dist/prepare.js"],
          run_at: "document_start",
          world: "MAIN",
        },
        { matches: ["<all_urls>"], js: ["dist/devtools-overlay.js"], run_at: "document_idle" },
      ],
    });
    expect(shimMv3ToMv2(vue)).toBeNull();
    expect(requiresMainWorld(vue)).toBe(true);

    // And the mirror image: Angular declares the same main-world script, but only
    // as a flag, so it is still rewritten — that is the feature's whole point.
    const angular = manifest({
      name: "Angular DevTools",
      manifest_version: 3,
      background: { service_worker: "app/background_bundle.js" },
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["app/devtools_connected_flag_bundle.js"],
          run_at: "document_start",
          world: "MAIN",
          all_frames: true,
        },
      ],
    });
    expect(shimMv3ToMv2(angular)).not.toBeNull();
    expect(requiresMainWorld(angular)).toBe(false);
  });

  it("rewrites by default, so an unrecognised main-world script is not a free pass out", () => {
    expect(requiresMainWorld(manifest({ name: "Something Else" }))).toBe(false);
    expect(requiresMainWorld(manifest({ name: "Vue.js DevTools" }))).toBe(false);
  });

  it("round-trips a real store extension's manifest into something Electron accepts", () => {
    // The whole feature rests on this shape being loadable, and the one field
    // that broke in the spike was not guessable from the schema. Replaying
    // Angular DevTools 1.22's manifest is the regression guard for it.
    const angular = manifest({
      manifest_version: 3,
      name: "Angular DevTools",
      background: { service_worker: "app/background_bundle.js" },
      content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
      action: { default_popup: "popups/not-angular.html" },
      devtools_page: "devtools.html",
      host_permissions: ["<all_urls>"],
      permissions: ["scripting", "activeTab", "storage", "debugger"],
      web_accessible_resources: [
        {
          resources: ["app/backend_bundle.js", "app/detect_angular_bundle.js"],
          matches: ["<all_urls>"],
          extension_ids: [],
        },
      ],
      content_scripts: [
        { matches: ["<all_urls>"], js: ["a.js"], run_at: "document_start", world: "MAIN" },
      ],
      // The store ships a `key`, and dropping it would change the extension ID.
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC",
    });

    const shim = shimMv3ToMv2(angular);
    expect(shim).not.toBeNull();
    const out = shim!.manifest;

    // The fields Electron's MV2 parser rejects or misreads.
    expect(out.manifest_version).toBe(2);
    expect(out.content_security_policy).toBe("script-src 'self'; object-src 'self'");
    expect(typeof out.content_security_policy).toBe("string");
    expect(out.background).toEqual({ scripts: ["app/background_bundle.js"], persistent: true });
    expect(out.action).toBeUndefined();
    expect(out.browser_action).toMatchObject({ default_popup: "popups/not-angular.html" });
    expect(out.host_permissions).toBeUndefined();
    expect(out.permissions).toContain("<all_urls>");
    expect(out.web_accessible_resources).toEqual([
      "app/backend_bundle.js",
      "app/detect_angular_bundle.js",
    ]);
    expect((out.content_scripts as Record<string, unknown>[])[0].world).toBeUndefined();

    // Carried through untouched, because losing either breaks the panel.
    expect(out.key).toBe("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC");
    expect(out.devtools_page).toBe("devtools.html");

    // The panel reaches the page through the worker script, so it must still be
    // declared exactly as the extension shipped it.
    expect(shim!.workerScript).toBe("app/background_bundle.js");
  });

  it("never mutates the manifest it was given", () => {
    // Guard the backfill too: `load()` calls this on an already-installed
    // extension, so a partial rewrite would corrupt the authored copy's read.
    const source = manifest({
      ...mv3Worker,
      permissions: ["storage"],
      host_permissions: ["<all_urls>"],
      action: { default_popup: "p.html" },
    });
    const before = JSON.stringify(source.raw);
    shimMv3ToMv2(source);
    expect(JSON.stringify(source.raw)).toBe(before);
  });
});

describe("sanitizeExtensions", () => {
  it("drops malformed records and keeps valid ones", () => {
    const result = sanitizeExtensions([
      {
        slug: "demo",
        id: "abcdefghijklmnopabcdefghijklmnop",
        name: "Demo",
        version: "1.0",
        source: "folder",
        enabled: true,
        installedAt: 1,
      },
      { slug: "bad", name: "Missing fields" },
      {
        slug: "demo",
        id: "x",
        name: "dupe",
        version: "2",
        source: "store",
        enabled: false,
        installedAt: 2,
      },
      {
        slug: "wrong-source",
        id: "x",
        name: "x",
        version: "1",
        source: "sideload",
        enabled: true,
        installedAt: 1,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ slug: "demo", name: "Demo" });
  });

  it("returns an empty list for non-arrays", () => {
    expect(sanitizeExtensions(undefined)).toEqual([]);
    expect(sanitizeExtensions("nope")).toEqual([]);
  });

  it("defaults the MV3 flag for records written before it existed", () => {
    // An older document must keep the extension and read as "no badge" rather
    // than be dropped; the next load re-derives the real value.
    const [legacy] = sanitizeExtensions([
      {
        slug: "legacy",
        id: "x",
        name: "Legacy",
        version: "1.0",
        source: "store",
        enabled: true,
        installedAt: 1,
      },
    ]);
    expect(legacy).toMatchObject({ slug: "legacy", mv3ServiceWorker: false });
  });

  it("keeps a true MV3 flag and coerces a non-boolean to false", () => {
    const base = {
      slug: "mv3",
      id: "x",
      name: "MV3",
      version: "1.0",
      source: "store",
      enabled: true,
      installedAt: 1,
    };
    expect(sanitizeExtensions([{ ...base, mv3ServiceWorker: true }])[0]).toMatchObject({
      mv3ServiceWorker: true,
    });
    expect(sanitizeExtensions([{ ...base, mv3ServiceWorker: "yes" }])[0]).toMatchObject({
      mv3ServiceWorker: false,
    });
  });
});
