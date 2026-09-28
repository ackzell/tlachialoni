import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { parseExtensionId } from "@shared/extension-id";
import {
  crxZipOffset,
  extractCrxToDir,
  extractZipToDir,
  isCrx,
  readManifest,
} from "../../src/main/extensions/crx";
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
});
