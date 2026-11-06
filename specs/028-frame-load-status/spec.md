# Feature Specification: Frame Load Status

**Feature Branch**: `028-frame-load-status`

**Created**: 2026-10-26

**Status**: Implemented (2026-10-27)

**Input**: User description: "we need some status pages, for example net::ERR_CONNECTION_REFUSED" — clarified to: "I am thinking more about iframes that can't load … this is an empty DOM that is literally white" and then "can we render a message / issue within the iframe like chrome does? … can we at least keep the iframe hollow as if we were looking to the most bottom surface of the browser?"

## Problem

When a page embeds a frame that cannot load, the frame is a white hole in the page.

Measured on Electron 44 with a page framing an origin that sends
`Content-Security-Policy: frame-ancestors 'self' https://ackzell.dev`:

- Chromium blocks the subframe and reports `ERR_BLOCKED_BY_RESPONSE` for it.
- Chromium does **not** paint an error page inside the subframe. The frame's
  document URL is null and it has no body.
- The frame paints an **opaque white canvas** over the page's own background.
- The same is true for a framed page that refuses the connection.

Chrome and Firefox do not leave it blank: they substitute a document in the frame
slot (Chrome paints a white error page with a document icon; Firefox paints its
blocked-frame error page). Electron exposes no way to load a document into a
subframe, so the tool must draw the report itself.

The developer therefore sees white space and cannot tell whether the framed
application is down, still starting, refusing to be framed, or broken.

Main-frame failures already have a status page. This feature covers the remaining
case: a frame *inside* the page that cannot load.

## Constraints

The guest page is sacred (constitution II), with one new sanctioned exception.
While a frame inside the page is marked, the tool MAY add one transient host node
to the page and draw the marker inside it. It MUST remove that node when the frame
recovers or leaves, when the page navigates, or when the marker clears, and it MUST
NOT touch the page's own nodes, styles, or scripts.

The exception exists because the shell cannot follow the frame. A shell overlay
learns the frame's rectangle after the page has already reflowed, so it trails by
one round trip. A box in the page's own document is placed after layout and before
paint, in the same frame as the frame it covers. This is also why the box can only
be an overlay: Electron cannot put a document inside the frame slot the way a
browser does.

The report MUST keep the frame's place in the page legible. A floating notice
above a white hole states the problem but leaves the hole, which reads as broken
layout. The marker fills the frame's place instead.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Refused Frame Reads as a Hole, With the Reason in It (Priority: P1)

A developer views a local page that embeds a site which refuses to be framed.
Where the frame should be, the window's own base surface shows through, filled
with the frame's address and the reason. Nothing floats over the rest of the
page. The page reads as whole, with one place that is deliberately empty.

**Why this priority**: This is the exact case reported, including the
appearance. It is the whole request and delivers value on its own.

**Independent Test**: Load a page that frames an origin sending
`frame-ancestors 'self'`. Confirm the frame's rectangle is painted with the
window's base surface, that it names the origin inside, and that no floating card
appears over the page.

**Acceptance Scenarios**:

1. **Given** a page frames an origin that refuses framing, **When** the frame is
   blocked, **Then** the frame's own rectangle is filled with the window's base
   surface instead of Chromium's white canvas.
2. **Given** the marker fills the frame, **When** it renders, **Then** it names
   the frame's address and states that the framed site's response headers blocked
   it, naming `frame-ancestors` or `X-Frame-Options` when the browser reports
   which one refused it.
3. **Given** the marker is shown, **When** the developer reads the page, **Then**
   no floating card covers any other part of the page.
4. **Given** the marker is shown, **When** the page scrolls, **Then** the marker
   stays over its frame in the same frame the page moves.
5. **Given** the marker is shown, **When** the window resizes or page zoom
   changes, **Then** the marker covers its frame in the same layout pass, without
   a visible trail.
6. **Given** several frames fail one after another, **When** each is marked,
   **Then** every marker survives; a measurement answering an earlier request
   never retires a later one.
7. **Given** the marker is shown, **When** the developer clicks it,
   **Then** nothing changes: the cover stays, because removing it would bring
   Chromium's white canvas back.

---

### User Story 2 - Any Failed Frame Names Its Reason (Priority: P2)

