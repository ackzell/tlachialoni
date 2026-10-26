# Feature Specification: Test Card Demo Site

**Feature Branch**: `026-test-card-demo-site`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "A 'test card' demo site that ships with Tlachialoni, used to record the feature clips and demos of the browser.

Why: today's recordings show an unrelated real project inside the browser. Its busy, colorful content competes with what the clips are meant to show: Tlachialoni's own features (command palette, themes, docked DevTools, element picker, history, reload). We need a guest page whose only job is to make the browser the subject, in the spirit of a TV test card, and that also shows Tlachialoni's purpose: local frontend development, where the page changes live as code is edited.

Who uses it: the maintainer, recording short silent clips (a few seconds to about a minute) of a 1440×900 window at 2× scale. The clips are later shown at roughly 760–1000 CSS px wide on a portfolio site, so every on-screen change must read at that size.

User scenarios:
1. Live edit: with the editor beside the browser, the maintainer changes one obvious value (an accent hue, a headline, a layout toggle) and the page updates in place within a second, without a full reload. Each edit point is easy to find and produces a large, unmistakable visual change.
2. Element picker: the page has a handful of clearly separated, sensibly named elements (a heading, a swatch, a button, a card) that the picker can land on, so the hover highlight and the selection in DevTools are easy to follow.
3. History: there are at least three linked pages with visibly different content, so going back and forward (and the history overlay) obviously changes something.
4. Reload: the page shows proof that it reloaded, such as a load counter that persists across reloads in the same tab and the time of the last load, so a reload is visible even when the content is static.
5. DevTools: interacting with the page writes a short, readable message to the console, and at least one action makes a small network request, so the Console and Network panels have something meaningful to show when docked.
6. Themes and color scheme: the page uses a neutral, mostly monochrome palette so Tlachialoni's eight themes and its light/dark modes are what stand out. The page follows the preferred color scheme, so a scheme switch is visible in the page too.

Requirements:
- The page is calm by default: no continuous animation, autoplaying media, or background motion. Motion happens only in response to an action or edit. This keeps the recordings legible and their file sizes small.
- Large, high-contrast type and generous spacing, legible when a 1440 px capture is shown at 760 px.
- The editable values live in one place, clearly marked, so a recording can jump straight to them.
- Works offline, with no external fonts, images, or services.
- Starts with one command and runs on a local dev server, the way the browser is meant to be used.
- The wording on the page is placeholder text the maintainer will replace.

Out of scope: real app functionality, routing beyond the few demo pages, analytics, deployment.

Success criteria:
- Each of the six scenarios above can be recorded in one take, with no setup beyond starting the server.
- A live edit shows up on screen in under one second.
- A reload is identifiable from a single still frame.
- Recorded clips of the test card compress smaller than equivalent clips of the current guest content at the same resolution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Clean Recording in One Take (Priority: P1)

The maintainer starts the demo site with one documented command and points Tlachialoni at its local address. The page opens calm: a neutral, mostly monochrome test card with large type, generous spacing, and placeholder copy. Nothing moves until the maintainer acts. This page becomes the guest content for every feature clip.

**Why this priority**: Every other scenario depends on a guest page that runs, stays still, and remains legible after downscaling. Without this foundation, no clip can be recorded cleanly.

**Independent Test**: Start from a clean checkout, run the documented command, and open the local address in Tlachialoni at 1440×900. Confirm the page is static for 10 seconds, requests no external resources, and keeps its largest text legible when the capture is viewed at 760 px wide.

**Acceptance Scenarios**:

1. **Given** a clean checkout with dependencies installed, **When** the maintainer runs the documented command and opens the site, **Then** the page renders completely and no external network request is made.
2. **Given** the page is idle, **When** the maintainer observes it for 10 seconds, **Then** no visible element moves, animates, or changes.
3. **Given** a 1440×900 capture at 2× scale, **When** it is displayed 760 px wide, **Then** the headline, body copy, and reload proof remain readable.
4. **Given** the site is running, **When** the maintainer saves an edited recording value, **Then** the page updates without restarting the server.

