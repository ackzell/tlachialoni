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
  /**
   * When true, the Shift modifier is not significant when matching. Used for
   * zoom in, whose `+` is Shift+`=` on a US layout, so both `⌘=` and `⌘⇧=`
   * resolve to the same command (specs/023).
   */
  shiftInsensitive?: boolean;
  /**
   * Overrides the OS-menu accelerator string when `code` has no Electron key name
   * (e.g. `Equal` for `+`). Shown in the menu and handled app-wide (specs/023).
   */
  menuAccelerator?: string;
}

/**
 * Palette groups. The order here is the order the palette lists groups in and
 * the order `Tab` cycles through them (after the leading "all" scope).
 */
export const COMMAND_GROUPS = [
  { id: "location", label: "Location" },
  { id: "devtools", label: "DevTools" },
  { id: "view", label: "View" },
  { id: "theme", label: "Theme" },
  { id: "extensions", label: "Extensions" },
  { id: "other", label: "Other" },
] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number]["id"];

/** What the palette is scoped to: every group, or one of them. */
export type Scope = "all" | CommandGroup;

/** Tab order: "all" first, then each group in declaration order. */
export const SCOPES: readonly Scope[] = ["all", ...COMMAND_GROUPS.map((group) => group.id)];

export function scopeLabel(scope: Scope): string {
  if (scope === "all") return "All";
  return COMMAND_GROUPS.find((group) => group.id === scope)?.label ?? scope;
}

