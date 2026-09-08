# keywork-app: Implementation Plan

> Milestones in execution order, each with sized tasks (keywork's scale: 1pt ≈ an hour or
> two · 2pt ≈ a half-day · 3pt ≈ a full day) and acceptance criteria that are the bar. The
> **server lane** at the end is work in the keywork repo; each app milestone names the server
> tasks it needs, so neither repo waits on a surprise. Strategy tags follow keywork:
> `OWN` = original · `LIFT:pi` / `LIFT:opencode` = adapt MIT source with attribution in
> `NOTICE` · `MIRROR:keywork` = the same semantics as a keywork module, re-expressed for the
> web platform (keywork is Jordan's own code; no attribution obligation, but the module is
> cited so the two stay in step).
>
> **Standing guardrails:** no engine logic in the app; Anthropic is API-key only and the app
> never touches credentials; the gate lives on the server; the user commits.

## Reading the shape

```
M0 skeleton ─► M1 protocol + client ─► M2 the front door ─► M3 the workspace ─► M4 the panes ─► M5 native polish
                     │                       │                     │                  │
                     └─ S0 (serve flags)     └─ S0                 └─ S1 asks         └─ S2 tree · S3 controls · S4 changes
                                                                      S8 stream filter    S5 files · S6 memory · S7 status
```

Server tasks are small and mechanical by design (keywork D7 promised exactly that); they
should land in keywork ahead of the app milestone that consumes them.

## Decisions of record (Jordan, 2026-09-07)

| # | Decision | Where |
|---|---|---|
| 1 | Electron is the shell; Tauri declined for Linux rendering and terminal parity | AD3 |
| 2 | Solid is the renderer, starting on 1.9 and upgrading when 2.0 goes final | AD4 |
| 3 | Server gaps are built in the keywork repo; one server per workspace, the terminal and the app as peers on one bus | AD2, server lane |
| 4 | Monospace for what the machine says, a text serif for what the model says | AD7 |
| 5 | Ordering: app-first against a mock server through M2, then server-first for the ask queue so the engine's shape dictates that route | below |

## M0: Skeleton (5pt)

The repo becomes a keywork-shaped monorepo with the check rail before any product code.

- **M0.1 (1pt) Workspaces and toolchain.** `package.json` with Bun workspaces for
  `packages/{protocol,client,ui,desktop}`, `packageManager` pinned, `tsconfig.base.json`
  strict, Biome config matching keywork's, Vitest workspace (node for `protocol`/`client`,
  `happy-dom` for `ui`). `OWN`.
  **Accept:** `bun install && bun run check && bun run test` green with placeholder tests.
- **M0.2 (1pt) Ratchets.** `scripts/check-pins.ts` (exact npm pins),
  `scripts/check-guardrails.ts` (no `@keywork/engine|tui|cli` imports; no credential-shaped
  code; no OAuth strings), `scripts/check-colors.ts` (no color literals outside
  `packages/ui/src/flavor/`). `MIRROR:keywork scripts/`.
  **Accept:** each script has a fixture that fails it and a test proving the failure.
- **M0.3 (1pt) CI.** GitHub Actions: check + test on ubuntu, windows, macos; Windows
  required-green (AD10); SHA-pinned actions. `OWN`.
- **M0.4 (2pt) Electron project.** `packages/desktop` on electron-vite: main, preload, and
  the renderer mounting `packages/ui`; `contextIsolation`, `sandbox`, no `nodeIntegration`;
  the preload exposes one typed `HostPort`; main-process modules stubbed by concern
  (`sidecar.ts`, `pty.ts`, `notify.ts`, `windows.ts`). electron-builder config with the
  sidecar under `extraResources`. `OWN` (OpenCode's `packages/desktop` as an MIT reference
  for supervision and packaging, attributed if adapted).
  **Accept:** `bun run dev` opens a window on Windows showing the flavor's ground color;
  `bun run dist` produces an installer.

## M1: Protocol and client (9pt)

The wire, mirrored and proven, before a single pixel.