---

### User Story 2 - Record a Live Edit (Priority: P1)

With the editor beside the browser, the maintainer changes one marked value: accent hue, headline, or layout toggle. The page changes in place within one second, with no full reload. Each change is large enough to read at portfolio size.

**Why this priority**: This is the browser's purpose in one clip. It shows local frontend work that appears as the code changes.

**Independent Test**: Open the marked editing location, change one value, and save. Time the update. Confirm the visual change is large and the reload counter does not increase.

**Acceptance Scenarios**:

1. **Given** the site is open, **When** the maintainer changes the accent hue and saves, **Then** every accent surface changes within one second and the load counter does not increment.
2. **Given** the site is open, **When** the maintainer changes the headline copy and saves, **Then** the largest heading updates in place within one second, wraps to fit, and stays inside the viewport.
3. **Given** the site is open, **When** the maintainer changes the layout toggle and saves, **Then** major blocks rearrange in an obvious way within one second, with no overlap or clipped content.
4. **Given** any recording value changes, **When** the maintainer views another page, **Then** that page uses the new value too.
5. **Given** the load proof is visible, **When** any recording value is saved, **Then** the load count and last-load time stay unchanged because no full reload occurred.

---

### User Story 3 - Walk Three Pages of History (Priority: P2)

The site has three linked pages with unique titles and visibly different content. The first page links to the other two. Moving back and forward changes the page, and the directional history overlay points the way.

**Why this priority**: History is a core browser feature, and it needs page-to-page contrast that survives a still frame.

**Independent Test**: From the first page, follow a visible link, follow another, then go back twice and forward twice. Confirm each page is identifiable from its first screen alone.

**Acceptance Scenarios**:

1. **Given** the first page, **When** the maintainer looks for navigation, **Then** two large, clearly labeled links lead to the other pages.
2. **Given** any of the three pages, **When** it loads, **Then** a large page identifier and at least one distinct content block make the page recognizable in a still frame at 760 px.
3. **Given** the maintainer has visited all three pages, **When** they move back and forward, **Then** each move shows a different page after the load settles.
4. **Given** the history direction overlay is armed, **When** the maintainer moves back or forward, **Then** the overlay points the matching direction and the destination page is obvious from its own identity.
5. **Given** any page, **When** the maintainer follows every visible link, **Then** no link reaches a dead end.

---

### User Story 4 - Prove a Reload From One Still (Priority: P2)

Every page shows a load counter for the current tab and the time of the last load. A reload increments the counter and updates the time. Both values stay static between loads, so a still frame proves that a reload happened.

**Why this priority**: The page content is static by design. Without an explicit load record, a reload clip shows almost no change.

**Independent Test**: Capture the page, reload, capture again. Confirm the counter increased by one and the time changed, with both values visible without scrolling.

**Acceptance Scenarios**:

1. **Given** a fresh tab, **When** the page first loads, **Then** the load counter reads 1 and the last-load time is visible.
2. **Given** a loaded page, **When** the maintainer reloads, **Then** the counter increases by one and the last-load time updates to the current time.
3. **Given** a loaded page, **When** the maintainer navigates to another page and back, **Then** the counter keeps its value for that tab.
4. **Given** a new tab or window, **When** the page loads, **Then** the counter starts again at 1.
5. **Given** a hard reload, **When** the page loads, **Then** the counter still increases by one.
6. **Given** a back or forward action restores a page without reloading it, **When** the page appears, **Then** the counter does not increase.

---

### User Story 5 - Give Docked DevTools Something to Show (Priority: P2)

Interacting with the page writes a short, readable line to the console. At least one action makes a small request to the site's own local endpoint, and the page reports the result. The Console and Network panels have meaningful content when docked.

**Why this priority**: Docked DevTools are a signature feature, and empty panels make a weak clip.

**Independent Test**: Open DevTools docked, click the primary action, then click the probe action. Confirm one readable console line per action and one local network request with a visible result.

