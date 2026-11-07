# keywork-app

**keywork, as a native app.** The same engine, the same event stream, the same tiling and
keyboard grammar and design language as [keywork](https://github.com/JMoak/keywork), mounted
in a desktop window instead of a terminal.

keywork-app is a client of `keywork serve`. Packaged apps register with one authorized shared
runtime, attach to its workspace servers on loopback, and render panes from the typed event
stream. No engine logic lives here.

The desktop library now supports two products. Keywork keeps its IDE and adds an optional
Stead panel; Stead starts with a personal creature home before a project is selected. Both
surfaces share home conversations, memory and live state. Product profiles keep application
identity, settings, labels, protocol handlers and update feeds separate.

`bun run pack:sdk` builds `@jmoak/keywork-desktop` as a compiled archive in `dist/sdk/`.
Its `startDesktop` entry and immutable profiles are consumed by Stead without source checkout
imports. Each candidate must pair the archive with the exact runtime version, contract and
binary checksum used by the other product. Automatic update installation is held for manual
compatibility review until coordinated engine upgrades are supported.

Status: the two-product integration is prepared for Windows review. Public distribution still
requires installer lifecycle acceptance, signing, and coordinated engine-upgrade handling.
Read [`docs/README.md`](docs/README.md) for the architecture, stack and milestone plan.
[`AGENTS.md`](AGENTS.md) carries the conventions, which apply to humans and agents equally.

## Development

```sh
bun install
bun run setup:electron   # once: fetches the Electron binary Bun's install skips
bun run check            # types, pins, guardrails, colors, contract, lint
bun run test             # vitest: node projects + the Solid renderer under happy-dom
bun run fixtures:record  # re-record wire fixtures from ../keywork (KEYWORK_REPO overrides)
bun scripts/fixtures/serve-mock.ts --write-ticket   # keywork's real server with a scripted provider; the app attaches to it
bun run check:contract   # route ids, methods and the version pin against ../keywork (KEYWORK_REPO overrides), else the recorded fixture
bun run check:contract -- --source fixture               # force the recorded fixture, as CI without a checkout runs
bun run check:contract -- --url http://127.0.0.1:4770   # against a live keywork serve
bun run dev              # the Electron app with the renderer on Vite HMR
bun run --cwd packages/ui dev   # the renderer alone in a browser, against the mock host
```

TypeScript is strict everywhere and dependencies are pinned exact. The code is written to
read top-down without needing comments, and if a change ships without tests it didn't happen.
