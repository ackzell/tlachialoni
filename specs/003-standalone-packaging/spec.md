# Feature Specification: Standalone macOS Application Packaging

**Feature Branch**: `003-standalone-packaging`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Package tlachialoni as a standalone macOS application that runs without the repository: an installable .app/.dmg with its own name and icon, produced by one documented command."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the tool without the repository (Priority: P1)

A developer who uses the tool daily wants to launch it like any other Mac
application. They build the installable artifact once, copy it into
`/Applications`, and from then on open it from Launchpad, Spotlight, or the Dock —
with no terminal, no repository, and no development command involved.

**Why this priority**: This is the entire point of the feature. Today the tool can
only be started from its own source checkout, which makes it a project rather than
a product. Everything else is in service of this journey.

**Independent Test**: Produce the artifact, move it out of the repository (for
example to `/Applications`), delete or move the source checkout away, and launch
the app by double-clicking. It opens and renders the default target.

**Acceptance Scenarios**:

1. **Given** a built installable artifact and no running dev server, **When** the
   user double-clicks it from `/Applications`, **Then** the app window opens and
   behaves exactly as it does under the development command.
2. **Given** the app is installed in `/Applications`, **When** the user opens it
   from Spotlight or Launchpad, **Then** it launches without any repository
   present on the machine.
3. **Given** the source checkout is moved or deleted **When** the installed app is
   launched, **Then** it still opens and functions.

---

### User Story 2 - Produce the artifact with one command (Priority: P2)

A developer (or a clean machine) wants to reproduce the installable artifact
deterministically. A single documented command, run from a fresh checkout,
produces the artifact with no manual steps and no hand-edited files.

**Why this priority**: Reproducibility is what separates a shareable build from a
one-off local export. It also gates any future automation.

**Independent Test**: On a clean checkout, run the documented packaging command
and confirm the artifact appears in the expected output location.

**Acceptance Scenarios**:

1. **Given** a clean checkout with dependencies installed, **When** the user runs
   the single documented packaging command, **Then** an installable artifact is
   produced without further manual intervention.
2. **Given** a previous build exists, **When** the command is re-run, **Then** it
   succeeds again and produces an equivalent artifact.

---

### User Story 3 - Correct identity in the OS (Priority: P3)

The installed app presents a consistent identity: its product name and icon
appear in Finder, the Dock, the ⌘Tab switcher, the application menu, and the
About panel — not the generic runtime name or icon.

**Why this priority**: Identity mismatch (a generic icon or the framework's name)
makes the tool feel unfinished and is immediately visible; it is polish on top of
a working artifact.

**Independent Test**: Launch the installed app and inspect the Dock, ⌘Tab
switcher, application menu, and About panel.

**Acceptance Scenarios**:

1. **Given** the installed app is running, **When** the user inspects the Dock and
   ⌘Tab switcher, **Then** the app's own icon is shown.
2. **Given** the installed app is running, **When** the user opens the application
   menu and About panel, **Then** the product name (not the runtime's default
   name) is shown.

### Edge Cases

- The artifact is unsigned: the first launch may be blocked by the OS. The
  expected behavior (how to open it, or that signing is a later optional step)
  must be documented.
- The build is run on a machine with no signing credentials: the command MUST
  still succeed and produce a locally usable artifact.
- The icon source art is missing or malformed: the build MUST fail loudly rather
  than silently ship a default icon.
- A target build directory already contains a previous artifact: the command MUST
  overwrite or replace it without corrupting the source tree.
- The user still wants the development command: packaging MUST NOT break or alter
  the existing development workflow.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single documented command MUST produce an installable macOS
  application artifact from a clean checkout.
- **FR-002**: The artifact MUST be a macOS application bundle that launches by
  double-click and functions without the repository, a terminal, or development
  tooling present.
- **FR-003**: The bundle MUST carry the product name, version, and a stable bundle
  identifier sourced from a single point of truth, so the same values drive the
  bundle, the application menu, and the About panel.
- **FR-004**: The application icon MUST be derived from committed source art and
  render correctly at the sizes macOS uses (Finder, Dock, switcher).
- **FR-005**: All runtime assets the UI needs (icon, theme values, typography)
  MUST be bundled inside the artifact; the installed app MUST NOT read them from
  the source tree or the network.
- **FR-006**: The packaging command MUST NOT require network access at runtime nor
  mutate tracked source files; its only writes are to ignored build output.
- **FR-007**: The packaging command MUST succeed without code-signing credentials,
  producing an artifact usable locally, and MUST NOT preclude adding signing and
  notarization later without restructuring.
- **FR-008**: The existing development workflow (build, run from source, checks,
  tests) MUST continue to work unchanged.
- **FR-009**: The artifact's output location MUST be a build-output directory that
  is ignored by version control.

### Key Entities *(include if feature involves data)*

- **Installable artifact**: the self-contained macOS application (and its
  distributable container) that a user installs and launches; carries identity
  (name, version, identifier, icon).
- **Icon source art**: the committed vector/raster artwork from which every
  platform icon size is generated; single source of truth for the app's visual
  identity.
- **Build output**: the ignored directory where the artifact is produced and where
  previous builds are replaced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout with dependencies present, one command
  produces a launchable artifact with zero manual steps.
- **SC-002**: 100% of launches from `/Applications` with the source checkout
  absent succeed and render the default target.
- **SC-003**: The installed app shows its product name (not the runtime default)
  in Finder, the application menu, and the About panel, and its own icon in the
  Dock and ⌘Tab switcher.
- **SC-004**: The app icon renders without visible artifacts at every standard
  macOS icon size.
- **SC-005**: The installed app renders its full UI with no network access.
- **SC-006**: The documented packaging command completes in under five minutes on
  the target hardware.

## Assumptions

- The target platform is macOS on Apple silicon; Windows and Linux packaging are
  out of scope for this feature.
- The audience is the developer themself (local installation), not third-party
  distribution; Developer ID signing and notarization are explicitly deferred and
  optional.
- An unsigned artifact is acceptable for local use, with the first-launch caveat
  documented.
- The packaging tool is a build-time dependency only; it does not become a runtime
  dependency of the app.
- The icon source art committed in the repository is authoritative; no design work
  is introduced by this feature.
