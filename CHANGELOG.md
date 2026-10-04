# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.1.12](///compare/v0.1.11...v0.1.12) (2026-10-04)

### Bug Fixes

* restore mouse back/forward thumb buttons on macOS 3c6f008

## [0.1.11](///compare/v0.1.10...v0.1.11) (2026-10-02)

### Features

* **extensions:** rewrite MV3 backgrounds to MV2 so extensions run (019) 33d1775

### Bug Fixes

* **extensions:** stop the MV2 rewrite breaking Vue and axe (019) 143c49a
* **packaging:** stop dev and packaged builds sharing one profile (003) 8118064

## [0.1.10](///compare/v0.1.9...v0.1.10) (2026-10-01)

### Features

* **dock:** native macOS Dock menu with origin-grouped recents (017) 23e3421
* **extensions:** warn once on an MV3 service worker, then badge it (018) a1848d6
* **shell:** titlebar mode docks the strip and pushes the page below (016) 59c5a6b

## [0.1.9](///compare/v0.1.8...v0.1.9) (2026-10-01)

### Features

* **screenshots:** capture the shell's states as shareable images 06e9292
* **shell:** armed swipe overlay and history buttons in the strip 9213555
* **swipe:** drive history from the native gesture, not the wheel relay 7afffcd
* **swipe:** native macOS gesture addon and its build step 626d1bb

## [0.1.8](///compare/v0.1.7...v0.1.8) (2026-09-29)

### Bug Fixes

* **shell:** thin the drag band so page content below it stays clickable (013) 976f443

## [0.1.7](///compare/v0.1.6...v0.1.7) (2026-09-29)

### Bug Fixes

* **window:** restore windows to their saved monitor (013) d31df43

## [0.1.6](///compare/v0.1.5...v0.1.6) (2026-09-29)

### Bug Fixes

* **shell:** keep the drag band available over full-window surfaces (013) 7fd025e

## [0.1.5](///compare/v0.1.4...v0.1.5) (2026-09-29)

### Bug Fixes

* **window:** keep the hover reveal alive across macOS Spaces (013) bb8c493

## [0.1.4](///compare/v0.1.3...v0.1.4) (2026-09-29)

### Features

* **blank:** themed logo watermark on blank windows (014) 4dc28be
* open multiple independent windows (012) 5a91e9f
* **window:** always-on drag region with hover-reveal strip (013) e176e5e

## [0.1.3](///compare/v0.1.2...v0.1.3) (2026-09-28)

### Features

* **dev:** preview transient shell surfaces be19377
* **extensions:** install, unpack, and persist Chrome extensions 6205c46
* **extensions:** load extensions into the guest session a278b38
* **menu:** group the application menu into domain menus 97ce361
* **palette:** group commands and scope the palette 5fa464e
* **palette:** install and manage extensions from the palette c726033
* **shell:** show native macOS traffic lights with the drag strip f2cd519

## [0.1.2](///compare/v0.1.1...v0.1.2) (2026-09-28)

### Bug Fixes

* **about:** derive the copyright from the package author 9d8dd9d

## [0.1.1](///compare/v0.1.0...v0.1.1) (2026-09-28)

### Features

* updating author name 2c9e87c

## 0.1.0 (2026-09-28)

### Features

* implement chromeless localhost browser (feature 001) 9ca58cb
* navigate history with mouse back/forward buttons c433a2d
* package standalone macOS app with electron-builder edad781
* **palette:** keep the highlighted row in view while arrowing c442749
* **palette:** make ⌘P toggle the command palette 8e7b07a
* **palette:** report fuzzy match indices for row emphasis 88da01d
* polish shell theming for S7 537e18e
* **release:** add tag-based versioning and About release date 3aa3fbb
* **shell:** animate transient surfaces with tokenized motion 6b019a6
* **shell:** raise the loading veil only on site switches 33563b5
* **shell:** render palette accelerators as key caps and strip controls as icons 5297d92
* **shell:** rework loading veil spinner and label 5eeb48d
* **shell:** toggle focus between page and DevTools with ⌘J d5a030a
* **theme:** lower subtle foreground mix and regenerate tokens 1df3d23

### Bug Fixes

* block main-frame redirects off the local target ddf9cd3
* keep recents across instances and quiet failed loads ee892f6
* name the loading target and add failure recovery 8d983a4
* **palette:** animate main-initiated close and stop double-reporting open 9ba46c4
* **palette:** stable row keys, fixed row height, staggered row motion 9fd1ded
* persist DevTools dock side changed from inside DevTools 27d5aa0
* rebind DevTools toggle to Cmd+Opt+J f56ac08
* reject invalid palette targets; Cmd+L prefills live URL 0fdb85b
* shortcuts while DevTools focused; dock shortcuts to Cmd+1/2/3 0b90cd9
* shortcuts while DevTools is focused; poll DevTools dock side e0b9edd
* show the loading veil only for target loads 2023962