**Acceptance Scenarios**:

1. **Given** docked DevTools, **When** the maintainer clicks the primary action, **Then** one short console line names the current page and the action.
2. **Given** docked DevTools, **When** the maintainer clicks the probe action, **Then** a single request to the site's local endpoint appears in the Network panel and a success result with elapsed time appears on the page within one second.
3. **Given** the probe action is clicked twice in a row, **When** the maintainer reads the Network panel, **Then** both requests appear as separate entries.
4. **Given** the page is idle, **When** the maintainer watches the Console and Network panels, **Then** no new messages or requests appear.
5. **Given** the local endpoint is unavailable, **When** the probe runs, **Then** the page shows a readable failure and stays usable.

---

### User Story 6 - Land the Element Picker on Clear Landmarks (Priority: P3)

The page has four clearly separated landmarks: a heading, a swatch, a button, and a card. Each has a label that matches its visible text. The picker hover and the DevTools selection are easy to follow.

**Why this priority**: The picker clip needs obvious targets, but the page can be recorded without perfecting them.

**Independent Test**: Arm the picker and hover each landmark in turn. Confirm the highlight lands inside the intended element and does not touch a neighbor, then select the heading and confirm DevTools shows it.

**Acceptance Scenarios**:

1. **Given** the picker is armed, **When** the maintainer hovers the heading, swatch, button, or card, **Then** the highlight stays inside that element and does not touch an adjacent landmark.
2. **Given** any landmark is picked, **When** DevTools shows the selection, **Then** the element label matches the landmark's visible label.
3. **Given** the page reloads, **When** the picker is armed again, **Then** the four landmarks keep their order and general position.
4. **Given** the maintainer reads the page, **When** they look for the four landmarks, **Then** each is visually distinct and clearly separated from the others.

---

### User Story 7 - Let Tlachialoni's Themes Be the Color (Priority: P3)

The page uses a neutral, mostly monochrome palette with at most one editable accent. It follows the device's preferred color scheme, so an OS scheme switch is visible on the page. Tlachialoni's eight themes and both color modes remain the strongest color change on screen.

**Why this priority**: A neutral page makes the browser's own themes and schemes the subject. The page must not compete with them.

**Independent Test**: Switch the OS between light and dark while the page is open. Confirm the page changes within one second without a reload. Then cycle the shell themes and confirm the page stays neutral.

**Acceptance Scenarios**:

1. **Given** the device is in light mode, **When** the page loads, **Then** it uses a light neutral background with dark text, and the reverse in dark mode.
2. **Given** the page is open, **When** the device color scheme changes, **Then** the page changes within one second without a reload.
3. **Given** the page loads in either scheme, **When** it first paints, **Then** no frame in the wrong scheme is visible.
4. **Given** any of Tlachialoni's eight themes or two color modes, **When** the maintainer views the shell around the page, **Then** the shell's colors change while the page stays within its neutral palette.

---

### Edge Cases

- The conventional local address is already in use by another project or a stale server. The start command must report the conflict clearly, or use another local address that the maintainer can enter in Tlachialoni.
- The page is reloaded in a second tab or window while the first tab is open. Each tab keeps an independent load count.
- A hard reload clears cached resources but must not hide or reset the load proof within the same tab.
- The page is restored by back or forward without a new load. The load count must not increase.
- The maintainer changes a recording value while a subpage is open. The change must appear on that subpage.
- The maintainer changes the layout toggle while DevTools is docked to the side and the page is narrow. Content must stay reachable with no horizontal scrolling.
- DevTools is docked at the bottom and the page is short. The page identity and load proof must stay at the top and remain visible.
- The placeholder copy is replaced with much longer or shorter text. Layouts must stay inside the viewport and keep landmarks separated.
- The probe action is clicked repeatedly. Each request must appear in the Network panel and the page must keep reporting the latest result.
- The local endpoint is down or the network is disabled. The page must stay usable and show a readable failure.
- The preferred color scheme changes while a clip is being recorded. The page must settle into the new scheme without a reload.
- A recording value is empty or malformed. The page must keep the last valid or default value and must not go blank.
- The site is opened with the network fully offline after dependencies are installed. Every scenario must still work with no external request.
- An unknown local path is opened. The site must show a plain local fallback with a link back to the first page, not a server error.
- The system is set to reduce motion. The page must stay usable, and its motion budget must already be small.

