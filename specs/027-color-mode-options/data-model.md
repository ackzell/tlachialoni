# Data Model: Color Mode Options

**Feature**: `027-color-mode-options`
**Date**: 2026-10-25

## Entity 1: Color Mode Entry

One of the three choices the catalog exposes. The entries live in the shared command catalog. They are not stored as a document.

| Field | Type | Rules |
|-------|------|-------|
| `slug` | `"light" \| "dark" \| "system"` | Unique. The persisted value and the command-id suffix. |
| `name` | string | Display name: `Light`, `Dark`, `System`. |
| `commandId` | string | `theme.mode.<slug>`. Unique. |
| `paletteLabel` | string | `Color Mode: <name>`. |
| `menuLabel` | string | `<name>` inside the Theme menu. |
| `group` | `"theme"` | The palette group and the source of catalog order. |

Fixed instances, in catalog order:

| Slug | Name | Command id |
|------|------|------------|
| `light` | Light | `theme.mode.light` |
| `dark` | Dark | `theme.mode.dark` |
| `system` | System | `theme.mode.system` |

## Entity 2: Window Record (existing)

The persisted record already exists in `src/main/state/schema.ts`. This feature does not add or remove a field.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Stable window identity. |
| `colorMode` | `"light" \| "dark" \| "system"` | This window's mode. Defaults to `system` when missing or unknown. Persisted on every change. |

Rules:

- Each window record owns exactly one `colorMode`.
- A change to one record never writes a sibling record.
- A new window copies the focused window's `colorMode`. A window created with no focused window starts at `system`.
- The value space is the same before and after this feature, so the schema version stays 4 and no migration runs.

## Entity 3: OS Appearance

The operating system's current light or dark setting.

| Field | Type | Rules |
|-------|------|-------|
| `appearance` | `"light" \| "dark"` | Read live. Never persisted by the tool. |

System mode reads this value on every resolve. Light and Dark mode ignore it.

## Entity 4: Selection Marker (derived, not stored)

The visible sign of the active mode on each surface.

| Surface | Field | Rules |
|---------|-------|-------|
| Command palette | row `detail` | Exactly one `theme.mode.*` row carries `current` when theme state is available. The other two carry no detail. With no theme state, no mode row carries a marker. |
| Theme menu | item `checked` | Exactly one of the three mode items is checked. The source is the focused window's `colorMode`. |

The marker is always derived. It is never written to the state store.

## State Transitions

| From | Action | Stored `colorMode` | Rendered appearance |
|------|--------|--------------------|---------------------|
| Any | Select Light | `light` | Light |
| Any | Select Dark | `dark` | Dark |
| Any | Select System | `system` | Current OS appearance, then follows later OS changes |
| Light or Dark | OS appearance changes | Unchanged | Unchanged |
| System | OS appearance changes | Unchanged | New OS appearance |
| Light | Select Light again | `light` | Light, no repaint or flicker |
| Unknown value at launch | Restore | `system` | Current OS appearance |

## Validation Rules

- **V-001**: A stored `colorMode` MUST be one of the three slugs. Any other value resolves to `system`.
- **V-002**: The command catalog MUST contain exactly three mode commands and zero cycle commands.
- **V-003**: Every mode command MUST belong to the `theme` group and appear in the palette.
- **V-004**: A mode change MUST write only the executing window's record.
- **V-005**: Light and Dark MUST NOT read the OS appearance when they resolve a mode.
- **V-006**: A repeated selection of the active mode MUST NOT change stored state or the marker.
- **V-007**: The guest page MUST NOT receive any mode value from this feature.

## Relationships

```text
Color Mode Entry (3)
        │ command id
        ▼
Command catalog ──► Palette row (detail: current?)
        │
        └──────────► Theme menu item (checked?)
                              │ reads
                              ▼
                     Window Record.colorMode
                              │ resolves with
                              ▼
                     OS Appearance (only when system)
```