A developer views a page that frames a second local application that is not
running. The frame's place is marked, and the marker says the connection was
refused.

**Why this priority**: A frame is equally uninformative when the framed host
refuses the connection, fails to resolve, or times out. The main-frame failure
surface already has this vocabulary; a frame marker should reuse it.

**Independent Test**: Frame a closed local port. Confirm the marker names the
address and reads "Connection refused".

**Acceptance Scenarios**:

1. **Given** a page frames an address whose host refuses connections, **When**
   the frame fails, **Then** the marker reads "Connection refused".
2. **Given** a page frames an address that does not resolve, **When** the frame
   fails, **Then** the marker reads "Name could not be resolved".
3. **Given** a page frames an address that never answers, **When** the frame
   times out, **Then** the marker reads "The connection timed out".
4. **Given** a page frames an address while the network is offline, **When** the
   frame fails, **Then** the marker reads "The network is offline".
5. **Given** a frame failure has no known reason, **When** the marker appears,
   **Then** it shows the platform's own description rather than an empty reason.

---

### User Story 3 - Several Failed Frames Stay Legible (Priority: P3)

A developer views a page that embeds several third-party frames, several of
which fail. Each failed frame is marked in its own place, with its own reason. A
repeated failure for the same address does not stack a second marker.

**Why this priority**: Without one marker per frame, a page with several embeds
would either mark the wrong place or bury the page under repeated reports.

**Independent Test**: Frame three refused origins. Confirm three markers, each
over its own frame, and one marker after the same address fails twice.

**Acceptance Scenarios**:

1. **Given** three frames fail, **When** the markers appear, **Then** each sits
   over its own frame and names its own address.
2. **Given** the same address fails twice in one page load, **When** the markers
   appear, **Then** that address carries one marker.
3. **Given** markers are shown for one page, **When** the developer navigates,
   **Then** the previous markers do not carry over.
4. **Given** a frame is removed from the page after failing, **When** the page
   settles, **Then** its marker is removed with it.

---

### Edge Cases

- A frame navigation cancelled on purpose (including redirects and page teardown)
  reports nothing.
- Only a frame's own document load counts. A sub-resource inside a frame that
  fails reports nothing.
- The page's main document still uses the existing full failure surface. The two
  reports never appear at once.
- A frame that fails while the loading veil is up is held until the page is
  ready, then marked.
- A frame that fails while the palette, the extension status, or a dev preview is
  on screen does not replace it: both remain, with the palette and the other
  interactive surfaces drawn above the marker, which takes no input. This is now
  structural: the marker renders inside the page, which sits below every shell
  surface.
- The marker follows the frame through scroll, page zoom, and any layout change
  that moves the frame, because it is placed from the frame's own box in the same
  layout pass.
- A marker whose frame leaves the page or stops pointing at the failed address is
  removed: only a frame still pointing at that address is marked.
- The marker follows the window's theme variant and color mode; the page receives
  the values and never reads the shell's stylesheet.
- An ancestor that clips the frame does not clip the marker, because the marker is
  fixed to the viewport while the frame is clipped by its ancestor. This is the
  known visual limit of an overlay, and it does not occur in the demo.
- A frame that fails, then is pointed at a working address without a page
  navigation, leaves no marker behind: only a frame still pointing at the failed
  address is marked.
- A frame failure inside docked DevTools reports nothing; only the inspected page
  is measured and marked.
- With no page loaded, nothing is watched and nothing is marked.
- A short frame drops the reason line and keeps the label and address, so the
  text is never clipped mid-sentence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST detect when a frame inside the page fails to load its
  own document, and MUST NOT treat a cancelled frame navigation as a failure.
- **FR-002**: The tool MUST NOT modify the page's own nodes, styles, or scripts to
  report a frame failure. It MAY add one transient host node while a frame is
  marked, and MUST remove it when the frame recovers or leaves, when the page
  navigates, or when the marker clears (constitution II, third exception).
- **FR-003**: The tool MUST fill the failed frame's rectangle with the window's
  base surface, so Chromium's white canvas is not visible.
- **FR-004**: The tool MUST show the frame's address and the reason inside that
  rectangle, not in a floating surface over the rest of the page.
