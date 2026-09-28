/**
 * Installs, loads, and manages developer-installed Chrome extensions.
 *
 * Electron can only load unpacked extensions and forgets them every launch, so
 * the manager owns the extension folder under the app's user-data area, records
 * every install in the state store, and re-loads the enabled ones at boot.
 *
 * Extensions are loaded only into the session handed to the constructor — the
 * guest page's session. The shell runs in a different session and is never
 * reachable from here (constitution II, FR-009).
 */

import { dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { parseExtensionId } from "@shared/extension-id";
import type {
  ExtensionResult,
  ExtensionSource,
  ExtensionStatus,
  InstalledExtension,
} from "@shared/extensions";
import type { StateStore } from "../state/store";
import { extractCrxToDir, readManifest } from "./crx";
import { crxDownloadUrl, downloadCrx } from "./store";

export interface ExtensionManagerOptions {
  store: StateStore;
  session: Electron.Session;
  /** Absolute path to the directory holding unpacked extension folders. */
  root: string;
}

/** Filesystem-safe folder name derived from an extension name. */
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || `extension-${Date.now().toString(36)}`
  );
}

function chromeVersion(): string {
  return process.versions.chrome ?? "120.0.0.0";
}

export class ExtensionManager {
  /** Called whenever the installed list changes, so the shell can re-render. */
  onChange: (() => void) | null = null;
  /** Called with each install/update status, for the status surface. */
  onStatus: ((status: ExtensionStatus) => void) | null = null;

  private readonly store: StateStore;
  private readonly session: Electron.Session;
  /** True while a mutating task runs, so two installs cannot race staging. */
  private busy = false;
  readonly root: string;

  constructor(options: ExtensionManagerOptions) {
    this.store = options.store;
    this.session = options.session;
    this.root = options.root;
    fs.mkdirSync(this.root, { recursive: true });
  }

  // ---- boot ------------------------------------------------------------

