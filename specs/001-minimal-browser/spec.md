# Feature Specification: Minimal Browser

**Feature Branch**: `001-minimal-browser`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "A local single chromeless window that renders localhost sites from my development environment (default port 3000), with docked Chromium DevTools for frontend work and none of the rest of the window required. Draggable from the top of the window but with no title bar. A command palette to enter the URL (no visible URL bar), a hidden drag strip toggled on demand, docked DevTools whose side is configurable, and the whole minimal UI themed with the Tlapalli theme system, with dark/light following the system."

## Clarifications

### Session 2026-09-25

- Q: Which addresses should the tool be allowed to load — only your local development servers, or any `http/https` address you type? → A: Local targets only — loopback (`localhost`, `127.0.0.0/8`, `::1`), private network ranges (`10/8`, `172.16/12`, `192.168/16`), and dev hostnames (`*.localhost`, `*.local`, `*.test`); public internet addresses are rejected in the palette or opened in the system browser when navigated to from the page.
- Q: When the drag strip is visible, should it float on top of the page, or should the page shrink down to make room for it? → A: Overlay — the strip floats above the page and never changes the page's layout or viewport size.
- Q: While a target is loading — especially on a cold start with a slow server — what should the window show? → A: A subtle themed loading indicator over the themed background until first paint, then it disappears.
- Q: When the palette is open, how should it close, and where should keyboard focus go afterwards? → A: `Esc` and click-outside both dismiss it, focus returns to the page, and invalid submissions keep it open with visible feedback.
- Q: What should happen if the tool is launched again while an instance is already running? → A: Multiple instances are allowed — each launch opens an independent window with its own target, so parallel related projects can be open at once.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Render a local dev site with docked DevTools (Priority: P1)

A developer starts any local dev server on port 3000 and launches the tool. A
frameless window opens showing the site edge to edge, with real Chromium
DevTools docked at the bottom of the same window. No URL bar, tabs, or menus
appear.

**Why this priority**: This is the reason the tool exists. Everything else
refines an already-useful single-window, docked-DevTools workflow.

**Independent Test**: With a server listening on `http://localhost:3000`, launch
the tool and confirm the page and docked DevTools share the window, then resize
the window and confirm both reflow. Delivers standalone value on its own.

**Acceptance Scenarios**:

1. **Given** a reachable `http://localhost:3000` and a first-ever launch, **When** the tool opens, **Then** a frameless window renders the site with genuine Chromium DevTools docked within it at the bottom.
2. **Given** DevTools docked, **When** the window is resized, **Then** the page and DevTools reflow together with no overlap or dead space.
3. **Given** a previously used target, **When** the tool is relaunched, **Then** that target loads by default, and on a first launch the default is `http://localhost:3000`.
4. **Given** the tool is running, **When** no shell surface has been invoked, **Then** no tool chrome is visible over the page.

---

### User Story 2 - Navigate with the command palette (Priority: P2)

The developer presses `⌘P` to open a top-centered command palette, centered
horizontally near the top of the window, and presses it again to dismiss. With an
empty input it lists available
commands and recent targets. Typing a URL, or a shorthand such as `:5173`,
`5173`, or `localhost:5173`, navigates the view.
Pressing `⌘L` opens the palette prefilled with the current target for editing.

**Why this priority**: With no URL bar, the palette is the only way to point the
tool at a target. It must exist before any target other than the default can be
reached.

**Independent Test**: Open the palette, type `:5173`, submit, and confirm the
view navigates to `http://localhost:5173`; relaunch and confirm the target is
offered in recents.

**Acceptance Scenarios**:

