import { ipcRenderer } from "electron";

/**
 * Site bridge. Runs in the guest's isolated world; it never exposes anything to
 * page scripts. It owns the transient element-picker overlay (FR-012/FR-013) and
 * reports editable focus so the main process can defer ⌘←/⌘→ (FR-011).
 */

let armed = false;
let box: HTMLDivElement | null = null;

function ensureBox(): void {
  if (box) return;
  box = document.createElement("div");
  box.setAttribute("data-localbrowser-picker", "");
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    background: "rgba(90, 150, 255, 0.25)",
    border: "1px solid rgba(90, 150, 255, 0.9)",
    borderRadius: "2px",
    boxSizing: "border-box",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(box);
}

function removeBox(): void {
  box?.remove();
  box = null;
}

function onMove(event: MouseEvent): void {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!element || !box) return;
  const rect = element.getBoundingClientRect();
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  ipcRenderer.send("picker:hover", { x: event.clientX, y: event.clientY });
}

function onClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  ipcRenderer.send("picker:picked", { x: event.clientX, y: event.clientY });
}

function arm(): void {
  if (armed) return;
  armed = true;
  ensureBox();
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("click", onClick, true);
}

function disarm(): void {
  if (!armed && !box) return;
  armed = false;
  window.removeEventListener("mousemove", onMove, true);
  window.removeEventListener("click", onClick, true);
  removeBox();
}

ipcRenderer.on("picker:armed", (_event, payload: { armed?: boolean }) => {
  if (payload?.armed) arm();
  else disarm();
});

// Editable-focus tracking for the ⌘← / ⌘→ guard.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

window.addEventListener(
  "focusin",
  (event) => ipcRenderer.send("site:focus-editable", { editable: isEditable(event.target) }),
  true,
);
window.addEventListener(
  "focusout",
  () => ipcRenderer.send("site:focus-editable", { editable: false }),
  true,
);

window.addEventListener("beforeunload", () => disarm());
