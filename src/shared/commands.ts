/**
 * The single command catalog shared by the main process and the shell renderer.
 *
 * Both the keybinding dispatcher (main) and the command palette (renderer) read
 * from this module, so every command is guaranteed to be reachable from both a
 * shortcut and the palette (constitution III, FR-020).
 */

export interface Accelerator {
  /** macOS Command. */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** KeyboardEvent.code, e.g. "KeyP", "Digit1", "ArrowLeft". */
  code: string;
}

export interface CommandDef {
  id: string;
  label: string;
  /** Human-readable accelerator shown in the palette. */
  acceleratorLabel?: string;
  /** Machine-readable accelerator matched in the main process. */
  accelerator?: Accelerator;
  /** Whether the command is listed in the palette. */
  palette: boolean;
  /** Command takes the palette's typed text as an argument. */
  acceptsTargetInput?: boolean;
}

export const THEME_VARIANTS = [
  { slug: "obsidian", name: "Obsidian" },
  { slug: "gold", name: "Gold" },
  { slug: "turquoise", name: "Turquoise" },
  { slug: "quartz", name: "Quartz" },
  { slug: "lapis-lazuli", name: "Lapis Lazuli" },
  { slug: "amethyst", name: "Amethyst" },
  { slug: "jade", name: "Jade" },
  { slug: "fire-opal", name: "Fire Opal" },
] as const;

export const COMMANDS: CommandDef[] = [
  {
    id: "palette.open",
    label: "Toggle Command Palette",
    acceleratorLabel: "⌘P",
    accelerator: { meta: true, code: "KeyP" },
    palette: false,
  },
  {
    id: "palette.editUrl",
    label: "Edit Current Target",
    acceleratorLabel: "⌘L",
    accelerator: { meta: true, code: "KeyL" },
    palette: true,
  },
  {
    id: "target.navigate",
    label: "Go to Target",
    palette: false,
    acceptsTargetInput: true,
  },
  {
    id: "strip.toggle",
    label: "Toggle Window Strip",
    acceleratorLabel: "⌘B",
    accelerator: { meta: true, code: "KeyB" },
    palette: true,
  },
  {
    id: "view.reload",
    label: "Reload",
    acceleratorLabel: "⌘R",
    accelerator: { meta: true, code: "KeyR" },
    palette: true,
  },
  {
    id: "view.hardReload",
    label: "Hard Reload",
    acceleratorLabel: "⇧⌘R",
    accelerator: { meta: true, shift: true, code: "KeyR" },
    palette: true,
  },
  {
    id: "view.back",
    label: "Back",
    acceleratorLabel: "⌘←",
    accelerator: { meta: true, code: "ArrowLeft" },
    palette: true,
  },
  {
    id: "view.forward",
    label: "Forward",
    acceleratorLabel: "⌘→",
    accelerator: { meta: true, code: "ArrowRight" },
    palette: true,
  },
  {
    id: "devtools.toggle",
    label: "Toggle DevTools",
    acceleratorLabel: "⌘⌥J",
    accelerator: { meta: true, alt: true, code: "KeyJ" },
    palette: true,
  },
  {
    id: "devtools.dock.bottom",
    label: "Dock DevTools Bottom",
    acceleratorLabel: "⌘1",
    accelerator: { meta: true, code: "Digit1" },
    palette: true,
  },
  {
    id: "devtools.dock.right",
    label: "Dock DevTools Right",
    acceleratorLabel: "⌘2",
    accelerator: { meta: true, code: "Digit2" },
    palette: true,
  },
  {
    id: "devtools.dock.left",
    label: "Dock DevTools Left",
    acceleratorLabel: "⌘3",
    accelerator: { meta: true, code: "Digit3" },
    palette: true,
  },
  {
    id: "focus.toggle",
    label: "Toggle Focus (Page / DevTools)",
    acceleratorLabel: "⌘J",
    accelerator: { meta: true, code: "KeyJ" },
    palette: true,
  },
  {
    id: "picker.toggle",
    label: "Inspect Element",
    acceleratorLabel: "⌘⇧C",
    accelerator: { meta: true, shift: true, code: "KeyC" },
    palette: true,
  },
  ...THEME_VARIANTS.map((v): CommandDef => ({
    id: `theme.variant.${v.slug}`,
    label: `Theme: ${v.name}`,
    palette: true,
  })),
  {
    id: "theme.cycleMode",
    label: "Cycle Color Mode",
    palette: true,
  },
  {
    id: "extensions.install",
    label: "Install Extension from Chrome Web Store",
    // Not listed on its own: a store install is offered as a row only when the
    // palette input is a store URL or ID, so there is no confusing dead entry.
    palette: false,
  },
  {
    id: "extensions.installFolder",
    label: "Install Extension from Folder",
    palette: true,
  },
  {
    id: "extensions.reload",
    label: "Reload Extensions",
    palette: true,
  },
  {
    id: "extensions.revealFolder",
    label: "Reveal Extensions Folder",
    palette: true,
  },
  {
    id: "extensions.dismissStatus",
    label: "Dismiss Extension Status",
    palette: false,
  },
  {
    id: "failure.retry",
    label: "Retry",
    palette: false,
  },
  {
    id: "failure.dismiss",
    label: "Go Back to Last Target",
    palette: false,
  },
  {
    id: "window.close",
    label: "Close Window",
    palette: true,
  },
];

export interface KeyInput {
  type: string;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  control: boolean;
  code: string;
}

/** Returns the command bound to a key event, or undefined. */
export function commandForInput(input: KeyInput): CommandDef | undefined {
  if (input.type !== "keyDown") return undefined;
  return COMMANDS.find((cmd) => {
    const a = cmd.accelerator;
    if (!a) return false;
    return (
      Boolean(a.meta) === input.meta &&
      Boolean(a.shift) === input.shift &&
      Boolean(a.alt) === input.alt &&
      a.code === input.code
    );
  });
}

export const PALETTE_COMMANDS = COMMANDS.filter((c) => c.palette);