1. **Given** the palette is open with empty input, **When** it renders, **Then** commands and recent targets are listed.
2. **Given** the palette is open, **When** the developer submits `:5173`, `5173`, or `localhost:5173`, **Then** the view navigates to `http://localhost:5173`.
3. **Given** the palette is open, **When** the developer submits a full local `http(s)://` URL, **Then** the view navigates to that URL unchanged.
4. **Given** the palette is open, **When** the developer submits text that is neither a valid target nor a command, **Then** no navigation occurs and feedback indicates no match.
5. **Given** a target loaded successfully, **When** the palette is reopened, **Then** that target appears in recents, deduplicated, newest first.
6. **Given** the tool is showing a target, **When** the developer presses `⌘L`, **Then** the palette opens prefilled with the current target.
7. **Given** the palette is open, **When** the developer presses `Esc` or clicks outside it, **Then** the palette closes and keyboard focus returns to the page.
8. **Given** the palette is open, **When** the developer types a query that fuzzy-matches a command, **Then** the matched characters in that row's label are emphasized (bolder, in the theme accent) without altering the label text.
9. **Given** the palette is open with more matches than fit the visible list, **When** the developer moves the highlight with the arrow keys past the visible window, **Then** the list scrolls to keep the highlighted row in view.
10. **Given** the palette is open, **When** the developer presses `⌘P` again, **Then** the palette dismisses and keyboard focus returns to the page.

---

### User Story 3 - Control DevTools placement (Priority: P3)

The developer toggles DevTools with `⌘⇧J` and moves them with `⌘⇧1`, `⌘⇧2`, and
`⌘⇧3` (bottom, right, left), or through equivalent palette commands. The chosen
side and open state persist across launches.

**Why this priority**: Docking is core, but which side is a preference. The
default (bottom, open) already satisfies Story 1, so placement control can land
after navigation.

**Independent Test**: Dock right with `⌘⇧2`, quit, relaunch, and confirm DevTools
reopen docked right.

**Acceptance Scenarios**:

1. **Given** DevTools are open, **When** the developer presses `⌘⇧J`, **Then** DevTools close without closing or reloading the page; pressing it again reopens them on the last used side.
2. **Given** the developer presses `⌘⇧2`, **Then** DevTools dock to the right and the page reflows accordingly.
3. **Given** a chosen side and open state, **When** the tool is relaunched, **Then** both are restored.

---

### User Story 4 - Pick an element with hover highlighting (Priority: P4)

The developer presses `⌘⇧C` to arm element picking. As the pointer moves over
the page, the element under it is highlighted. Clicking selects that element in
DevTools (opening DevTools if they were closed). Pressing `Esc` or `⌘⇧C` again
disarms; navigating away also disarms.

**Why this priority**: This is a daily-use inspection shortcut, but the tool is
already useful without it; it enhances the debugging loop rather than enabling
it.

**Independent Test**: Arm the picker, hover several elements to confirm a single
correct highlight, click one, and confirm DevTools shows that element selected;
then confirm the overlay is gone.

**Acceptance Scenarios**:

1. **Given** the picker is armed, **When** the pointer moves over the page, **Then** exactly one element is highlighted at a time.
2. **Given** the picker is armed, **When** the developer clicks an element, **Then** DevTools open if closed and display that element selected.
3. **Given** DevTools are closed, **When** the developer clicks an element while armed, **Then** DevTools open docked and the element is selected.
4. **Given** the picker is armed, **When** the developer presses `Esc` or `⌘⇧C`, **Then** the picker disarms and all highlights disappear.
5. **Given** the picker is armed, **When** the page navigates or reloads, **Then** the picker disarms automatically.
6. **Given** any completed or cancelled picking session, **Then** the page retains no overlay elements, styles, or listeners from the tool.

---

### User Story 5 - Reveal the hidden drag strip (Priority: P5)

By default the window shows no chrome and cannot be moved by its edge. Pressing
`⌘B` (or a palette command) reveals a slim (~36px) top strip that can drag the window
and exposes minimal controls: reload, toggle DevTools, and close. The strip's
visibility persists across launches.

**Why this priority**: A chromeless window needs a way to move and close itself,
but this is a supporting interaction rather than the core value.

