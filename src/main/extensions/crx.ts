/**
 * CRX container handling: locating the ZIP payload inside a CRX2/CRX3 file,
 * extracting it safely, and reading the unpacked manifest.
 *
 * Pure module apart from `node:fs`/`node:path` (no Electron), so the header
 * parser and the archive safety rules are unit-testable.
 */

import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const CRX_MAGIC = "Cr24";

export interface ExtensionManifest {
  name: string;
  version: string;
  raw: Record<string, unknown>;
}

/** True when the buffer starts with the CRX magic. */
export function isCrx(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.toString("ascii", 0, 4) === CRX_MAGIC;
}

/**
 * Byte offset of the ZIP payload inside a CRX buffer.
 *
 * CRX3: `Cr24`(4) + version(4) + header length(4) + header, then the ZIP.
 * CRX2: `Cr24`(4) + version(4) + public-key length(4) + signature length(4) +
 * public key + signature, then the ZIP.
 */
export function crxZipOffset(buffer: Buffer): number {
  if (!isCrx(buffer) || buffer.length < 12) {
    throw new Error("That file is not a Chrome extension package");
  }
  const version = buffer.readUInt32LE(4);
  if (version === 3) {
    const headerLength = buffer.readUInt32LE(8);
    const offset = 12 + headerLength;
    if (offset >= buffer.length) throw new Error("The extension package header is truncated");
    return offset;
  }
  if (version === 2) {
    if (buffer.length < 16) throw new Error("The extension package header is truncated");
    const publicKeyLength = buffer.readUInt32LE(8);
    const signatureLength = buffer.readUInt32LE(12);
    const offset = 16 + publicKeyLength + signatureLength;
    if (offset >= buffer.length) throw new Error("The extension package header is truncated");
    return offset;
  }
  throw new Error(`Unsupported extension package version ${version}`);
}

/**
 * Resolves an archive entry name against the destination, refusing absolute
 * paths and any `..` segment so a malicious package cannot write outside it
 * (FR-012).
 */
function safeEntryPath(destDir: string, name: string): string {
  const normalized = name.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Refused an unsafe path in the package: ${name}`);
  }
  const target = path.join(destDir, ...segments);
  const relative = path.relative(destDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refused an unsafe path in the package: ${name}`);
  }
  return target;
}

/** Extracts a plain ZIP payload into `destDir`. */
export function extractZipToDir(zip: Uint8Array, destDir: string): void {
  const entries = unzipSync(zip);
  fs.mkdirSync(destDir, { recursive: true });
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) {
      fs.mkdirSync(safeEntryPath(destDir, name), { recursive: true });
      continue;
    }
    const target = safeEntryPath(destDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

/** Extracts a CRX package's ZIP payload into `destDir`. */
export function extractCrxToDir(buffer: Buffer, destDir: string): void {
  const offset = crxZipOffset(buffer);
  extractZipToDir(new Uint8Array(buffer.subarray(offset)), destDir);
}

/** Reads and validates `<dir>/manifest.json`, returning its name and version. */
export function readManifest(dir: string): ExtensionManifest {
  const file = path.join(dir, "manifest.json");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error("No manifest.json found — that folder is not an extension");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("manifest.json is not an object");
  }
  const manifest = raw as Record<string, unknown>;
  const name =
    typeof manifest.name === "string" && manifest.name.trim()
      ? manifest.name.trim()
      : "Unnamed extension";
  const version = typeof manifest.version === "string" ? manifest.version : "unknown";
  return { name, version, raw: manifest };
}

/**
 * Detects whether a manifest is Manifest V3 with a service worker background.
 * Electron hosts these, but tears a worker down if it throws while starting up
 * — which is what happens when it touches an API Electron doesn't compile, such
 * as `chrome.debugger`. The flag marks an extension whose background is at risk
 * and may be rewritten to an MV2 background page (specs/018/019).
 */
export function detectMv3ServiceWorker(manifest: ExtensionManifest): boolean {
  if (manifest.raw.manifest_version !== 3) return false;
  const background = manifest.raw.background;
  if (typeof background !== "object" || background === null) return false;
  return "service_worker" in background;
}
