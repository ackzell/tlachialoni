import { ipcRenderer } from "electron";
import type { FrameMarker, FrameNoticeStyle, FrameNoticeUpdate } from "@shared/frame-notice";

/**
 * The frame-failure marker, drawn inside the guest page (specs/028).
 *
 * This is the tool's third sanctioned exception to constitution II: one transient
 * host node per page while a frame is marked, removed on recovery, dismissal, or
 * navigation. It exists because Electron cannot load a document into a subframe
 * the way Chrome and Firefox do, and a shell overlay can only learn the frame's
 * rectangle after the page has already reflowed.
 *
 * Because the box lives in the page's own document, a `ResizeObserver` callback
 * places it after layout and before paint, so it moves in the same frame as the
 * frame it covers. Nothing is measured across processes.
 */

const HOST_ATTRIBUTE = "data-tlachialoni-frames";
/** Below this height the frame has no room for the reason line. */
const COMPACT_HEIGHT = 104;

interface Placed {
  box: HTMLDivElement;
  frame: HTMLIFrameElement;
  observer: ResizeObserver;
}

let host: HTMLDivElement | null = null;
let layer: HTMLDivElement | null = null;
let markers: FrameMarker[] = [];
let style: FrameNoticeStyle | null = null;
let preview: { box: HTMLDivElement; url: string } | null = null;
const placed = new Map<string, Placed>();

const CSS = `
.layer {
  position: absolute;
  inset: 0;
  direction: ltr;
  pointer-events: none;
  font: 400 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  -webkit-font-smoothing: antialiased;
}
.marker {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--marker-bg);
  color: var(--marker-fg);
  text-align: center;
  pointer-events: none;
}
.marker__body { min-width: 0; max-width: 42ch; }
.marker__label { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
.marker__url {
  margin: 4px 0 0;
  color: var(--marker-accent);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.marker__reason { margin: 3px 0 0; color: var(--marker-muted); font-size: 11px; }
.marker--compact { padding: 8px; }
.marker--compact .marker__reason { display: none; }
.marker--card {
  position: fixed;
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(440px, 88vw);
  height: auto;
  padding: 14px 16px;
  border-radius: 8px;
  box-shadow: 0 24px 60px rgb(0 0 0 / 45%), inset 0 0 0 1px var(--marker-border);
}
`;

function ensureHost(): void {
  if (host) return;
  host = document.createElement("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = document.createElement("style");
  sheet.textContent = CSS;
  shadow.appendChild(sheet);
  layer = document.createElement("div");
  layer.className = "layer";
  shadow.appendChild(layer);

  (document.documentElement ?? document.body).appendChild(host);
  // A scroll moves the frame without resizing it, and a resize can move it
  // without changing its size. Both are placed synchronously in the handler, so
  // the box moves in the same frame as the page.
  window.addEventListener("scroll", onMove, { capture: true, passive: true });
  window.addEventListener("resize", onMove, { passive: true });
}

function onMove(): void {
  if (placed.size === 0) return;
  refreshFrameMarkers();
}

function paintStyle(): void {
  if (!layer || !style) return;
  layer.style.setProperty("--marker-bg", style.background);
  layer.style.setProperty("--marker-fg", style.foreground);
  layer.style.setProperty("--marker-muted", style.muted);
  layer.style.setProperty("--marker-accent", style.accent);
  layer.style.setProperty("--marker-border", style.border);
}

/** The frame still pointing at the failed address, if the page still has one. */
function findFrame(url: string): HTMLIFrameElement | null {
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    const src = frame.src || frame.getAttribute("src") || "";
    if (src === url) return frame;
  }
  return null;
}

function buildBody(marker: FrameMarker): HTMLDivElement {
  const body = document.createElement("div");
  body.className = "marker__body";

  const label = document.createElement("p");
  label.className = "marker__label";
  label.textContent = "Frame blocked";

  const url = document.createElement("p");
  url.className = "marker__url";
  url.textContent = marker.url;

  const reason = document.createElement("p");
  reason.className = "marker__reason";
  reason.textContent = marker.reason;

  body.append(label, url, reason);
  return body;
}

function place(entry: Placed): void {
  if (!entry.frame.isConnected) return;
  const rect = entry.frame.getBoundingClientRect();
  entry.box.style.left = `${rect.left}px`;
  entry.box.style.top = `${rect.top}px`;
  entry.box.style.width = `${rect.width}px`;
  entry.box.style.height = `${rect.height}px`;
  entry.box.classList.toggle("marker--compact", rect.height < COMPACT_HEIGHT);
}

function create(marker: FrameMarker, frame: HTMLIFrameElement): Placed {
  const box = document.createElement("div");
  box.className = "marker";
  box.appendChild(buildBody(marker));
  layer?.appendChild(box);

  const observer = new ResizeObserver(() => {
    const entry = placed.get(marker.url);
    if (entry) place(entry);
  });
  observer.observe(frame);

  const entry: Placed = { box, frame, observer };
  placed.set(marker.url, entry);
  return entry;
}

function drop(url: string): void {
  const entry = placed.get(url);
  if (!entry) return;
  entry.observer.disconnect();
  entry.box.remove();
  placed.delete(url);
}

function syncPreview(marker: FrameMarker | null): void {
  if (!marker) {
    preview?.box.remove();
    preview = null;
    return;
  }
  if (preview?.url === marker.url) return;
  preview?.box.remove();
  const box = document.createElement("div");
  box.className = "marker marker--card";
  box.appendChild(buildBody(marker));
  layer?.appendChild(box);
  preview = { box, url: marker.url };
}

function report(missing: string[]): void {
  if (missing.length > 0) ipcRenderer.send("frame:missing", { urls: missing });
}

/**
 * Draws the markers main asked for. An address with no matching frame left in the
 * page is reported, so a marker whose frame is gone is dropped rather than kept
 * alive over nothing.
 */
export function applyFrameMarkers(update: FrameNoticeUpdate): void {
  markers = update.markers ?? [];
  style = update.style ?? null;

  if (markers.length === 0) {
    clearFrameMarkers();
    return;
  }

  ensureHost();
  paintStyle();

  const wanted = new Set(markers.map((marker) => marker.url));
  for (const url of placed.keys()) {
    const entry = placed.get(url);
    if (wanted.has(url) && entry?.frame.isConnected) continue;
    drop(url);
  }

  const missing: string[] = [];
  let previewMarker: FrameMarker | null = null;

  for (const marker of markers) {
    if (marker.preview) {
      previewMarker = marker;
      continue;
    }
    const existing = placed.get(marker.url);
    const frame = existing?.frame ?? findFrame(marker.url);
    if (!frame) {
      missing.push(marker.url);
      continue;
    }
    const entry = existing && existing.frame.isConnected ? existing : create(marker, frame);
    place(entry);
  }

  syncPreview(previewMarker);
  report(missing);
}

/** Re-runs the placement pass; used when the page's own DOM changed. */
export function refreshFrameMarkers(): void {
  if (markers.length === 0) return;
  applyFrameMarkers({ markers, style });
}

/** Removes every marker and the host node. Idempotent. */
export function clearFrameMarkers(): void {
  for (const url of placed.keys()) drop(url);
  preview?.box.remove();
  preview = null;
  markers = [];
  host?.remove();
  host = null;
  layer = null;
  window.removeEventListener("scroll", onMove, true);
  window.removeEventListener("resize", onMove);
}
