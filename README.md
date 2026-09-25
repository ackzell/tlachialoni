# localbrowser

A chromeless local browser for frontend development: one frameless window that
renders a local dev server edge-to-edge with real Chromium DevTools docked inside
the same window — and essentially no other browser chrome.

The only UI is transient and keyboard-first:

- `⌘P` — command palette (type a target like `:5173`, or run a command)
- `⌘B` — show/hide the draggable window strip
- `⌘⇧J` — toggle DevTools; `⌘⇧1/2/3` dock it bottom/right/left
- `⌘⇧C` — element picker with hover highlight
- `⌘R` / `⇧⌘R` — reload / hard reload
- `⌘←` / `⌘→` — back / forward (native text behavior inside inputs)
- `⌘L` — edit the current target

Everything is themed with [Tlapalli](https://tlapalli.ackzell.dev) (eight mineral
variants, dark/light following the system) in Source Code Pro.

## Requirements

- macOS 13+ (Apple silicon)
- Node 24.21+ and npm

## Development

```sh
npm install
npm run dev        # build and launch with renderer HMR
npm run build      # production build
npm run preview    # run the production build
npm run check      # format, lint, and type checks (Vite+)
npm run test       # unit tests (Vitest)
```

The default target is `http://localhost:3000`.

## Design docs

This project is built spec-first with [Spec Kit](https://github.com/github/spec-kit).
See:

- `.specify/memory/constitution.md` — project principles
- `specs/001-chromeless-localhost-browser/spec.md` — the feature specification
- `specs/001-chromeless-localhost-browser/plan.md` and `tasks.md`

## License

MIT — see `LICENSE`. Theme color values are derived from Tlapalli (MIT); see
`NOTICE`.
