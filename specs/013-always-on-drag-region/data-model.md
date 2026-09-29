# Phase 1 Data Model: Always-On Drag Region

No persisted shape changes. The store stays at **schema version 3** as 012 defined
it; `stripVisible` in each `WindowRecord` remains the only persisted setting this
feature reads or writes, and it now means "the strip is pinned." Peek is runtime-only
and is never written. The authoritative persisted shape remains
`specs/012-multi-window/contracts/state.schema.json`.

## Persisted

### WindowRecord (unchanged, relevant field only)

| Attribute | Type | Default | Purpose / requirements |
| --- | --- | --- | --- |
| `stripVisible` | boolean | `false` | Whether the strip is **pinned** on this window (`⌘B`). Peek never changes it (FR-007). |

No field is added, removed, or migrated. A transient peek must survive neither a
relayout nor a relaunch, so it has no place in the document.

## Runtime entities

### Drag band

The permanent, transparent top region of the shell overlay.

| Attribute | Value | Notes |
| --- | --- | --- |
| Height | `DRAG_BAND_HEIGHT` = 36px | Equals the strip height; a CSS value and a main constant that must agree |
| Width | window content width | Full width, including above docked DevTools |
| Painted | none | Satisfies FR-003 / SC-004 |
| Draggable | yes (`app-region: drag`) | The whole band; controls are `no-drag` |
| Mounted when | no full-window surface is up | FR-011; not rendered behind palette/veil/failure/status |

### Strip surface

The visible strip (target + controls) inside the band. Derived, not stored:

```text
stripSurfaceVisible = (stripVisible || peeking) && !paletteOpen
```

Both the renderer (whether `DragStrip` mounts) and main (whether the traffic lights
show) evaluate this same predicate (009 FR-004, FR-008).

### Peek state

| Attribute | Type | Default | Notes |
| --- | --- | --- | --- |
| `peeking` | boolean | `false` | Main-owned; pushed on `strip:peek`; never persisted |

### Proximity tracker inputs and outputs

The pure tracker receives one sample per tick and returns the new `peeking` value.

| Input | Type | Meaning |
| --- | --- | --- |
| `cursor` | `{ x, y }` | `screen.getCursorScreenPoint()` (screen DIP) |
| `bounds` | `{ x, y, width, height }` | `win.getContentBounds()` (screen DIP) |
| `now` | number | Monotonic ms, injected for testability |
| `paused` | boolean | Unfocused or a full surface up |
| `dragging` | boolean | The window is being dragged (or a future double-click interaction): hold the current peek state |

| Output | Type | Meaning |
| --- | --- | --- |
| `peeking` | boolean | Whether the strip is currently revealed by hover |

### Constants (tuning values)

| Constant | Value | Requirement |
| --- | --- | --- |
| `bandHeight` | 36 | FR-001 |
| `proximity` | 4px | FR-004 (spec Q1 A) |
| `dwellMs` | 400 | FR-004 (spec Q1 A) |
| `graceMs` | 600 | FR-005 (spec Q1 A) |
| `pollMs` | 150 | FR-010, SC-007 |
| `dragSettleMs` | 200 | FR-016 (a drag holds the strip's current state) |

## State machine: peek

```text
                 atEdge (<=4px)                    leave band
        hidden ────────────────────► peeking ──────────────────► (grace timer)
          ▲                             ▲   │                        │
          │                        inBand│   │                        │
          │                     (dwell)  │   └── re-enter band ────────┘
          │                              │            (cancel dismiss)
          │        paused (blur / full surface)
          └──────────────────────────────────────────────────────────
                     (paused clears peek and resets timers)

  hidden  : strip not shown unless pinned
  peeking : strip shown; stays while inBand/atEdge, dismisses graceMs after leaving
  dragging: a window move holds the current strip state (no reveal, no dismissal)
```

Transitions and effects:

| Event | Peek effect | Persisted effect |
| --- | --- | --- |
| Cursor enters top ≤4px | reveal immediately | none |
| Cursor dwells ≥400ms in band | reveal | none |
| Cursor stays in band/strip | remain | none |
| Cursor leaves band for ≥600ms | dismiss | none |
| Cursor re-enters during grace | cancel dismissal | none |
| Window blurs / hides | clear peek, reset timers | none |
| Full-window surface opens | clear peek, sensor paused | none |
| Drag in progress (`move` within 200ms) | hold current state | none |
| Drag ends | pointer-in-band rule resumes | none |
| `⌘B` pressed | none (pin changes) | `stripVisible` toggled |

## Invariants

- `peeking` is always `false` unless the window is focused, visible, and no
  full-window surface is up.
- `peeking` never changes any persisted field.
- The renderer's `DragStrip` presence and the native traffic lights derive from the
  same predicate, so they cannot disagree.
- The guest page is never read or modified by any of the above.
