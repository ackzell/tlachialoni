import { readonly, ref } from "vue";
import type { ColorMode, Scope } from "@shared/commands";
import type { ExtensionStatus, InstalledExtension } from "@shared/extensions";
import type { HistoryArmed } from "@shared/history";
import { applyTheme, type ResolvedMode } from "../theme/apply";

export type DockMode = "bottom" | "right" | "left";
export type { ColorMode };

export interface RecentEntry {
  url: string;
  lastOpenedAt: number;
}

export interface ShellState {
  schemaVersion: number;
  target: string | null;
  recents: RecentEntry[];
  dockMode: DockMode;
  devtoolsOpen: boolean;
  stripVisible: boolean;
  titlebarMode: boolean;
  variant: string;
  colorMode: ColorMode;
  extensions: InstalledExtension[];
}

export interface Failure {
  url: string;
  reason: string;
  previousUrl?: string | null;
}

/** Where a shell badge sits relative to the guest page's corner (specs/024). */
export interface BadgeInsets {
  top: number;
  right: number;
  bottom: number;
}

const api = window.tlachialoni;

const state = ref<ShellState | null>(null);
const loading = ref(false);
const loadingTarget = ref("");
/** The transient load rim, or null when no in-place load is running (specs/025). */
const reloading = ref<{ hard: boolean } | null>(null);
const failed = ref<Failure | null>(null);
const paletteOpen = ref(false);
const paletteInitial = ref("");
const paletteScope = ref<Scope>("all");
const devtools = ref<{ open: boolean; mode: DockMode }>({ open: false, mode: "bottom" });
const extensionStatus = ref<ExtensionStatus | null>(null);
/** The transient zoom confirmation, or null when hidden (specs/023). */
const zoomLevel = ref<{ percent: number; insets: BadgeInsets } | null>(null);
/** The transient viewport-size confirmation, or null when hidden (specs/024). */
const viewportSize = ref<{ width: number; height: number; insets: BadgeInsets } | null>(null);
/** Transient strip reveal driven by pointer proximity in main (specs/013). */
const peeking = ref(false);
/** Transient armed history signal; drives the edge overlay (specs/015). */
const historyArmed = ref<HistoryArmed | null>(null);
/** Whether the guest can move back/forward; drives the strip's nav buttons. */
const historyAvailable = ref<{ canGoBack: boolean; canGoForward: boolean }>({
  canGoBack: false,
  canGoForward: false,
});

let initialised = false;

let leavingSurfaces = 0;
let settleFallback: ReturnType<typeof setTimeout> | null = null;

/**
 * The main process holds the shell-view collapse until the renderer reports its
 * leave transitions finished (contracts/settle-protocol.md). The fallback timer
 * guarantees a report even when a lifecycle hook is missed; it must exceed the
 * slowest leave (200ms) and stay under main's 400ms safety timeout.
 */
export function markSurfaceLeaving(): void {
  leavingSurfaces += 1;
  if (settleFallback) clearTimeout(settleFallback);
  settleFallback = setTimeout(() => {
    settleFallback = null;
    leavingSurfaces = 0;
    api.settled();
  }, 300);
}

/** A surface's leave finished; report once every concurrent leave is done. */
export function markSurfaceLeft(): void {
  if (leavingSurfaces > 0) leavingSurfaces -= 1;
  if (leavingSurfaces > 0) return;
  if (settleFallback) {
    clearTimeout(settleFallback);
    settleFallback = null;
  }
  api.settled();
}

/** A leave was interrupted by a re-show; no report is owed for it. */
export function markSurfaceLeaveCancelled(): void {
  if (leavingSurfaces > 0) leavingSurfaces -= 1;
  if (leavingSurfaces > 0) return;
  if (settleFallback) {
    clearTimeout(settleFallback);
    settleFallback = null;
  }
}

function init(): void {
  if (initialised) return;
  initialised = true;

  void api.getState().then((value) => {
    state.value = value as ShellState;
  });

  api.on("state:changed", (payload) => {
    state.value = payload as ShellState;
  });
  api.on("viewport:loading", (payload) => {
    const { loading: isLoading, url } = payload as { loading: boolean; url?: string };
    loading.value = isLoading;
    // A target load (launch/Retry/palette navigate) supersedes any failure view
    // and names the incoming target in the veil.
    if (isLoading) {
      failed.value = null;
      reloading.value = null;
      if (url) loadingTarget.value = url;
    }
  });
  api.on("viewport:ready", () => {
    failed.value = null;
  });
  api.on("viewport:failed", (payload) => {
    failed.value = payload as Failure;
    loading.value = false;
    reloading.value = null;
  });
  api.on("viewport:reloading", (payload) => {
    const next = payload as { hard?: boolean } | null;
    reloading.value = next ? { hard: next.hard === true } : null;
  });
  api.on("devtools:changed", (payload) => {
    devtools.value = payload as { open: boolean; mode: DockMode };
  });
  api.on("extension:status", (payload) => {
    extensionStatus.value = (payload as ExtensionStatus | null) ?? null;
  });
  api.on("zoom:changed", (payload) => {
    zoomLevel.value = (payload as { percent: number; insets: BadgeInsets } | null) ?? null;
  });
  api.on("viewport:changed", (payload) => {
    viewportSize.value =
      (payload as { width: number; height: number; insets: BadgeInsets } | null) ?? null;
  });
  api.on("strip:peek", (payload) => {
    peeking.value = payload === true;
  });
  api.on("history:armed", (payload) => {
    historyArmed.value = (payload as HistoryArmed | null) ?? null;
  });
  api.on("history:availability", (payload) => {
    historyAvailable.value = payload as { canGoBack: boolean; canGoForward: boolean };
  });
  api.on("palette:open", (payload) => {
    const { initial, scope } = payload as { initial?: string; scope?: Scope };
    paletteInitial.value = initial ?? "";
    paletteScope.value = scope ?? "all";
    paletteOpen.value = true;
  });
  api.on("palette:close", () => {
    paletteOpen.value = false;
  });
  api.on("theme:apply", (payload) => {
    const theme = payload as { variant: string; resolved: ResolvedMode };
    applyTheme(theme.variant, theme.resolved);
  });

  // Tell main the renderer is subscribed so nothing is missed.
  api.ready();
}

export function closePalette(): void {
  paletteOpen.value = false;
  // Main keeps the shell view full-window until the leave completes; the
  // palette's after-leave reports back through notifyPaletteClosed().
}

/** Palette leave finished: release the overlay in main, then report the settle. */
export function notifyPaletteClosed(): void {
  markSurfaceLeft();
  api.setPaletteVisible(false);
}

export function useShell() {
  init();
  return {
    state: readonly(state),
    loading: readonly(loading),
    loadingTarget: readonly(loadingTarget),
    reloading: readonly(reloading),
    failed: readonly(failed),
    paletteOpen: readonly(paletteOpen),
    paletteInitial: readonly(paletteInitial),
    paletteScope: readonly(paletteScope),
    devtools: readonly(devtools),
    extensionStatus: readonly(extensionStatus),
    zoomLevel: readonly(zoomLevel),
    viewportSize: readonly(viewportSize),
    peeking: readonly(peeking),
    historyArmed: readonly(historyArmed),
    historyAvailable: readonly(historyAvailable),
    closePalette,
  };
}
