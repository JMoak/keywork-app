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
- The contract is the wire: `docs/events.md` (the twenty-one bus events and their envelope)
  and the OpenAPI document at `/doc`. The app's `protocol` package mirrors both, and a
  contract check against a real `keywork serve` fails the build when they drift.
- The contract identifies the wire the client supports. A packaged console uses its bundled
  engine as the lifecycle bootstrap and immutable installation candidate; the engine selects
  a verified compatible shared runtime, which can be a different release. Before using any
  attached ticket or spawned server, the app reads `info.x-keywork-contract` from `/doc` and
  requires its exact authored contract. Contract `1.28` does not imply support for `1.29`.
  A development build's existing `KEYWORK_BIN`, sibling checkout, and PATH launch order remains
  separate from packaged lifecycle admission.
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
  per platform, checksummed). Packaged lifecycle commands invoke that trusted bootstrap,
  never PATH. `node status --json` advertises `runtimeCompatibility: 1` when it supports
  `--contract <expectedContract>` on consumer installation and client attachment. The app
  probes once per preparation or workspace attachment and reuses that capability for lease
  renewals. Runtime selection, artifact verification, consumer admission, and safe replacement
  remain engine responsibilities. A running compatible engine is reused while a newer candidate
  is deferred. Activation requires an explicit stop, with its supervisor and recorded children
  stopped; closing app windows alone is insufficient. The app does not restart or downgrade it.
- A bundled engine without the recognized capability marker is refused before any installation
  or attachment, even if its status reports an empty or matching runtime: old status cannot
  establish the persisted runtime registry's identity. Unsupported requirement flags are never
  retried without their requirement. This SDK requires the compatible engine implementation to
  be published and adopted into the app's verified bundle before shipping; changing the SDK
  alone does not upgrade an old bootstrap. Earlier app registrations retain their original
  exact-version requirements until that app is updated. The desktop has no release-version
  threshold or alternate state directory to bypass this transition.
- The server's security posture is inherited unchanged: `127.0.0.1` only, bearer token per
  launch, no CORS.
- The app never reads or writes `~/.keywork` directly. Sessions, config, memory, and
  credentials are keywork's; the app sees them through routes.
- Onboarding offers Local, Flagship AI direct (OpenAI or Anthropic), and OpenRouter through
  one shared setup card. A discovered local model is highlighted without changing the
  user's choice or moving keyboard focus. Keywork can open its managed home for setup
  before a project is open; Stead lets the keeper meet a creature and explore first.
  Connection entry stays in the existing PTY running
  `keywork connect --group <route> --first-model`; renderer components add no credential
  fields or storage. The terminal transport still carries its input.
- After successful setup, the client calls authenticated `POST /models/refresh` (contract
  1.31) and uses the returned model for the requested activity. Creature conversation
  reads `conversation`, whose `chat` mode permits smaller models with tools disabled by
  the engine. Project setup continues to require `inherits.strong`. It keeps recovery visible if refresh is
  unsupported or fails. Setup never grants project trust, restarts the shared engine,
  or changes a running conversation. A chosen model is presented as ready to try; only
  the normal conversation supplies evidence of a real response. The keeper explicitly
  continues into the project or creature conversation. Advanced creature controls remain
  available separately from the first meeting.

### AD3. The shell: Electron, with a thin main process

