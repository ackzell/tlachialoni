# Feature Specification: Developer Surface Preview

**Feature Branch**: `008-surface-preview`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "We could add some more of those states to the menu — please check which make sense (I can think of LoadingVeil for now) and add them too. Let's create a spec/contract for this where we establish the developer should be able to work on these."

## Context

The shell's transient surfaces are hard to summon on demand: the loading veil
needs a slow server, the failure view needs a dead one, and the extension install
status needs a real download. That makes iterating on their look and motion
painful. This feature establishes a development-only affordance — a **Developer
menu** — that puts each such surface into a representative state and holds it
there so it can be styled with live HMR.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Preview a transient surface while styling it (Priority: P1)

The maintainer runs the dev build, opens the **Developer** menu, and chooses a
surface. It appears in a representative state and stays until they stop it, so
they can edit its component and watch Vite HMR update it in place.

**Why this priority**: This is the entire request, and it is the difference
between minutes and seconds per styling change.

**Independent Test**: Choose **Preview Loading Veil**, confirm the veil renders
over the window, edit `LoadingVeil.vue`, and confirm the change appears without a
restart.

**Acceptance Scenarios**:

1. **Given** a dev build, **When** the Developer menu is opened, **Then** it lists a preview for the loading veil, the failure view, and the extension install status, plus a way to stop.
2. **Given** a preview is chosen, **When** it appears, **Then** the shell is full-window so the surface is never clipped, and the surface shows representative content (a target for the veil, a target and reason for the failure view, and a cycling install for the status).
3. **Given** a preview is on screen, **When** the maintainer edits the surface's component, **Then** the change renders live.
4. **Given** a preview is on screen, **When** the maintainer chooses **Stop Preview**, **Then** the surface clears and the shell returns to its normal computed mode.

---

### User Story 2 - Previews never leak into the product (Priority: P1)

The preview affordances exist only while developing. A packaged build has no
Developer menu, and previews never touch the guest page or persisted state.

**Why this priority**: A dev convenience must not become shipped chrome or a
correctness risk; the app's chromeless contract depends on it.

**Independent Test**: Package the app and confirm there is no Developer menu;
while previewing, confirm the guest page is not navigated and no state file
entry is written.

**Acceptance Scenarios**:

1. **Given** a packaged build, **When** the menu bar is inspected, **Then** no Developer menu is present and no preview code path is reachable.
2. **Given** any preview, **When** it is active, **Then** the guest page is not navigated, modified, or reloaded, and persisted state is unchanged.
3. **Given** a preview is active, **When** the developer starts a real navigation, **Then** the preview ends so the page is interactive and the renderer follows the real load.

---

### Edge Cases

- **Two previews at once**: starting a preview clears any other, so exactly one is ever active.
- **Preview then real load**: a real target load ends the preview; the renderer follows the real loading/ready signals.
- **Guests of the app**: the strip and picker are already one keystroke away (`⌘B`, `⌘⇧C`), and the palette one `⌘P` away, so they are deliberately not previewed.
- **Slow edit loop**: previews hold indefinitely (the extension install one loops), so there is no timeout to race.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Development builds MUST expose a **Developer** menu with a preview for each transient shell surface that is otherwise hard to summon: the loading veil, the failure view, and the extension install status.
- **FR-002**: Starting a preview MUST render a representative state for that surface and MUST hold the shell at full-window so the surface is not clipped.
- **FR-003**: Exactly one preview MAY be active at a time; starting a preview MUST clear any other preview and any running extension simulation.
- **FR-004**: A single stop action MUST clear the active preview, restore the renderer's signals, and recompute the shell mode.
- **FR-005**: Previews MUST be unavailable in packaged builds and MUST NOT appear in the shipped command palette.
- **FR-006**: Previews MUST NOT navigate, modify, or reload the guest page, and MUST NOT write persisted state.
- **FR-007**: A real navigation MUST end any active preview.
- **FR-008**: The extension install preview MUST cycle its representative phases so every visual state (spinner, determinate bar, indeterminate bar, success, error) is observable.
- **FR-009**: A preview MUST persist until stopped, so a mounted component receives live HMR updates while it is being styled.

### Key Entities _(include if feature involves data)_

- **Surface preview**: a dev-only, named transient state (loading veil, failure view, extension install status) that is active or not, held by the window purely in memory.
- **Developer menu**: the development-only menu that starts and stops previews; absent from packaged builds.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Each previewed surface can be rendered on demand in one menu action, with no server, network, or navigation required.
- **SC-002**: Editing a previewed surface's component updates it live, without restarting the app.
- **SC-003**: A packaged build exposes zero preview affordances.
- **SC-004**: Starting and stopping any preview leaves the guest page's URL and the persisted state unchanged.

## Assumptions

- Previews are development tooling, not a shipped capability, so they are exempt from the palette-listing principle (constitution III) and are gated on `app.isPackaged`.
- The set of previewed surfaces is the transient ones that are hard to trigger; the palette, strip, and picker are excluded because they are already one shortcut away.
- Representative content is fixed mock data (a plausible target, reason, and install cycle); it is not configurable in this feature.
