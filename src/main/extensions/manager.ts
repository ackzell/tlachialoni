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
 *
 * Electron hosts Manifest V3 background service workers, but a worker that
 * throws while starting up is torn down — and `chrome.debugger` is not compiled
 * into Electron, so an MV3 extension whose worker touches it loses its
 * background entirely. For extensions that use the background as a message bus
 * — every framework developer tool — that is the whole feature. So an install
 * also writes an MV2 rewrite of the manifest to a sibling directory and prefers
 * it, falling back to the authored copy when the rewrite does not load
 * (specs/019). A background page survives the throw that kills a worker.
 */

import { app, dialog, shell } from "electron";
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
import {
  detectMv3ServiceWorker,
  extractCrxToDir,
  readManifest,
  type ExtensionManifest,
} from "./crx";
import { requiresMainWorld, shimMv3ToMv2, type Mv2Shim } from "./mv2-shim";
import { crxDownloadUrl, downloadCrx } from "./store";

export interface ExtensionManagerOptions {
  store: StateStore;
  session: Electron.Session;
  /** Absolute path to the directory holding unpacked extension folders. */
  root: string;
}

/** What a load resolved to: the display name and whether Electron will run it. */
interface LoadedExtension {
  name: string;
  /** True for an MV3 manifest with a background service worker (specs/018). */
  usesMv3ServiceWorker: boolean;
  /** True when the loaded copy is our MV2 rewrite, not the authored one (019). */
  shimmed: boolean;
  /**
   * True when no rewrite was attempted because this extension's main-world
   * content script is load-bearing. Derived from the authored manifest on every
   * load rather than persisted: it only colours the install/re-enable notice,
   * and the badge it would otherwise change is already correct.
   */
  mainWorldRequired: boolean;
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
   *
   * Boot deliberately does NOT warn about MV3 service workers: the warning fires
   * once when the extension is installed or re-enabled, and from then on the
   * list row carries an `MV3` badge. Re-warning on every launch would just train
   * the developer to dismiss it unread (specs/018, FR-005).
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
      const loaded = enabled ? await this.load(slug) : null;
      if (!enabled) this.unload(slug);
      this.patch(slug, { enabled });
      // Re-enabling is the same moment as installing: a rewritten extension gets
      // its MV2 copy loaded back, and one we could not rewrite gets the warning
      // repeated (specs/019, FR-005).
      if (loaded?.shimmed) {
        this.emitShimmed(record.name);
        return { ok: true };
      }
      if (loaded?.mainWorldRequired) {
        this.warnAboutMainWorld(record.name);
        return { ok: true };
      }
      if (loaded?.usesMv3ServiceWorker) {
        this.warnAboutMv3(record.name);
        return { ok: true };
      }
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
      fs.rmSync(this.shimDirFor(slug), { recursive: true, force: true });
      this.save(this.store.get().extensions.filter((entry) => entry.slug !== slug));
      // A `done` status replaces whatever the surface was showing, so a warning
      // left over from this extension's own load leaves with it.
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
      // A reload is not an install, so it does not re-warn; the badge in the
      // list already carries the fact (specs/018, FR-005).
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

  /**
   * Where an extension's MV2 rewrite lives. A full copy of the extension under
   * a dotted folder, so it cannot collide with an installed slug and stays out
   * of `revealRoot`, which should only ever show real installs.
   */
  private shimDirFor(slug: string): string {
    return path.join(this.root, ".shim", slug);
  }

  private stagingDir(slug: string): string {
    return path.join(this.root, `.staging-${slug}`);
  }

  private find(slug: string): InstalledExtension | null {
    return this.store.get().extensions.find((entry) => entry.slug === slug) ?? null;
  }

