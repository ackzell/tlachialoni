/**
 * Persisted state shape, defaults, sanitization, and migration.
 * Pure module (no Electron imports) so it is unit-testable.
 *
 * Schema 3 moves from a single per-app window (target/bounds/dock/strip scalars)
 * to an ordered list of window records, so several windows can be restored
 * independently (specs/012-multi-window).
 */

import { randomUUID } from "node:crypto";
import { isLocalHostname } from "../nav/policy";
import type { ExtensionSource, InstalledExtension } from "@shared/extensions";

export type DockMode = "bottom" | "right" | "left";
export type ColorMode = "system" | "dark" | "light";

export const VARIANT_SLUGS = [
  "obsidian",
  "gold",
  "turquoise",
  "quartz",
  "lapis-lazuli",
  "amethyst",
  "jade",
  "fire-opal",
] as const;

export type VariantSlug = (typeof VARIANT_SLUGS)[number];

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecentEntry {
  url: string;
  lastOpenedAt: number;
}

/** One open window, persisted so the workspace survives a launch. */
export interface WindowRecord {
  /** Stable identity; the merge key across windows and processes. */
  id: string;
  /** This window's page; `null` means blank with the location prompt armed. */
  target: string | null;
  /** This window's frame; validated against a display before use. */
  bounds: Bounds | null;
  dockMode: DockMode;
  devtoolsOpen: boolean;
  stripVisible: boolean;
  /**
   * Whether this window docks the strip as a permanent title bar and pushes the
   * guest content below it (specs/016). Additive and defaulted to `false`, so an
   * older document without the field reads as the default overlay layout.
   */
  titlebarMode: boolean;
  /** This window's Tlapalli mineral variant. */
  variant: VariantSlug;
  /**
   * This window's color mode for the tool's own surfaces. The guest page's
   * `prefers-color-scheme` and the docked DevTools' internal theme are not
   * per-window; they follow the OS (specs/012-multi-window).
   */
  colorMode: ColorMode;
}

export interface PersistedState {
  schemaVersion: number;
  recents: RecentEntry[];
  /** Shared installed extensions. */
  extensions: InstalledExtension[];
  /** Open windows, in creation order. */
  windows: WindowRecord[];
}

export const SCHEMA_VERSION = 3;
export const DEFAULT_TARGET = "http://localhost:3000";
export const MAX_RECENTS = 30;
/** How many recent pages a single origin may keep, so one busy server cannot
 *  evict every other site from history. */
export const MAX_RECENTS_PER_HOST = 5;
export const MAX_EXTENSIONS = 32;
/** Cap the persisted window list so a corrupt file cannot open unbounded windows. */
export const MAX_WINDOWS = 16;
export const MIN_WIDTH = 480;
export const MIN_HEIGHT = 360;
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;

const DOCK_MODES: DockMode[] = ["bottom", "right", "left"];
const COLOR_MODES: ColorMode[] = ["system", "dark", "light"];
const EXTENSION_SOURCES: ExtensionSource[] = ["store", "folder"];
/** Fields that only existed before schema 3; their presence marks a v1/v2 file. */
const LEGACY_KEYS = ["target", "bounds", "dockMode", "devtoolsOpen", "stripVisible"] as const;

export function newWindowId(): string {
  return randomUUID();
}

export function defaultWindowRecord(): WindowRecord {
  return {
    id: newWindowId(),
    target: null,
    bounds: null,
    dockMode: "bottom",
    devtoolsOpen: false,
    stripVisible: false,
    titlebarMode: false,
    variant: "obsidian",
    colorMode: "system",
  };
}

export function defaultState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    recents: [],
    extensions: [],
    windows: [],
  };
}

/** Coerces a variant slug, falling back to the default for anything unknown. */
export function sanitizeVariant(raw: unknown): VariantSlug {
  return (VARIANT_SLUGS as readonly string[]).includes(raw as string)
    ? (raw as VariantSlug)
    : "obsidian";
}

