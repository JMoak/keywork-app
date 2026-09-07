# keywork-app

**keywork, as a native app.** The same engine, the same event stream, the same tiling and
keyboard grammar and design language as [keywork](https://github.com/JMoak/keywork), mounted
in a desktop window instead of a terminal.

keywork-app is a client of `keywork serve`. It bundles the keywork binary as a sidecar,
starts a server per workspace on loopback, and renders every pane from the typed event
stream. No engine logic lives here.

Status: M0, the skeleton. Read [`docs/README.md`](docs/README.md) for the architecture, the
stack, and the milestone plan. [`AGENTS.md`](AGENTS.md) carries the conventions, which apply
to humans and agents equally.

## Development

```sh
bun install
bun run setup:electron   # once: fetches the Electron binary Bun's install skips
bun run check            # types, pins, guardrails, colors, lint
bun run test             # vitest: node projects + the Solid renderer under happy-dom
bun run dev              # the Electron app with the renderer on Vite HMR
bun run --cwd packages/ui dev   # the renderer alone in a browser, against the mock host
```

TypeScript is strict everywhere and dependencies are pinned exact. The code is written to
read top-down without needing comments, and if a change ships without tests it didn't happen.
