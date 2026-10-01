import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET,
  MAX_RECENTS,
  MAX_RECENTS_PER_HOST,
  MAX_WINDOWS,
  capRecents,
  defaultState,
  mergeRecentLists,
  mergeRecents,
  mergeWindows,
  sanitizeState,
  sanitizeWindows,
  type WindowRecord,
} from "../../src/main/state/schema";
import { StateStore } from "../../src/main/state/store";

const tmpDirs: string[] = [];
function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tlachialoni-"));
  tmpDirs.push(dir);
  return path.join(dir, "state.json");
}

function record(id: string, overrides: Partial<WindowRecord> = {}): WindowRecord {
  return {
    id,
    target: null,
    bounds: null,
    dockMode: "bottom",
    devtoolsOpen: false,
    stripVisible: false,
    titlebarMode: false,
    variant: "obsidian",
    colorMode: "system",
    ...overrides,
  };
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("sanitizeState", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeState(null)).toEqual(defaultState());
    expect(sanitizeState(42)).toEqual(defaultState());
    expect(sanitizeState({})).toEqual(defaultState());
  });

  it("keeps a legacy (v2) document as one window", () => {
    const state = sanitizeState({
      schemaVersion: 2,
      target: "http://localhost:5173/",
      recents: [],
      dockMode: "right",
      devtoolsOpen: true,
      stripVisible: true,
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      variant: "jade",
      colorMode: "light",
      extensions: [],
    });
    expect(state.schemaVersion).toBe(3);
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]).toMatchObject({
      target: "http://localhost:5173/",
      dockMode: "right",
      devtoolsOpen: true,
      stripVisible: true,
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      // The old app-wide theme becomes the migrated window's theme.
      variant: "jade",
      colorMode: "light",
    });
  });

  it("falls back to the default target when a legacy target is invalid", () => {
    const state = sanitizeState({ schemaVersion: 2, target: "https://example.com" });
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]?.target).toBe(DEFAULT_TARGET);
  });

  it("drops invalid targets and recents from a v3 document", () => {
    const state = sanitizeState({
      schemaVersion: 3,
      windows: [{ id: "w1", target: "https://example.com" }],
      recents: [
        { url: "http://localhost:5173/", lastOpenedAt: 2 },
        { url: "https://evil.example/", lastOpenedAt: 3 },
        { url: "http://localhost:3000/" },
      ],
    });
    expect(state.windows[0]?.target).toBeNull();
    expect(state.recents).toEqual([{ url: "http://localhost:5173/", lastOpenedAt: 2 }]);
  });

  it("clamps a window's bounds to the minimum size", () => {
    const state = sanitizeState({
      schemaVersion: 3,
      windows: [{ id: "w1", bounds: { x: 1, y: 2, width: 10, height: 10 } }],
    });
    expect(state.windows[0]?.bounds).toEqual({ x: 1, y: 2, width: 480, height: 360 });
  });
});

describe("sanitizeWindows", () => {
  it("drops records without a usable id and defaults the rest", () => {
    const windows = sanitizeWindows([
      { id: "w1", target: "http://localhost:3000/", dockMode: "left" },
      { target: "http://localhost:3000/" },
      { id: "" },
      "nope",
    ]);
    expect(windows.map((w) => w.id)).toEqual(["w1"]);
    expect(windows[0]).toMatchObject({ dockMode: "left", devtoolsOpen: false });
  });

  it("drops duplicate ids and caps the list", () => {
    expect(sanitizeWindows([{ id: "a" }, { id: "a" }])).toHaveLength(1);
    const many = Array.from({ length: MAX_WINDOWS + 4 }, (_, i) => ({ id: `w${i}` }));
    expect(sanitizeWindows(many)).toHaveLength(MAX_WINDOWS);
  });

  it("defaults titlebarMode to false and preserves an explicit value", () => {
    const windows = sanitizeWindows([
      { id: "overlay" },
      { id: "docked", titlebarMode: true },
      { id: "garbage", titlebarMode: "yes" },
    ]);
    expect(windows.map((w) => w.titlebarMode)).toEqual([false, true, false]);
  });
});