/** Coerces a color mode, falling back to `system` for anything unknown. */
export function sanitizeColorMode(raw: unknown): ColorMode {
  return COLOR_MODES.includes(raw as ColorMode) ? (raw as ColorMode) : "system";
}

function isAllowedTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isLocalHostname(url.hostname);
  } catch {
    return false;
  }
}

/** Clamps arbitrary bounds input to valid numbers, or `null` when unusable. */
export function sanitizeBounds(raw: unknown): Bounds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const bounds = raw as Partial<Bounds>;
  if (
    typeof bounds.x !== "number" ||
    typeof bounds.y !== "number" ||
    typeof bounds.width !== "number" ||
    typeof bounds.height !== "number"
  ) {
    return null;
  }
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(MIN_WIDTH, Math.round(bounds.width)),
    height: Math.max(MIN_HEIGHT, Math.round(bounds.height)),
  };
}

/** Coerces one window record, dropping anything that cannot be trusted. */
export function sanitizeWindowRecord(raw: unknown): WindowRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) return null;
  return {
    id: record.id,
    target: isAllowedTarget(record.target) ? record.target : null,
    bounds: sanitizeBounds(record.bounds),
    dockMode: DOCK_MODES.includes(record.dockMode as DockMode)
      ? (record.dockMode as DockMode)
      : "bottom",
    devtoolsOpen: typeof record.devtoolsOpen === "boolean" ? record.devtoolsOpen : false,
    stripVisible: typeof record.stripVisible === "boolean" ? record.stripVisible : false,
    titlebarMode: typeof record.titlebarMode === "boolean" ? record.titlebarMode : false,
    variant: sanitizeVariant(record.variant),
    colorMode: sanitizeColorMode(record.colorMode),
  };
}

function dedupeWindows(records: WindowRecord[]): WindowRecord[] {
  const seen = new Set<string>();
  const kept: WindowRecord[] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    kept.push(record);
    if (kept.length >= MAX_WINDOWS) break;
  }
  return kept;
}

/** Coerces a `windows` array, dropping malformed records and duplicate ids. */
export function sanitizeWindows(raw: unknown): WindowRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: WindowRecord[] = [];
  for (const entry of raw) {
    const record = sanitizeWindowRecord(entry);
    if (record) records.push(record);
  }
  return dedupeWindows(records);
}

/**
 * Builds the single window record a v1/v2 document described. The old `target`
 * falls back to the default target when it is missing or invalid, so an upgrade
 * always restores a working window.
 */
function migrateLegacyWindow(input: Record<string, unknown>): WindowRecord {
  const target = isAllowedTarget(input.target) ? input.target : DEFAULT_TARGET;
  return {
    id: newWindowId(),
    target,
    bounds: sanitizeBounds(input.bounds),
    dockMode: DOCK_MODES.includes(input.dockMode as DockMode)
      ? (input.dockMode as DockMode)
      : "bottom",
    devtoolsOpen: typeof input.devtoolsOpen === "boolean" ? input.devtoolsOpen : true,
    stripVisible: typeof input.stripVisible === "boolean" ? input.stripVisible : false,
    titlebarMode: false,
    // The old document's theme was app-wide; it becomes the migrated window's.
    variant: sanitizeVariant(input.variant),
    colorMode: sanitizeColorMode(input.colorMode),
  };
}

function windowsFromInput(input: Record<string, unknown>): WindowRecord[] {
  if (Array.isArray(input.windows)) return sanitizeWindows(input.windows);
  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version >= SCHEMA_VERSION) return [];
  const isLegacy = version >= 1 || LEGACY_KEYS.some((key) => key in input);
  return isLegacy ? [migrateLegacyWindow(input)] : [];
}