**Independent Test**: Press `⌘B`, drag the window by the strip, use each control,
and confirm the state survives a relaunch.

**Acceptance Scenarios**:

1. **Given** a fresh default state, **When** the tool opens, **Then** no strip or other chrome is visible over the page.
2. **Given** the strip is hidden, **When** the developer presses `⌘B`, **Then** the strip appears at the top of the window and can drag the window.
3. **Given** the strip is visible, **When** it appears or is dismissed, **Then** the page's layout and viewport size are unchanged.
4. **Given** the strip is visible, **When** the developer uses its controls, **Then** reload reloads the page, the DevTools control toggles DevTools, and close closes the window.
5. **Given** a chosen strip visibility, **When** the tool is relaunched, **Then** it is restored.

---

### User Story 6 - Reload and move through history (Priority: P6)

The developer presses `⌘R` to reload, `⇧⌘R` to hard reload (bypassing cache),
and `⌘←` / `⌘→` to go back and forward. Inside editable fields, the arrow
shortcuts keep their native text behavior.

**Why this priority**: Standard and expected, but not needed for the tool to be
useful, and it depends on navigation already working (Story 2).

**Independent Test**: Navigate across two pages, use `⌘←` and `⌘→`, then focus a
text field and confirm `⌘←` / `⌘→` move the caret instead of navigating.

**Acceptance Scenarios**:

1. **Given** the view has in-session history, **When** the developer presses `⌘←`, **Then** the view goes back; pressing `⌘→` goes forward.
2. **Given** focus is inside an editable field, **When** the developer presses `⌘←` or `⌘→`, **Then** the native text behavior occurs and the view does not navigate.
3. **Given** a stale or cached page, **When** the developer presses `⇧⌘R`, **Then** the page reloads bypassing the cache.

---

### User Story 7 - Theme the shell with Tlapalli (Priority: P7)

The developer selects any of the eight Tlapalli mineral variants through the
palette. Dark and light mode follow the system by default, and a manual override
cycles `system → dark → light` and is remembered. Shell surfaces and the docked
DevTools re-skin together without a restart, using Source Code Pro typography.

**Why this priority**: Theming is identity, not function; the tool works before
it looks like the owner's. It sits high in polish but low in dependency order.

**Independent Test**: Switch variants and confirm every shell surface updates
immediately; override the mode, relaunch, and confirm the choice sticks and
DevTools match.

**Acceptance Scenarios**:

1. **Given** the mode is `system`, **When** the operating system switches between dark and light, **Then** the shell and DevTools follow live.
2. **Given** a manual mode override, **When** the tool is relaunched, **Then** the override is honored regardless of the system setting, and DevTools render in the same mode.
3. **Given** any of the eight variants, **When** it is selected, **Then** all shell surfaces update immediately without restart.
4. **Given** the shell is visible in any state, **Then** its colors derive from Tlapalli tokens and its typography is Source Code Pro.

---

### User Story 8 - Survive an unreachable target (Priority: P8)

When nothing is listening at the target, the tool shows a themed failure view
naming the target and offering Retry and Edit URL, instead of a raw network
error.

**Why this priority**: Recovery matters but only after the happy path exists;
developers restart their dev servers often, so this must eventually be smooth.

**Independent Test**: Point the tool at a port with no server, confirm the
failure view and both actions, start a server, press Retry, and confirm the site
renders.

**Acceptance Scenarios**:

1. **Given** nothing is listening at the target, **When** the view attempts to load, **Then** a themed failure view appears showing the target with Retry and Edit URL.
2. **Given** the failure view is shown, **When** the developer starts the server and presses Retry, **Then** the site renders normally.
3. **Given** the failure view is shown, **When** the developer chooses Edit URL, **Then** the palette opens prefilled with the current target.

---

### Edge Cases

