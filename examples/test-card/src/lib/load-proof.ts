export interface LoadProof {
  count: number;
  lastLoadAt: number;
}

export interface LoadProofStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "test-card:load-proof";

export function readAndBumpLoadProof(storage: LoadProofStorage | null, now: number): LoadProof {
  const previous = readLoadProof(storage);
  const next: LoadProof = {
    count: (previous?.count ?? 0) + 1,
    lastLoadAt: now,
  };

  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The page still shows this load; only persistence is lost.
  }

  return next;
}

export function formatLoadCount(count: number): string {
  return String(Math.max(1, Math.trunc(count))).padStart(2, "0");
}

export function formatLoadTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function readLoadProof(storage: LoadProofStorage | null): LoadProof | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return null;

    const count = value.count;
    const lastLoadAt = value.lastLoadAt;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
    if (typeof lastLoadAt !== "number" || !Number.isFinite(lastLoadAt)) return null;

    return { count, lastLoadAt };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