/** Coerces arbitrary parsed JSON into a valid state, dropping anything invalid. */
export function sanitizeState(raw: unknown): PersistedState {
  const base = defaultState();
  if (typeof raw !== "object" || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const recents: RecentEntry[] = Array.isArray(input.recents)
    ? input.recents
        .filter(
          (r): r is RecentEntry =>
            typeof r === "object" &&
            r !== null &&
            isAllowedTarget((r as RecentEntry).url) &&
            typeof (r as RecentEntry).lastOpenedAt === "number",
        )
        .slice(0, MAX_RECENTS)
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    recents,
    extensions: sanitizeExtensions(input.extensions),
    windows: windowsFromInput(input),
  };
}

/**
 * Unions two window lists by `id`: `mine` wins and keeps its order, then records
 * only on disk (another process) are appended. Used so a write never drops a
 * sibling's or another instance's window record (FR-014).
 */
export function mergeWindows(disk: WindowRecord[], mine: WindowRecord[]): WindowRecord[] {
  const byId = new Set(mine.map((record) => record.id));
  return dedupeWindows([...mine, ...disk.filter((record) => !byId.has(record.id))]);
}

/**
 * Coerces the persisted extension list, dropping malformed records and duplicate
 * slugs while keeping every valid one (FR-015). A dropped record never
 * invalidates the rest of the state.
 */
export function sanitizeExtensions(raw: unknown): InstalledExtension[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const extensions: InstalledExtension[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.slug !== "string" || !record.slug) continue;
    if (typeof record.id !== "string") continue;
    if (typeof record.name !== "string" || !record.name) continue;
    if (typeof record.version !== "string") continue;
    if (!EXTENSION_SOURCES.includes(record.source as ExtensionSource)) continue;
    if (typeof record.enabled !== "boolean") continue;
    if (typeof record.installedAt !== "number" || !Number.isFinite(record.installedAt)) continue;
    if (seen.has(record.slug)) continue;
    seen.add(record.slug);
    extensions.push({
      slug: record.slug,
      id: record.id,
      name: record.name,
      version: record.version,
      source: record.source as ExtensionSource,
      enabled: record.enabled,
      installedAt: record.installedAt,
    });
    if (extensions.length >= MAX_EXTENSIONS) break;
  }
  return extensions;
}

/** Origin key used to group recents ("http://localhost:5173" → itself). */
export function recentHost(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Caps a newest-first list: at most `MAX_RECENTS_PER_HOST` pages per origin,
 * then `MAX_RECENTS` overall. Applying the per-host cap first keeps history
 * diverse instead of letting one dev server fill the whole list.
 */
export function capRecents(list: RecentEntry[]): RecentEntry[] {
  const perHost = new Map<string, number>();
  const kept: RecentEntry[] = [];
  for (const entry of list) {
    const host = recentHost(entry.url);
    const count = perHost.get(host) ?? 0;
    if (count >= MAX_RECENTS_PER_HOST) continue;
    perHost.set(host, count + 1);
    kept.push(entry);
  }
  return kept.slice(0, MAX_RECENTS);
}

/** Merges a newly loaded target into recents: dedupe, newest first, capped. */
export function mergeRecents(existing: RecentEntry[], url: string, now: number): RecentEntry[] {
  const without = existing.filter((entry) => entry.url !== url);
  return capRecents([{ url, lastOpenedAt: now }, ...without]);
}

/**
 * Unions two recents lists from concurrent instances: dedupe by URL keeping the
 * newest timestamp, newest first, capped. Used so a scalar write never drops a
 * target another instance recorded (FR-004).
 */
export function mergeRecentLists(a: RecentEntry[], b: RecentEntry[]): RecentEntry[] {
  const byUrl = new Map<string, RecentEntry>();
  for (const entry of [...a, ...b]) {
    const seen = byUrl.get(entry.url);
    if (!seen || entry.lastOpenedAt > seen.lastOpenedAt) byUrl.set(entry.url, entry);
  }
  const sorted = [...byUrl.values()].sort((x, y) => y.lastOpenedAt - x.lastOpenedAt);
  return capRecents(sorted);
}