  /**
   * Loads an installed extension and refreshes its manifest-derived metadata,
   * including the MV3 and shim flags the list badges from (specs/018 FR-010,
   * specs/019). Re-deriving them on every load keeps the badges correct for
   * records written before the fields existed, and for an extension whose
   * manifest changed underneath us.
   *
   * The authored manifest is always the source of truth for what the extension
   * *is*; only the directory it loads from varies. That split is what lets a
   * failed rewrite degrade to today's behaviour instead of an error.
   */
  private async load(slug: string): Promise<LoadedExtension> {
    const dir = this.dirFor(slug);
    const manifest = readManifest(dir);
    const shimDir = this.shimDirFor(slug);

    // The rewrite is derived state, so it is reconciled against the manifest on
    // every load rather than trusted. `commit` writes it at install time, but an
    // extension installed before this feature existed has none, and without the
    // backfill it would load exactly as it did before — silently, since a missing
    // rewrite is indistinguishable from one that was declined.
    //
    // A rewrite we would refuse to write today is deleted outright, not left to
    // be found. Eligibility is not only a property of the manifest: it is a
    // function of this code, so a rewrite written by an earlier build can be one
    // we have since learned to refuse — Vue.js devtools' `world: "MAIN"` was
    // rewritten before we knew it was load-bearing. Preferring such a copy would
    // keep running exactly the state the decline exists to undo, and it would look
    // like the fix did not take.
    const shim = this.shimFor(manifest, dir);
    if (!shim) {
      fs.rmSync(shimDir, { recursive: true, force: true });
    } else if (!fs.existsSync(path.join(shimDir, "manifest.json"))) {
      this.tryWriteShim(dir, shimDir, shim, manifest.name);
    }

    let extension: Electron.Extension | null = null;
    let shimmed = false;
    if (fs.existsSync(path.join(shimDir, "manifest.json"))) {
      try {
        extension = await this.session.extensions.loadExtension(shimDir);
        shimmed = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[extensions] ${manifest.name}: MV2 rewrite would not load, using the authored copy (${reason})\n`,
        );
      }
    }
    if (!extension) extension = await this.session.extensions.loadExtension(dir);

    const existing = this.find(slug);
    const name = extension.name || manifest.name;
    // The authored manifest still says MV3 even when we are running the rewrite,
    // which is exactly what the badge needs: it distinguishes "converted and
    // working" from "converted and failed".
    const usesMv3ServiceWorker = detectMv3ServiceWorker(manifest);
    const mainWorldRequired = requiresMainWorld(manifest);
    this.patch(slug, {
      // Keep the store ID so updates can re-resolve the store URL; otherwise use
      // the platform-assigned ID.
      id: existing?.source === "store" ? existing.id : extension.id,
      name,
      version: extension.version || manifest.version,
      mv3ServiceWorker: usesMv3ServiceWorker,
      mv2Shimmed: shimmed,
    });
    return { name, usesMv3ServiceWorker, shimmed, mainWorldRequired };
  }

  /**
   * Copies `sourceDir` to `destDir` and swaps in a rewritten manifest.
   *
   * A whole copy rather than an in-place edit, so the installed extension stays
   * byte-identical to what the store served. That costs disk (a few MB per
   * rewritten extension, once, at install) and buys reversibility: the authored
   * copy is always there to fall back to.
   */
  private writeShim(sourceDir: string, destDir: string, shim: Mv2Shim): void {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(sourceDir, destDir, { recursive: true, dereference: true });
    fs.writeFileSync(path.join(destDir, "manifest.json"), JSON.stringify(shim.manifest, null, 2));
  }

  /**
   * Writes a rewrite, reporting rather than throwing: a rewrite we cannot
   * produce is not a reason to fail a load, and the authored copy is always a
   * working fallback.
   */
  /**
   * The rewrite this manifest's worker supports, or `null` if it has none.
   *
   * The worker's own source is read here rather than inside the transform so
   * that module stays pure, but it is not optional: a worker that loads its code
   * with `importScripts` cannot run as an MV2 background page, and rewriting it
   * anyway produces an extension that loads and is silently missing everything
   * that worker was for.
   */
  private shimFor(manifest: ExtensionManifest, dir: string): Mv2Shim | null {
    const background = manifest.raw.background;
    const worker =
      typeof background === "object" && background !== null && !Array.isArray(background)
        ? (background as Record<string, unknown>).service_worker
        : "";
    const name = typeof worker === "string" ? worker : "";
    let workerSource = "";
    if (name) {
      try {
        // Split on `/` so a manifest path resolves segment by segment on every
        // platform; `path.join` would not treat `/` as a separator on Windows.
        workerSource = fs.readFileSync(path.join(dir, ...name.split("/")), "utf8");
      } catch (error) {
        // Unreadable is not the same as empty: guessing would risk rewriting an
        // extension whose worker we never actually read.
        const reason = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[extensions] ${manifest.name}: could not read ${name} (${reason})\n`);
        return null;
      }
    }
    return shimMv3ToMv2(manifest, { workerSource });
  }

  private tryWriteShim(dir: string, shimDir: string, shim: Mv2Shim, name: string): void {
    try {
      this.writeShim(dir, shimDir, shim);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[extensions] ${name}: could not write the MV2 rewrite (${reason})\n`);
    }
  }

  private unload(slug: string): void {
    const loaded = this.session.extensions.getAllExtensions();
    for (const dir of [this.dirFor(slug), this.shimDirFor(slug)]) {
      const found = loaded.find((entry) => entry.path === dir);
      if (found) this.session.extensions.removeExtension(found.id);
    }
  }

  /**
   * Validates a staged folder, swaps it into place, loads it, and records it.
   * `idHint` (a store ID) is preferred for the record so updates can re-resolve
   * the store URL; otherwise the platform-assigned ID is used.
   *
   * This is the single funnel every install, folder install, and update passes
   * through, so it discards any stale rewrite here. `load` regenerates one for
   * an extension that has none; this exists so an update never leaves the
   * previous version's rewrite behind.
   */
  private async commit(
    slug: string,
    staging: string,
    source: ExtensionSource,
    idHint: string,
  ): Promise<ExtensionResult> {
    const manifest = readManifest(staging);
    const dir = this.dirFor(slug);
    const shimDir = this.shimDirFor(slug);

    // Computed before the swap so a manifest we cannot rewrite is never written.
    const shim = this.shimFor(manifest, staging);

    this.unload(slug);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(shimDir, { recursive: true, force: true });
    fs.renameSync(staging, dir);

    if (shim) this.tryWriteShim(dir, shimDir, shim, manifest.name);

    this.emit({ phase: "loading", name: manifest.name, message: "Loading extension" });
    let extension: Electron.Extension | null = null;
    let shimmed = false;
    if (shim && fs.existsSync(path.join(shimDir, "manifest.json"))) {
      try {
        extension = await this.session.extensions.loadExtension(shimDir);
        shimmed = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[extensions] ${manifest.name}: MV2 rewrite would not load (${reason})\n`,
        );
      }
    }
    if (!extension) {
      try {
        extension = await this.session.extensions.loadExtension(dir);
      } catch (error) {
        // Only the authored copy failing is fatal. A rejected rewrite already
        // fell back above, and must never cost the developer their extension.
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(shimDir, { recursive: true, force: true });
        throw error;
      }
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
      mv3ServiceWorker: detectMv3ServiceWorker(manifest),
      mv2Shimmed: shimmed,
    };
    this.save([...this.store.get().extensions.filter((entry) => entry.slug !== slug), record]);

    // Install is the one moment this is worth interrupting for: the developer is
    // deciding whether to keep the extension, and the badge takes over after.
    if (shimmed) this.emitShimmed(record.name);
    else if (requiresMainWorld(manifest)) this.warnAboutMainWorld(record.name);
    else if (record.mv3ServiceWorker) this.warnAboutMv3(record.name);
    else this.emit({ phase: "done", name: record.name, message: `Installed ${record.name}` });
    return { ok: true };
  }

  /**
   * Reports a successful rewrite as a `warning` that waits to be dismissed.
   *
   * A `done` auto-leaves after ~1.6s, which is right for an install that needs
   * no further attention but wrong here: the app silently changed how an
   * extension it was given declares itself, and that is worth reading at the
   * developer's pace rather than in the time it takes to glance away. Dismissing
   * it is the acknowledgement; the badge carries the fact afterwards
   * (specs/019, FR-004).
   */
  private emitShimmed(name: string): void {
    this.emit({
      phase: "warning",
      name,
      message: `${name} was rewritten from Manifest V3 to V2 so its background runs as a page, which survives an API error that would kill a service worker. Its manifest is the only thing that changed; the installed copy is untouched.\nReload the page for it to take effect — extensions only reach a page that loads after them. Some Manifest V3-only APIs are still unavailable, so parts of it may not work.`,
    });
  }

  /**
   * Reports that no rewrite was attempted because this extension needs the main
   * JavaScript world, which MV2 cannot express.
   *
   * Kept apart from {@link warnAboutMv3} because the two leave the same visible
   * state — an at-risk background, and therefore the same `MV3` badge — but not
   * the same one: this extension is working, and saying so much less would be a
   * lie the developer can disprove by looking at the panel.
   */
  private warnAboutMainWorld(name: string): void {
    this.emit({
      phase: "warning",
      name,
      message: `${name} keeps its Manifest V3 manifest on purpose. It runs part of itself in the page's own JavaScript world, which Manifest V2 cannot express, so converting it would break the extension outright. Its background runs as authored and may not survive an API this app doesn't compile, but the rest of it does.\nReload the page for it to take effect — extensions only reach a page that loads after them.`,
    });
  }

  /**
   * Warns that our MV2 rewrite of an MV3 extension did not load, so the authored
   * service worker is what runs — and that Electron tears down a service worker
   * which hits an API it doesn't compile. Shown once per install/re-enable, then
   * left to the list's badge (specs/019, FR-003).
   */
  private warnAboutMv3(name: string): void {
    this.emit({
      phase: "warning",
      name,
      message: `This extension's MV2 rewrite wouldn't load, so it keeps its Manifest V3 service worker. ${app.getName()} tears that worker down if it hits an API the app doesn't compile, so parts of it may not work.`,
    });
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
      next.enabled === record.enabled &&
      next.mv3ServiceWorker === record.mv3ServiceWorker &&
      next.mv2Shimmed === record.mv2Shimmed
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
