import { readonly, ref } from "vue";
import { applyTheme, type ResolvedMode } from "../theme/apply";

export type DockMode = "bottom" | "right" | "left";
export type ColorMode = "system" | "dark" | "light";

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
  variant: string;
  colorMode: ColorMode;
}

export interface Failure {
  url: string;
  reason: string;
  previousUrl?: string | null;
}

const api = window.tlachialoni;

const state = ref<ShellState | null>(null);
const loading = ref(false);
const loadingTarget = ref("");
const failed = ref<Failure | null>(null);
const paletteOpen = ref(false);
const paletteInitial = ref("");
const devtools = ref<{ open: boolean; mode: DockMode }>({ open: false, mode: "bottom" });

let initialised = false;

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
      if (url) loadingTarget.value = url;
    }
  });
  api.on("viewport:ready", () => {
    failed.value = null;
  });
  api.on("viewport:failed", (payload) => {
    failed.value = payload as Failure;
    loading.value = false;
  });
  api.on("devtools:changed", (payload) => {
    devtools.value = payload as { open: boolean; mode: DockMode };
  });
  api.on("palette:open", (payload) => {
    paletteInitial.value = (payload as { initial?: string }).initial ?? "";
    paletteOpen.value = true;
    api.setPaletteVisible(true);
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
  api.setPaletteVisible(false);
}

export function useShell() {
  init();
  return {
    state: readonly(state),
    loading: readonly(loading),
    loadingTarget: readonly(loadingTarget),
    failed: readonly(failed),
    paletteOpen: readonly(paletteOpen),
    paletteInitial: readonly(paletteInitial),
    devtools: readonly(devtools),
    closePalette,
  };
}
