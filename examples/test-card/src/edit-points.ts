/**
 * TEST CARD EDIT POINTS
 *
 * Edit `editPoints` below and save. Vite updates this page in place.
 *  - accentHue: 0–359; repaints the swatch, page marker, focus ring, and rule.
 *  - headline: the largest text on every card.
 *  - layout: "split" (rail right) or "stacked" (rail on top).
 *  - copy: every other visible string on the page.
 *
 * A malformed value falls back to the default instead of blanking the page.
 */
import { computed, reactive } from "vue";

export type CardLayout = "split" | "stacked";
export type PageId = "one" | "two" | "three";

export interface PageCopy {
  navLabel: string;
  number: string;
  name: string;
  summary: string;
  specimenLabel: string;
}

export interface TestCardCopy {
  brand: string;
  eyebrow: string;
  loadCountLabel: string;
  lastLoadLabel: string;
  navAriaLabel: string;
  swatchLabel: string;
  primaryLabel: string;
  statusLabel: string;
  probeIdle: string;
  probePending: string;
  probeSuccess: string;
  probeFailure: string;
  pages: Record<PageId, PageCopy>;
  notFoundTitle: string;
  notFoundBody: string;
  notFoundAction: string;
}

export interface EditPoints {
  accentHue: number;
  headline: string;
  layout: CardLayout;
  copy: TestCardCopy;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const defaultEditPoints: EditPoints = {
  accentHue: 78,
  headline: "Test card.",
  layout: "split",
  copy: {
    brand: "TLACHIALONI / TEST CARD",
    eyebrow: "LOCAL FRONTEND · LIVE EDIT",
    loadCountLabel: "LOAD",
    lastLoadLabel: "LAST LOAD",
    navAriaLabel: "Test card pages",
    swatchLabel: "Accent swatch",
    primaryLabel: "Run local check",
    statusLabel: "Status card",
    probeIdle: "Ready. Run the local check.",
    probePending: "Checking the local endpoint...",
    probeSuccess: "Local endpoint OK",
    probeFailure: "Local endpoint unavailable",
    pages: {
      one: {
        navLabel: "01 Signal",
        number: "01",
        name: "Signal",
        summary: "A broad field for the clearest contrast. Placeholder copy.",
        specimenLabel: "SIGNAL FIELD",
      },
      two: {
        navLabel: "02 Grid",
        number: "02",
        name: "Grid",
        summary: "A measured grid that holds still. Placeholder copy.",
        specimenLabel: "MEASURED GRID",
      },
      three: {
        navLabel: "03 Notes",
        number: "03",
        name: "Notes",
        summary: "A quiet page of notes. Placeholder copy.",
        specimenLabel: "PLACEHOLDER NOTES",
      },
    },
    notFoundTitle: "Lost signal",
    notFoundBody: "This path is not part of the test card.",
    notFoundAction: "Back to card 01",
  },
};

export const editPoints = reactive<EditPoints>(cloneEditPoints(defaultEditPoints));

function cloneEditPoints(points: EditPoints): EditPoints {
  return {
    ...points,
    copy: {
      ...points.copy,
      pages: {
        one: { ...points.copy.pages.one },
        two: { ...points.copy.pages.two },
        three: { ...points.copy.pages.three },
      },
    },
  };
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeHue(value: unknown): number {
  if (typeof value === "string" && value.trim() === "") return defaultEditPoints.accentHue;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return defaultEditPoints.accentHue;
  return ((Math.round(numeric) % 360) + 360) % 360;
}

function normalizeLayout(value: unknown): CardLayout {
  return value === "stacked" ? "stacked" : value === "split" ? "split" : defaultEditPoints.layout;
}

function normalizePage(value: DeepPartial<PageCopy> | undefined, fallback: PageCopy): PageCopy {
  return {
    navLabel: normalizeText(value?.navLabel, fallback.navLabel),
    number: normalizeText(value?.number, fallback.number),
    name: normalizeText(value?.name, fallback.name),
    summary: normalizeText(value?.summary, fallback.summary),
    specimenLabel: normalizeText(value?.specimenLabel, fallback.specimenLabel),
  };
}

function normalizeCopy(value: DeepPartial<TestCardCopy> | undefined): TestCardCopy {
  const fallback = defaultEditPoints.copy;
  return {
    brand: normalizeText(value?.brand, fallback.brand),
    eyebrow: normalizeText(value?.eyebrow, fallback.eyebrow),
    loadCountLabel: normalizeText(value?.loadCountLabel, fallback.loadCountLabel),
    lastLoadLabel: normalizeText(value?.lastLoadLabel, fallback.lastLoadLabel),
    navAriaLabel: normalizeText(value?.navAriaLabel, fallback.navAriaLabel),
    swatchLabel: normalizeText(value?.swatchLabel, fallback.swatchLabel),
    primaryLabel: normalizeText(value?.primaryLabel, fallback.primaryLabel),
    statusLabel: normalizeText(value?.statusLabel, fallback.statusLabel),
    probeIdle: normalizeText(value?.probeIdle, fallback.probeIdle),
    probePending: normalizeText(value?.probePending, fallback.probePending),
    probeSuccess: normalizeText(value?.probeSuccess, fallback.probeSuccess),
    probeFailure: normalizeText(value?.probeFailure, fallback.probeFailure),
    pages: {
      one: normalizePage(value?.pages?.one, fallback.pages.one),
      two: normalizePage(value?.pages?.two, fallback.pages.two),
      three: normalizePage(value?.pages?.three, fallback.pages.three),
    },
    notFoundTitle: normalizeText(value?.notFoundTitle, fallback.notFoundTitle),
    notFoundBody: normalizeText(value?.notFoundBody, fallback.notFoundBody),
    notFoundAction: normalizeText(value?.notFoundAction, fallback.notFoundAction),
  };
}

export function normalizeEditPoints(value: DeepPartial<EditPoints> = {}): EditPoints {
  return {
    accentHue: normalizeHue(value.accentHue),
    headline: normalizeText(value.headline, defaultEditPoints.headline),
    layout: normalizeLayout(value.layout),
    copy: normalizeCopy(value.copy),
  };
}

export const normalizedEditPoints = computed(() => normalizeEditPoints(editPoints));

export const editCssVars = computed<Record<string, string>>(() => {
  const points = normalizedEditPoints.value;
  return {
    "--accent-h": String(points.accentHue),
    "--stage-columns":
      points.layout === "split" ? "minmax(0, 1.45fr) minmax(19rem, 0.55fr)" : "minmax(0, 1fr)",
    "--stage-areas": points.layout === "split" ? '"hero rail"' : '"rail" "hero"',
    "--stage-gap": points.layout === "split" ? "clamp(1.75rem, 3vw, 3rem)" : "1.5rem",
  };
});

type EditPointsHmr = {
  accept: (callback: (next?: { editPoints?: EditPoints }) => void) => void;
};

const hot = (import.meta as ImportMeta & { hot?: EditPointsHmr }).hot;

hot?.accept((next) => {
  if (!next?.editPoints) return;
  Object.assign(editPoints, next.editPoints);
});