- **M1.1 (2pt) Envelope and event types.** `packages/protocol`: `BusEnvelope`, the fifteen
  event payloads as a tagged union, `TurnDelta`, `Message` parts, `Usage`, `PermissionDecision`,
  `SessionSummary`/`SessionDetail`, the route ids. Written from `docs/events.md` and `host.ts`,
  not imported. `MIRROR:keywork packages/server`.
  **Accept:** a `docs/events.md` reader test (same idea as keywork's `bus.test.ts`) parses the
  headings of a checked-in copy of that file and fails when the union and the doc disagree.
- **M1.2 (1pt) Contract check.** `scripts/check-contract.ts`: given a running server URL,
  fetches `/doc`, compares route ids and `info.version` with the protocol's table, exits
  non-zero on drift. Runs in CI against the pinned keywork release binary. `OWN`.
- **M1.3 (2pt) HTTP client and SSE reader.** `packages/client`: typed calls per route with the
  bearer header; an `events()` async iterator carrying `Last-Event-ID` across reconnects,
  250 ms doubling to a 5 s ceiling, abortable; pure over injected `fetch`, frame reader and
  delay. `MIRROR:keywork packages/server/src/client.ts`.
  **Accept:** the same eleven behaviors keywork's `client.test.ts` proves, plus the ring-gap
  comment surfaced as a typed `Gap` value.
- **M1.4 (3pt) The projection.** A pure reducer `project(state, envelope)` producing per
  session: message list, the live turn (streamed text, visible thinking, tool calls with
  started/output/finished, spill references), queue, gate decisions keyed by `callId`, mode,
  preset, cost and usage, replay-vs-live. Frame coalescing as a separate pure function over a
  batch of deltas. `MIRROR:keywork tui conversation-model + transcript-feed` semantics.
  **Accept:** golden fixtures recorded from a real `keywork serve` with the mock provider
  (`scripts/record-fixtures.ts`): a plain turn, a tool-using turn, a headless denial, an
  interrupt, a replayed history, a compaction summary; each replays through the reducer to a
  snapshot; property test that coalescing a batch equals reducing it one by one.
- **M1.5 (1pt) Sidecar contract.** `packages/client/sidecar.ts`: parse `keywork serve`'s
  stdout lines (`listening on`, `token`, `ticket`), the exit classes (`docs/headless.md`), and
  the unresolved-inference payload into typed values. `OWN`.
  **Accept:** fixtures for every exit class; a malformed line never throws.

Needs **S0** for ephemeral ports and per-workspace tickets; until it lands the app uses
`--port` with a probe for a free port and the user's ticket file.

### M1 ledger (landed 2026-09-07, wave 1)

**What landed.** `packages/protocol` mirrors the fifteen-event vocabulary, the route ids, and
the session shapes; a checked-in copy of keywork's `docs/events.md` is read by a test that
fails when the two disagree. `packages/client` holds the SSE frame reader (comments kept, so
`: connected` and the ring-gap notice become typed `StreamNotice`s), the typed client over
every route plus `/doc`, the resuming event iterator (Last-Event-ID carried across drops,
250 ms doubling to 5 s, abortable, 401 refused rather than retried), and the projection:
a pure reducer from envelopes to a transcript (user, assistant, thinking, tool, notice
entries), the live turn, the queue, gate decisions, preset, mode, injections, diagnostics,
and a usage ledger that counts unpriced turns so a total can be honest. Tool durations come
from envelope timestamps, never a local clock. `coalesceEnvelopes` merges text deltas and
tool output per frame and is proven equivalent to reducing one by one. `historyEnvelopes`
turns `GET /sessions/{id}` into replay-flagged envelopes, and a test proves the replayed
transcript equals the live one. `scripts/fixtures/record.ts` drives keywork's real
`fileSessionHost` and server package (loaded by path from the keywork checkout, never
imported by the app) through six scenarios with a stepping clock and normalized ids, so
every fixture is byte-stable across runs. `scripts/check-contract.ts` compares the
protocol's route ids with the recorded `/doc` or a live server.

**Evidence.** 53 tests: SSE framing across chunk boundaries, every client route and refusal,
resume and backoff, projection semantics by hand and against the six recorded fixtures,
coalescing equivalence on every fixture, the raw SSE capture parsing to the jsonl fixture,
stored history replaying to the live transcript, and the contract check.

**Findings from the real wire, for keywork.**
- `docs/events.md` says a refused tool never fires `tool.started`. The server fires
  `tool.started`, then `gate.permission{denied}`, then `tool.finished{isError}`. The
  projection follows the wire; the doc or the engine should be corrected.
- A tool-using turn carries two `done` deltas: a zero-usage one after the tool call and the
  priced one after the final text. Only `turn.completed` is counted.
- `GET /sessions/{id}` on a live session reports the title as `(untitled session)` while
  `GET /sessions` already shows the titled summary for the same session.
- Session timestamps are wall clock rather than the event log's clock, so the recorder
  normalizes them.

**Left for M2.** The app-side server feed multiplexing one stream across panes lands with
the first pane; the recorder gains a `--live` mode against a real `keywork serve` once a
provider is configured for CI.

## M2: The front door (14pt)

`keywork attach` parity in a native window: open a folder, the server starts, a conversation
streams. This is the milestone that proves the architecture and is the first demo.

- **M2.1 (2pt) HostPort.** `packages/ui/src/host/`: one interface for everything the shell
  provides (discover or spawn a server, open folder dialog, notify, open external, window
  state, pty). The Electron preload implements it; an in-browser mock lets `ui` run under
  Vite alone against a mock server for fast iteration and Playwright. `OWN`.
- **M2.2 (3pt) Workspace open: attach first, spawn second.** Pick a folder (dialog, recent
  list, deep link, or CLI arg); look for a running server's ticket for that workspace and
  attach; only otherwise spawn `keywork serve`, capture URL and token, health-check `/doc`,
  version-match against the pinned server version; restart on crash with backoff; on window
  close, stop only a server the app started (never one the terminal started), and leave no
  orphan process. The unresolved case shows the IR-18 `nextAction` and offers a terminal
  pane running `keywork connect`. `OWN`.
  **Accept:** open → prompt within two seconds on a warm cache; `keywork serve` started in a
  terminal first is attached to, not duplicated, and `keywork attach` from a terminal joins
  the app's server; killing the sidecar by hand shows one calm notice and reconnects;
  closing the window leaves no orphan process (Windows and Linux fixtures).
- **M2.3 (2pt) Flavors.** Load keywork flavor JSON (the schema mirrored from
  `packages/shared/src/config/flavor.ts`, APCA floor included), map tokens and density to CSS
  variables, `system` appearance default, hot-swap from the palette. Ship keywork-night and
  the first-class light flavor. `MIRROR:keywork flavor.ts + contrast.ts`.
  **Accept:** a flavor that fails contrast is refused with keywork's exact message; every
  shipped flavor passes; `check-colors.ts` proves no literal escaped.
- **M2.4 (3pt) The conversation pane, v1.** Transcript from the projection: the density
  rail with voice stamps, prose in the text face at the width tier's measure, machine output
  full bleed, markdown rendered through tokens, the tool row (fold stamp · verb · subject ·
  duration · outcome, outcome the only colored word), streamed text arriving by ink. Composer
  with `Enter` steer, `Alt+Enter` queue, `Esc` interrupt; the queue rendered. Virtualized.
  `OWN` (keywork `104` page grammar as the spec).
  **Accept:** the M1.4 fixtures render to Playwright screenshots per flavor and per width
  tier; 5k-line paste lands intact with the UI responsive (T2); keystroke-to-echo under a
  streaming fixture stays under 16 ms (T8, measured).
- **M2.5 (2pt) Sessions list and switching.** Newest-first, title, age, live mark as
  density, cost when known; open, create; the pane rebinds. `OWN`.
- **M2.6 (1pt) Status line.** `keywork · <model> · <preset> · ░n` translated: model and
  preset from the projection, cost per keywork's honesty rules (a total hiding unpriced turns
  never renders as a total). `MIRROR:keywork status-bar`.
