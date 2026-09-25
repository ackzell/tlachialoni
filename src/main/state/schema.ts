/**
 * Persisted state shape, defaults, and sanitization.
 * Pure module (no Electron imports) so it is unit-testable.
 */

import { isLocalHostname } from "../nav/policy";

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
}

export const SCHEMA_VERSION = 1;
export const DEFAULT_TARGET = "http://localhost:3000";
export const MAX_RECENTS = 10;
export const MIN_WIDTH = 480;
export const MIN_HEIGHT = 360;
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;

const DOCK_MODES: DockMode[] = ["bottom", "right", "left"];
const COLOR_MODES: ColorMode[] = ["system", "dark", "light"];

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
  };
}

/** Merges a newly loaded target into recents: dedupe, newest first, capped. */
export function mergeRecents(existing: RecentEntry[], url: string, now: number): RecentEntry[] {
  const without = existing.filter((entry) => entry.url !== url);
  return [{ url, lastOpenedAt: now }, ...without].slice(0, MAX_RECENTS);
}