describe("mergeWindows", () => {
  it("keeps our records and appends disk-only records", () => {
    const merged = mergeWindows(
      [record("disk"), record("shared")],
      [record("mine"), record("shared", { target: "http://localhost:5173/" })],
    );
    expect(merged.map((w) => w.id)).toEqual(["mine", "shared", "disk"]);
    expect(merged[1]?.target).toBe("http://localhost:5173/");
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

describe("recents caps", () => {
  it("keeps at most MAX_RECENTS_PER_HOST pages per origin", () => {
    const list = Array.from({ length: MAX_RECENTS_PER_HOST + 3 }, (_, i) => ({
      url: `http://localhost:5173/p${i}`,
      lastOpenedAt: 100 - i,
    }));
    const capped = capRecents(list);
    expect(capped).toHaveLength(MAX_RECENTS_PER_HOST);
    expect(capped[0]?.url).toBe("http://localhost:5173/p0");
  });

  it("lets a different origin survive a busy host's history", () => {
    const busy = Array.from({ length: MAX_RECENTS }, (_, i) => ({
      url: `http://localhost:3000/p${i}`,
      lastOpenedAt: MAX_RECENTS - i,
    }));
    const merged = mergeRecents(busy, "http://localhost:5173/", 1);
    expect(merged).toHaveLength(MAX_RECENTS_PER_HOST + 1);
    expect(merged[0]?.url).toBe("http://localhost:5173/");
  });

  it("caps the total list across many origins", () => {
    const many = Array.from({ length: MAX_RECENTS + 10 }, (_, i) => ({
      url: `http://localhost:${2000 + i}/`,
      lastOpenedAt: i,
    }));
    expect(mergeRecentLists(many, [])).toHaveLength(MAX_RECENTS);
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

  it("applies last-writer-wins to the shared extension list", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    const b = new StateStore(file);
    a.setExtensions([]);
    b.setExtensions([
      {
        slug: "s",
        id: "id",
        name: "Name",
        version: "1.0.0",
        source: "folder",
        enabled: true,
        installedAt: 1,
      },
    ]);
    expect(new StateStore(file).get().extensions.map((e) => e.slug)).toEqual(["s"]);
  });

  it("keeps another instance's recents when a shared preference is written", () => {
    const file = tmpFile();
    const a = new StateStore(file);
    a.recordRecent("http://localhost:3000/");
    const b = new StateStore(file); // starts with [3000]
    a.recordRecent("http://localhost:5173/"); // a now has [5173, 3000]
    b.setExtensions([]); // must not clobber 5173 from disk

    const state = new StateStore(file).get();
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

describe("StateStore window records", () => {
  it("upserts one window without dropping a sibling", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(record("a", { target: "http://localhost:3000/" }));
    store.upsertWindow(record("b", { target: "http://localhost:5173/" }));
    store.patchWindow("a", { stripVisible: true });

    const state = new StateStore(file).get();
    expect(state.windows.map((w) => w.id).sort()).toEqual(["a", "b"]);
    expect(state.windows.find((w) => w.id === "a")?.stripVisible).toBe(true);
    expect(state.windows.find((w) => w.id === "b")?.target).toBe("http://localhost:5173/");
  });

  it("keeps two windows' surfaces independent on write", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(
      record("a", {
        target: "http://localhost:3000/",
        dockMode: "left",
        devtoolsOpen: true,
        variant: "jade",
        colorMode: "dark",
      }),
    );
    store.upsertWindow(record("b", { target: "http://localhost:5173/" }));
    store.patchWindow("b", {
      dockMode: "right",
      stripVisible: true,
      variant: "gold",
      colorMode: "light",
    });

    const a = new StateStore(file).get().windows.find((w) => w.id === "a");
    const b = new StateStore(file).get().windows.find((w) => w.id === "b");
    expect(a).toMatchObject({
      dockMode: "left",
      devtoolsOpen: true,
      stripVisible: false,
      variant: "jade",
      colorMode: "dark",
    });
    expect(b).toMatchObject({
      dockMode: "right",
      devtoolsOpen: false,
      stripVisible: true,
      variant: "gold",
      colorMode: "light",
    });
  });

  it("removes only the closed window's record, keeping the rest", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(record("a"));
    store.upsertWindow(record("b"));
    store.removeWindow("a");
    expect(new StateStore(file).get().windows.map((w) => w.id)).toEqual(["b"]);
  });

  it("composes a window view from shared state plus its record", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(
      record("a", { target: "http://localhost:3000/", devtoolsOpen: true, variant: "jade" }),
    );
    store.upsertWindow(record("b"));
    store.recordRecent("http://localhost:5173/");

    const a = store.composeWindowView("a");
    const b = store.composeWindowView("b");
    expect(a).toMatchObject({
      target: "http://localhost:3000/",
      devtoolsOpen: true,
      variant: "jade",
    });
    // Theme is per-window: b keeps the default while a is jade.
    expect(b).toMatchObject({ target: null, devtoolsOpen: false, variant: "obsidian" });
    expect(a.recents).toEqual(b.recents);
  });

  it("keeps two windows' titlebar modes independent", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(record("a", { titlebarMode: true }));
    store.upsertWindow(record("b"));
    store.patchWindow("b", { titlebarMode: false });

    const windows = new StateStore(file).get().windows;
    expect(windows.find((w) => w.id === "a")?.titlebarMode).toBe(true);
    expect(windows.find((w) => w.id === "b")?.titlebarMode).toBe(false);
  });

  it("composes titlebarMode into the renderer view per window", () => {
    const file = tmpFile();
    const store = new StateStore(file);
    store.upsertWindow(record("a", { titlebarMode: true }));
    store.upsertWindow(record("b"));

    expect(store.composeWindowView("a").titlebarMode).toBe(true);
    expect(store.composeWindowView("b").titlebarMode).toBe(false);
  });
});