- **In-page navigation to a non-local site**: a clicked link to a public internet address opens in the system browser instead of the view, keeping the view on a local target; links to other local addresses navigate within the view. New windows or popups raised by the page also open in the system browser.
- **Disallowed targets**: entering a non-local address, or a scheme such as `file://` or `javascript:`, via the palette is rejected with visible feedback, and the current target is unchanged.
- **Picker armed then navigation/reload**: the picker disarms automatically and leaves no overlay behind.
- **Picker click with DevTools closed**: DevTools open in the persisted dock position and the clicked element is selected.
- **Rapid dock-side changes**: the final state is stable, with no orphaned panel or leftover space.
- **Recents growth**: the list stays deduplicated, newest first, and capped at ten entries.
- **Window resize with the strip visible**: the strip spans the window width and does not alter the page's layout beyond the window resize itself.
- **First-ever launch (no persisted state)**: target `http://localhost:3000`, obsidian variant, system mode, strip hidden, DevTools open docked bottom.
- **Target changes port or dies mid-session**: the next load surfaces the failure view rather than a blank window.
- **Slow or starting server**: while the target is loading, a themed loading indicator is shown over the themed background until first paint; it disappears immediately on paint and is never shown over an already-painted page. A same-origin target change (a different path on the same scheme+host+port) is treated as the site navigating itself and is therefore never covered; a switch to a different origin still is.
- **Multiple instances**: launching the tool again opens an independent window; quitting or changing one instance does not affect the others, and targets opened in any instance remain in recents.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST render exactly one local http/https target at a time in a frameless window, defaulting to `http://localhost:3000` on first launch. Allowed local targets are loopback addresses (`localhost`, `127.0.0.0/8`, `::1`), private network ranges (`10/8`, `172.16/12`, `192.168/16`), and dev hostnames (`*.localhost`, `*.local`, `*.test`).
- **FR-002**: The system MUST provide genuine Chromium DevTools docked within the same window as the page, on a selectable side (bottom, right, or left).
- **FR-003**: On first launch, the system MUST open DevTools docked at the bottom.
- **FR-004**: The system MUST persist across launches: the current target, recents, DevTools dock side and open state, strip visibility, window size and position, theme variant, and color mode. Across instances, global preferences (theme variant, color mode, dock side and open state, strip visibility) and recents are shared — recents merge so targets opened in any instance are retained — while the persisted current target and window bounds are last-writer-wins.
- **FR-005**: The system MUST toggle a command palette on `⌘P` — opening it when closed and dismissing it when open — listing commands and recents when the input is empty and filtering both as the developer types.
- **FR-006**: The system MUST normalize target shorthand: `:5173`, `5173`, and `localhost:5173` resolve to `http://localhost:5173`; well-formed local http/https URLs pass through unchanged; all other schemes and non-local addresses are rejected with visible feedback.
- **FR-007**: The system MUST provide `⌘L` to open the palette prefilled with the current target.
- **FR-008**: The system MUST provide `⌘⇧J` to toggle DevTools and `⌘⇧1` / `⌘⇧2` / `⌘⇧3` to dock bottom / right / left, with equivalent palette commands for each.
- **FR-009**: The system MUST provide `⌘B` as an explicit toggle for a top drag strip, and the strip MUST expose reload, toggle-DevTools, and close controls while remaining draggable outside those controls. The strip MUST overlay the page without changing the page's layout or viewport size.
- **FR-010**: The system MUST provide `⌘R` to reload and `⇧⌘R` to reload bypassing the cache.
- **FR-011**: The system MUST provide `⌘←` and `⌘→` for back and forward, and MUST defer to native text behavior when focus is inside an editable field.
- **FR-012**: The system MUST arm an element picker on `⌘⇧C` that highlights the element under the pointer and, on click, selects that element in DevTools; `Esc` or `⌘⇧C` disarms it.
- **FR-013**: The element picker's highlighting MUST be transient, and the system MUST remove all of its artifacts on selection, cancel, or navigation.
- **FR-014**: The system MUST run the guest page isolated and sandboxed, with no privileged runtime access from the page.
- **FR-015**: The system MUST open guest-initiated popups and new windows in the system browser rather than inside the tool.
- **FR-016**: The system MUST theme every shell surface (palette, strip, failure view) exclusively from Tlapalli tokens and MUST offer all eight mineral variants for selection.
- **FR-017**: The system MUST follow the operating system's color mode by default and MUST provide a persisted manual override cycling `system → dark → light`; shell surfaces and docked DevTools MUST share the effective mode.
- **FR-018**: The system MUST use Source Code Pro as the shell typography, bundled locally so it renders without network access.
- **FR-019**: The system MUST display a themed failure view naming the target and offering Retry and Edit URL when the target is unreachable.
- **FR-020**: The system MUST make every shell capability reachable from the keyboard and listed in the palette, so that no capability depends on a hidden mouse target.
- **FR-021**: The system MUST show a subtle themed loading indicator over the themed surface from launch or navigation until the target's first paint, and MUST NOT show the failure view for a target that is merely slow to respond.
- **FR-022**: The system MUST dismiss the palette on `Esc` or a click outside it, return keyboard focus to the page afterwards, and keep the palette open with visible feedback when a submission is invalid.
- **FR-023**: The system MUST allow more than one instance to run at once, each rendering its own target independently, so a developer can work on parallel related projects side by side.
- **FR-026**: The system MUST emphasize, within each palette row's label, the characters the typed query matched, so the fuzzy match is visible at a glance without changing the label text.
- **FR-027**: The system MUST keep the highlighted palette row within the visible list window as the developer moves the selection with the arrow keys, scrolling the list only when the row would otherwise leave it.

