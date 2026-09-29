/**
 * Atomic, multi-instance-safe JSON store.
 * Pure module apart from the caller-provided file path (Electron supplies it),
 * so it is unit-testable.
 *
 * Several windows in one process share a single instance. Per-window records are
 * merged by `id` on write so a window never drops a sibling's (or another
 * process's) record; recents are merged; shared scalars are last-writer-wins
 * (specs/012-multi-window).
 */

import fs from "node:fs";
import path from "node:path";
import type { InstalledExtension } from "@shared/extensions";
import {
  type PersistedState,
  type WindowRecord,
  type ColorMode,
  type RecentEntry,
  type VariantSlug,
  defaultState,
  mergeRecentLists,
  mergeRecents,
  mergeWindows,
  sanitizeState,
} from "./schema";

/** The renderer-facing shape: shared state plus one window's record. */
export interface WindowViewState {
  schemaVersion: number;
  target: string | null;
  recents: RecentEntry[];
  dockMode: WindowRecord["dockMode"];
  devtoolsOpen: boolean;
  stripVisible: boolean;
  variant: VariantSlug;
  colorMode: ColorMode;
  extensions: InstalledExtension[];
}

export class StateStore {
  private state: PersistedState;

  constructor(private readonly file: string) {
    this.state = this.readFromDisk();
  }

  get(): PersistedState {
    return structuredClone(this.state);
  }

  private readFromDisk(): PersistedState {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      return sanitizeState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  private writeAtomic(data: PersistedState): void {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }

  private commit(next: PersistedState): PersistedState {
    this.state = next;
    this.writeAtomic(this.state);
    return this.state;
  }

  /**
   * Applies a patch to this process's state, unioning recents and window records
   * with whatever is on disk so neither a scalar write nor a window update drops
   * another instance's data.
   */
  update(patch: Partial<PersistedState>): PersistedState {
    const onDisk = this.readFromDisk();
    const recents = mergeRecentLists(onDisk.recents, this.state.recents);
    const windows = mergeWindows(onDisk.windows, patch.windows ?? this.state.windows);
    return this.commit({ ...this.state, ...patch, recents, windows });
  }

  /**
   * Replaces the installed extension list. Membership is last-writer-wins, like
   * the other shared preferences (FR-008).
   */
  setExtensions(extensions: InstalledExtension[]): PersistedState {
    return this.update({ extensions });
  }

  // ---- per-window records ---------------------------------------------

  /** The persisted window list (in creation order). */
  windows(): WindowRecord[] {
    return this.state.windows.map((record) => structuredClone(record));
  }

  window(id: string): WindowRecord | null {
    const record = this.state.windows.find((entry) => entry.id === id);
    return record ? structuredClone(record) : null;
  }

  /** Inserts or replaces one window record, leaving siblings untouched. */
  upsertWindow(record: WindowRecord): PersistedState {
    const windows = this.state.windows.filter((entry) => entry.id !== record.id);
    windows.push(structuredClone(record));
    return this.update({ windows });
  }

  /** Applies changes to one window record; a no-op when the id is unknown. */
  patchWindow(id: string, changes: Partial<Omit<WindowRecord, "id">>): PersistedState {
    const record = this.window(id);
    if (!record) return this.get();
    return this.upsertWindow({ ...record, ...changes });
  }

  /**
   * Removes one window record from memory and disk (so a closed window does not
   * restore), keeping every other record — including another process's.
   */
  removeWindow(id: string): PersistedState {
    const onDisk = this.readFromDisk();
    const union = mergeWindows(onDisk.windows, this.state.windows);
    const windows = union.filter((record) => record.id !== id);
    return this.commit({ ...this.state, windows });
  }

  /** Composes the renderer-facing state for one window. */
  composeWindowView(id: string): WindowViewState {
    const record = this.state.windows.find((entry) => entry.id === id) ?? null;
    return {
      schemaVersion: this.state.schemaVersion,
      target: record?.target ?? null,
      recents: structuredClone(this.state.recents),
      dockMode: record?.dockMode ?? "bottom",
      devtoolsOpen: record?.devtoolsOpen ?? false,
      stripVisible: record?.stripVisible ?? false,
      variant: record?.variant ?? "obsidian",
      colorMode: record?.colorMode ?? "system",
      extensions: structuredClone(this.state.extensions),
    };
  }

  // ---- recents ---------------------------------------------------------

  /**
   * Records a successfully loaded target. Re-reads the file first so concurrent
   * instances merge their recents instead of clobbering each other.
   */
  recordRecent(url: string): PersistedState {
    const onDisk = this.readFromDisk();
    const recents = mergeRecents(onDisk.recents, url, Date.now());
    return this.commit({ ...this.state, recents });
  }

  /**
   * Refreshes in-memory recents from disk without writing, so the palette shows
   * targets opened in other instances (FR-004). Never touches window records.
   */
  refreshRecents(): PersistedState {
    const onDisk = this.readFromDisk();
    const recents = mergeRecentLists(onDisk.recents, this.state.recents);
    this.state = { ...this.state, recents };
    return this.state;
  }
}
