# Quickstart: MV3 Extension Detection & Warning

## Prerequisites

- Electron 44+ with extension support
- An MV3 extension with `background.service_worker` (e.g., a modern Chrome Web Store extension)
- An MV2 extension, or an MV3 extension with no background, for the negative cases
- The app running (`npm run dev`)

## Validation scenarios

### 1. Install an MV3 extension and see the warning

**Steps:**
1. Launch the app and open the command palette (`P`).
2. Paste a Chrome Web Store URL for an MV3 extension with a service worker background.
3. Choose **Install extension**.

**Expected:**
- The status surface shows a warning: "This extension uses Manifest V3 service workers, which {appName} doesn't support. Its background functionality won't work, but content scripts and DevTools pages will."
- The warning stays visible until dismissed — it does not leave on a timer.
- The extension is installed and its content scripts inject into the guest page.

### 2. Dismiss the warning

**Steps:**
1. With the warning visible, press `Esc` or click the card.

**Expected:**
- The warning disappears.
- The extension remains loaded.

### 3. The badge appears in the extension list

**Steps:**
1. Open the command palette and switch to the Extensions group.
2. Find the extension installed in scenario 1.

**Expected:**
- Its **Extension:** toggle row carries an `MV3` badge next to `enabled`.
- The **Remove Extension:** row is not badged.

### 4. Boot is silent

**Steps:**
1. With MV3 extensions installed and enabled, quit and relaunch the app.
2. Watch for a status card during startup.
3. Reopen the palette's Extensions group.

**Expected:**
- No warning card appears at launch.
- Every MV3 extension is still badged, and non-MV3 ones are not.

### 5. Reload is silent

**Steps:**
1. Run **Reload extensions** from the palette.

**Expected:**
- A `Reloaded extensions` confirmation, no warning card.
- The badges are unchanged.

### 6. Re-enabling warns again

**Steps:**
1. Disable an MV3 extension, then enable it again.

**Expected:**
- The warning is shown, standing in for the usual `Enabled <name>` confirmation.

### 7. MV2 extension — no warning, no badge

**Steps:**
1. Install an MV2 extension (e.g., an older extension with `background.scripts`).

**Expected:**
- A plain `Installed <name>` confirmation, no warning.
- No badge on its row.

### 8. MV3 without a service worker — no warning, no badge

**Steps:**
1. Install an MV3 extension that only has content scripts or a DevTools page (no `background.service_worker`).

**Expected:**
- No warning, and no badge on its row.

### 9. Removal toast auto-dismisses

Removal emits a single `done`, so it is the case that distinguishes a
value-driven auto-dismiss from a change-driven one.

**Steps:**
1. Remove one extension. Leave the surface alone and count.
2. Remove a second extension, then a third within about a second of each other.

**Expected:**
- Each shows `Removed <name>` and leaves on its own after roughly 1.6s, with no click.
- The rapid second and third removals also clear; the phase is `done` throughout.
- Disabling an extension still shows `Disabled <name>` and clears the same way.

### 10. Legacy records back-fill

**Steps:**
1. Delete `mv3ServiceWorker` from an installed extension's record in `state.json` (leaving the rest intact), then relaunch.

**Expected:**
- The extension is still installed, not dropped.
- Its badge is correct after the launch load re-derives the flag.

## Success criteria

- [ ] 100% of MV3 extensions with service worker backgrounds warn on install and on re-enable.
- [ ] 0% warn at boot or on reload.
- [ ] The badge marks exactly the extensions whose manifests are MV3 with a service worker.
- [ ] No MV2 extension, and no MV3 extension without a service worker, warns or is badged.
- [ ] MV3 extensions with content scripts still inject those scripts into the guest page.
- [ ] The warning is dismissible and does not block the extension load.