/** Cycles scopes, wrapping; `delta` is +1 for Tab and -1 for Shift+Tab. */
export function nextScope(scope: Scope, delta = 1): Scope {
  const index = SCOPES.indexOf(scope);
  if (index < 0) return "all";
  return SCOPES[(index + delta + SCOPES.length) % SCOPES.length];
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
  /** Which palette group the command belongs to. */
  group: CommandGroup;
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

/**
 * The three color-mode choices, in palette and menu order. The slug is both the
 * persisted value and the command-id suffix, so the catalog, the store, and the
 * menu cannot disagree about the set.
 */
export const COLOR_MODES = [
  { slug: "light", name: "Light" },
  { slug: "dark", name: "Dark" },
  { slug: "system", name: "System" },
] as const;

export type ColorMode = (typeof COLOR_MODES)[number]["slug"];

export function colorModeCommandId(mode: ColorMode): string {
  return `theme.mode.${mode}`;
}

export const COMMANDS: CommandDef[] = [
  {
    id: "palette.open",
    label: "Toggle Command Palette",
    acceleratorLabel: "⌘P",
    accelerator: { meta: true, code: "KeyP" },
    palette: false,
    group: "other",
  },
  {
    id: "palette.editUrl",
    label: "Edit Current Target",
    acceleratorLabel: "⌘L",
    accelerator: { meta: true, code: "KeyL" },
    palette: true,
    group: "other",
  },
  {
    id: "palette.openTheme",
    label: "Browse Themes",
    acceleratorLabel: "⌘T",
    accelerator: { meta: true, code: "KeyT" },
    palette: true,
    group: "other",
  },
  {
    id: "target.navigate",
    label: "Go to Target",
    palette: false,
    group: "location",
    acceptsTargetInput: true,
  },
  {
    id: "strip.toggle",
    label: "Toggle Window Strip",
    acceleratorLabel: "⌘B",
    accelerator: { meta: true, code: "KeyB" },
    palette: true,
    group: "other",
  },
  {
    id: "titlebar.toggle",
    label: "Toggle Titlebar Mode",
    acceleratorLabel: "⇧⌘F",
    accelerator: { meta: true, shift: true, code: "KeyF" },
    palette: true,
    group: "other",
  },
  {
    id: "view.reload",
    label: "Reload",
    acceleratorLabel: "⌘R",
    accelerator: { meta: true, code: "KeyR" },
    palette: true,
    group: "view",
  },
  {
    id: "view.hardReload",
    label: "Hard Reload",
    acceleratorLabel: "⇧⌘R",
    accelerator: { meta: true, shift: true, code: "KeyR" },
    palette: true,
    group: "view",
  },
  {
    id: "view.back",
    label: "Back",
    acceleratorLabel: "⌘←",
    accelerator: { meta: true, code: "ArrowLeft" },
    palette: true,
    group: "view",
  },
  {
    id: "view.forward",
    label: "Forward",
    acceleratorLabel: "⌘→",
    accelerator: { meta: true, code: "ArrowRight" },
    palette: true,
    group: "view",
  },
  {
    id: "view.zoomIn",
    label: "Zoom In",
    acceleratorLabel: "⌘+",
    // `+` is Shift+`=` on a US layout, so accept both chords (specs/023).
    accelerator: {
      meta: true,
      code: "Equal",
      shiftInsensitive: true,
      menuAccelerator: "CommandOrControl+Plus",
    },
    palette: true,
    group: "view",
  },
  {
    id: "view.zoomOut",
    label: "Zoom Out",
    acceleratorLabel: "⌘−",
    accelerator: { meta: true, code: "Minus", menuAccelerator: "CommandOrControl+-" },
    palette: true,
    group: "view",
  },
  {
    id: "view.zoomReset",
    label: "Reset Zoom",
    acceleratorLabel: "⌘0",
    accelerator: { meta: true, code: "Digit0", menuAccelerator: "CommandOrControl+0" },
    palette: true,
    group: "view",
  },
  {
    id: "devtools.toggle",
    label: "Toggle DevTools",
    acceleratorLabel: "⌘⌥J",
    accelerator: { meta: true, alt: true, code: "KeyJ" },
    palette: true,
    group: "devtools",
  },
  {
    id: "devtools.dock.bottom",
    label: "Dock DevTools Bottom",
    acceleratorLabel: "⌘1",
    accelerator: { meta: true, code: "Digit1" },
    palette: true,
    group: "devtools",
  },
  {
    id: "devtools.dock.right",
    label: "Dock DevTools Right",
    acceleratorLabel: "⌘2",
    accelerator: { meta: true, code: "Digit2" },
    palette: true,
    group: "devtools",
  },
  {
    id: "devtools.dock.left",
    label: "Dock DevTools Left",
    acceleratorLabel: "⌘3",
    accelerator: { meta: true, code: "Digit3" },
    palette: true,
    group: "devtools",
  },
  {
    id: "focus.toggle",
    label: "Toggle Focus (Page / DevTools)",
    acceleratorLabel: "⌘J",
    accelerator: { meta: true, code: "KeyJ" },
    palette: true,
    group: "devtools",
  },
  {
    id: "picker.toggle",
    label: "Inspect Element",
    acceleratorLabel: "⌘⇧C",
    accelerator: { meta: true, shift: true, code: "KeyC" },
    palette: true,
    group: "devtools",
  },
  ...THEME_VARIANTS.map((v): CommandDef => ({
    id: `theme.variant.${v.slug}`,
    label: `Theme: ${v.name}`,
    palette: true,
    group: "theme",
  })),
  ...COLOR_MODES.map((mode): CommandDef => ({
    id: colorModeCommandId(mode.slug),
    label: `Color Mode: ${mode.name}`,
    palette: true,
    group: "theme",
  })),
  {
    id: "extensions.install",
    label: "Install Extension from Chrome Web Store",
    // Not listed on its own: a store install is offered as a row only when the
    // palette input is a store URL or ID, so there is no confusing dead entry.
    palette: false,
    group: "extensions",
  },
  {
    id: "extensions.installFolder",
    label: "Install Extension from Folder",
    palette: true,
    group: "extensions",
  },
  {
    id: "extensions.reload",
    label: "Reload Extensions",
    palette: true,
    group: "extensions",
  },
  {
    id: "extensions.revealFolder",
    label: "Reveal Extensions Folder",
    palette: true,
    group: "extensions",
  },
  {
    id: "extensions.dismissStatus",
    label: "Dismiss Extension Status",
    palette: false,
    group: "extensions",
  },
  {
    id: "failure.retry",
    label: "Retry",
    palette: false,
    group: "other",
  },
  {
    id: "failure.dismiss",
    label: "Go Back to Last Target",
    palette: false,
    group: "other",
  },
  {
    id: "window.new",
    label: "New Window",
    acceleratorLabel: "⌘N",
    accelerator: { meta: true, code: "KeyN" },
    palette: true,
    group: "other",
  },
  {
    id: "window.close",
    label: "Close Window",
    acceleratorLabel: "⌘W",
    accelerator: { meta: true, code: "KeyW" },
    palette: true,
    group: "other",
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
    const shiftMatches = a.shiftInsensitive ? true : Boolean(a.shift) === input.shift;
    return (
      Boolean(a.meta) === input.meta &&
      shiftMatches &&
      Boolean(a.alt) === input.alt &&
      a.code === input.code
    );
  });
}

export const PALETTE_COMMANDS = COMMANDS.filter((c) => c.palette);