Decided 2026-09-07 over Tauri. The two things that make this app world-class rather than
fine are pixel-identical rendering on all three platforms and a flawless embedded terminal,
and those are exactly where a system webview is weakest on Linux, keywork's primary
platform. Electron bundles Chromium, so a theme renders the same everywhere, and its PTY
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
doubles as documentation, and a leaderless hot path (Enter queues, Alt+Enter steers, as in
keywork's composer; interrupt, approve, deny, mode cycle, palette, pane jump, zoom, overlay). Bindings share
action ids with keywork where the action exists in both, so muscle memory transfers.

**Standing (2026-11-12): seats persist, the stage is a projection.** Every open pane keeps a
seat in the arrangement (a leaf of the split tree or a dock slot) for as long as it is open.
What the stage shows is a pure function of the seats, each pane's standing and the screen;
there is no second arrangement to keep in step, and nothing the screen does is ever saved.
Three things take a pane off the tiling without touching its seat:

- **Float.** A pane lifts over the tiling as a window in a pane's clothes: the same frame,
  verbs, ordinal and outfit, placed in fractions of the stage so it survives a resize,
  stacked by recency with the focused one on top. The tiling closes under it. The same key
  settles it back into the seat it left. `move` nudges a float and `grow`/`shrink` size it
  by one step; the title row drags it and a corner grip sizes it. A float wears no window
  chrome: its own pane-ink line and the ground's shade under it are all that set it off, so
  it reads as a lifted pane, in the window or (when it can leave) out of it. Lifting and
  settling are the one place geometry moves: the pane travels between its seat and its
  float in one quick stepped beat so the eye keeps hold of it, the tiling around it still
  snaps, a drag or a nudge never eases, and reduced motion snaps the lot. Zoom leaves floats where
  they are, so a float over a zoomed pane is the picture-in-picture: a workshop display, a
  terminal or the stead kept in sight over the work.
- **Shelf.** The keeper puts a pane out of the way by hand. It stays mounted and running,
  and one line above the status line lists it by ordinal, name and lifecycle stamp, so a
  shelved pane that needs you still says so. Focusing it by any route (ordinal, palette,
  summon, a needs-you jump, a click on the shelf) returns it to the exact seat and ratio it
  left. The last pane on the stage cannot be shelved.
- **The fit.** When the screen cannot hold every seated pane at the minimum pane size, the
  panes of lowest standing are tucked onto the same shelf, marked as waiting for room, and
  they return on their own when room does. Standing is ordinal only: the focused pane,
  then pinned panes, then recency of focus. Only as many panes are tucked as free the room
  that is missing. An open, a dock, a cycle or a move is therefore never refused for room;
  the status line says how many panes now wait. A resize that would squeeze a shown pane
  under its minimum is still refused, because resizing is not a reason to hide anything.

The arrows walk the tiling and never land on a float; one verb steps from the tiling through
each float and back. Floats, the shelf and pins persist with the layout per workspace.

Why this shape. The order is Furnas's degree of interest (a priori importance less distance
from the focus) used ordinally, as the yard's depth already is. Adaptation that moves
familiar things loses to layouts the person arranged, and loses badly when it is
unpredictable, so the keeper's seats and pins outrank the fit, the fit is deterministic,
and it changes what is shown only on an event (a pane opens, closes or takes focus, the
window resizes), never on a clock. Floating and stepping between layers follow i3
(`floating toggle`, `focus mode_toggle`); the shelf is the minimised row every desktop has,
kept honest by carrying each pane's state.

### AD6. One theme system: keywork themes (PD15, T6)

The app does not have its own theme format. It reads keywork **theme** files (tokens,
ramp, density mapping, appearance) and maps every token to a CSS variable; every color
in every component is a token; the APCA contrast floor is enforced at load exactly as
keywork's validator does, and a failing theme errors helpfully instead of loading. The
curated gallery ships with the app; any theme file can be imported. `system` appearance
is the default. Density still carries state and hue still carries identity: those two
rules survive the translation intact.

**The house and the outfits.** The window wears one **house** theme; a pane wears an outfit
resolved in one order: its own choice, else its arc's, else the house. Admin panes (tree,
arcs, bots, mcp, memory, workspaces, themes, permissions, trust setup) always wear the
house; work panes (conversation, diff, terminal, file, browser) can be dressed, and a dressed
pane takes its theme whole (tokens, sections, chrome weight, instruments) except `gap`, which belongs to
the house because the gap lies between panes, not inside one. The themes pane wears onto a
target (the window, the summoning pane, its arc, or the marked panes), and a pane or arc
that drops its choice inherits again; `system` is a window-only choice. Choices live in the
app's storage per workspace (`keywork.attire:<workspace>`), never in the keywork config and
never on the server: a theme per arc is presentation state of one window, like the layout.
The TUI stays single-theme, and keywork's arc rule is unchanged: hue is identity, the stop
is the arc's, and the ramp it indexes is now the pane's own theme's. A server-held arc theme,
so other clients could share it, is a later server-lane task, not this one.

### AD7. Modern flavor, terminal soul: the design language translated, not imitated

The material of the terminal is ink density on a cell grid. The app translates that
material rather than drawing a fake terminal:

- **Density** renders as fill and weight (a mark's opacity and stroke), still mapped
  through the theme's density tokens, still monochrome-safe.
- **The tile-fill progress mark** is the one and only progress element. Never a spinner.
- **The motion grammar** carries over whole: motion in ink not geometry, four named tempos,
  one mover per region, input outranks motion, reduced-motion is the floor.
- **Typography** is the one axis the terminal never had, and the decision (2026-09-07) is
  the editorial one keywork's page grammar already implies: everything the machine says is
  monospace (rail, stamps, paths, tool rows, diffs, terminal, status), and everything the
  model says to you sets in a **text serif** at the tier's measure, headings the same face
  one step up, never display type. The width-tier grammar (broadsheet / column / clipping /
  masthead) becomes a container-query grammar with the same tiers. In the light theme it
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
A session's quiet posture (N11) changes which scope the approve key sends, never whether a
person answers: the app never answers an ask by itself, and a gate that grants without a
person is the server's to build (S16).

Trust setup (2026-10-15) proposes rules from what the server knows and records only the ones
the person accepts, through a server grant route. Until keywork serves one (S23), an accepted
rule waits for its first ask and the ask card names it; the app never answers an ask by
itself, so what it remembers of an acceptance is a hint on a card, not an allowlist.

### AD9. Config: one typed surface, zero-config default (D9, P5)

The app has exactly one config file (keybindings, theme, window preferences), schema
validated, with every option carrying a written justification in its `.describe()`. The
first run with no config is the best experience: one theme, one keymap, one layout
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