- **M2.7 (1pt) Window chrome.** Native title bar decisions per platform, window state
  restored, the app icon, `keywork://` scheme registered. `OWN`.

Needs **S0**. Asks still answer no here, shown honestly as keywork attach does.

### M2 ledger, wave 2 (landed 2026-09-07, two parallel lanes)

**The page (lane A, `packages/ui`).** `src/flavor/`: keywork's flavor schema and APCA
validator mirrored with the same floors and the same failure message; `keywork-night` from
keywork's exact values and a designed `keywork-day`; tokens mapped to `--kw-*` variables;
the default stylesheet generated from the same values and byte-checked by a test.
`src/page/`: the conversation pane with the density rail (`█ ▓ ░` voice stamps, the agent
stamp stepping through density tokens while streaming), serif prose at a 72ch measure at
broadsheet, mono machine output full bleed, container-query width tiers (800 / 560 / 320
px), thinking folded to a one-line count, the tool row from `toolRowSpans` with the outcome
as the only colored word and detail under a faint rule, an own markdown renderer over
`marked`'s lexer that never touches innerHTML. `src/composer/`: Enter steers, Alt+Enter
queues, Shift+Enter newline, Esc interrupts, paste never submits. `src/dev/`: the review
page at `/?dev` replaying the six recorded fixtures plus a prose scenario with scenario,
flavor, and width pickers. Verified by Electron captures of plain, tool, prose in
keywork-day, and denied at clipping width (`artifacts/shots/`, untracked).