  /**
   * Loads every enabled extension. A record whose folder has vanished is kept
   * but disabled so it stops failing on every launch and stays visible for the
   * developer to remove or reinstall.
   */
  async loadAll(): Promise<void> {
    for (const record of this.store.get().extensions) {
      if (!record.enabled) continue;
      try {
        await this.load(record.slug);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[extensions] ${record.name} failed to load: ${reason}\n`);
        this.patch(record.slug, { enabled: false });
      }
    }
  }

  // ---- install ---------------------------------------------------------

  /** Installs or updates a store extension from a URL or raw ID. */
  async installFromStore(input: string): Promise<ExtensionResult> {
    const id = parseExtensionId(input);
    if (!id) {
      const reason = "Paste a Chrome Web Store URL or a 32-character extension ID";
      this.emit({ phase: "error", message: "Couldn't install the extension", error: reason });
      return { ok: false, reason };
    }
    if (this.busy) return { ok: false, reason: "Another extension task is already running" };
    this.busy = true;
    try {
      return await this.downloadAndInstall(id);
    } finally {
      this.busy = false;
    }
  }

  private async downloadAndInstall(id: string): Promise<ExtensionResult> {
    const staging = this.stagingDir(id);
    try {
      this.emit({ phase: "resolving", name: id, message: "Looking up the extension" });

      let announced = false;
      const buffer = await downloadCrx(crxDownloadUrl(id, chromeVersion()), (received, total) => {
        announced = true;
        this.emit({
          phase: "downloading",
          name: id,
          message: "Downloading from the Chrome Web Store",
          progress: { received, total },
        });
      });
      if (!announced) {
        this.emit({
          phase: "downloading",
          name: id,
          message: "Downloading from the Chrome Web Store",
          progress: { received: buffer.length, total: buffer.length },
        });
      }

      this.emit({ phase: "verifying", name: id, message: "Verifying the package" });

      fs.rmSync(staging, { recursive: true, force: true });
      try {
        this.emit({ phase: "extracting", name: id, message: "Unpacking files" });
        extractCrxToDir(buffer, staging);
        return await this.commit(id, staging, "store", id);
      } catch (error) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      return this.failure(error, id);
    }
  }

  /** Installs an unpacked extension copied from a developer-chosen folder. */
  async installFromFolder(): Promise<ExtensionResult> {
    const choice = await dialog.showOpenDialog({
      title: "Choose an unpacked extension folder",
      buttonLabel: "Install",
      properties: ["openDirectory"],
    });
    if (choice.canceled || !choice.filePaths[0]) return { ok: true };
    if (this.busy) return { ok: false, reason: "Another extension task is already running" };
    this.busy = true;
    try {
      return await this.copyAndInstall(choice.filePaths[0]);
    } finally {
      this.busy = false;
    }
  }

  private async copyAndInstall(source: string): Promise<ExtensionResult> {
    let name = path.basename(source);
    try {
      this.emit({ phase: "verifying", message: "Reading manifest.json" });
      const manifest = readManifest(source);
      name = manifest.name;

      const slug = slugify(manifest.name);
      const staging = this.stagingDir(slug);
      fs.rmSync(staging, { recursive: true, force: true });

      this.emit({ phase: "extracting", name, message: "Copying files" });
      fs.cpSync(source, staging, { recursive: true, dereference: true });

      return await this.commit(slug, staging, "folder", "");
    } catch (error) {
      return this.failure(error, name);
    }
  }

  // ---- management ------------------------------------------------------

  async toggle(slug: string): Promise<ExtensionResult> {
    const record = this.find(slug);
    if (!record) return { ok: false, reason: "That extension is not installed" };
    return this.setEnabled(slug, !record.enabled);
  }

  async setEnabled(slug: string, enabled: boolean): Promise<ExtensionResult> {
    const record = this.find(slug);
    if (!record) return { ok: false, reason: "That extension is not installed" };
    if (this.busy) return { ok: false, reason: "Another extension task is already running" };
    this.busy = true;
    try {
      this.emit({
        phase: "loading",
        name: record.name,
        message: enabled ? `Enabling ${record.name}` : `Disabling ${record.name}`,
      });
      if (enabled) await this.load(slug);
      else this.unload(slug);
      this.patch(slug, { enabled });
      this.emit({
        phase: "done",
        name: record.name,
        message: enabled ? `Enabled ${record.name}` : `Disabled ${record.name}`,
      });
      return { ok: true };
    } catch (error) {
      return this.failure(error, record.name);
    } finally {
      this.busy = false;
    }
  }

  /** Refreshes a store-installed extension from the store. */
  async update(slug: string): Promise<ExtensionResult> {
    const record = this.find(slug);
    if (!record) return { ok: false, reason: "That extension is not installed" };
    if (record.source !== "store") {
      return { ok: false, reason: "Only extensions installed from the store can be updated" };
    }
    return this.installFromStore(record.id || record.slug);
  }

  async remove(slug: string): Promise<ExtensionResult> {
    const record = this.find(slug);
    if (!record) return { ok: false, reason: "That extension is not installed" };
    if (this.busy) return { ok: false, reason: "Another extension task is already running" };
    this.busy = true;
    try {
      this.unload(slug);
      fs.rmSync(this.dirFor(slug), { recursive: true, force: true });
      this.save(this.store.get().extensions.filter((entry) => entry.slug !== slug));
      this.emit({ phase: "done", name: record.name, message: `Removed ${record.name}` });
      return { ok: true };
    } catch (error) {
      return this.failure(error, record.name);
    } finally {
      this.busy = false;
    }
  }

  /** Unloads and re-loads every enabled extension. */
  async reloadAll(): Promise<ExtensionResult> {
    if (this.busy) return { ok: false, reason: "Another extension task is already running" };
    this.busy = true;
    try {
      this.emit({ phase: "loading", message: "Reloading extensions" });
      for (const record of this.store.get().extensions) this.unload(record.slug);
      await this.loadAll();
      this.emit({ phase: "done", message: "Reloaded extensions" });
      return { ok: true };
    } catch (error) {
      return this.failure(error);
    } finally {
      this.busy = false;
    }
  }

  revealRoot(): void {
    fs.mkdirSync(this.root, { recursive: true });
    void shell.openPath(this.root);
  }

  // ---- internals -------------------------------------------------------

  private dirFor(slug: string): string {
    return path.join(this.root, slug);
  }

  private stagingDir(slug: string): string {
    return path.join(this.root, `.staging-${slug}`);
  }

  private find(slug: string): InstalledExtension | null {
    return this.store.get().extensions.find((entry) => entry.slug === slug) ?? null;
  }

  /** Loads an installed extension and refreshes its manifest-derived metadata. */
  private async load(slug: string): Promise<Electron.Extension> {
    const dir = this.dirFor(slug);
    const manifest = readManifest(dir);
    const extension = await this.session.extensions.loadExtension(dir);
    const existing = this.find(slug);
    this.patch(slug, {
      // Keep the store ID so updates can re-resolve the store URL; otherwise use
      // the platform-assigned ID.
      id: existing?.source === "store" ? existing.id : extension.id,
      name: extension.name || manifest.name,
      version: extension.version || manifest.version,
    });
    return extension;
  }

  private unload(slug: string): void {
    const dir = this.dirFor(slug);
    const loaded = this.session.extensions.getAllExtensions().find((entry) => entry.path === dir);
    if (loaded) this.session.extensions.removeExtension(loaded.id);
  }

  /**
   * Validates a staged folder, swaps it into place, loads it, and records it.
   * `idHint` (a store ID) is preferred for the record so updates can re-resolve
   * the store URL; otherwise the platform-assigned ID is used.
   */
  private async commit(
    slug: string,
    staging: string,
    source: ExtensionSource,
    idHint: string,
  ): Promise<ExtensionResult> {
    const manifest = readManifest(staging);
    const dir = this.dirFor(slug);

    this.unload(slug);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);

    this.emit({ phase: "loading", name: manifest.name, message: "Loading extension" });
    let extension: Electron.Extension;
    try {
      extension = await this.session.extensions.loadExtension(dir);
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    }

    const existing = this.find(slug);
    const record: InstalledExtension = {
      slug,
      id: idHint || extension.id,
      name: extension.name || manifest.name,
      version: extension.version || manifest.version,
      source,
      enabled: true,
      installedAt: existing?.installedAt ?? Date.now(),
    };
    this.save([...this.store.get().extensions.filter((entry) => entry.slug !== slug), record]);
    this.emit({ phase: "done", name: record.name, message: `Installed ${record.name}` });
    return { ok: true };
  }

  private save(extensions: InstalledExtension[]): void {
    this.store.setExtensions(extensions);
    this.onChange?.();
  }

  private patch(slug: string, changes: Partial<InstalledExtension>): void {
    const current = this.store.get().extensions;
    const record = current.find((entry) => entry.slug === slug);
    if (!record) return;
    const next = { ...record, ...changes };
    if (
      next.id === record.id &&
      next.name === record.name &&
      next.version === record.version &&
      next.enabled === record.enabled
    ) {
      return;
    }
    this.save(current.map((entry) => (entry.slug === slug ? next : entry)));
  }

  private emit(status: ExtensionStatus): void {
    this.onStatus?.(status);
  }

  private failure(error: unknown, name?: string): ExtensionResult {
    const reason = error instanceof Error ? error.message : "Something went wrong";
    this.emit({
      phase: "error",
      name,
      message: name ? `Couldn't install ${name}` : "Couldn't install the extension",
      error: reason,
    });
    return { ok: false, reason };
  }
}