## Requirements *(mandatory)*

### Functional Requirements

**Shipping and startup**

- **FR-001**: The site MUST ship with the Tlachialoni repository as part of its documented demo content.
- **FR-002**: One documented command MUST start the site on a local development server. No other setup MUST be required.
- **FR-003**: The site MUST be reachable at a stable local address that the recording workflow uses as a Tlachialoni target.
- **FR-004**: The local server MUST apply saved source changes in place. The maintainer MUST NOT restart the server or rebuild by hand.
- **FR-005**: The site MUST work with the network fully offline. It MUST NOT use external fonts, images, scripts, styles, or services, and it MUST make no request to an external host.
- **FR-006**: The site MUST behave as ordinary guest content. It MUST NOT depend on privileged browser access, shell integration, or installed extensions.

**Calm and legibility**

- **FR-007**: The page MUST be still by default. It MUST NOT use continuous animation, autoplaying media, tickers, marquees, animated backgrounds, or a live-ticking clock.
- **FR-008**: Motion MUST occur only after a maintainer action or a source edit. It MUST finish within 400 ms and settle on a static frame.
- **FR-009**: Every element needed for a scenario MUST fit in the first view at 1440×900 with DevTools closed, with no scrolling.
- **FR-010**: At a 760 px display width, the primary headline MUST be at least 48 px tall, body copy at least 14 px, the load-count numeral at least 28 px, and the last-load time at least 14 px.
- **FR-011**: Body text MUST meet at least a 4.5:1 contrast ratio against its background in both color schemes. Large text MUST meet at least 3:1.
- **FR-012**: Landmarks MUST sit in distinct regions with visible whitespace. A picker highlight around one landmark MUST NOT touch an adjacent landmark.
- **FR-013**: With DevTools docked to a side, the page MUST remain usable and MUST NOT scroll horizontally. The page identity and load proof MUST stay visible.
- **FR-014**: Each page's identity and load proof MUST stay in the first viewport when DevTools is closed.

**Editable values**

- **FR-015**: The recording values MUST live in one clearly marked editing location near the top of the relevant source. The location MUST hold at least the accent hue, the headline, and the layout toggle, with a short comment that explains each effect.
- **FR-016**: Each recording value MUST produce a large, unmistakable change within one second of a save, without a full reload.
- **FR-017**: The accent hue MUST paint at least two large surfaces, including the swatch and a page marker that stays visible across pages.
- **FR-018**: The headline value MUST drive the largest text on every page. Long values MUST wrap without clipping or pushing content out of view.
- **FR-019**: The layout toggle MUST select between at least two clearly different arrangements. All landmarks and the load proof MUST stay reachable in both arrangements.
- **FR-020**: A recording value change MUST apply to every page while the site is open.
- **FR-021**: An empty or malformed recording value MUST NOT blank the page. The site MUST keep the last valid or default value and MUST write a short console note.
- **FR-022**: The page copy MUST live in one clearly marked editing location, so the maintainer can replace all placeholder wording without changing structure or styles.

**Pages and history**

- **FR-023**: The site MUST have at least three pages. Each page MUST have a unique browser title and a unique large page identifier.
- **FR-024**: Every demo page MUST link to the other two demo pages with large, readable labels. No demo page MUST be a dead end.
- **FR-025**: Each page MUST contain content that is visibly different from the other two, so page identity survives a still frame at 760 px.
- **FR-026**: Page changes MUST be local and fast. The site MUST NOT show loading spinners or progress indicators.
- **FR-027**: Back and forward MUST move between visited pages and MUST keep the current recording values.
- **FR-028**: Each page MUST have a unique browser title and route, so back and forward moves are unambiguous.
- **FR-029**: A full page load MUST increase the load count. A back or forward restore that does not reload the page MUST NOT increase it.
- **FR-030**: An unknown local path MUST show a plain local fallback with a link to the first page. It MUST NOT show a server error page.