### Key Entities _(include if feature involves data)_

- **Target**: the single local http/https address currently rendered; stored in normalized form.
- **Recents**: an ordered, deduplicated list of **RecentEntry** records (a successfully loaded target URL plus its last-opened time), newest first, at most ten entries.
- **Preferences (PersistedState)**: the single persisted record — current target, recents, DevTools dock side, DevTools open state, strip visibility, window bounds, theme variant, and color mode.
- **Picker session**: the transient armed/disarmed state of element picking and the lifecycle of its highlight overlay.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a developer machine, a reachable target renders with DevTools docked within 3 seconds of launch.
- **SC-002**: When no shell surface is invoked (strip hidden, palette closed, target reachable), zero pixels of tool chrome are visible over the page.
- **SC-003**: 100% of shell capabilities are invocable by keyboard and listed in the command palette.
- **SC-004**: After any picking session, the rendered page contains zero residual elements, styles, or listeners from the tool.
- **SC-005**: 100% of persisted preferences (target, recents, dock side and open state, strip visibility, window bounds, variant, mode) are restored after relaunch with no manual file editing.
- **SC-006**: Theme variant and mode changes apply to the shell and DevTools without restart, in under 1 second.
- **SC-007**: A developer can switch to a shorthand target (for example port `5173`) and be viewing it within two keystrokes plus Enter from an idle state.

## Assumptions

- The primary platform is macOS on Apple silicon; other platforms are out of scope for this version.
- The tool runs from source through the project's development command. (Packaging,
  signing, and distribution were deferred for this feature; packaging is now in
  scope — see `specs/003-standalone-packaging/`.)
- Users are developers running local http/https development servers, commonly on ports such as 3000 or 5173. The tool serves only local targets (loopback, private network ranges, and dev hostnames); public internet addresses are out of scope.
- Applications under development bring their own framework-specific DevTools (for example, a Vue integration); the tool does not bundle or inject any.
- The repository is MIT-licensed with a README; the project is named `tlachialoni` and may be renamed later.
- Each window renders one target; tabs and auto-update are out of scope. Multiple independent instances are supported so parallel related projects can be open at once (see FR-023).
