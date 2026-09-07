# keywork-app: Architecture Decisions

> Decision record, 2026-09-07. Each decision is binding until explicitly revisited. Every one
> of them is derived from a keywork decision of record (`docs/vision.md` D1–D10,
> `docs/backlog/80-p2-reach.md`'s external-surface posture, `docs/design-language.md`,
> `docs/ux-principles.md`, `docs/textures.md`) and says which.
>
> **Standing guardrails (restated on purpose):** Anthropic is API-key / Agent-SDK only. Pi and
> OpenCode are MIT: adapt with attribution in `NOTICE`. Crush is never a source. The user
> commits; agents never `git commit` or `git push`.

## The one-liner

**keywork-app** is keywork's third mounting surface: a native desktop shell in which every
pane is a client of the same typed event stream the terminal reads, with keywork's tiling,
keyboard grammar, trust ladder, and design language translated into pixels instead of cells.
It is not a port and not a fork. The engine stays in keywork; the app talks to `keywork serve`.

## Decisions

### AD1. A third mounting surface, never a port (keywork D6, D7, D10, 80's revisit gate)

keywork decided that panes are bus clients with two mounting surfaces (in-process TUI and
`keywork attach` over the server) and that a native app is a **third** one. This app is that
surface. Consequences:

- The app contains **zero engine logic**. Sessions, tools, permissions, memory, providers,
  and inference resolution are reached over HTTP + SSE and nowhere else.
- The contract is the wire: `docs/events.md` (the fifteen bus events and their envelope)
  and the OpenAPI document at `/doc`. The app's `protocol` package mirrors both, and a
  contract check against a real `keywork serve` fails the build when they drift.
- When the app needs something the server lacks, **the server grows**, as a task in the
  keywork repo (`docs/plan.md`, server lane). The app never re-implements the missing piece.
- Ratchet: `scripts/check-guardrails.ts` fails on any import of `@keywork/engine`,
  `@keywork/tui`, or `@keywork/cli`.

### AD2. One server per workspace, any number of clients

The invariant that keeps the terminal and the app coherent on one machine: **a workspace has
exactly one `keywork serve`, and every surface is a client of it.** The server owns the
sessions, the memory vault, the trust state, and the asks; the TUI, `keywork attach`, and
this app are views. Two servers on one workspace would mean two memory writers and two ask
queues, so the app never starts a second one.

- On opening a workspace the app **discovers** a running server for it first (the
  per-workspace ticket the server lane's S0 adds) and attaches. Only when none is running
  does it spawn `keywork serve` itself, on a loopback ephemeral port, reading the URL and
  token from stdout. A terminal user can `keywork attach` to the app's server, and the app
  can attach to a server the terminal started; nobody has to plan for this, it simply works.
- Two clients on one session behave as the engine already defines: prompts queue, the
  first answer to an ask wins and the other client sees the resulting `gate.permission`.
  Context and memory stay single-writer because the server is the only writer.
- The app bundles the same single-file `keywork` binary every release ships (Bun-compiled,
  per platform, checksummed) as its sidecar. A `keywork` already on the user's PATH is used
  instead when its `/doc` version matches the app's pinned server version; otherwise the
  bundled one runs. Mismatch is shown, never silently papered over.
- The server's security posture is inherited unchanged: `127.0.0.1` only, bearer token per
  launch, no CORS.
- The app never reads or writes `~/.keywork` directly. Sessions, config, memory, and
  credentials are keywork's; the app sees them through routes.
- Onboarding reuses keywork's: when a server reports an unresolved inference (exit class 3,
  the IR-18 `code` and `nextAction`), the app shows that text and opens a terminal pane
  running `keywork connect`. No parallel setup flow, no credential handling in the app.

### AD3. The shell: Electron, with a thin main process