**Reload proof**

- **FR-031**: Every demo page MUST show a load count for the current tab and the time of the last load.
- **FR-032**: The load count MUST persist across reloads and page changes in the same tab and MUST reset for a new tab or window.
- **FR-033**: The last-load time MUST update on each full load and MUST NOT tick between loads.
- **FR-034**: The load count and last-load time MUST sit in a fixed top-level region, in type large enough to read at a 760 px display width, and MUST stay visible without scrolling.
- **FR-035**: A normal reload and a hard reload MUST both increase the load count by one.
- **FR-036**: If the tab cannot retain the count, the page MUST still show the last-load time and MUST stay usable.
- **FR-037**: Any reload acknowledgment MUST be static or brief. The page MUST NOT leave an animation running after the load settles.

**Docked DevTools**

- **FR-038**: Each primary interaction MUST write one short console line that names the current page and the action. The line MUST be at most 120 characters and MUST be readable at the default DevTools font size.
- **FR-039**: At least one action MUST issue one small request to a local endpoint served by the site.
- **FR-040**: A successful probe MUST report its result and elapsed time on the page within one second and MUST appear in the Network panel.
- **FR-041**: Each repeated probe MUST create its own Network entry.
- **FR-042**: The page MUST NOT contact any external host, including for fonts, icons, analytics, or error reporting.
- **FR-043**: A failed probe MUST show a readable failure on the page and in the console. The page MUST remain usable.
- **FR-044**: The page MUST stay quiet at idle. It MUST NOT log to the console or send requests until the maintainer acts.
- **FR-045**: With DevTools docked at the bottom, the primary button and the latest probe result MUST stay visible without scrolling.

**Element picker landmarks**

- **FR-046**: Every demo page MUST show four distinct landmarks: a heading, a swatch, a primary button, and a status card.
- **FR-047**: Each landmark's visible label MUST match the label shown in DevTools when it is picked.
- **FR-048**: The four landmarks MUST keep their order and general position across reloads and page changes.
- **FR-049**: The swatch and primary button MUST have target areas large enough to hover and click without precision aiming.

**Themes and color scheme**

- **FR-050**: The page palette MUST be neutral and mostly monochrome. It MUST contain at most one non-neutral accent, which the accent hue value controls.
- **FR-051**: The page MUST follow the device's preferred color scheme on first load and on later changes, with no reload.
- **FR-052**: The first paint MUST use the correct color scheme. The page MUST NOT flash the wrong scheme.
- **FR-053**: The page MUST NOT use Tlachialoni's theme hues or theme token colors. The shell's eight themes and both color modes MUST stay the strongest color on screen.
- **FR-054**: A color-scheme change MUST settle within one second and MUST be visible in a clip.

**Copy and recording quality**

- **FR-055**: All page wording MUST be descriptive placeholder copy, not lorem ipsum, and MUST be clearly replaceable.
- **FR-056**: The page MUST favor large flat areas and static text. It MUST NOT use photographic imagery, moving grain, or noise that changes between frames.
- **FR-057**: At idle, consecutive frames MUST be identical. Only an action, an edit, a navigation, or a load may change pixels.

### Key Entities

