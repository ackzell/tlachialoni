/**
 * Persisted state shape, defaults, and sanitization.
 * Pure module (no Electron imports) so it is unit-testable.
 */

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

export interface PersistedState {
  schemaVersion: number;
  target: string | null;
  recents: RecentEntry[];
  dockMode: DockMode;
  devtoolsOpen: boolean;
  stripVisible: boolean;
  bounds: Bounds | null;
  variant: VariantSlug;
  colorMode: ColorMode;
  extensions: InstalledExtension[];
}

export const SCHEMA_VERSION = 2;
export const DEFAULT_TARGET = "http://localhost:3000";
export const MAX_RECENTS = 30;
/** How many recent pages a single origin may keep, so one busy server cannot
 *  evict every other site from history. */
export const MAX_RECENTS_PER_HOST = 5;
export const MAX_EXTENSIONS = 32;
export const MIN_WIDTH = 480;
export const MIN_HEIGHT = 360;
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;

const DOCK_MODES: DockMode[] = ["bottom", "right", "left"];
const COLOR_MODES: ColorMode[] = ["system", "dark", "light"];
const EXTENSION_SOURCES: ExtensionSource[] = ["store", "folder"];

export function defaultState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    target: DEFAULT_TARGET,
    recents: [],
    dockMode: "bottom",
    devtoolsOpen: true,
    stripVisible: false,
    bounds: null,
    variant: "obsidian",
    colorMode: "system",
    extensions: [],
  };
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

/** Coerces arbitrary parsed JSON into a valid state, dropping anything invalid. */
export function sanitizeState(raw: unknown): PersistedState {
  const base = defaultState();
  if (typeof raw !== "object" || raw === null) return base;
  const input = raw as Record<string, unknown>;

  const target = isAllowedTarget(input.target) ? input.target : base.target;

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

  const dockMode = DOCK_MODES.includes(input.dockMode as DockMode)
    ? (input.dockMode as DockMode)
    : base.dockMode;

  const variant = (VARIANT_SLUGS as readonly string[]).includes(input.variant as string)
    ? (input.variant as VariantSlug)
    : base.variant;

  const colorMode = COLOR_MODES.includes(input.colorMode as ColorMode)
    ? (input.colorMode as ColorMode)
    : base.colorMode;

  const boundsRaw = input.bounds as Partial<Bounds> | undefined;
  const bounds: Bounds | null =
    boundsRaw &&
    typeof boundsRaw.x === "number" &&
    typeof boundsRaw.y === "number" &&
    typeof boundsRaw.width === "number" &&
    typeof boundsRaw.height === "number"
      ? {
          x: Math.round(boundsRaw.x),
          y: Math.round(boundsRaw.y),
          width: Math.max(MIN_WIDTH, Math.round(boundsRaw.width)),
          height: Math.max(MIN_HEIGHT, Math.round(boundsRaw.height)),
        }
      : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    target,
    recents,
    dockMode,
    devtoolsOpen: typeof input.devtoolsOpen === "boolean" ? input.devtoolsOpen : base.devtoolsOpen,
    stripVisible: typeof input.stripVisible === "boolean" ? input.stripVisible : base.stripVisible,
    bounds,
    variant,
    colorMode,
    extensions: sanitizeExtensions(input.extensions),
  };
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
