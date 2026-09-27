/**
 * Atomic, multi-instance-safe JSON store.
 * Pure module apart from the caller-provided file path (Electron supplies it),
 * so it is unit-testable.
 */

import fs from "node:fs";
import path from "node:path";
import {
  type PersistedState,
  type Bounds,
  type DockMode,
  type ColorMode,
  type VariantSlug,
  defaultState,
  mergeRecentLists,
  mergeRecents,
  sanitizeState,
} from "./schema";

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
   * Applies a patch to this window's state, unioning recents with whatever is on
   * disk so a scalar write never drops a target another instance recorded.
   */
  update(patch: Partial<PersistedState>): PersistedState {
    const onDisk = this.readFromDisk();
    const recents = mergeRecentLists(onDisk.recents, this.state.recents);
    return this.commit({ ...this.state, ...patch, recents });
  }

  setTarget(target: string): PersistedState {
    return this.update({ target });
  }

  setDockMode(dockMode: DockMode): PersistedState {
    return this.update({ dockMode });
  }

  setDevtoolsOpen(devtoolsOpen: boolean): PersistedState {
    return this.update({ devtoolsOpen });
  }

  setStripVisible(stripVisible: boolean): PersistedState {
    return this.update({ stripVisible });
  }

  setBounds(bounds: Bounds): PersistedState {
    return this.update({ bounds });
  }

  setVariant(variant: VariantSlug): PersistedState {
    return this.update({ variant });
  }

  setColorMode(colorMode: ColorMode): PersistedState {
    return this.update({ colorMode });
  }

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
   * targets opened in other instances (FR-004). Never touches target/bounds.
   */
  refreshRecents(): PersistedState {
    const onDisk = this.readFromDisk();
    const recents = mergeRecentLists(onDisk.recents, this.state.recents);
    this.state = { ...this.state, recents };
    return this.state;
  }
}