- **Recording values**: The accent hue, headline text, layout mode, and any other maintainer-editable value. One marked editing location controls them. A change applies site-wide without a reload.
- **Demo page**: One of the three linked pages. Each has a unique identifier, browser title, content set, and links to the other pages.
- **Load record**: The per-tab load count and last-load time. It increments on a full load, survives navigation in the same tab, and resets in a new tab.
- **Interaction event**: A maintainer action on the page. It produces one short console line and may produce a probe request.
- **Probe result**: The local request outcome: success or failure, plus elapsed time. It appears in the Network panel and on the page.
- **Landmark**: A picker target. It has a role (heading, swatch, button, card), a visible label, and a stable position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout with dependencies installed, the maintainer starts the site and begins the first recording in under two minutes using one documented command.
- **SC-002**: A saved recording value changes the screen in under one second, and the load count stays the same.
- **SC-003**: Two still captures taken 10 seconds apart on an idle page are identical.
- **SC-004**: When a 1440×900 capture is shown 760 px wide, the primary headline renders at least 48 px tall, body copy at least 14 px, the load-count numeral at least 28 px, and the last-load time at least 14 px.
- **SC-005**: A reviewer identifies a reload from a single still frame in under five seconds, using only the load count and last-load time, with both visible without scrolling.
- **SC-006**: All three pages are distinguishable from one still frame each at 760 px, and back and forward each produce a visible page change.
- **SC-007**: The element picker lands on all four named landmarks, and no hover highlight overlaps an adjacent landmark.
- **SC-008**: A docked Console shows a readable line for each action, and a docked Network panel shows the local probe request and its response within one second.
- **SC-009**: With the page open, all eight Tlachialoni themes and both light and dark modes produce a visible shell color change while the page stays neutral.
- **SC-010**: Changing the device color scheme changes the page within one second, with no flash of the wrong scheme on first paint.
- **SC-011**: Clips of the test card compress at least 20% smaller than clips of the current guest content of equal duration, resolution, frame rate, and encoder settings.
- **SC-012**: The full set of placeholder copy is replaceable in one location in under five minutes, with no structural or style changes.
- **SC-013**: With the network disabled, all six scenarios remain recordable and the page makes zero external requests.
- **SC-014**: All six scenarios can be recorded in one take each, with no setup beyond starting the server and opening the local address.
- **SC-015**: A maintainer who has not seen the source finds the marked recording values in under 30 seconds and can name the accent, headline, and layout edit points.

## Assumptions

- The maintainer records manually with the existing screen-capture workflow. Regenerating the repository's checked-in screenshots and GIFs, and updating the portfolio site, are not part of this feature.
- The site is a small, self-contained demo inside the repository. It uses the repository's existing local tooling and adds no runtime dependency, service, or account.
- The site runs at the conventional default target address (`http://localhost:3000`). If that address is busy, another local address is acceptable, and the recording instructions must name it.
- Three pages are enough: a first page plus two linked pages. No deeper routing, dynamic routes, or user-generated pages are needed.
- The device's preferred color scheme is the only external state the page follows. Tlachialoni's shell theme and color mode remain independent, except that the guest page follows the OS.
- Placeholder copy is English and generic. The maintainer replaces it later.
- "Eight themes" means the Tlapalli variants that exist at implementation time. The page does not list, preview, or drive them.
- Each recording is a 1440×900 window at 2× scale, displayed later at 760–1000 px wide.
- Compression is measured with the same encoder, duration, resolution, frame rate, and quality settings against the current guest content used for recordings. A 20% reduction is the practical bar for "compress smaller": large enough to show a real gain, small enough to stay achievable with a neutral static page.
- The page is intentionally impersonal demo content. It has no real application data, accounts, forms, or business logic.
- Basic keyboard access is expected for the primary button and links, but a full accessibility audit is not in scope.

## Dependencies

- Tlachialoni's default target and local development workflow.
- The repository's existing local server and package tooling.
- Chromium behavior for per-tab load persistence, history restore, and color-scheme changes.
- The OS color-scheme setting for scheme-switch recordings.
- The current guest content as the baseline for the compression comparison.

## Out of Scope

- Real application features, data, authentication, or form submission.
- Routing beyond the three demo pages and a simple unknown-path fallback.
- Analytics, deployment, hosting, or CI changes.
- Automated clip generation, checked-in media regeneration, and portfolio-site changes.
- Theme switching inside the page.
- Mobile-first layouts or a full accessibility certification.
- Internationalization or localized copy.