Decided 2026-09-07 over Tauri. The two things that make this app world-class rather than
fine are pixel-identical rendering on all three platforms and a flawless embedded terminal,
and those are exactly where a system webview is weakest on Linux, keywork's primary
platform. Electron bundles Chromium, so a flavor renders the same everywhere, and its PTY
story (`node-pty` plus xterm's WebGL renderer) is VS Code's own terminal stack. The cost is
about 80 MB on top of a 125 MB sidecar, which is the honest total.

The main process does only what a renderer cannot: windows and their state, sidecar
discovery and lifecycle, native menus and tray, OS notifications, the PTY, deep links, the
updater, and file dialogs. Product logic lives in the renderer. Security is by
construction: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, and the preload
exposes exactly one typed `HostPort`. The renderer is shell-agnostic through that port, and
an in-browser mock of it runs the whole UI under plain Vite against a mock server.

### AD4. The frontend: Solid, Vite, strict TypeScript, a pure projection

Decided 2026-09-07 over React. Solid's fine-grained reactivity is the natural fit for a
stream of sixty deltas a second into a long transcript: the streaming text is a signal and
only that node updates, with no memo ceremony. Solid is Svelte-sized in adoption, its core
idea is on its way into the language through the TC39 Signals proposal, and OpenCode's web
UI proves it in this exact domain. Solid 2.0 is in release candidate as of this decision;
the app starts on 1.9 and upgrades the release 2.0 goes final, while the codebase is small.
The trade accepted with eyes open: no Radix, no cmdk; Kobalte covers dialogs and menus and
the palette is our own.

The streaming discipline that makes it feel native:

- One **pure projection** turns the envelope stream into state (messages, the live turn's
  parts, tool cards, the queue, gate decisions, mode, preset, cost). It is a reducer with
  no Solid in it, tested against envelope fixtures recorded from a real server.
- `turn.delta` chatter is **coalesced per animation frame** before the store commits, the
  same discipline as the engine's `coalesceDeltas`.
- `replay: true` paints history; live events animate. The distinction `docs/events.md`
  draws is honored in the projection, not in components.
- The projection's output lives in a Solid store; components read paths from it. There is
  no second state library.

### AD5. Panes are bus clients, tiled by keywork's verbs (D6, P10)

The app owns its tiling: a split tree with the same verb set as the terminal
(split, rotate, zoom, close, focus jump directional and ordinal), two docks with the
location cycle, and rects as the single geometric truth. Layout changes snap; ink animates
(design-language motion rule 1). The mouse is a first-class **garnish** here, because a
native window is where drag genuinely works: resizing a split by its border is allowed,
dragging a pane between docks is allowed, and every one of those has a keystroke that is
no slower.

Keyboard grammar is keywork's: one leader, a palette generated from the live keymap that
doubles as documentation, and a leaderless hot path (submit as steer, queue follow-up,
interrupt, approve, deny, mode cycle, palette, pane jump, zoom, overlay). Bindings share
action ids with keywork where the action exists in both, so muscle memory transfers.

### AD6. One theme system: keywork flavors (PD15, T6)

The app does not have its own theme format. It reads keywork **flavor** files (tokens,
ramp, density mapping, appearance) and maps every token to a CSS variable; every color
in every component is a token; the APCA contrast floor is enforced at load exactly as
keywork's validator does, and a failing flavor errors helpfully instead of loading. The
curated gallery ships with the app; any flavor file can be imported. `system` appearance
is the default. Density still carries state and hue still carries identity: those two
rules survive the translation intact.

### AD7. Modern flavor, terminal soul: the design language translated, not imitated

The material of the terminal is ink density on a cell grid. The app translates that
material rather than drawing a fake terminal:

- **Density** renders as fill and weight (a mark's opacity and stroke), still mapped
  through the flavor's density tokens, still monochrome-safe.
- **The tile-fill progress mark** is the one and only progress element. Never a spinner.
- **The motion grammar** carries over whole: motion in ink not geometry, four named tempos,
  one mover per region, input outranks motion, reduced-motion is the floor.
- **Typography** is the one axis the terminal never had, and the decision (2026-09-07) is
  the editorial one keywork's page grammar already implies: everything the machine says is
  monospace (rail, stamps, paths, tool rows, diffs, terminal, status), and everything the
  model says to you sets in a **text serif** at the tier's measure, headings the same face
  one step up, never display type. The width-tier grammar (broadsheet / column / clipping /
  masthead) becomes a container-query grammar with the same tiers. In the light flavor it
  reads like a broadsheet; in keywork-night, like a terminal that learned to typeset.
- **Needs-you only.** A notification always means a keystroke is wanted, with the same two
  triggers as keywork. Completions stay silent and show as return state in the title
  stamp.
- **Empty states teach** (T7): every pane's zero state names the next action in one line.

The bar is keywork's: restraint, composition, honest instrumentation, and nothing
decorative that is not also informative.

### AD8. Trust visible and answerable, gate on the server (D3, P11)

The trust preset is always in the status line, one key moves it, and the app renders
permission asks as the needs-you state and answers them over the server's ask route. The
app cannot loosen anything: an answer is a user verdict the server records as
`gate.permission{gate:"user"}`; policy lives in keywork's presets and rules; the app has no
allowlist of its own. File changes are undoable per turn through the server's checkpoints.

### AD9. Config: one typed surface, zero-config default (D9, P5)

The app has exactly one config file (keybindings, flavor, window preferences), schema
validated, with every option carrying a written justification in its `.describe()`. The
first run with no config is the best experience: one flavor, one keymap, one layout
algorithm. keywork's own config is keywork's.

### AD10. Windows-first parity, three platforms (T3)

Dogfooded on Windows 11; Linux and macOS are full targets with the same Chromium. Every
milestone's acceptance runs on a Windows CI runner as required-green. Platform-specific
behavior (ConPTY, job objects, the tray, deep-link registration) lives in one main-process
module per concern, never scattered.

### AD11. keywork's house rules, verbatim

Strict TypeScript, exact-pinned dependencies, every behavior with a test,
ratchet scripts in `scripts/` for every texture worth keeping, code that reads top-down
without comments, `AGENTS.md` as the canonical instruction file, and the user commits.
Where a tool is shared with keywork (TypeScript, Vitest, Biome, Bun) the version is the
same, so one toolchain story covers both repos.

### AD12. Refusals (the simplicity budget, extended)

| Refusal | Rationale |
|---|---|
| No engine logic, no forked engine, no direct file access to sessions or vaults | AD1; the server is the only door |
| No embedded editor | keywork's refusal stands: CodeMirror renders read-only review and diffs; a reference deep-links to `$EDITOR` |
| No second theme system | AD6 |
| No cloud, share links, accounts, telemetry, or enterprise packaging | Single-user, local-first, loopback-only |
| No plugin marketplace | keywork's extensions extend the server; the app renders what the bus says |
| No spinner, no decorative motion, no ambient animation beyond one mark | Design-language motion grammar |
| No config option without a fight | AD9 |
| No second shell | Electron is the shell; Tauri was weighed and declined for Linux rendering and terminal parity |
| No second server per workspace | AD2; the app attaches before it ever spawns |
| No speculative panes | A pane earns its place with daily use or is cut |

## Identity anchors

- Everything on the keyboard; the mouse as a garnish that is genuinely good.
- The tiler is the product. A single conversation window is the degenerate case, not the
  design center.
- The trust state, the model, the preset, and the cost are always one glance away.
- It looks finished on first launch in the system's appearance, and it looks like keywork.