**The host (lane B, `packages/client` and `packages/desktop`).** `client/src/feed.ts`: one
`/events` stream per server multiplexed to subscribers, batched per frame, notices and
terminal loss surfaced. `desktop/src/main/serve-process.ts`: sidecar supervision pure over
seams: free-port probe, ticket from stdout, `/doc` health check, exact version pin,
restart with the client's backoff curve, exit classes mapped (usage, unresolved with
`nextAction`, port in use, failed), tree kill via `taskkill /T /F` on Windows and
SIGTERM then SIGKILL elsewhere. `workspace.ts`: attach-first through keywork's ticket
file, spawn only when absent or dead, PATH `keywork` only on a version match else the
bundled sidecar, only app-started servers stopped on close. `recents.ts`: zod-validated,
atomic. HostPort grown (pickFolder, recentWorkspaces, openWorkspace with typed failures,
closeWorkspace, onServerLost, openExternal, notify) with the Electron preload and handlers
behind it, `electron` imports confined to three files.

**Evidence.** 115 tests across 22 files; check rail green. One cross-lane defect found by
looking at the capture and fixed: below the column tier the tool row hid every meta span,
so the separator and the refusal reason vanished; spans now carry a `part`, and only
`facts` (duration, size, elision) yield to narrow widths.

**Decisions Jordan may reverse.** Voice stamps are literal block glyphs in mono; the
streaming animation steps the stamp's color through density tokens; the measure applies at
broadsheet only; `keywork-day`'s palette is a first design; links allow http(s), mailto,
and anchors only; the version check is exact on `0.0.1`; a dead or corrupt ticket counts
as absent; unresolved inference is read from stderr's first line.

**Left for rung 2 and 3.** Wiring the feed and projection into the app shell against a
live server (sessions list, composer intents to routes, status line), then the workspace
open flow in the window.

## M3: The workspace (16pt)

The tiler, the keyboard, and the trust ladder. After M3 the app is a daily driver for
Jordan.

- **M3.1 (3pt) Tiling tree.** Split tree with ratios, two docks, the location cycle, rects
  as truth, minimum sizes refused honestly (never silent overlap), zoom and restore, close
  with focus handoff. Pure `layout.ts` with property tests (gapless, overlap-free under any
  verb sequence), persisted per workspace. `MIRROR:keywork tui/layout.ts`.
- **M3.2 (2pt) Keymap and leader.** One leader with timeout, modifier grammar, action ids
  shared with keywork, a single `keybindings` config section, chords resolved per focus
  context; input outranks motion. `MIRROR:keywork keymap.ts`.
  **Accept:** the hot-path ten are leaderless; every action reachable by keyboard; a
  collision test over the whole map.
- **M3.3 (2pt) Palette and overlay.** An own palette over Kobalte's combobox, generated from
  the keymap with bindings beside every row, fuzzy, executable; the `?` overlay is the same
  data filtered to the focused context. `OWN`.
- **M3.4 (2pt) Pane chrome.** The title row with the lifecycle stamp (tile-fill working,
  full-density awaiting, held-then-drained finished-unseen, missing-tile failed, blank idle),
  telemetry slot, mode word only when not Agent, arc hue on the border by spawn rank,
  focus as the pane's own hue lifted, needs-you inversion. Width-tier chrome shedding. `OWN`
  (keywork `104`/`113` as the spec).
- **M3.5 (3pt) Asks answered.** Ask cards as the needs-you state: tool, subject, the rule
  that would apply, approve/deny keys, `always for this session` where the server offers it;
  the OS notification on unfocused; answering posts to the ask route and the card settles on
  the resulting `gate.permission`. `OWN`. **Needs S1.**
  **Accept:** a mutating tool call from the app runs after approval and is refused after
  denial, both visible as keywork's own gate events; a completion while unfocused does not
  notify, an ask does.
