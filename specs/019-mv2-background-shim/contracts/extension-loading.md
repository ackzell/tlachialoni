# Contract: Extension Loading with a Rewrite

## Loading

An extension resolves to exactly one directory, and which one is not observable
to the rest of the app — `load()` returns the same `LoadedExtension` either way.

```ts
interface LoadedExtension {
  name: string;
  usesMv3ServiceWorker: boolean;  // from the AUTHORED manifest
  shimmed: boolean;               // did the rewrite load?
}
```

### Order of attempts

```
load(slug):
  dir      = <extensions>/<slug>          # authored, authoritative
  manifest = readManifest(dir)            # never the rewrite
  shimDir  = <extensions>/.shim/<slug>

  if shimDir/manifest.json is absent:
      writeRewrite(dir, shimDir, manifest)   # backfill; see below

  if shimDir/manifest.json exists:
      try loadExtension(shimDir) → shimmed = true
      catch → stderr, fall through          # FR-004

  loadExtension(dir)                      # may throw; caller decides
```

### Backfill on load, not only at install

`load` regenerates a missing rewrite rather than treating its absence as a
decision (FR-016). Two reasons, and the second is the important one:

1. **Upgrades.** Every extension installed before this feature exists has no
   rewrite. Writing only in `commit` leaves all of them loading exactly as they
   did before — silently, since "no rewrite" and "rewrite declined" are
   indistinguishable from the load path.
2. **Drift.** A manifest that changed underneath us (an extension updated out of
   band, say) would otherwise keep loading a rewrite of the old one.

`commit` still discards any stale rewrite before swapping, so an update never
leaves the previous version behind; `load` then regenerates it. The cost is one
`cpSync` per extension, once, guarded by an `existsSync`.

Reading the manifest from the authored directory is what keeps
`detectMv3ServiceWorker` and `shimMv3ToMv2` describing the extension rather than
our own rewrite of it.

### Failure ownership

Only the authored copy is allowed to be fatal. This is the property that makes
the feature safe to enable for every extension without opt-in (FR-005):

| Failure | Result |
| --- | --- |
| Rewrite rejected by the parser | Falls back to authored. Installed. Badge `MV3`. |
| Rewrite throws at load | Falls back to authored. Installed. Badge `MV3`. |
| `cpSync` / write of the rewrite fails | Falls back to authored. Installed. Badge `MV3`. |
| **Authored** copy throws at load | Install fails. Directory removed. |

The last row is pre-existing behaviour: a genuinely broken install is not
resurrected. The three above it are new, and all of them are strictly better
than the status quo, where the extension loads with a dead background and no
explanation.

## Commit

`commit()` is the single funnel for store installs, folder installs, and updates,
which is why the rewrite is written there rather than at load time (FR-014).

```
commit(slug, staging, source, idHint):
  manifest = readManifest(staging)
  shim     = shimMv3ToMv2(manifest)        # computed before anything moves

  unload(slug)                             # both directories
  rm(dir); rm(shimDir)
  rename(staging → dir)                    # staged copy is already final

  if shim: writeShim(dir → shimDir, shim)  # copy + replace manifest.json

  load shimDir if written and non-null → shimmed = true
  load dir otherwise
```

Computing `shim` before the swap means a manifest we decline never reaches disk,
and computing it from `staging` means it reflects exactly the files being
installed.

## Status surface

The phase is a promise about outcome, not about mechanism:

| Outcome | Phase | Message |
| --- | --- | --- |
| Rewritten and loaded | `warning` | `X was rewritten from Manifest V3 to V2 so its background service worker can run here. …` |
| Authored, no rewrite needed | `done` | `Installed X` |
| Authored, rewrite failed | `warning` | `This extension uses Manifest V3 service workers, which Tlachialoni can't host, and the MV2 rewrite of it wouldn't load either. Most of it won't work.` |

## A successful rewrite is still a `warning`

Deliberate, and the one place this spec uses the phase for severity rather than
outcome. The extension installed and its background is running — the opposite of
what `specs/018` described — but the app has silently changed how an extension
it was given declares itself.

That is worth reading at the developer's pace. A `done` auto-leaves after ~1.6s,
which is right for an install needing no further attention and wrong for a notice
about a conversion the developer did not ask for. So the rewrite reports as a
`warning`: it stays until dismissed (Esc or click), and dismissing it is the
acknowledgement. The badge carries the fact afterwards (FR-010), so nothing is
lost by not re-reading it.

The message also states the limit rather than implying the extension is now
whole: the manifest is the only thing changed, but MV3-only APIs are still
unavailable, so parts of it may not work (see `research.md` R7).

Re-enabling reports the same way, for the same reason it did before: it is the
other moment the extension's state changes materially.

## Palette badge

Derived from the two flags (FR-010):

```ts
badge: mv2Shimmed ? "MV3→MV2" : mv3ServiceWorker ? "MV3" : undefined
```

On the toggle row only. This ordering matters: an extension that is both authored
MV3 *and* successfully rewritten must report the rewrite, because the service
worker warning would be a false statement about something that is running.

## teardown

`unload(slug)` scans both directories, and `remove(slug)` deletes both. Missing
the second path would leave an orphaned registered copy that no record refers
to — invisible to the palette, un-unloadable, and growing.