- **FR-005**: The marker MUST state that the framed site's response headers
  blocked the frame when framing restrictions caused the failure. It MUST name
  the policy family only when the platform reports which one refused it; it MUST
  NOT guess a family.
- **FR-006**: The marker MUST use the same reason vocabulary as the main-frame
  failure surface for connection refused, unresolvable name, offline network, and
  timeout.
- **FR-007**: The marker MUST fall back to the platform's own description when
  the reason is unknown.
- **FR-008**: The tool MUST keep one marker per failed address per page load, and
  MUST NOT stack a second marker for the same address.
- **FR-009**: The tool MUST keep each marker over its frame while the page
  scrolls, page zoom changes, or the frame moves, using the rectangle the page
  measured. The tool MUST NOT guess a rectangle: it MUST NOT rescale a marker, nor
  hide it, to cover a frame it has not measured yet.
- **FR-010**: The tool MUST place the marker from the frame's own layout box, in
  the page's coordinate space, and MUST update it after layout and before paint,
  so no cross-process measurement is needed to keep it over the frame.
- **FR-011**: The marker MUST NOT be dismissible by the developer. It clears only
  when the page navigates, or when its frame leaves the page or stops pointing at
  the failed address.
- **FR-012**: The marker MUST NOT intercept input outside its own rectangle.
- **FR-013**: The tool MUST preserve the page's viewport size while markers are
  visible.
- **FR-014**: The tool MUST clear markers when the page navigates or reloads, and
  MUST remove a marker whose frame leaves the page or stops pointing at the
  failed address.
- **FR-015**: The marker MUST follow the window's theme variant and color mode.
- **FR-016**: The tool MUST NOT replace an existing higher-priority surface
  (failure, loading, palette, extension status, dev preview) and MUST render
  beneath all of them. While the loading veil is up, markers are held until the
  page is ready.
- **FR-017**: The tool MUST ignore frames belonging to docked DevTools.
- **FR-018**: A marker whose frame is no longer in the page MUST be dropped rather
  than kept over nothing. The developer preview of this surface MUST render the
  same box as a centred card, because no frame exists to place it on.
- **FR-019**: The marker MUST be previewable from the Developer menu, like the
  other transient surfaces.
- **FR-020**: The demo site MUST carry a page with frames that fail in each mapped
  way, so the behaviour can be checked without a network.
- **FR-021**: The marker MUST be drawn inside a closed shadow root on a single host
  node, so the page's own styles cannot reach it and its scripts cannot read it.

### Key Entities

- **FrameFailure**: the frame's address, the reason text, and whether framing
  restrictions caused it.
- **FrameMarker**: one failed frame as the page draws it — address, reason, policy,
  and whether it is the dev preview.
- **FrameNoticeStyle**: the five theme values main pushes to the page: base
  surface, foreground, muted foreground, accent, and border.
- **FrameNoticeUpdate**: the marker set plus the theme, sent to the page whenever
  either changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can tell why a frame is blank without opening DevTools,
  in 100% of the four mapped failure kinds and in the framing-restriction case.
- **SC-002**: The marker appears within 1 second of the frame failing.
- **SC-003**: The marker's rectangle matches the frame's rendered rectangle after
  a scroll, a zoom change, or a settled resize, within 1 pixel.
- **SC-004**: A page with three failed frames shows three markers, each over its
  own frame.
- **SC-005**: The page's viewport height is unchanged while markers are visible.
- **SC-006**: The page's own markup is unchanged. While a marker is visible the
  page has exactly one extra host node, and it is gone after the marker clears.

## Assumptions

- Framing restrictions and other frame failures surface as distinct failures the
  host reports per frame; this was measured against Electron 44.
- Reading a frame's rectangle from the page is not a modification. The tool reads
  it and writes nothing back.
- The window's base surface is the right fill: it makes the frame read as empty
  down to the bottom of the window rather than as white paper.
- The marker persists until the page navigates or the frame loads again. Any
  dismissal would uncover Chromium's white canvas, which is the state this
  feature exists to fix, so there is none.

## Out of Scope

- Injecting a placeholder into the page's DOM.
- Opening a blocked frame externally from the marker.
- Reporting failed sub-resources, scripts, or stylesheets.
- Reporting HTTP 4xx/5xx responses, which the framed server renders itself.
- Automatic frame retries.
- Telemetry or error reporting.