- **M3.6 (1pt) Preset and mode controls.** One key moves the preset up or down, `shift+tab`
  cycles the mode per pane, both as session entries via the server. `OWN`. **Needs S3.**
- **M3.7 (2pt) Mouse garnish.** Border drag resizes a split, pane drag between docks,
  click focuses, wheel scrolls; every gesture has an equal keystroke; hit-testing is the
  layout's rects. `OWN`.
- **M3.8 (1pt) Multiple workspaces.** A workspace switcher; each with its own sidecar and
  layout; recent list persisted. `OWN`.

## M4: The panes (20pt)

Each pane earns its place with daily use. Order is by how often Jordan reaches for it.

- **M4.1 (3pt) Session tree.** The entry tree with branches, fork, labels, jump; live off
  the bus; arcs as grouping when present. `OWN`. **Needs S2.**
- **M4.2 (3pt) Changes and review.** Files changed this session with turn provenance,
  CodeMirror merge view per file (read-only), per-turn undo and redo through checkpoints,
  deep link to `$EDITOR` at the line. `OWN` (Zed's behavior observed only). **Needs S4.**
- **M4.3 (2pt) Files.** Read-only browser within the workspace's confinement, gitignore
  aware, follow-the-agent highlighting from `tool.started` paths, open a file pane with
  syntax highlighting. `OWN`. **Needs S5.**
- **M4.4 (3pt) Terminal.** xterm with the WebGL renderer over node-pty (ConPTY on Windows);
  a real shell in the workspace root, the mirror mode that tails the agent's bash calls from
  the bus, and the bridge mode that runs the real `keywork` TUI inside a pane attached to the
  same server. `OWN`.
  **Accept:** `vim`, `htop`, and `keywork` itself run correctly inside the pane on Windows and
  Linux; resize propagates; Ctrl+C reaches the child.
- **M4.5 (2pt) Memory.** The vault as a browser: notes, daily, entities, staging with
  approve and discard, provenance as density, curing as density. `OWN`. **Needs S6.**
- **M4.6 (1pt) MCP.** Per-server state as the tile-fill mark, tool counts, the lazy-schema
  story visible. `OWN`. **Needs S7.**
- **M4.7 (2pt) Arcs, bots, workspaces overview.** The overview surfaces with the same
  grammar as keywork's nodes; bot identity by sigil and name, never hue. `OWN`. **Needs S7.**
- **M4.8 (2pt) Context gauge and cost lineage.** keywork's cockpit instruments in the app's
  own character: context fullness, cost with lineage, changed files with provenance; every
  number honest about what it does not know. `OWN` (keywork `102` grammar).
- **M4.9 (2pt) Empty states and first run.** Every pane's zero state teaches; the first run
  teaches five keys and nothing else. `OWN`.
  **Accept:** a pane inventory test proving every registered pane has an empty state.

## M5: Native polish and release (10pt)

- **M5.1 (2pt) Notifications and tray.** The needs-you formula through native toasts,
  clicking a toast focuses the pane, a tray mark for asks pending while hidden. `OWN`.
- **M5.2 (2pt) Updater and signing.** Signed updates from GitHub releases, Windows code
  signing, macOS notarization, Linux AppImage and deb. `OWN`.
- **M5.3 (2pt) Release rail.** Tagged workflow building three platforms with the pinned
  keywork sidecar binaries fetched by checksum, SHA-256 sums, the 60-second install clock
  measured in the publish job. `MIRROR:keywork scripts/release`.
- **M5.4 (2pt) Textures.** T1 grapheme corpus through the composer, T2 paste flood, T6
  first-class light, T7 empty states, T8 latency: each with its ratchet in `scripts/`.
  `MIRROR:keywork textures.md`.
- **M5.5 (1pt) Three-platform screenshot parity.** Playwright screenshots on all three CI
  runners for the transcript, the diff view and the terminal, diffed against each other;
  font fallback is the only permitted difference. `OWN`.

## Server lane (keywork repo)

Every task here lands under keywork's rules: a route in `openapi.ts`'s table, a handler,
tests in `server.test.ts` and `serve.test.ts`, and `docs/events.md` updated in the same
change when an event is added. Loopback and bearer posture never changes.

| Task | Size | What | Needed by |
|---|---|---|---|
| **S0 serve discovery** | 2 | `--port 0` for an ephemeral port; the ticket moves from one per user to one per workspace identity (`~/.keywork/workspaces/<identity>/server.json`, the fallback read path for the old file kept one release), so a second `keywork serve` on the same workspace refuses with the running one's URL, and `keywork attach` with no flags finds the workspace's server; `/doc` gains `workspace` (anchor, identity) beside the version | M1, M2 |
| **S1 the ask queue** | 3 | A `ConfirmingGate` backed by a queue in `fileSessionHost`: a new bus event `gate.ask` (`callId`, `tool`, `arguments`, `rule`), `GET /asks` (pending), `POST /asks/{callId}` `{ verdict, scope? }`; an unanswered ask times out to `denied` after a configured window and is reported as `gate:"headless"` so today's behavior is the fallback; an answered one records `gate:"user"` | M3.5 |
| **S2 the session tree** | 2 | `GET /sessions/{id}/entries` (the JSONL tree, active leaf), `POST /sessions/{id}/fork` `{ entryId }`, `POST /sessions/{id}/label` `{ entryId, label }`, `POST /sessions/{id}/rename` `{ title }`; events already exist on the bus | M4.1 |
| **S3 session controls** | 2 | `POST /sessions/{id}/mode`, `/preset`, `/model`, `/thinking`; each is a session entry; `session.mode` and `gate.preset` already fire; `SessionSummary` gains `model` | M3.6, M2.6 |
| **S4 changes and checkpoints** | 2 | `GET /sessions/{id}/changes` (paths with turn provenance), `GET /sessions/{id}/changes/{path}` (before and after text, bounded), `POST /sessions/{id}/undo` and `/redo` over the existing `Checkpoints` | M4.2 |
| **S5 workspace and files** | 2 | `GET /workspace` (anchor, linked dirs, trusted, arcs, bots), `GET /files?path=` and `GET /tree?path=` read-only inside the confinement jail, gitignore applied | M4.3 |
| **S6 memory** | 2 | `GET /memory/notes`, `GET /memory/notes/{title}`, `GET /memory/daily/{date}`, `GET /memory/staging`, `POST /memory/staging/{id}` `{ action: approve \| discard }`; inert when untrusted, exactly as the store is | M4.5 |
| **S7 status surfaces** | 1 | `GET /mcp`, `GET /arcs`, `GET /bots`, `GET /workspaces` as the existing pane models already compute them | M4.6, M4.7 |
| **S8 stream and prompt shape** | 1 | `/events?session=` filter; `POST /sessions/{id}/prompt` gains `behavior: steer \| queue` and the P2.6 `provenance` field | M2.4 |
| **S9 flavors** | 1 | `GET /flavors` listing the gallery and user flavors so the app and the TUI agree on what exists | M2.3 (optional) |

S1 is the one that changes the product: without it the app is a viewer with a composer.

**Ordering (decision 5).** M0 through M2 build app-first against a mock server that already
speaks the future routes; the mock doubles as the Playwright fixture. S0 lands in keywork
during M2 since it is small and the attach-first behavior needs it. S1 is built
server-first before M3.5, because the ask queue is the one route whose shape the engine
should dictate. The rest of the lane lands one task ahead of the pane that consumes it.

**Two surfaces, one bus.** The point of the invariant in AD2 is that a person can have the
terminal and the app open on the same workspace and talk to whichever is in front of them.
The complexities that raises are real and already answered by the engine: prompts from two
clients queue in arrival order, an ask answered in one surface settles in the other through
`gate.permission`, and memory has one writer because the server is the only one. What the
lane must never add is a route that lets a client hold state the server does not know about.

## Design pass (runs alongside M2–M3)

A short design pass in the `design` canvas before M2.4 and M3.4 land: the conversation pane
at three width tiers in both shipped flavors, the tool row, the ask card, the title row's
five stamp states, the palette, the status line, and the first-run screen. The serif is
decided (AD7); the canvas picks the two faces and the measure by showing the same fixture
transcript in both flavors. Nothing decorative that is not also informative.

## What is deliberately not in this plan

- Shared workspaces across machines (keywork P2.3) and any multi-user story.
- Embedded editing of any kind.
- A settings GUI: the one config file and its schema are the editor.
- Voice, dictation, or any audio surface: the app is a keyboard citizen like the terminal.
