import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_RECENTS,
  defaultState,
  mergeRecentLists,
  mergeRecents,
  sanitizeState,
} from "../../src/main/state/schema";
import { StateStore } from "../../src/main/state/store";

const tmpDirs: string[] = [];
function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localbrowser-"));
  tmpDirs.push(dir);
  return path.join(dir, "state.json");
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("sanitizeState", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeState(null)).toEqual(defaultState());
    expect(sanitizeState(42)).toEqual(defaultState());
    expect(sanitizeState({ target: 5, dockMode: "sideways" })).toMatchObject({
      target: defaultState().target,
      dockMode: "bottom",
      variant: "obsidian",
      colorMode: "system",
    });
  });

  it("drops invalid targets and recents", () => {
    const state = sanitizeState({
      target: "https://example.com",
      recents: [
        { url: "http://localhost:5173/", lastOpenedAt: 2 },
        { url: "https://evil.example/", lastOpenedAt: 3 },
        { url: "http://localhost:3000/" },
      ],
    });
    expect(state.target).toBe(defaultState().target);
    expect(state.recents).toEqual([{ url: "http://localhost:5173/", lastOpenedAt: 2 }]);
  });

  it("clamps bounds to the minimum size", () => {
    const state = sanitizeState({ bounds: { x: 1, y: 2, width: 10, height: 10 } });
    expect(state.bounds).toEqual({ x: 1, y: 2, width: 480, height: 360 });
  });
});

describe("mergeRecents", () => {
  it("dedupes, orders newest first, and caps the list", () => {
    const base = Array.from({ length: MAX_RECENTS }, (_, i) => ({
      url: `http://localhost:${1000 + i}/`,
      lastOpenedAt: i,
    }));
    const merged = mergeRecents(base, "http://localhost:1005/", 99);
    expect(merged[0]).toEqual({ url: "http://localhost:1005/", lastOpenedAt: 99 });
    expect(merged).toHaveLength(MAX_RECENTS);
    expect(merged.filter((r) => r.url === "http://localhost:1005/")).toHaveLength(1);
  });
});

describe("mergeRecentLists", () => {
  it("unions two instances, keeping the newest timestamp per URL", () => {
    const a = [
      { url: "http://localhost:3000/", lastOpenedAt: 1 },
      { url: "http://localhost:5173/", lastOpenedAt: 5 },
    ];
    const b = [
      { url: "http://localhost:3000/", lastOpenedAt: 9 },
      { url: "http://localhost:8080/", lastOpenedAt: 2 },
    ];
    expect(mergeRecentLists(a, b)).toEqual([
      { url: "http://localhost:3000/", lastOpenedAt: 9 },
      { url: "http://localhost:5173/", lastOpenedAt: 5 },
      { url: "http://localhost:8080/", lastOpenedAt: 2 },
    ]);
  });
});

describe("StateStore", () => {
  it("round-trips state and merges recents across instances", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    const b = new StateStore(file);

    a.recordRecent("http://localhost:3000/");
    b.recordRecent("http://localhost:5173/");

    const recents = new StateStore(file).get().recents;
    expect(recents.map((r) => r.url).sort()).toEqual([
      "http://localhost:3000/",
      "http://localhost:5173/",
    ]);
  });

  it("applies last-writer-wins to scalars", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    const b = new StateStore(file);
    a.setVariant("jade");
    b.setVariant("gold");
    expect(new StateStore(file).get().variant).toBe("gold");
  });

  it("keeps another instance's recents when a scalar is written", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    a.recordRecent("http://localhost:3000/");
    const b = new StateStore(file); // starts with [3000]
    a.recordRecent("http://localhost:5173/"); // a now has [5173, 3000]
    b.setVariant("jade"); // must not clobber 5173 from disk

    const state = new StateStore(file).get();
    expect(state.variant).toBe("jade");
    expect(state.recents.map((r) => r.url).sort()).toEqual([
      "http://localhost:3000/",
      "http://localhost:5173/",
    ]);
  });

  it("refreshes recents from disk without writing", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    const b = new StateStore(file);
    a.recordRecent("http://localhost:5173/");
    expect(b.get().recents).toEqual([]);
    expect(b.refreshRecents().recents.map((r) => r.url)).toEqual(["http://localhost:5173/"]);
  });

  it("recovers from a corrupt file", () => {
    const file = tmpFile();
    fs.writeFileSync(file, "{ not json");
    expect(new StateStore(file).get()).toEqual(defaultState());
  });
});
