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
  `packages/ui/src/theme/`). `MIRROR:keywork scripts/`.
  **Accept:** each script has a fixture that fails it and a test proving the failure.
- **M0.3 (1pt) CI.** GitHub Actions: check + test on ubuntu, windows, macos; Windows
  required-green (AD10); SHA-pinned actions. `OWN`.
- **M0.4 (2pt) Electron project.** `packages/desktop` on electron-vite: main, preload, and
  the renderer mounting `packages/ui`; `contextIsolation`, `sandbox`, no `nodeIntegration`;
  the preload exposes one typed `HostPort`; main-process modules stubbed by concern
  (`sidecar.ts`, `pty.ts`, `notify.ts`, `windows.ts`). electron-builder config with the
  sidecar under `extraResources`. `OWN` (OpenCode's `packages/desktop` as an MIT reference
  for supervision and packaging, attributed if adapted).
  **Accept:** `bun run dev` opens a window on Windows showing the theme's ground color;
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
- **M2.3 (2pt) Themes.** Load keywork theme JSON (the schema mirrored from
  `packages/shared/src/config/theme.ts`, APCA floor included), map tokens and density to CSS
  variables, `system` appearance default, hot-swap from the palette. Ship keywork-night and
  the first-class light theme. `MIRROR:keywork theme.ts + contrast.ts`.
  **Accept:** a theme that fails contrast is refused with keywork's exact message; every
  shipped theme passes; `check-colors.ts` proves no literal escaped.
- **M2.4 (3pt) The conversation pane, v1.** Transcript from the projection: the density
  rail with voice stamps, prose in the text face at the width tier's measure, machine output
  full bleed, markdown rendered through tokens, the tool row (fold stamp · verb · subject ·
  duration · outcome, outcome the only colored word), streamed text arriving by ink. Composer
  with `Enter` steer, `Alt+Enter` queue, `Esc` interrupt; the queue rendered. Virtualized.
  `OWN` (keywork `104` page grammar as the spec).
  **Accept:** the M1.4 fixtures render to Playwright screenshots per theme and per width
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

**The page (lane A, `packages/ui`).** `src/theme/`: keywork's theme schema and APCA
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
theme, and width pickers. Verified by Electron captures of plain, tool, prose in
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
and anchors only; the version check is exact on the pinned `protocolVersion` (0.1.1 from wave 4, 0.2.0 from the keywork v0.2.0 cut); a dead or corrupt ticket counts
as absent; unresolved inference is read from stderr's first line.

**Left for rung 3.** The workspace open flow in the window, and the token-in-main
decision below.

### M2 ledger, rung 2 (landed 2026-09-07): the shell, live

**What landed.** `packages/ui/src/shell/`: `session-store.ts` (a Solid store of
projections keyed by session, history from `GET /sessions/{id}` replayed through
`historyEnvelopes`, live batches applied per session, envelopes that arrive while history
loads held and applied after it, summaries refreshed on `turn.started` and
`turn.completed`, gap and loss surfaced), `workspace-view.tsx` (sessions rail with density
liveness marks and relative ages, the title row with the lifecycle stamp and telemetry,
the conversation pane, the composer wired to prompt and abort, the status line in
keywork's grammar with every item justified or absent), `open-screen.tsx` (recents, the
folder picker, and a typed path in the browser build), `frame-tick.ts`, and `app.tsx` as
the state machine over `HostPort.openWorkspace`. `scripts/fixtures/serve-mock.ts` runs
keywork's real server package on a real socket with a scripted provider that streams at
a human cadence and runs the real bash tool, so the shell can be exercised end to end
with no key. `bun run --cwd packages/ui dev` proxies `/kw` to it (`KEYWORK_SERVER`).

**Evidence.** 119 tests. Driven live in Electron against the mock server: open, new
session, a tool turn with the real bash tool (60 ms), a priced prose turn showing
`380 tokens · $0.0031`, and a prompt posted from a second client (curl) appearing in the
app's transcript, which is the two-surfaces-one-bus story proven for the first time.

**Findings, both found by looking, both fixed.**
- keywork's server sends no CORS headers by design, so a renderer on another origin
  cannot call it. The dev build now goes through a same-origin Vite proxy. For the
  product this decides AD3's shape further: **the token never enters the renderer.** The
  Electron main process owns the ticket and performs every request and the event stream;
  the renderer reaches the server only through `HostPort`. Rung 3 builds that transport
  (IPC-backed fetch with streamed bodies) and drops `server` from `OpenedWorkspace`.
- Batching on `requestAnimationFrame` alone freezes the projection in a hidden or
  minimized window, because Chromium stops painting. `frameTick` now takes the frame
  when one comes and a 32 ms timer backstop otherwise, so state never depends on paint.

**Also fixed.** Tailwind's preflight had removed list markers from transcript prose; the
accent markers the design language calls for are back.

### M2 ledger, rung 3 (landed 2026-09-07): the native window

**What landed.** The token never enters the renderer: `desktop/src/main/server-relay.ts`
performs every request in main with the held ticket, overwriting any renderer-supplied
authorization, and streams bodies back over IPC as chunks; the preload assembles them
through a pure `chunk-queue`; `ui/src/host/transport.ts` turns the host port into the
client's `Fetch`, so the renderer's `keyworkClientOver(hostFetch(host, workspace))` is the
same client as before with no credential in it. `OpenedWorkspace` now carries a
`serverLabel`, not a ticket. The workspace host follows a restarted server to its new
ticket transparently (the feed reconnects on its own) and clears a ticket file that a
server it force-killed left behind, never a foreign one. Window state is remembered
(bounds and maximized, validated, placed only on a connected display). The mock server
gained `--write-ticket` so the app attaches to it in dev. `keyworkOnPath` picks a
launchable entry on Windows (`.exe`, then `.cmd`), and `.cmd` shims spawn through the
shell. The preload builds as CommonJS and workspace packages bundle into main.

**Evidence.** 138 tests. The real Electron window, driven over the remote debugging
port: attach-first to the mock through keywork's ticket file, a session created, a
bash tool turn streamed through the main-process relay; then, with no ticket, a real
`keywork serve` from PATH spawned and ready in two seconds; then the app closed and
the server tree was gone with the port released.

**Findings, all found by launching, all fixed.**
- electron-vite externalized the workspace packages, so Electron's Node loaded raw
  TypeScript and rejected a parameter property. Bundled now, and `erasableSyntaxOnly`
  ratchets the codebase.
- A sandboxed preload cannot be ESM; the `.mjs` preload silently exposed nothing.
- `before-quit` fired the tree kill without awaiting it, so the app exited first and the
  spawned server survived as an orphan. Quit now waits for `closeAll`.
- A force-killed `keywork serve` leaves its ticket file behind, which would mislead a
  later `keywork attach`. The app removes a stale ticket that names the server it killed.
- `where keywork` lists a shell script before the `.cmd` shim on Windows; spawning the
  script fails silently. The launcher choice and shell spawn fix that.

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

### M3 ledger, wave 3 (landed 2026-09-08)

**Lane A, the tiler (`packages/ui`).** `src/layout/`: the pure tiling model mirrored from
keywork's `layout.ts`: split tree with stepped ratios, two docks with the location cycle,
rects as the single geometric truth, minimum pane 320×200 so a legal pane never falls
below the clipping tier, typed refusals instead of overlap, zoom and restore, close with
focus handoff, ordinal and directional focus, versioned JSON; property tests over random
verb runs. `src/keys/`: chords, keywork's leader (`ctrl+k`, 2 s, cancel-and-consume),
keywork's action ids and chords verbatim where shared, a collision test, the hot-path ten
leaderless, a zod keybindings section with every option described. `src/palette/`: an own
palette with bindings beside rows and the `?` overlay from the same data.
`src/chrome/pane-frame.tsx`: the title row with the five lifecycle stamp states, ramp hue
by spawn rank, focus as the hue lifted, needs-you inversion, tier shedding. The shell is
the tiler: panes rendered from rects, keyed so layout changes never remount transcripts,
sessions docked left, layout persisted per workspace.

**Lane B, keywork's server (in the keywork repo, uncommitted there).** S0: `serve --port 0`,
per-workspace tickets with the user-level file kept one release, a pre-listen health
check that refuses beside a live server and clears a stale ticket, `attach` finding the
workspace's server, `/doc` naming the workspace. S1: the `gate.ask` event, `AskQueue` with
a 120 s default timeout, `GET /asks`, `POST /asks/{callId}`, and `ToolGuard.confirm`
reporting `user` for an answered ask and `headless` for a timed-out one. `asOf` on session
detail. The events doc corrected: the engine fires `tool.started` before the gate decides,
and it stays that way because the row that will carry the outcome must exist before the
ask lands on it.

**The app side of asks (this ledger's own work).** Protocol and client know the new event
and routes; the projection has an `asking` phase whose row reads "waiting for your
answer" and carries the ask's rule; the pane renders an ask card (why, arguments, approve
and deny with their chords); `ctrl+y` / `ctrl+n` answer the focused pane's pending ask;
the lifecycle stamp goes needs-you on `asking`; the store drops buffered live envelopes at
or below the history's `asOf`. Fixtures re-recorded: `denied` now shows the ask timing out
headlessly, and `asked-granted` / `asked-denied` show a user answer each way. The mock
server gained `--ask`.

**Evidence.** keywork: 3862 tests. App: 184 tests, rail green.

**Findings.**
- keywork's `check:guardrails` segfaults under Bun 1.3.9 on this machine on an untouched
  file (`packages/tui/src/layout.ts`); keywork's CI pins 1.3.14. Upgrade the local Bun.
- The recorder hung once asks existed: the ask timeout is an unref'd timer, and with
  nothing else holding Bun's loop the timer never fired. The recorder now keeps the loop
  alive while a scenario runs; a real `keywork serve` holds a socket and is unaffected.
- History and a racing live `turn.started` double-painted a prompt; `asOf` closes it.
- `asOf` alone would have dropped an in-flight ask: history holds messages, not the
  gate's state, so a `gate.ask` at or below `asOf` vanished. Opening a session now reads
  `GET /asks` beside the history and re-injects the session's pending asks, which also
  restores an ask card after the app restarts.
- Seen live in the shell: a fresh session, the ask card with its reason and arguments,
  `ctrl+y` granting it and the tool running under a `user` gate; a second ask denied by
  click. Captures in `artifacts/shots/ask-*.png`.

### Wave 4 ledger (2026-10-07): the parallel build

Nine lanes ran at once after a short serial wave 0, four of them in the keywork repo. The
assessment that shaped it: the app sat at M3.5 with 185 tests; keywork sat at 25e9f67
(v0.1.1, eleven routes, S0 and S1 landed, S2 to S9 absent); the dependency graph was routes
then panes; the conflict hot spots were four shared UI files and one server dispatch file.

**Wave 0, the app (landed).** The wire resynced to keywork 25e9f67: `injectPrompt`
(`POST /sessions/{id}/inject`, `{text, client}`) in the protocol routes, the typed client
(`inject` → `started | queued | missing`) and the re-recorded `/doc` fixture; `PromptOrigin`
on `turn.started` and `queue.changed` items; the checked-in `events.md` copy current and the
rest of the vocabulary audited clean. Protocol routes carry method and path, not ids alone,
and `check:contract` compares ids, methods and the version pin against keywork's real
`openApiDocument` read by file path from the checkout (`KEYWORK_REPO` or `../keywork`,
`--source auto|fixture|checkout`, `--url` for a live server), falling back to the fixture
where no checkout exists, with a temp-dir drifted-checkout test proving it fails. The server
version pin is `protocolVersion = "0.1.1"` in one place; `expectedServerVersion` and the mock
server derive from it (it had been `0.0.1`, so attach-first would have refused every real
keywork). New fixture `injected.jsonl`: a `wispr-flow` prompt queues behind a running turn
with its origin and then runs as its own turn; the page and composer tag it `via wispr-flow`.
Submit-key parity with keywork's 2026-09-02 composer flip: **Enter queues, Alt+Enter
steers**; Shift+Enter newline, Esc interrupt, paste never submits. The keywork checkout
locator is one helper (`scripts/lib/keywork-checkout.ts`) shared by the recorder, the mock
server and the contract check. README status corrected.

**Wave 0, the pane registry (`packages/ui/src/panes/`, landed).** One table,
`paneRegistry`, built from a static tuple of `definePane` definitions; `PaneSpec` derives
from it, so adding a pane is one directory and one tuple entry. A definition carries its zod
spec, home dock, title, one-line empty state, Solid component, optional summon (action id,
chord, palette command, spec factory), pane-local actions, adornments, lifecycle and restore
hook. The tiler places by home and mints `<kind>-<n>` ids (MIRROR: keywork
`pane-kinds.ts`); the keymap, palette and frame title read the registry;
`workspace-view.tsx` is composition only. The keymap learned scopes: a pane-local chord
fires only while its kind is focused, two panes may share one, and a collision with a global
chord still throws. M4.9's inventory test lands early: every registered pane has a title, a
home, a one-line empty state naming exactly one leader chord, a unique summon id and a
palette open command.

**Wave 0, keywork (landed in the keywork checkout, uncommitted there).**
`docs/backlog/118-app-surface.md` owns the app's server lane under keywork's ledger
(registered in the backlog index, pointed to from 80's S0·S1 section, rows in the open
ledger); it re-cuts S2 to S9 as K0 to K4 with sizes, Accept criteria and questions
Q-AS1 to Q-AS8 for Jordan. The server dispatch is one module per route family under
`packages/server/src/routes/` (`family.ts` holds the contract and helpers); `openapi.ts`
composes `routeFamilies` and a fixture test keeps the composed `/doc` byte-stable; adding a
family is one file and one line.

**Lane A1, the terminal pane (M4.4, landed).** `desktop/src/main/pty.ts` holds node-pty
over a typed seam, ConPTY explicit, shell chosen per platform (pwsh → Windows PowerShell →
`%COMSPEC%`; `$SHELL` → `/bin/sh`), env scrubbed of every keywork token and any value
carrying a held ticket, output batched per 8 ms frame or 4 KiB, PTYs tied to their
`webContents` and killed as a tree on quit. node-pty is the one module main does not bundle
(`nativeModules` in the vite config, `npmRebuild` and `asarUnpack` in the builder).
`HostPort.pty` is six calls; the preload keeps pty bytes ordered through the same
`chunkQueue` as the relay. `ui/src/panes/terminal/` is xterm 6 with fit and WebGL (DOM
fallback on context loss), themed from `--kw-*` tokens and re-themed on theme change,
three modes in one spec: shell, mirror (a pure projection→text tail of the agent's bash
calls), bridge (the real `keywork attach` or `connect` from the binary main resolves, no
token passed). A keyboard-owning pane is a registry concept: `keyboard: "owned"` makes the
keymap pass every chord but the leader and the pane's own. Summon `leader shift+t`.
Evidence, live on Windows 11: a PowerShell prompt, `dir`, resize 57 → 156 columns on zoom,
Ctrl+C stopping `ping -t`, vim open and quit on the alternate screen, two independent
shells, a mirror of a real bash turn from the mock, and `keywork --version` through ConPTY.
Findings: shifted leader keys never fired from a real keyboard (`chord.ts` dropped shift for
letters; fixed; `shift+.` and `shift+,` still arrive as `>` `<`); ResizeObserver is throttled
in a hidden window, so fit has a 200 ms backstop like `frameTick`; keywork's own TUI paints
one blank frame under ConPTY with the cursor placed past the reported width, which is the
Windows failure keywork's SW11 should record (it is OpenTUI/Bun's terminal layer, not the
PTY); stale per-workspace tickets shadow the live global one for `keywork attach`; `pane.close`
refuses silently on a full layout.

**Lane A2, the desktop main process (M3.8, M2.7, M5.1, landed).** Main holds a set of
windows over a pure `windowRegistry` (window ↔ workspace, MRU order, pending asks per
workspace); each workspace keeps its attached-or-spawned server, released only when its last
window closes and only if the app started it; window state is a per-workspace book.
`HostPort` grew `listOpenWorkspaces`, `switchWorkspace`, `onOpenWorkspacesChanged`,
`onOpenRequested`, `onNotificationActivated`, `setPendingAsks`. Single instance and
`keywork://open?path=…` (plus a bare folder argument) parse through `deep-link.ts`, every
refusal typed and none thrown. A per-platform menu from a pure `menuModel`, a tray from
`trayModel` with a runtime-built monochrome mark and a Windows overlay while asks pend, and
the needs-you rule in `shouldNotify`: a toast only for a pending ask (or the inbox
threshold) in an unfocused window, click focusing the window and naming the pane.
Evidence: the built app driven over CDP; a second-instance deep link routed into the front
door, three windows across three workspaces, a toast shown for an ask and refused for a bare
notice, and after closing the last window the spawned server, its port and its ticket were
gone. Findings, found by launching, fixed: `closeAll` could not see a close already in
flight, so quit outran taskkill; dev argv carried the entry script as a folder; the relay
sent stream ends to destroyed webContents. Open: the renderer does not yet call
`setPendingAsks`; the app still reads keywork's user-level ticket rather than the
per-workspace one.

**Lane A3, mouse garnish, first run, instruments (M3.7, M4.9, M4.8 part, landed).**
`layout/hit.ts` and `pointer.ts`: hit-testing is a pure function over the layout's own
rects and seams, and the pointer is a pure machine (down/move/up/cancel → focus, resize,
drop) tested over sequences including cancel, escape mid-drag, same-home drops and drags past
the minimum. Gestures land on the verbs the keyboard already has: a seam drag is
`resizeSeam` snapping to the stepped ratio with the same minimum clamp as `pane.grow`; a
title drag onto a dock is `send`; click focuses on press; wheel is never intercepted.
Feedback is ink only through density tokens, stepped, none under reduced motion.
`chrome/first-run.tsx`: the first run teaches exactly five keys (enter, split, sessions, go,
keys) rendered from the live keymap, shown only while the workspace has zero sessions.
`instruments/`: `formatTokens` and `formatCost` mirror keywork's rounding; the context gauge
is a level, not progress (steps in calm, bar in cockpit), drawn from the last turn's context
tokens against an assumed 200k window and labelled `basis: assumed` until the server's
`/context` is consumed; the cost item never renders a total that hides unpriced turns. The
gauge sits in the pane frame's telemetry slot and sheds at the clipping tier.

**Lane A4, the release rail (M5.2, M5.3, M5.5, landed).** `scripts/fetch-sidecar.ts`
resolves keywork's release asset per platform and arch from `protocolVersion`, verifies the
published `.sha256` before writing, and places the binary at the one shared `sidecar/`
constant; v0.1.1 Windows fetched and verified for real. `release.yml` on `v*` tags: three
runners, SHA-pinned actions, check + test + sidecar + `electron-builder --publish never`,
per-artifact sums, a publish job that re-verifies, writes `SHA256SUMS`, times the deb
install to `--version` (fails above 60 s) and creates a draft release; no secrets needed for
green, signing gated on `WIN_CSC_*`, `MAC_CSC_*`, `APPLE_*`. Updater: electron-updater 6.8.9
against the app's GitHub releases, a check 30 s after launch then every 6 h, download
silently, surface `onUpdateReady`, install on quit only after `acceptUpdate`, off in dev.
Parity scaffold: Playwright 1.63.0 captures the transcript scenarios per theme and width
tier on three runners; `scripts/compare-shots.ts` diffs across OS with a 5% tolerance for
font fallback, advisory until the first baselines exist. `docs/release.md` records the ritual.
Decision for Jordan: `productName: keywork` makes the deb executable `keywork`, shadowing
the CLI on PATH; `executableName: keywork-app` would avoid it.

**Server lane K0 to K4 (landed in keywork on branches `app-surface/k1..k4`, worktrees under
`C:\src\keywork-lanes\`, uncommitted; an integration worktree `all` folds them).**
- K0/K1 (`app-surface/k1`): `keywork serve` composes checkpoints like the TUI
  (`--no-checkpoints` opts out) and resolves model, thinking and effort per session from the
  JSONL; `SessionHost.checkpointsOf(id)`. Routes
  `POST /sessions/{id}/{model,thinking,effort,compact,undo,redo,export,rename}`,
  `GET /sessions/{id}/{context,cost}`, `POST /preset` (loosening needs `confirmed: true`),
  `/prompt` `behavior: "steer"|"queue"` (default queue), `GET /events?session=<id>[&only=session]`.
  `SessionSummary` carries `model`, `thinking`, `effort`. New server event `session.state`
  `{ model?, thinking, effort?, title, leafId, undoable, redoable }`; `gate.preset` now fires
  process-wide. `/undo` returns the prompt text so the composer re-seeds it. The retired-model
  map moved from the TUI ledger into `engine/src/usage-ledger.ts`, so `/cost` carries real
  per-model rows. Found and fixed: `turn.completed` fires before persistence, so verbs await
  the pending persist.
- K2 (`app-surface/k2`): `GET /sessions/{id}/entries` (flat JSONL with `parentId`,
  `leafId`, `labels`, `activePath`), `POST …/fork {entryId}` → 201 summary, `POST …/label`,
  `POST …/leaf` (409 while a turn runs); `GET /sessions/{id}/changes` (`trusted`, `baseline`,
  files with 1-based `turn`), `GET …/changes/file?path=` (both sides, 1 MiB cap per side,
  `note` for new/deleted/binary/unreadable). Events `session.tree` and `changes.updated`
  fired where the TUI's feeds fire; `engine/src/mutations.ts` is the shared
  `followMutations`.
- K3 (`app-surface/k3`): `GET /workspace`, `GET /tree?path=`, `GET /files?path=&from=&to=`
  (jailed to the tool scope, 403 outside, ignored entries flagged never dropped, reading
  needs no trust, `[from,to)` 1 MiB per request, 415 on NUL), `POST /workspace/trust {}` →
  `{ trusted, root, reopens }` (the server does not recompose; the app restarts the sidecar),
  `GET /themes` with a `system` placeholder; `/mcp` + restart/enabled/tools, `/arcs` +
  new/close/abandon and per-session bind, `/bots` + create and per-session switch (409
  mid-turn), `/workspaces` + new/use (`reopens: true`)/focus/unfocus. One
  `surface.changed { kind }` event with `sessionId: ""`. Session summaries carry `arc` and
  `bot`. `/doc` has 28 paths on this branch.
- K4 (`app-surface/k4`): `GET /memory`, `/memory/inbox` + approve/discard,
  `/memory/notes[?layer=]`, `/memory/notes/{name}`, `/memory/daily[/{date}]`,
  `/memory/ledger` + revert (`needs-rebase` is a 200 outcome), `/memory/ask {query, arc?}`,
  and the arc airlock (`GET /arcs/{slug}/airlock`, candidates and questions triage including
  `carry`, deliver, finish `{force}`). Wire shapes are the engine's own `StagedItem`, `Note`,
  `LedgerEntry`, `AuditEntry`, `DailyEntry`. Untrusted: reads `{ trusted: false, …empty }`,
  writes 403 `memory is inert`. First server event `memory.inbox { count, kinds }`; the
  needs-you threshold (3, rising edge) stays in the app. `keywork serve` now composes arcs,
  bots and citations as the TUI does.
- The envelope `type` enum in `/doc` is now engine ∪ server events (`surface.changed`,
  `memory.inbox`, `session.state`); the protocol package mirrors both lists.
- Integration: `app-surface/all` (worktree `C:\src\keywork-lanes\all`) folds K2, K3 and K4
  onto the wave 0 split with every conflict recorded in `C:\src\keywork-lanes\INTEGRATION.md`;
  50 `/doc` paths across nine families, 4304 tests green. K1 is folded the same way
  (the file gives the command sequence); its `session.state` joins `serverEventTypes` then.

**Wave 2, the panes (landed 2026-10-07 against the K worktrees).**
- **M4.1 and M4.2, the tree and the changes.** Protocol: six routes (`/entries`, `/fork`,
  `/label`, `/leaf`, `/changes`, `/changes/file`), two events (`session.tree`,
  `changes.updated`), the entry union mirrored from keywork's `entries.ts`; client methods
  with status mapping and fixtures `tree`, `changes` recorded from K2. Pure reducers
  `treeState` and `changesState` fold the bus into stale-marked state the store refetches;
  `treeRows` folds the flat log by `parentId` with keywork's branch-depth rule. One `tree`
  pane on `leader t` replaces `sessions`: overview above, entry tree below, labels inline,
  the leaf marked, `f` forking and opening the new session; old `sessions-N` layouts revive.
  The `diff` pane on `leader g`: files by turn with +/- counts, keywork's untrusted and
  no-baseline lines, a read-only CodeMirror merge view (`@codemirror/merge` 6.12.2, `view`
  6.43.11, `state` 6.7.4) themed only from `--kw-*` tokens, unified below broadsheet and
  side-by-side at it. Seams left honest: `openInEditor?`, `onUndoTurn?` (K1). Verified live:
  fork, label, a write turn appearing as `turn 1 / notes.txt +6 −0`, the merge view in both
  layouts. Findings: a pane hidden by zoom read a stale `<Show>` accessor (fixed in the slot
  renderer); pane-local single keys need the pane to own DOM focus and to yield while a text
  field is typing (`keepKeyboardHome`, `scopeWhileTyping`).
- **M4.3, the files pane, the spill viewer and the trust flow.** Protocol mirrors K3's
  workspace family (`readWorkspace`, `listTree`, `readFile`, `trustWorkspace`;
  `surface.changed` beside `memory.inbox`); the client maps 403/404/413/415 and both trust
  refusals to typed readings. The `browser` pane (`leader f`) walks the jail lazily through
  `/tree`, folders first, gitignored entries as lighter density, dotfiles behind `.`, `/`
  filters, and `tool.started` read/write/edit paths lift their row for four seconds. The
  `file` pane reads byte ranges through `/files` with CodeMirror's read-only view and a
  numbered rail, `g`/`G` reach head and tail, `]`/`[` step slices, `o` deep-links
  `file://…#L<n>` through main's allowlist (now `file:` inside an open workspace root). The
  trust flow reads `GET /workspace`, shows a quiet card in keywork's words, the mode word
  `untrusted` and `leader u` in the status line; accepting posts `/workspace/trust` and on
  `reopens: true` restarts the sidecar through the new `HostPort.restartServer`. Spills are
  wired to open a file pane at `elidedFrom..elidedTo` but need a server route that resolves a
  spill id (a server-lane row). Live verification deferred.
- **M4.5, the memory pane.** `protocol/src/memory.ts` mirrors K4's wire shapes verbatim;
  sixteen routes; `serverEventTypes` beside the engine's with the envelope typed over the
  union; `memory.inbox` as the first process-level event. One client method per route
  (403 → inert, 404 → missing, 409 → the airlock's typed refusals); `memory.jsonl` recorded
  from a seeded trusted vault. The pane renders keywork's three lenses: garden (layers with
  the curing tally as a density ramp, the prompt budget as a level, the inbox grouped by kind
  with provenance as density, airlocks with candidates, questions and the close row), note,
  ledger (`needs-rebase` shown honestly), plus daily from the dates row; inert state names
  the next action. Summon `leader shift+m` (`leader m` is the terminal's mode cycle).
  `shell/memory-store.ts` folds the event into a count, the stamp goes needs-you at three,
  and `shell/needs-you.ts` is the pure rising edge feeding `HostPort.notify`; the desktop
  threshold is 3. Live verification deferred.
- **M4.6, M4.7, S9, the overview panes.** `protocol/src/surfaces.ts` mirrors K3's status
  surfaces whole; eighteen routes; every refusal typed as `{refused, detail}` carrying the
  server's words. `shell/surfaces-store.ts` holds mcp, arcs with ordinals, bots, workspaces
  and themes, refetching exactly the kind a `surface.changed` names. Panes `mcp` (tile-fill
  while connecting, missing tile down, `enter` tools, `r`, `t`), `arcs` on `leader a` (hue
  chip by ordinal, sessions grouped, `n`/`c`/`shift+a` with a confirm, `b`/`u`), `bots`
  (`sigil name`, never hue; `enter` switches, a mid-turn 409 shown as the server says),
  `workspaces` (`enter` uses one and restarts the sidecar on `reopens`). The conversation
  title row shows the bound bot typographically and takes its hue from the arc's ordinal
  (AD5). `theme/wardrobe.ts` lists server themes beside the gallery, `system` from the OS,
  a theme below the APCA floor refused with keywork's exact message. Live verification
  deferred.
- **Consolidation.** `record.ts` now merges `doc.json` additively and waits for the
  post-turn `session.tree` and `memory.inbox` before cutting the SSE capture; every fixture
  re-recorded from the integration worktree. **Evidence:** 76 files, 633 tests; the rail green
  with `KEYWORK_REPO` at the integration worktree (54 routes, 0.1.1) and in fixture mode.

**Left after wave 4.** Consuming K1 in the app (model, thinking, effort, compact, undo and
redo in the diff pane and composer, rename, export, the preset control, the context gauge's
`reported` basis, cost lineage; `session.state`); folding K1 into the integration worktree;
live verification of the files, memory and overview panes; a spill-by-id route; the
renderer's `setPendingAsks` call and reading the per-workspace ticket; `pane.close` refusing
silently on a full layout; `shift+.` and `shift+,` chords; M3.6 when keywork builds modes.

**Findings across the wave.**
- keywork has no modes: Plan, Recall and Agent are a spec (`docs/modes.md`) with no code, so
  M3.6's mode half waits on keywork PD12, not on a route. Presets are process-level.
- The main keywork checkout carried ~107 dirty files from another session while this wave
  ran, so the K lanes were isolated in worktrees; Jordan merges `app-surface/*`.
- `check:contract` in auto mode drifts against the main checkout until those branches merge;
  the fixture mode stays green in CI.
- The TUI's browser and file readers are unconfined; the HTTP routes apply the tool jail.

**Decisions for Jordan.** Q-AS1 to Q-AS8 in keywork's 118 doc (the trust route, preset
loosening over HTTP, rename pinning and `effort: null`, cost lineage, the events filter,
one `surface.changed` or four, context-dir linking, the `system` theme placeholder); the
deb executable name; installing Bun 1.3.14 locally; whether to persist injection origin.

### Wave 5 ledger (2026-10-10): K1 consumed, the panes verified live, the leftovers closed

Five lanes ran at once, one in keywork. The precondition found at the start: keywork's `main`
had merged agentbox (bc33378) after wave 4 was cut, carrying the wave-0 route split but also
~120 other engine, TUI and CLI files, so the wave-4 lane worktrees were stale against it and a
merge of `app-surface/*` as-is would have conflicted. The keywork lane therefore re-based the
integration rather than merging stale branches.

**Lane K5, keywork (landed on branch `app-surface/next`, worktree `C:\src\keywork-lanes\next`,
staged, uncommitted).** K2+K3+K4 re-applied onto bc33378 (five conflicts, all agentbox's
`extension.notice` beside k2's events), then K1 folded (fourteen conflicts, each recorded in the
118 ledger and in `C:\src\keywork-lanes\INTEGRATION-NEXT.md`): one `serverEventTypes` of
`surface.changed`, `memory.inbox`, `session.state`; `routeFamilies` ending `memory,
sessionVerbs, presets`; the test host's undo and redo move the store's leaf so the store and
agent never disagree; `serve.ts` composes `arcService`, `botMemory` and citations once with
K1's per-session provider and one `AgentBuild` seam that keeps the session's bot across
rebuilds. Served sessions now spill large tool output like the TUI (they never had), the guard
calls `checkpoints.beginTurn()` as agentbox's `chat.ts` does, and a leaf move announces
`session.state`. The spill route: `GET /sessions/{id}/spills/{spillId}?from=&to=` → `{ spillId,
bytes, from, to, text, truncated, eof, encoding }`, the `/files` slice keyed by the engine's
existing `SpillReference.id`; 400 on a bad range, 404 unknown session or spill, 415 on NUL;
stored sessions answer too. `/doc` has 62 paths. Gate: types, lint, prose, pins, guardrails
green; 325 files, 4533 tests passed, 1 pre-existing skip. The only wire change agentbox made:
the engine event `extension.notice { extension, level, message, detail? }`.

**Lane A5, the app consumes K1 (M3.6 preset half, M4.2 undo and redo, M4.8 finished).**
`protocol/src/controls.ts` mirrors K1's shapes verbatim, eleven routes, `session.state` beside
the server events, `extension.notice` beside the engine's (nineteen), `SessionSummary` with
`model`, `thinking`, `effort`, `PromptOutcome` as `started | queued | missing`; one client
method per route with every refusal typed (`invalid`, `unresolved`, `busy`, `staged`,
`nothing`, `outside-scope`, `needs-confirmation`, `unavailable`), `prompt` always sending
`behavior` (**finding: Alt+Enter steer had sent exactly what Enter sent**), `events` taking
`session` and `onlySession`. Fixture `controls` recorded from `next` (model switch and an
unknown model, thinking, effort and an unknown word, rename, context, cost, undo returning the
prompt, a second undo as `staged`, redo, a second redo as `nothing`, preset loosening refused
then confirmed with the process-level `gate.preset`, export); `doc.json` at 62 paths. The
projection keeps `standing` (the latest `session.state`) and renders `extension.notice` as a
quiet notice row by level. `shell/controls-store.ts` reads context and cost on watch and on
`turn.completed`/`session.state`, learns the preset from `gate.preset`, builds the model list
from summaries, states and the server's refusal lists, reloads the transcript after undo, redo
and compact, and seeds the composer after undo. Conversation pane chords, all pane-local:
`leader o` model picker, `leader v` thinking, `leader e` effort cycle to provider default,
`leader shift+c` compact, `leader shift+r` rename inline, `leader shift+e` export to the
clipboard (`export-file` writes into the workspace through the server), `leader [` / `leader ]`
preset tighter and looser with keywork's confirm line before any loosening; palette commands for
each plus `undo`, `redo`, `cost`, and the three presets by name. The title row shows
`model · thinking · effort` typographically through a new `inference` adornment. Diff pane: `u`
undo, `shift+u` redo, verbs struck through when the server says there is nothing to act on; the
`onUndoTurn?` seam is gone. Instruments: the gauge labelled `reported` from `GET /context` with
the server's thresholds, `~` when the window is undeclared; `cost-report.ts` lists every model
and never hides unpriced turns. Deferred, as briefed: mode cycling (keywork PD12).

**Lane A6, the wave-2 panes verified live (M4.3, M4.5, M4.6, M4.7).** A `keywork.cmd` shim
let the app's own supervisor spawn keywork's real `serve()` with a scripted model and two MCP
servers (one broken on purpose), tickets and trust in temp dirs, the renderer driven over CDP
with request logging on the server. Every surface verified: lazy tree walk, gitignored density,
the four-second lift after a real read, 1 MiB slices with honest facts, trust card to
`/workspace/trust` to `reopens` to a restarted sidecar, the four memory lenses with approve and
discard dropping the count 3→2→1 over `memory.inbox` and `needs-rebase` after a hand edit, MCP
restart and toggle refetching only `/mcp`, arcs new and bind with the hue chip and the arc's
memory layer, bots create and switch and the mid-turn 409 in the server's words, workspace
`use` reopening on a new sidecar and back, keywork-day re-theming. Twelve defects fixed with
tests: the browser filter missed folded folders and dropped parents; a no-match filter said
"nothing here"; written files never appeared (the folder is reread on `tool.finished`); the
root path and the byte range were hidden under 560 px; `G` needed two presses and the view was
built twice per load; a refused editor link was silent; the trust card claimed the folder was
read-only to the agent (false: keywork keeps the root in the tool scope, the agent wrote
`proof.txt` live); every discard reported failure (`"discarded"` was read as a refusal, in the
pane and the store); memory and surfaces went stale after a restart (they reload on
reconnect); the daily title sat flush; `b` in arcs and `enter`/`u` in bots could never fire
from the keyboard (they now use the summoning or last-focused conversation,
`overview/working-session.ts`); single-key verbs died after summoning from the composer (all
seven panes take keyboard home). Screenshots `02`–`23` in the session scratchpad.

**Lane A7, the desktop and keyboard leftovers (M5.1 closed, M2.7 ticket, M3.1 refusals).**
`host/pending-asks.ts` tallies live asks minus their `gate.permission`, seeded from `GET /asks`,
and calls `setPendingAsks` once per frame batch on change, so the tray badge and the Windows
overlay are real; the ask toast reads `<title> · needs you · ask`. `desktop/main/
workspace-identity.ts` re-expresses keywork's identity rule (declaration above, else `.git`
root, else the folder; sha256 of `workspace:<root>` or the lowercased path, twelve hex) pinned
against identities computed by running keywork itself; `ticket.ts` calls a ticket live only
when `/doc` answers as keywork with the matching identity and `/asks` accepts the token; the
per-workspace ticket is tried first, a dead or foreign ticket never shadows a spawn, and
stopping the app's own server clears every ticket pointing at it (verified live with a killed
server). Tiler refusals carry keywork's wording ("no room for another pane · close or resize
one"), `closeFocused` says "no pane is focused · nothing to close". `chord.ts` resolves `>`
`<` and the US shifted-punctuation table to `shift+.` `shift+,` with `event.code` as the
physical fallback, so a German `:` or a Russian ctrl+л reach their chords (`chordsOfKey`).
`host/activation.ts` focuses the pane showing the toast's session, opens it if none does, and
summons memory for an inbox toast. Spill consumer: `protocol/src/spills.ts`, `client.spill`
mapping 400/404/415 to typed readings, the file pane opening `spill <id>` at
`elidedFrom..elidedTo`.

**Lane A8, M5.4 textures (landed).** `scripts/textures/ratchets.json` holds every number
with a direction and a written `why`; `scripts/check-textures.ts` (in the `check` chain) fails
on a missing, dropped or loosened ratchet (a loosening needs a rewritten `why`, the pins rule)
and measures T1 and T6 itself. T1: seventeen grapheme families through the real composer, the
caret walking one cluster, Backspace and Delete erasing one cluster, submit byte-identical
(`composer/graphemes.ts` over `Intl.Segmenter`); **finding: the browser could split a
decomposed cluster on delete**. T2: `composer/paste-vault.ts` mirrors keywork's vault, a paste
over six lines or 4096 characters lands as `[pasted #n, N lines, 5.0 MB]` and expands on
submit; **finding: the composer had no paste handling at all**. T6: `theme/contrast-audit.ts`
applies keywork's APCA floors to every pair plus a measured polarity check so a tinted dark
theme fails as light; keywork-night's smallest headroom is 3.1 Lc. T7: every pane's zero state
is `state · chord action`, one chord, ≤ 320 px at a worst-case mono advance (eight empty
states rewritten). T8: every fixture streamed one character per event at 800 events per frame,
batched equal to unbatched, the busiest frame under the reducer budget, first paint under the
element budget. `docs/textures.md` records each ratchet.

**Consolidation.** The lead fixed what the lanes left for each other: a focused needs-you
title was unreadable (specificity in `pane-frame.css`); the terminal's leader check used the
typed chord only (`chordsOfKey`); the shell's `openInEditor` dropped the refusal (it now says
it in the status line and the file pane shows it); the status line kept the old port after a
restart (`App` wraps `restartServer` to refresh the opened workspace); a `file:` link with a
line fragment fails under Windows ShellExecute, so main opens file links through
`shell.openPath` (the line is lost, honestly). **Evidence:** 89 files, 981 tests (wave 4: 633);
`bun run check` green with `KEYWORK_REPO=C:\src\keywork-lanes\next` (66 routes, 0.1.1) and in
fixture mode; no process or ticket left behind.

**Findings for keywork, from the app's side (also appended to the 118 ledger in `next`).**
- `keywork serve` refuses to start for a second workspace: it writes the user-level
  `~/.keywork/server.json` for every workspace and treats any live ticket there as this
  workspace's server (`runningServerAmong` should check `/doc`'s identity, or stop writing the
  user-level ticket). `keywork attach` has the same mix-up.
- No way to read the active preset (`GET /preset`) and no route listing models (`GET /models`);
  the app learns the preset from the first `gate.preset` and builds the model list from
  summaries and refusal lists.
- Refusals told apart only by text: `/preset` 409 for both "needs confirmed" and "no preset
  switch", `/undo` 404 for both a missing session and "nothing to undo". A `code` field would
  make the client's mapping robust.
- `costBasis` says "metered by the provider" when no turn was priced (0 === 0).
- `GET /themes` serves only `keywork-night` plus the `system` placeholder: no keywork-day, no
  user themes, so "server themes beside the gallery" has nothing to show yet.
- `/memory/ledger` discard entries carry only the staging path, not the note's name.
- The identity derivation is not on the wire before connecting; `/doc` is unauthenticated, so
  checking a token needs an authenticated route (a ping would do).
- `/prompt` and `/inject` are text-only although agentbox's `promptMessage(text, images)` exists.
- File-host undo sends `session.state` but not `session.tree`; `docs/events.md` still lists
  `engine.error` under "Tree and files".

**Left after wave 5.** Merging `app-surface/next` into keywork `main` (Jordan); mode cycling
(keywork PD12); a real save dialog for export (a `HostPort` call); a posix identity fixture;
launching the built Electron app for A5's and A7's paths (A6 drove the real renderer, A7 drove
main's modules from bun); the T8 load rising with a longer fixture; Ctrl+Z after a vaulted paste;
the conversation pane's typed text before the composer has DOM focus and one empty transcript
after a reopen (observed by A6, not reproduced); the duplicate `/mcp` and `/memory` loads at
startup; `docs/README.md` now indexes `textures.md`.

### Wave 6 ledger (2026-10-11): the wardrobe, and trust that remembers

Jordan's brief: keep pushing with quality, and "get the themes and multi-theme options in there
similar to omarchy (thoroughly themed)"; the app "looks a lot like vscode". Mid-wave: the word
is **theme**, not theme, everywhere a person sees it and in new code (keywork keeps `theme`
only as a one-release config alias). Then: pre-load read permissions on trust so a new
workspace or session does not ask for every read. Seven lanes, three in keywork.

**Lane K6, keywork: the themes (staged on `app-surface/next`).** The theme schema gained
optional, whole sections `terminal` (16 ANSI), `syntax` (15 roles), `diff` (four grounds),
`selection`, `cursor` and `pair`, each `.describe()`d, floored by APCA (syntax ≥ 30 on panel,
comment 15; chromatic terminal colours ≥ 30; selection ≥ 45; text on diff lines ≥ 60; cursor
≥ 40) with keywork's exact refusal wording; `completeTheme` derives any missing section from
the thirteen base tokens by one deterministic rule (terminal from error, success, ramp, accent
and the text rungs, bright hues 20% toward text, floors cleared in 1% OKLab steps; diff by
mixing success and error into panel at 14% and 28%; selection from accentSoft; cursor the
accent). The gallery is nineteen themes with every section filled by hand: keywork-night and
keywork-day, catppuccin mocha and latte, nord and nord-light, gruvbox dark and light,
everforest dark and light, kanagawa wave and lotus, rose-pine and dawn, flexoki dark and
light, matte-black, osaka-jade and ristretto (an original warm palette), with taste varied so
they differ in kind (nord and gruvbox `regular`, matte-black and osaka-jade `borderless`,
gaps of 1 on catppuccin, everforest, rose-pine, flexoki and matte-black, cockpit instruments on
matte-black and ristretto) and twins sharing taste so following the OS never relayouts.
Twenty-six canonical shades were stepped by the smallest OKLCh lightness change that clears a
floor, each tabled with its canonical value in `gallery.test.ts`. Rename throughout: `Theme`,
`themeSchema`, `parseTheme`, `gallery`, the TUI's bare tokens now `Palette`, config key `theme`
(`theme` read one release), overrides key `palette`, commands `theme-<name>`, route
`GET /themes` (`listThemes`, `{ themes, active, placeholders }`, every theme served complete).
`docs/themes.md` is new. NOTICE carries the eight MIT palettes; the lead verified the copyright
lines against the upstream licence files and corrected four (gruvbox publishes no copyright line
and is MIT/X11 by README; Everforest is "sainnhe"; Rosé Pine is 2023; Omarchy's holder is David
Heinemeier Hansson) and spot-checked twelve canonical grounds. Gate: 327 files, 4595 tests.

**Lane F2, the app theme engine and the `themes` pane (M2.3 finished).** `theme/` became
`theme/`: `Theme`, `parseTheme`, `completeTheme` (proven identical to keywork's on all nineteen
themes with sections stripped), `themeVariables`, `applyTheme`; the storage key `keywork.theme`
with a one-time read of the old key. Variables now cover every surface: `--kw-terminal-*`
(16), `--kw-syntax-*` (15), `--kw-diff-*`, `--kw-selection`, `--kw-selection-text`,
`--kw-cursor`, `--kw-gap`; the root carries `data-theme`, `data-appearance`, `data-chrome`,
`data-instruments`, `data-gap`. `scripts/sync-themes.ts` reads keywork's gallery from the
checkout into `theme/gallery.json` and regenerates the static `keywork-night.css`;
`check:themes` fails on drift. xterm takes all sixteen ANSI colours, cursor and selection;
CodeMirror gained real syntax highlighting (`@codemirror/language` 6.13.1, `@lezer/highlight`
1.2.5, thirteen exact-pinned language packages lazy-loaded by extension) with a `HighlightStyle`
built only from `--kw-syntax-*`; the diff's `color-mix` grounds are gone. The `themes` pane on
`leader shift+f` (palette `theme`, per-theme `theme-<name>`): swatch strips drawn from the
parsed theme, taste words, the pair, `j`/`k` previewing live per frame tick, `enter` wearing,
`escape` restoring, `s` following the OS (`theme-follow`). The wardrobe orders gallery, then
server themes (overriding by name), then `system` between a theme and its pair. T6 now measures
all nineteen themes on tokens and sections (38 ratchet rows; nord and flexoki-dark sit exactly
on the floor). Follow-ups from the captures: the mono stack leads with the bundled face and
keeps block-capable faces before `ui-monospace`; the remembered theme is worn at boot so the
open screen is dressed; the duplicate `theme-system` palette row is gone; the terminal's tiny
text was xterm measuring before the bundled font loaded, now re-measured on `fonts.ready`.

**Lane F3, chrome and typography (M3.4 finished, the design pass).** Chrome weights render
for real: `regular` boxes each pane in its ink, `seams` draws one hairline per split from each
frame's right and bottom edge with focus as the title row's underline, `borderless` draws no
line and lifts the focused ground to panel with a `▎` density mark; `gap` becomes `0.5rem` per
cell of ground with seams hidden and the seam's grab zone widened to the gap. Pane ink is the
ramp stop by spawn rank (or the arc ordinal), 30% into border at rest, 82% toward text on
focus, the bare hue for needs-you. The title row is one component (stamp, name, detail zone of
bot · inference · mode, telemetry) shedding by tier (broadsheet all, column drops inference,
clipping keeps telemetry only when focused, masthead stamp and name). Fonts bundled as
exact-pinned `@fontsource-variable/jetbrains-mono` 5.3.0 and `source-serif-4` 5.3.1 (OFL,
recorded in NOTICE); the page on a 1.5rem rhythm with serif prose at 1.0625rem and mono at
0.9375rem, headings one step up, the 70ch measure on prose only with fences full bleed, dark
themes at weight 370; a tier-variable bug fixed (`@container pane` never matched its own
element, so the broadsheet measure never applied). Status line, open screen, palette (mode
word, matched characters as density, selected row inverted), composer, first run and every
pane's cursor row and input re-expressed on the density material. Motion tokens
`--kw-tempo-quick` and `--kw-tempo-settle`, zero under reduced motion, ink only. Evidence:
Playwright `chrome.spec.ts` over five themes and three scenes at two widths (30 shots under
`artifacts/shots/windows/chrome/`), plus the running app over CDP in three themes.

**Lane V1, the built app verified (what wave 5 proved only by tests).** Every K1 control, undo
and redo, the tray badge, both toasts and their clicks, the per-workspace ticket attach, the
second-instance deep link and the file pane's `o` verified in the built Electron app against
keywork's real `serve()`, with request and main-process logs and 31 screenshots. Eight defects
fixed with tests: leader chords were dead while the composer had focus (the keymap keeps leader
chords while typing; single keys still type); a redo left the undone prompt in the composer;
typed text was dropped until the composer had DOM focus after launch, a palette jump, an
answered ask or a command (the pane keeps keyboard home, hands it to an inline ask and takes it
back; overlays return it on close); a pane bound to a never-prompted session restored to a 404
and swallowed prompts (the store marks sessions `gone`, the pane says so, a prompt starts a new
one); a swallowed exception in the open flow left the open screen silent (it now says "could
not open <path> · <reason>"); and `HostPort.saveAs` (main's save dialog, typed refusals,
preload still one object) so export offers a real save beside the clipboard.

**Lane K7, keywork: trusted reads and ask scopes (staged on `app-surface/next`).** Jordan's
decisions, recorded in keywork's 50-trust ledger: the read bundle applies automatically on
trust; it is fixed in keywork with no config option; workspace grants cover bash and MCP only,
never write or edit. A trusted workspace runs a bundle of read-only shell commands without
asking (`git status|log|diff|show|rev-parse|remote -v`, explicit read forms of `git branch`,
`ls`, `dir`, `cat`, `head`, `tail`, `wc`, `pwd`, `which`, `where`, `rg`, `grep`, `find`,
`tree`, `stat`, `file`, `echo`, `type`, version checks), with ask carve-outs for the forms that
write or run (`find -delete|-exec`, `rg --pre`, `--output`); compound commands keep every-part
judgement. `POST /asks/{callId}` takes `scope: once | session | workspace`; a rule is derived
from the call (`<program> <flag> *` or `<program> *` per part; `<server>__<tool>` for MCP;
nothing for write and edit, which answer 400 "write and edit are approved once at a time");
`gate.ask` carries the `rules` a grant would record, `gate.permission` carries `scope` and the
new origin `gate: "trusted"`. Workspace grants persist to
`~/.keywork/workspaces/<identity>/permissions.json` (private, atomic, strict); session grants
live in the server; the TUI's `always` now records the same derived session rules. Layering:
user rules decide first, then one list of bundle, workspace grants, session grants, last match
winning. `GET /permissions` lists everything; `POST /permissions/workspace/revoke` removes one.
`activePreset` ignores the bundle (posture, not user rules). Gate: 329 files, 4685 tests, 64
`/doc` paths.

**Lane A9, asks answered with scope (M3.5 finished).** `protocol/src/permissions.ts` mirrors
K7 (`PermissionRule`, `AskScope`, the two refusals, `PermissionsView`, the two routes);
`gate.ask` carries `rules`, `gate.permission` carries `scope` and the `trusted` origin. The
client's `answerAsk(callId, verdict, scope?)` maps the two 400s by the server's words to
`write-once` and `nothing-to-remember`; `permissions()` and `revokeWorkspaceGrant(rule)` are
typed. Fixture `grants` recorded from `next` in a trusted temp workspace: a session grant, the
same command running with no ask, a workspace grant, a write refused beyond once, a redirect
with nothing to remember, and `git status` under `gate: "trusted"`; `doc.json` at 64 paths.
The ask card, extracted to `page/ask-card.tsx`: `y` once, `n` deny, `s` session, `w` workspace,
the last two offered only with non-empty `rules` and never for write or edit; the derived rules
shown in keywork's glob form before the pick, with "this would allow every <program> command"
on a blanket rule; both refusals in the server's words with the card left pending; the card
never steals focus from a text field holding a draft. Settled rows read `done · trusted`,
`done · session grant` or `done · workspace grant`, never as needs-you. The `permissions` pane
on `leader shift+p`: the bundle with its trust word, workspace grants with `x` revoke behind a
one-line confirm, session grants grouped by session, refetched on any scoped
`gate.permission`, after revoke and on reconnect. Verified over real HTTP + SSE: `git status`
ran under `trusted`, the first `mkdir` asked with its rule, the second ran without asking.

**Consolidation.** The lead verified the NOTICE copyright lines upstream (above), removed a
dead global ticket a dev run left at port 49276, restored `rules` on asks rebuilt from
`GET /asks` after a reopen (the card had offered only once and deny), and pinned nothing else:
every other cross-lane finding was closed by its lane. **Evidence:** 102 files, 1188 tests
(wave 5: 981); `bun run check` green with `KEYWORK_REPO=C:\src\keywork-lanes\next` (68
routes, 0.1.1, 19 themes) and in fixture mode; keywork `next` staged with lint and prose
clean; no process or ticket left behind.

**Findings for keywork, from the app's side (wave 6).**
- `GET /sessions/{id}/context` estimates from the conversation text and ignores reported
  usage: after a turn reporting 52 000 input tokens it answered `used: 16, basis: estimated`.
- `GET /sessions/{id}/cost` forgets turns made before a server restart (the usage ledger lives
  in memory).
- A compaction summary comes back from `GET /sessions/{id}` as a plain `role: "user"` message
  with no marker.
- A session created by `POST /sessions` but never prompted is gone after a restart; its 404
  is indistinguishable from a deleted session.
- `GET /asks` entries carry no `rule` origin, so a restored card cannot word its reason.
- Session and workspace grants fire no `surface.changed`, and session grants have no revoke
  route; in the TUI a call covered by a session rule still emits `gate.ask`.
- `keywork serve` still writes the user-level ticket and refuses a second workspace (wave 5).
- `/themes` serves the gallery; keywork has no source of user theme files yet, so the closet
  is empty under serve.

**Decisions for Jordan.** Merge `app-surface/next` (K2 to K7 together, 329 files, 4685 tests).
K7's reversible choices: the bundle is a constant, `git branch` narrowed to read forms, ask
carve-outs inside the bundle, `activePreset` ignoring the bundle, user rules deciding before
the bundle and grants, derived rules keeping a flag (`rm -rf *`), the line REPL sharing the
posture. K6's: `ristretto` as an original palette, `tokyo-night-storm` skipped, the overrides
config key renamed to `palette`.

**Left after wave 6.** Mode cycling (keywork PD12); the arc slug tag in the title row (no
`arc` adornment yet) and a `textFaint` token for the broadsheet ladder; the ASCII fallback for
`▎`; one-mover arbitration in the motion grammar; the status line's usage reading the local
projection after compact, undo or reopen; `/open` falling back to a nonexistent README; a
Playwright scenario for the themes pane and the permissions pane; screenshots of the new ask
card; a posix identity fixture; re-running the built-app checks against `next` once it settles
(V1 ran against an exported index mid-rename); the keywork findings above.

**The merge with keywork main, and the app realigned (2026-10-11, after the ledger above).**
Jordan's keywork `main` landed its own shape of the app-surface lane the same day (session
trash and restore, K2 tree and diff, serve parity, multi-host memory; different operation
ids), and PR #7 (`app-surface/next` → `main`) conflicted in 34 files with 152 auto-merged.
Resolution rule: main's architecture wins wherever both sides built the same ground; the PR
contributes only the themes (K6) and trusted reads with ask scopes (K7), re-applied in main's
shape (`listThemes` in `listFlavors`'s slot, the permissions family last, config `theme` with
`flavor` read one release); the PR's duplicate modules were dropped, including the separate
spill route since main serves spills through `/files`. Five end-to-end goldens changed by one
line each (the write ask row no longer offers `always`). Resolved and staged in the `next`
worktree for Jordan's commit; keywork's gate 346 files, 4797 tests, 49 of 49 scenarios.
The app then moved onto main's wire (lane A10): every renamed id mapped one to one in
`client/src/operations.ts` with a test holding the map to the server's ids; shapes re-read
against the server's own typed client (the changes reading lost `trusted`, airlock digests
flattened, `bindSessionBot` takes `name`, `applyPreset` answers 409 and 501, memory layers
no longer carry counts so the app counts from `/memory/notes`, `memory.inbox` and
`session.tree` payloads reshaped, `session.state` carries `arc` and `bot`); **a real bug
found: `setMcpServerEnabled` sent `{ enabled }` where the server reads `{ on }`**; the three
lifecycle events and the trash routes added (`protocol/src/lifecycle.ts`, `DELETE` joins the
methods); the tree pane gained `x` to trash a session behind a confirm, a collapsed trash
section on `shift+x` with `enter` restoring and `d` discarding, and a pane bound to a trashed
session offers restore in keywork's words. The spill viewer is withdrawn: the spill file sits
outside the tool jail and no route names it. All 34 fixtures re-recorded from the merged tree
with `doc.json` rebuilt from scratch (66 paths, 72 operations, 25 event types) plus a `trash`
scenario; one ratchet loosened honestly (`T8.reducerStepsPerFrame` 14 → 15, main sends
`session.state` on every prompt). **Evidence:** 104 files, 1198 tests; `bun run check` green
against `next` and in fixture mode at 72 routes. Keywork findings added: spills unreachable
over the wire; `POST /redo` answers 404 right after an undo announced `redoable: true`;
`gate.preset` arrives per session while `events.md` calls it process-level; memory layers
carry no counts and inbox items lose their bot; `GET /memory/notes/{name}` ignores `?layer`;
per-model cost rows include zero-turn models. Left: a `purgeTrash` UI, the spill viewer
pending a route, built-app verification of the trash flow.

**The live round, and what it fixed (2026-10-12).** The built app was driven as a user drives
it against a mock `keywork serve` from the merged tree in a clean sandbox home: trust by chord,
the read bundle applied without asks, a redirect inside a bundled program still asked, bash
asks with `s`/`w` scopes landing in the workspace file and lifting on revoke from the
permissions pane, write asks offering once and deny only, the themes pane, trash and restore,
and a restart that kept the theme, the trust and the layout. Seven defects came out and three
lanes closed them. **A11 (app):** the themes pane opened with its cursor on the last, offscreen
row when "system" was worn (the system choice now leads the list and the cursor opens on the
theme being worn); list cursors now scroll into view (`keepInView` in `overview/rows.tsx`);
the ask card claims focus from a composer that holds no draft, and `alt+s` / `alt+w` answer for
the session or the workspace from anywhere, so the card and the permissions hint name chords
that work; every trash line names the session as its row did, captured before the store
forgets it; tool rows subtract the time spent waiting for the person and say `· waited 4.3s`
instead; the title row and the status line read one `telemetry()` so the two token counts
agree, and a count built only from streamed turns says `live turns only`. **K8 (keywork +
app):** two original themes, `whiplash` (dark, borderless: cold black, chrome greys, white-hot
focus, ice cyan accent, red-magenta error) and `whiplash-flash` (its light pair), every section
written by hand, floors cleared with margins of 4.8 and 14.6, gallery now 21, synced and
ratcheted in the app. **K9 (keywork):** derived ask rules no longer hand out open-ended
destructive grants: `rm`, `rmdir`, `del`, `Remove-Item` and `git branch -D` remember only the
exact command, force pushes, `reset --hard`, `clean` and `checkout --` remember nothing, git
global options are skipped before the subcommand, and a remembered wildcard can never cover a
destructive variant (`git push *` no longer matches `git push --force`). **Evidence:** every
fix re-verified in the rebuilt app; app rail 105 files, 1214 tests, `check:themes` 21;
keywork 346 files, 4828 tests. The outline of waves 7 to 11 follows M5.

### Wave 6.5 ledger (2026-10-12): outfits, themes per arc and per pane

Jordan's brief: themes per arc, shared by every pane in the arc that is not an admin pane, a
quick command to put a theme on a set of work panes, several themes on screen at once moving
freely with the panes, "the thing that is eye-catching". Five lanes on Opus: the engine (T1)
and the themes pane (T2) in parallel against a contract the lead wrote first, then the shell
integration (T3) and docs plus the gallery stage (T4) in parallel, then one polish lane (T5)
from the live round. The vocabulary stays: the word is **theme**, the verb is **wear**; the
window wears the **house** theme; "attire" and "outfit" are code names a person never reads.

**The model (`theme/attire.ts`).** A pane's outfit resolves in one order: its own choice, else
its arc's choice, else the house. `PaneDefinition.attire` is `"house"` for the admin panes
(tree, arcs, bots, mcp, memory, workspaces, themes, permissions) and `"work"` for conversation,
diff, terminal, file and browser; a house pane can never be dressed and says so. A dressed
pane takes its theme whole (tokens, ramp, density, terminal, syntax, diff, selection, cursor,
appearance, chrome weight, instruments); `gap` stays the house's because it lies between
panes. Choices persist per workspace under `keywork.attire:<workspace>` as
`{ version: 1, arcs, panes }`, never in the keywork config and never on the server: a theme
per arc is presentation state of one window, like the layout. A stored name that no longer
resolves falls through to the next rung silently while the themes pane still shows it with its
refusal. One preview at a time, honoured at its own rung, so a pane's own choice still wins
over an arc preview. `system` is a window-only choice (`system is a choice for the window ·
pick a theme by name`).

**Dressing (`theme/variables.ts`, `chrome/`).** `dressElement` sets the variables and
`data-theme`, `data-appearance`, `data-chrome`, `data-instruments` and `color-scheme` on a
pane's frame; `undressElement` removes exactly that. `PaneFrame` takes `outfit` and `marked`,
carries `data-attire="pane"|"arc"` when dressed, and the title row shows the worn theme's
name (`kw-frame-theme`, broadsheet and column tiers) and a mark glyph for marked panes. The
prose weight moved to a `--kw-prose-weight` variable set per `data-appearance` so the nearest
dressed ancestor wins without a specificity race; xterm's `watchTheme` watches the nearest
`.kw-frame` as well as the root, so a dressed terminal retints; CodeMirror and `::selection`
inherit through `var()`. The gauge in a dressed title row follows the outfit's instruments.

**The themes pane dresses a target (`panes/themes/targets.ts`, `dresser.ts`).** The spec
carries the target: the window (`leader shift+f`, `theme`), the pane it was summoned from
(`leader w`, `theme-pane`), that pane's arc (`leader shift+w`, `theme-arc`), or the marked
panes (`theme-marked`). `t` cycles window → this pane → its arc → marked, skipping what does
not apply, rebinding the spec so it survives a restart; `j`/`k` preview on the target per frame
tick; `enter` wears (`remembered`; the window keeps `remembered for the next launch`); `x` or
`backspace` makes the target inherit again (`theme-inherit`); `s` follows the OS on the window
only. Rows mark a target's own theme `█` and its inherited theme `·`. A variant with nothing to
dress opens on the window with a one-time notice (`this pane is in no arc · the arcs pane binds
one`). `PaneSummonVariant` can now carry chords, and `tiler.summon` rebinds an open docked
pane whose kind has variants, so `leader w` retargets a themes pane that is already open
instead of only focusing it.

**Marks (`shell/marks.ts`, `keys/actions.ts`).** `leader b` marks or unmarks the focused pane
(`mark`; `unmark-all` from the palette); a mark drops when its pane closes; marking a house
pane is refused with `pane "x" always wears the window's theme`. The notice counts the set:
`marked · 2 panes carry the mark · theme-marked dresses them`.

**Docs and the gallery.** AD6 gained "The house and the outfits"; `docs/README.md` names the
house and the per-arc and per-pane themes; `stage--outfits` in the screenshot rail shows
whiplash, rose-pine-dawn and the house keywork-night in one window
(`artifacts/shots/windows/themes/stage--outfits.png`). A server-held arc theme, so other
clients could share it, is a later server-lane task (S15 below), not this wave.

**Live round and polish (T5).** Driven over CDP in the built app: `leader w` retargeted an
open themes pane and dressed one conversation everforest-dark inside a gruvbox window; the
window moved to catppuccin-mocha with the pane keeping its own; two marked panes took
whiplash from `theme-marked`. Found and fixed: the themes head clipped without an ellipsis, a
mixed marked set read as wearing nothing, the cursor row at the list's bottom sat half under
the edge, and the mark glyph collided with a bot sigil. The mark is now `▣` (no stamp, voice glyph, fold glyph, focus mark or sigil uses it; JetBrains Mono carries no box glyphs, so it draws from Cascadia Code like `█` does), the themes head ends in an ellipsis and drops its hint under 560px, `markedChoices` sorts a marked set into shared, mixed or none (`esc` on a mixed set says `kept what each pane wears`), and `keepInView` re-scrolls when the list resizes under a notice.

Gate: app 107 files, 1271 tests; `bun run check` green at 21 themes and 72 routes. Left for later: no palette entries derived from marks; `theme-<name>` stays
window-scoped by design; a server-held arc theme (S15).

### Wave 7 ledger (2026-10-15)

**Open loops (N5).** The trash empties: `shift+d` in the sessions pane (`empty-trash`, the
trash's `d` made plural) rereads and shows the trash, then asks in the grammar remove and
discard already speak, `empty the trash? 2 sessions go for good, there is no undo`, and
answers from the server's own count (`DELETE /trash`, `purgeTrash`, already in the client and
the `trash` fixture): `deleted 2 sessions for good · the trash is empty`, or `the trash is
already empty` with no ask when nothing is there. The shown trash's head teaches the chord
(`trash · 2 sessions · shift+d empties it`); the empty section keeps `the trash is empty · x
sends a session here`. The title row tags the arc at broadsheet only, as keywork's TUI does:
`#pricing-v2` right after the name through a new `arc` adornment, the words on `textDim` and
the `#` and hyphens a rung below (`chrome/slug.ts`, keywork's slug grammar shifted one rung for
chrome). The bot adornment became `{ sigil, name }` (`titleBot`), so the sigil is its own glyph
span inked with its name; stamp, mark, name, detail, theme and telemetry keep their rhythm at
every tier. `textFaint` is derived in the app (`derivedTextFaint` in `theme/complete.ts`,
`--kw-text-faint` in `themeVariables` and the regenerated `keywork-night.css`): half way from
`textDim` to the ground, raised back toward `textDim` in 1% OKLab steps until it clears Lc 15,
the floor the dim rung is held to. All 21 themes resolve it strictly quieter than `textDim` with
the same polarity; light themes land near Lc 30, dark ones on the floor, so the fourth rung is a
whisper where a theme left no room. It is worn only where the design language reserves it, at
broadsheet: the arc tag's marks and the detail zone's `·` joints, pinned by a test over
`pane-frame.css`. `/open` with nothing the agent touched now opens the workspace root, and the
file pane resolves any path that `/files` calls missing but `/tree` lists as a folder: its
README (markdown first, then bare, `.txt`, `.rst`, `.adoc`, `.org`, any case) by rebinding the
pane, else `the workspace has no README · leader f browses the files` instead of the old
`no file at README.md`; the root titles itself `workspace`. The posix identity fixture pins the
three anchors under `/srv/fx`, case kept on Linux and macOS, dot segments and trailing slashes
resolved, tickets at `/home/me/.keywork/workspaces/<identity>/server.json`; its identities are
coreutils `sha256sum` over the subject keywork's rule forms (`resolve`, no case fold off
Windows), a method that reproduces the Windows identities keywork itself computed (keywork's
`canonicalPath` resolves with the host's own `path`, so it cannot be run for posix here). Mode
cycling stays out: keywork still has no mode route and PD12 is still a spec (`docs/modes.md`),
so it waits on keywork. **For the server lane:** `textFaint` belongs in keywork's theme schema
as the optional broadsheet token the design language reserves (C49), derived by keywork's
`completeTheme` with this rule when a theme omits it, so the TUI's broadsheet ladder and the
app agree; until then the app derives it outside `completeTheme`, which keeps the proof of
identity with keywork's completion intact. **Evidence:** 110 files, 1345 tests (from 108 and
1295); types, pins, guardrails, colors (135 files), themes (21), textures and lint green with
`KEYWORK_REPO=C:\src\keywork`; `check:contract` green in fixture mode (74 routes) and, against
keywork `main`, reporting only `child.started` and `child.finished` (another lane) and keywork's
new `0.2.0` against the app's `0.1.1` pin (`615cc5c`, the release's); the frame snapshots
updated on purpose (the focused frame now carries `#pricing-v2` and `◆ reviewer`); the wide
chrome shots re-taken and read in keywork-night and keywork-day. Left: the sigil alone at the
clipping tier, as keywork's TUI keeps it (the app still sheds the bot there); `/open <path>`
with an argument, which the palette cannot pass yet; `check:themes` without a keywork checkout
compares the 21-theme gallery to the two-theme `scripts/themes/house.json` and fails whatever
changes, so a worktree must set `KEYWORK_REPO`.

**Quiet mode (N11).** A per-session "let it run" posture on the K7 session scope, built as
the posture keywork's grant model can carry today. The server records a session grant only
when a person answers an ask with `scope: "session"`; no route sets a per-session policy or
records a grant ahead of its ask, so an app that answered asks by itself would be sending
`gate: "user"` verdicts no person gave, which is the app loosening policy (AD8 now says so).
Quiet therefore changes which scope the approve key sends, never whether a person answers.
In a quiet session `ctrl+y` (and `y` on the card) answers `session` whenever the ask's
`rules` name something to remember, so each kind of call asks once and then runs for the
rest of the session under the server's own grant. Approve stays `once` for everything keywork
approves one at a time (write and edit, K9's remember-nothing forms, a call with no rule)
and for three cases the app keeps strict on its own: an exact-command rule (keywork derives
one only for deletes and `git branch -D`), a blanket rule (`<program> *`, or a code runner
with a flag), and a form the trusted reads ask about; the card says which in one dim line
(`quiet · a destructive command is never the quiet default`). The card leads with
`this session ctrl+y` and moves once to the new hot-path `alt+o` (`ask.once`, palette
`approve-once`, `o` on the card); `alt+s`, `alt+w` and `ctrl+n` mean what they did. One
`askChoiceFor(pick, run, quiet)` resolves the five picks for the card and the global chords
alike, and `ActionTarget.answerAsk(pick)` replaces `approveAsk` and `denyAsk`.
`leader shift+s` (`session.quiet`, palette `quiet`, alias `let-it-run`, listed in the keys
overlay) toggles the focused conversation's session and says
`quiet · ctrl+y now grants an ask for the rest of this session · ctrl+k shift+s ends it`, or
`no session is focused · quiet is kept per session`. The title row carries `»` after the
stamp and ahead of the `▣` mark at every width tier, in `--kw-density-full`, labelled
`quiet`: no stamp, voice glyph, focus mark, pane mark, theme row, fold or sample sigil uses
it, and being Latin-1 it draws from the bundled JetBrains Mono on every platform. Leaving
quiet revokes nothing: the same chord reads `GET /permissions` and offers the revoke
(`quiet off · 2 session grants still hold · ctrl+k shift+p revokes them`, or
`quiet off · ctrl+y answers once again` when none were left). The permissions pane now
revokes session grants: one cursor walks the workspace grants and then each session's, `x`
confirms `revoke mkdir -p * for Build and stage` and posts `revokeSessionGrant`, and a quiet
session's group reads `» quiet`. The posture is `shell.quiet` (`shell/quiet.ts`: `has`,
`toggle`, `all`), held by the window and never stored, so a restart opens every session
listening again; asks stay where they were, waiting in each session's projection, so the
needs-you queue reads a quiet session's asks like any other. The stronger posture, a gate
that grants what the session scope covers with no person at the keyboard, is server-lane
task S16. Tests: `shell/quiet.test.ts` (the set, both notices, the grant count and its
failure), the card in a quiet session (labels, the chord beside the rules, every key, the
four exemptions with their lines, `askChoiceFor` as a table), the mark's glyph and place at
every tier, the chords, the pane's session revoke and quiet tag, the client's session
revoke route, and five shell flows (approve for the session, once from anywhere, a delete
held to once, quiet off then revoke through the pane, no focused session). Gate: app 109
files, 1332 tests (from 1295); `bun run check` green except `check:contract` against
keywork `main`, which reports `child.started` and `child.finished` (another lane) and the
server's 0.2.0 against the 0.1.1 pin (N2); `check:contract -- --source fixture` is green at
74 routes.

**Concept lane.** Jordan's brief: "a creativity lane for research", with prototypes we can see.
`docs/research/field-scan-2026-10.md` scans what Claude Code's desktop app, the Codex app,
Cursor 3's Agents Window, Zed's agent panel, OpenCode v2's TUI and desktop, Pi, Warp, Conductor,
Superset, Vibe Kanban and VS Code's Agent Sessions do that the app does not (observed behaviour
only; nothing adapted, `NOTICE` untouched, Crush not consulted), names what the app has that none
of them do, and ranks ten ideas by how likely each is to make the app the daily surface:
(1) **the desk**, every session grouped needs you, working, back and quiet, its ask answered in
place with the card's own keys; (2) **asks that show their consequence**, the merge view, the
typeset command or the argument table above the card's answers; (3) **the context map**, one
square per percent of the window with ink area for the parts and fences at the flush and
compaction lines; (4) **the turn ledger**; (5) **the review stream with talk-back** (W9.1 and
W9.2, comments batched); (6) **terminal blocks to the agent**; (7) **the follow cam**;
(8) **isolated sessions** in keywork-owned worktrees that bring work back uncommitted; (9) **the
side question**; (10) **workspace houses**. Twelve field patterns are rejected with the decision
each would break (cloud agents, commits and pull requests from review, the embedded editor,
loosening the gate from the client, a best-of-N judge, voice, an agent-driven browser, scheduled
automations, driving other agents, kanban, vendor ratings, subscription sign-in), and six server
asks are proposed under provisional numbers S17 to S22 (desk rows, ask previews from the tool's
own dry run, context parts, restore to a turn, isolated sessions, asides). The top three are
prototyped as dev-only modules in `ui/src/dev/concepts/` (no registry entry, no chord, no
protocol or client change, never imported by the app) built from the real `PaneFrame`,
`AskCard`, `mountMergeView`, `ContextGauge`, overview head and density tokens over fixture data,
staged in the chrome gallery as `concept-desk`, `concept-asks` and `concept-context`, and
rendered by a new `chrome.spec.ts` test to `artifacts/shots/windows/concepts/stage--desk.png`,
`stage--asks.png` and `stage--context.png`. The context map first drew glyph cells and read as a
bar chart; ink area reads as a quantity, so density in pixels is area. One product defect
surfaced: the merge view's collapsed-lines bar painted CodeMirror's own `#f3f3f3` gradient
because `mergeTheme` set `backgroundColor`; it now sets `background` to `--kw-panel-lift`. Gate:
app 112 files, 1328 tests; `bun run check` green with `KEYWORK_REPO` at the keywork checkout for
`check:themes` (21 themes; a lane worktree has no `../keywork`) and in fixture mode for
`check:contract` (74 routes). Against keywork `main` the contract reports `child.started` and
`child.finished`, another lane's, and the server's `0.2.0` against the pinned `0.1.1`.

**Children lane.** keywork 120 gave the engine `delegate`: a child session starts under the
current one, runs one turn under the parent's gate and answers as the call's result. The app
shows the child in both places Jordan picked. The protocol mirrors `child.started { callId,
sessionId?, title, bot? }` and `child.finished { callId, sessionId?, outcome, usage, costNanos?,
refused? }` as engine events (nineteen now) in `protocol/children.ts`, beside `childProvenanceOf`
for the `↳ child <id> · <bot> · <outcome>` first line of a `delegate` result, the only way a
replayed transcript names its child. `doc.json` is regenerated from keywork's own
`openApiDocument` (the two event names, `x-keywork-contract`, three reworded summaries), the
events mirror is keywork's `docs/events.md` again, and a recorded fixture `delegated` (a project
bot `researcher` with sigil `◇`, one child, the parent's detail, the child read by id, the list)
drives the tests. The projection marks a `delegate` run with a `ChildMark` (title from the
arguments until the server names it, id, bot, outcome, usage, cost, refused calls), settles it
from the provenance line live and on replay with the answer rather than the provenance as its
detail, and leaves a call refused before any child existed a plain failure with its reason. The
transcript row reads `child "audit the trust rules" · ◇ researcher · 1.0s · 17 tokens ·
completed ·· ↵ open`; a running row carries the child's latest step from `tool.output`, refused
calls and cost sit with the facts the way `waited` does, the state is the only coloured word,
`enter` or a click opens the child through `shell.sessions.openSession`, and the stamp still
folds the answer. The session store keeps a lineage ledger (`client/projection/lineage.ts`) fed
by child events on any session's bus and by every transcript it loads, keeps the summary of a
session read by id that `GET /sessions` never lists (`unlisted`, so a child's pane wears its
title and bot), and rereads an open child on its parent's activity lines and when it finishes;
`reload` now rereads after an in-flight load instead of skipping. While a child works, its
pane's composer holds the draft (`hold`) and says `this child is still working for its parent ·
it takes prompts once it finishes`, because `serve` would otherwise adopt the child's file as a
second writer. In the tree, `panes/tree/rows.ts` nests children under their parent as `└ title ·
state · ◇ bot` rows with the keys of any session row (`enter`, `l`, `x`, click, `›`); a parent
folds and unfolds with the entry tree's own `h` and `l` (`h` on a child goes up to its parent
first) and reads `▸ 2 children` folded; a child the server lists on its own nests under a listed
parent rather than twice, and one whose parent is trashed or not loaded lists flat with
`↳ child of x · trashed` or `· not loaded`. No chord, palette command or action id was added;
the tree's root lost its focus outline as the other panes' did. `stage--children` in the chrome
gallery puts the tree beside the parent's transcript. What the server does not expose: lineage
reaches a client only through the parent (the two events, live and never replayed, and the
provenance line in the stored result); `GET /sessions/{child}` names no parent, and there is no
`spawnedBy`, no `GET /sessions/{id}/children` and no child bus on `/events` (keywork 120's S6
and S9), so after a restart the tree learns a parent's children only as the parent is opened;
`serve` adopting a running child on prompt is S5's to close. Gate: app 112 files, 1337 tests;
`bun run check` green with `KEYWORK_REPO=C:\src\keywork` but for `check:contract`, whose only
disagreement is keywork `main`'s bump to 0.2.0 (615cc5c, landed during the lane) against the
pinned `protocolVersion` 0.1.1, the release lane's call; routes (74) and events (27) agree.
`T8.firstPaintElements` moved 185 → 207 with a rewritten `why`, the delegated fixture having
joined the sum.

**Needs-you queue (N9).** One ordered list of everything waiting on the person, held per
window and keyed by workspace: `shell/needs-you.ts` the model and its words,
`needs-you-ledger.ts` the folds from the wire, `needs-you-queue.ts` the reactive queue,
`needs-you-jumps.ts` the walk. It grew from the wave-5 seed rather than beside it: the inbox
rising edge and both toasts moved in, and `host/pending-asks.ts` is gone because its tally is
now the queue. **The ordering rule:** urgency first, by kind (a permission ask, then an
airlock delivery, then a memory inbox item, then a failed turn); then age, the longest
waiting first so nothing starves; then workspace and key, so the order never depends on
arrival. An item with no timestamp sorts as the oldest of its kind. **Sources:** asks from
`gate.ask` and `gate.permission`, seeded by `GET /asks` and reconciled on reconnect (an ask
the server no longer holds drops, one that arrived meanwhile stays); a failed turn is an
`engine.error` in a session not known to be between turns, cleared by its next
`turn.started` or the trash, keyed per error so dismissing one never hides the next; inbox
items and airlock digests from the memory garden, which the queue reads once at attach when
no pane has. A batch carrying none of those seven events returns the same ledger, so
streaming costs the queue nothing. **The strip** (`chrome/needs-you-strip.tsx`) sits above
the status line only while something waits and is never focusable (`role="status"`, no
control): `█ 3 need you · ask: rm -rf dist (refactor-permissions)   ctrl+k n`. Its stamp is
the frame's own needs-you `█`, not the mockup's `▲`, so the strip and the pane frames speak
one glyph. While the pane is open the strip collapses to `█ 3 need you`, the pane being the
detail; `needs-you-strip` in the palette hides or shows it, remembered under
`keywork.needs-you-strip` the way attire is. **The chords:** `leader n` (`needs-you-next`)
focuses the pane that answers the next item (the session's conversation, opening one if no
pane shows it; memory for inbox and airlock items) and that pane reveals it: the ask card
scrolled into view and handed the keys, the latest failure scrolled to, the memory cursor on
the inbox row or the airlock's first undecided entry. Pressed again while focus rests where
it landed, it walks on to the following item; once that item is answered it starts again
from the new head. `leader shift+n` (`needs-you-back`) returns to the pane the person left,
skipping panes closed since, and each further press steps one jump further back through a
return stack of eight. `leader q` (`needs-you`, alias `waiting`) summons **the needs-you
pane** (`panes/needs-you/`, docked right, house attire): one row per item with urgency as
density (`█` ask, `▓` airlock, `▒` inbox, `▛` failed), its gloss, where it is answered and
its age; `j`/`k` move, `enter` or a click jumps, `d` dismisses anything but an ask (`an ask
is answered, never dismissed · enter goes to its card`), workspace headings appear only when
more than one workspace waits, and the frame wears needs-you while anything does. A toast
click is a jump too, so `leader shift+n` walks back from it. **Main stays thin:**
`HostPort.setPendingAsks` became `setNeedsYou` (channel `host:set-needs-you`); the tray badge
is the queue's length (`keywork · 3 need you`, per workspace in the tray menu); the toast
rules are unchanged, an ask arriving live toasts only while the window is unfocused and the
memory inbox keeps keywork's rising edge at three, now counted from the queue. Dismissals
live for the window's life; the server is never told. Multi-workspace is in the shape (keys,
grouping, `switchWorkspace` for a foreign item) and proven with one workspace, since N8 is
not built. The gallery gained `stage--needs-you` and `stage--needs-you-pane`
(`artifacts/shots/windows/themes/`), captured in keywork-night, keywork-day and whiplash.
Gate: 114 files, 1390 tests (base 108, 1295); `bun run check` green except
`check:contract` against keywork `main`, which reports the server at 0.2.0 against the
pinned 0.1.1 and the `child.started`/`child.finished` events another lane owns.
Jordan decided on 2026-10-15 that the desk (the concept lane's idea 1) absorbs the queue in a
later lane: the needs-you pane becomes the desk's needs-you group, the strip and the chords
unchanged.

**What the server would need for the queue to be complete.**
- A failed turn exists only on the live stream: `GET /sessions` carries no last-turn
  outcome, so a failure before the window attached, or across a restart, is not in the
  queue; and `engine.error` does not say whether a turn failed or a listener or the settling
  did, so the app infers it from turn boundaries.
- Airlock digests carry no time they started waiting (candidate and question `created` are
  optional) and no event announces one; the queue falls back to first sight and only sees a
  new digest when a `memory.inbox` tally change refetches the garden.
- The inbox is read through the whole garden on every tally change: `memory.inbox` carries
  counts, not items.
- Another workspace's queue is out of reach from this window: each server knows its own, so
  a cross-workspace list needs main to relay queues between windows (N8 with S10).

**Trust onboarding.** Jordan's brief: an auto-mode onboarding "like Claude Code has but
better", a guided first run into trust "and then only adjusting when contextual / things are
different from the scenario it was built for". Trusting a workspace now opens the `trust setup`
house pane (kind `posture`, `leader shift+u`, palette `trust-setup`, `j`/`k` move, `y` accepts,
`n` declines, `a` accepts every offer not declined), which reads only what the server serves
and proposes a posture in keywork's grant grammar, each offer with its reason: the trusted
reads as a fact (`trusted reads · 40 commands without an ask · fixed in keywork`, from
`GET /permissions`), the workspace grants already recorded, the offers, and what still asks.
Command families are offered at workspace scope from the manifests `GET /tree?path=` lists at
the root and the scripts `GET /files?path=package.json` returns, through one table in
`posture/toolchains.ts`, each written as the rule an answered ask would derive: `bun install *`
from `bun.lock` (pnpm, yarn and npm by their lockfiles, npm with none), `<pm> run *` naming
every script it would cover, `npm|pnpm|yarn test *` for a `test` script but never `bun test`,
which is bun's own runner, `cargo build|test|check|fmt|clippy *`, `go build|test|vet|fmt *`,
`deno test|fmt|lint|task *`, `uv run|sync *`, `poetry run|install *`. Each enabled MCP server
from `GET /mcp` is offered whole for one session at a time (`mcp playwright__*` · `mcp server
playwright · connected · 12 tools`). Still asks: `write and edit · approved once at a time,
never remembered`; K9's destructive forms as `docs/events.md` states them, mirrored in the
protocol as `exactOnlyCommands` and `unrememberedCommands`; the bundle's ask carve-outs from
`GET /permissions`; `any other command or mcp tool · asks until a rule covers it`. A fact the
server would not give is named in its words (`could not read the mcp servers · …`), never
guessed; the app reads no file of its own. Nothing is granted silently, and here the brief met
the wire: keywork records a grant through one door, `POST /asks/{callId}` with a scope, and no
route records a rule ahead of a call. So an accepted rule waits in the app's storage for its
first ask, and the ask card names it then (`accepted in trust setup · alt+w records it for the
workspace`, or `alt+s … for this session` on a tool of an accepted MCP server); the person's
key records it through the route an answered ask uses, and a workspace rule leaves the wait
once `GET /permissions` lists it. A decline changes nothing. The app never answers an ask by
itself: that would be the app-held allowlist AD8 refuses, and with the TUI attached it would
answer the terminal's asks too; AD8 says so now, and an accepted rule answering its own first
ask is Jordan's call, not a lane's. **Closed by S23** (2026-10-16): keywork's contract 1.2 records
a rule ahead of its ask, so the setup now grants each acceptance the moment it is made and only an
MCP offer accepted with no session focused waits for its first ask; see **Asks with their
consequence** below. **Jordan's decision (2026-10-16):** an MCP server is offered whole, and
keywork's S23 grows to accept `mcp <server>__*` at session scope (being built in keywork now),
so the setup keeps one row per server rather than offering a server's tools one by one; until
keywork takes it, the grant route declines the whole-server rule ahead and the offer stays
undecided. **The fingerprint rule:** a posture is remembered with the
facts it was built from (the manifests seen at the root, the enabled MCP servers, the bots,
the keywork version) under `keywork.posture:<workspace>` as `{ version: 1, settled, noticed,
accepted }`, never on the server, and a review settles once every offer it shows is decided.
A later launch of a trusted workspace shows nothing unless the fingerprint differs from the
settled one; then one quiet notice names the difference (`new mcp server: playwright ·
trust-setup proposes 1 rule`), said once per fingerprint, and `trust-setup` reopens scoped to
the new facts alone (`new since the last setup · new mcp server: playwright`). A difference
that proposes nothing (a new bot, a new keywork version, a server gone) settles silently; a
fact that could not be read is carried from the settled fingerprint, so a failed read never
reads as change; a workspace trusted before the setup existed hears once `no trust setup for
this workspace yet · trust-setup proposes 3 rules`. With nothing new, `trust-setup` reviews
the whole posture with the decisions so far. **Server-lane asks:** S23 (below) is the one that
makes acceptance immediate: `POST /permissions/workspace/grant` and
`POST /permissions/session/{sessionId}/grant` (`grantWorkspaceRule`, `grantSessionRule`), body
`{ rule }` exactly as the revoke routes take it, `200 { granted: rule }`, `400` on a malformed
rule, `409` in keywork's words for anything an answered ask could never record (a `write`,
`edit` or `*` action, a wildcard over a destructive form, an untrusted workspace), persisted
where a `scope: "workspace"` answer persists and firing `surface.changed { kind:
"permissions" }`, which also closes S14's "surface.changed on grants". With it the setup
records each acceptance as it is made and the card's line retires; MCP offers stay a per-session
line on the card, since a setup runs before the session exists. S24: `GET /workspace/toolchain`
(`{ manifests: [{ path, kind }], families: [{ rule, reason }] }`) so detection lives in
keywork, sees nested packages and monorepo workspaces, speaks the grant grammar and filters K9
itself, and `GET /permissions` serving the destructive forms, so the app stops mirroring prose
`check:contract` cannot hold; until then the table reads root manifests only. Evidence:
`posture/` (facts, toolchains, proposal, fingerprint, record, trust-setup) and `panes/posture/`
with tests beside each, the ask card's accepted line, and `shell/trust-arrival.test.tsx`
driving the app: trusting by chord opens the setup focused and `a` settles it with no write
but the trust itself; a later launch with a new MCP server says the notice once and is quiet
the next time; `leader shift+u` opens scoped to the difference; an unchanged launch shows
nothing. Gate: app 115 files, 1430 tests; `bun run check` green but `check:contract` against
keywork `main` (0.2.0 against the pinned 0.1.1, and `child.started`/`child.finished`), both
other lanes'. Left: S24 (S23 landed with contract 1.2 and closed the wait); a Playwright scene
and a live run of the setup against a real `keywork serve`.

**Server mirror.** keywork's contract 1.2 lands in the protocol and client exactly as the server
has it, with `doc.json` re-recorded from its `openApiDocument`. Four shapes: `gate.ask` and
`GET /asks` carry an optional `preview: ToolPreview` (`{ path, before: string | null, after }`)
on a write or edit; `GET /sessions/{id}/context` adds `parts: ContextParts` (`system`, `tools`,
`injected`, `conversation`, `free`, each `{ tokens, basis: "reported" | "estimated" }`) and
`thresholds: ContextThresholds` on the parts' axis; `restoreSessionTurn` is
`client.restoreTurn(id, turn)`, a `TurnRestored` or undo's refusals (a turn off the path reads
as `nothing`); and `grantWorkspaceRule` / `grantSessionRule` answer a `GrantOutcome`
(`{ granted }`, or `invalid`, `missing`, `declined` in keywork's words), while `surface.changed`
gains `kind: "permissions"`, which the surfaces store maps to no listing. All recorded, none
hand-written: `controls.json` holds real parts, `grants` the write's preview, five permissions
changes and every grant-ahead answer, and a new `restored` scenario a restore, its refusals, the
redo that takes it back and the log's `restore` / `restore-undone` entries. S23 is met on the
wire; the setup's waiting line, the ask card's diff and the context bar are the UI lanes'. Gate:
15 tests added, app 1719 tests; `check:contract` ok at 77 routes against keywork's working tree.

**The context map.** Field-scan idea 3 is a real pane and its prototype is gone from
`ui/src/dev/concepts/`. `panes/context/` registers `context` (attire `work`, home the right dock,
so it opens beside the conversation): `leader shift+g` (`context.summon`, palette `context`,
alias `context-map`) maps the focused session's window, and a click on a conversation's
title-row gauge, now a bare `button.kw-frame-gauge` whenever the frame is given an opener
(`PaneFrame.onGauge`), maps that pane's session, rebinding an open map rather than opening a
second. The pane belongs to a session as the diff pane does and follows focus: whichever
conversation takes focus, the map rebinds to it, and a house pane taking focus leaves it where it
was. It reads `context(id)` through the controls store's `watchReadings`, so it refreshes on
`turn.completed` and `session.state` exactly as the gauge does, and draws what keywork sends. The
model is `instruments/context-map.ts` (`mapCells`, `legendRows`, `fenceRows`, `mapHead`,
`basisLine`, `pastWindowLine`, `partsReadout`): one square per percent of a 200k window and per
half percent of a larger one (ten by ten, twenty by ten), the parts in order of distance from
the person (system prompt, tool schemas, memory and skills, conversation) inked by area from
`--kw-density-*`, free room a dot, and the flush and compaction fences placed at `thresholds` on
the parts' axis. The head counts everything the next request carries (`128k of 200k · 64%`),
not the settler's conversation-only `used`, which the gauge keeps; the legend gives tokens and
share per part (`<1%` for a sliver that would read `0%`) and the two lines (`at 187k`); the basis
line says what was reported (`conversation from the usage the provider reported at the last turn
· the rest estimated from the text keywork sends · window declared in keywork.json`). A size
container fits the grid to a short pane. Keys: `c` (`context.compact`) compacts through
`controls.compact` in the conversation's own words (`compactingNotice`, now shared, then
`compactNotice` or the refusal) and rereads; `esc` (`context.close`) closes the pane through a new
`ShellSeams.closePane`; `f` (`context.flush`) answers `memory flushes when a turn settles past
187k · keywork has no route to flush now`, because there is none: keywork flushes only in
`settleTurn` when a turn crosses the line, `compactNow` passes `noFlush`, and `flushNow` is
reached only by the arc sweep, so the hint line reads `c compacts now · f says when memory
flushes · esc closes`. **What the map found:** `thresholds` are the settler's lines plus every
token the settler does not count, so once system, tools and injected outgrow the 24k flush
reserve, both lines fall past the window and the request outgrows the window before the
conversation alone reaches either; the pane says so in one dim line (`memory flush at 227k,
compaction at 235k · past the window · keywork measures the conversation only`). The title-row
gauge's hover carries the parts under its readout (`gaugeHover`, tokens and basis only; the
accessible label is unchanged), `ContextLevel` carries the report's `parts`, and
`sessionContextLevel` is the one rule both panes use for their gauge. The gallery's `context`
scene (`screenshots/context-stage.tsx`) stages the real pane over a fake shell, a 200k map in the
house, a 91% session in whiplash whose lines fall past the window and a 1M map in rose-pine-dawn,
rendered to `artifacts/shots/windows/themes/stage--context.png`; `concept-context` is gone, and
the other concept scenes followed once the asks and the desk landed. **For the server lane:** `POST
/sessions/{id}/flush` over the session's `MemoryFlush.flushNow`, answering `{ flushed, notices }`
as compact answers, so `f` can flush on demand; and a settler that measures the whole request (or
a reserve that counts the fixed parts), so the lines land inside the window. Tests: the model
(12: square counts at both scales, fill order, fences, no fence past the window, the cap, the
legend, the recorded answer, the head, the basis wordings, the past-window line, the readout),
the pane (15: the map, the 1M scale, the finding, readings watched and rewatched on rebind, both
empty lines, `c` settled, refused and without a session, `f`, `esc`, a notice dropped on rebind,
focus followed, the summon, the adornment and its fallback), the gauge's hover and
`sessionContextLevel`, the title row's opener, and two shell flows (`leader shift+g` docked right
then `esc`; the gauge's click, `c` and the palette). Gate: app 134 files, 1744 tests (from 133
and 1719); `bun run check` green with `KEYWORK_REPO=C:\src\keywork` but for `check:contract`,
whose only disagreement is `memory.decided`, an event another lane added to keywork's working
tree during this one; `check:contract -- --source fixture` is ok at 77 routes.

**Asks with their consequence.** The ask card shows what an answer would do, between its head
and its keys, and the concept prototype that proved the idea is gone (`dev/concepts/consequence*`
and the `concept-asks` scene). `page/consequence.ts` reads an ask into one shape and
`page/consequence-view.tsx` draws it. A `write` or `edit` with keywork's `preview` renders through
the diff pane's own `mountMergeView` (unified, unchanged lines collapsed, syntax and diff tokens)
under a head that says where and how much (`edit src/layout/verbs.ts · line 12 · +6 −6`,
`· 3 places` when it touches more than one, `write notes.txt · new file · 2 lines`), held to
22rem with its own scroll; the counts come from the two sides keywork sent, and the app never
re-applies an edit. Without a preview the arguments stay and one dim line says `no preview from
keywork · too large, binary, a memory note, or an edit that would not apply`, keywork's own four
reasons. A `bash` ask typesets its command with tokens only: each program after a separator in
`--kw-syntax-function`, flags in `-attribute`, `|`, `&&`, `;`, `&` and redirections in
`-operator`, paths and redirect targets in `-string`, a leading `VAR=x` read apart from the program
it sets up, quotes kept whole, no character lost. Under the rules line each remembering key says
in plain words what it would cover, worded from the ask's `rules` exactly as keywork reports them:
`s no ask for any bun test command or any tee command until this session ends`, `w the same in
every session of this workspace, until revoked`; an exact rule reads `the exact command rm -rf
build`, and a wildcard over a program with a form keywork holds back names it (`any git push
command but git push --force`, from the mirrored `unrememberedCommands` and `exactOnlyCommands`).
In a quiet session the first line leads with `y`. An MCP ask reads `github · create_issue` over
its arguments as a two-column table, each value one line cut at 80 characters with `…` and a
multi-line value folded `… 2 more lines`, the transcript's grammar. The keys, the rules line,
the blanket warning, the quiet line and the accepted line keep their places; the raw argument
line goes wherever a consequence stands in for it. A pending ask seeded from `GET /asks` now
carries its `preview` into the projection, so a card opened after the ask arrived shows the diff
too. Trust setup records an acceptance through S23 as it is made: a workspace offer calls
`grantWorkspaceRule`; an MCP offer calls `grantSessionRule` for the session the setup was summoned
from or the conversation focused since (the posture spec carries `sessionId`, as the arcs and bots
specs do), and with no session it waits in `keywork.posture:<workspace>` as before, its card line
intact, so the waiting list keeps only what could not be granted. A `declined` refusal shows
keywork's `detail` verbatim under the offer and leaves it undecided; `missing` and `invalid` read
`not recorded · that session is gone` and `not recorded · keywork could not read the rule`; an
unreachable server says why. An offer recorded in this window keeps its row (`proposalOf` takes
the rules recorded here, so a reread does not move it under granted), and declining it says
`keywork already holds bun run * · ctrl+k shift+p revokes it` rather than pretending. The notices
follow: `accepted bun run * · keywork holds it for every session`, `settled · 2 accepted · 1
declined · 1 waits for its first ask`. The permissions store and the posture pane refetch on
`surface.changed { kind: "permissions" }` as well as on a remembered answer
(`changesPermissions`). What the grant route taught: a whole-server rule (`mcp playwright__*`) is
nothing an answered ask records, so keywork declines it ahead (`an answered ask never records mcp
playwright__*; grants hold bash commands and MCP tools as an answer would remember them`); the
setup shows that and the offer stays undecided, so with a session focused an MCP server cannot
be granted ahead today. **For the server lane:** S23 accepting `mcp <server>__*` at session
scope, or the setup offering a server's tools one by one, was Jordan's call; he chose the whole
server on 2026-10-16 (see **Trust onboarding**). `stage--asks` in the
chrome gallery (`artifacts/shots/windows/themes/`) renders the three kinds with the real card in
keywork-night, gruvbox-dark and catppuccin-latte. No chord claimed. Tests:
`page/consequence.test.ts` (shapes, heads, typesetting, the table's fold, the coverage words), the
card (the parts in order, the diff mounted, keys kept, the no-preview line, the typeset roles,
the coverage lines and their quiet key, the table), the seeded preview, the setup (grant at once,
for a session or waiting, keywork's decline verbatim, missing, invalid and unreachable, the held
decline, the stable row, accepting the rest), the posture pane's notices and refusal row, both
panes' refetch; `shell/trust-arrival.test.tsx` now sees `a` write two grants after the trust.
Gate: app 133 files, 1755 tests (from 1719); `bun run check` green with
`KEYWORK_REPO=C:\src\keywork` but for `check:contract` against keywork's working tree, which
reports the event `memory.decided` another lane added there; fixture mode is ok at 77 routes.

**Memory decisions (AJ1–AJ3).** keywork's K10 put every memory judgment on the record
(`memory.decided { decision: MemoryDecision }` on the session bus, journaled as a
`memory_decision` entry and replayed with `replay: true`; backlog 121-5), and the app now shows
that record without deciding anything itself: no decider, no threshold, no key. The mirror is
`protocol/src/decisions.ts`, built as `children.ts` is: `MemoryDecision`, `DecisionSubject`,
`DecisionChoice`, `RecallSelection`, `DecisionFallback`, the catalog as `decisionQuestions`
(`DecisionQuestion`, because `MemoryQuestion` already names an ask), the option lists
(`entryDurabilities`, `pairRelations`, `driftVerdicts`, `mentionVerdicts`, `deciderNames`,
`fallbackReasons`), `isRecallSelection`, and `candidateClausesOf`, which reads the builtin's
action rule one clause per candidate, as `docs/events.md` promises it speaks. `memory.decided`
joins `engineEventTypes` after `context.injected` (twenty engine types), the events mirror is
keywork's `docs/events.md` again, `doc.json` is re-recorded (one line, the envelope's enum), and
a new recorded scenario, `decided`, seeds the vault and writes `src/layout/rects.ts` and then
`src/layout/rects.test.ts`, so the fixture holds a real builtin decision that kept
`[[Layout Rects]]` (`shares "layout", "rects" with the path`) and one that dropped it (`was
already surfaced`), each after the grant and before its `context.injected` and `tool.finished`;
it records byte-stable. The projection keeps `memoryDecisions` in arrival order, one per id (a
replay that repeats a decision replaces it), and rides a call's decision on its tool run as
`recall`, found among the running calls and then the settled ones, because the journal replays
decisions after the turn. **Why a note arrived (AJ2):** `context.injected` is not a transcript
row today (the projection only lists injections), so the fact lands on the row of the call the
recall rode: `write src/layout/rects.ts · 1.0s · done · recalled [[Layout Rects]] · shares
"layout", "rects" with the path`, or `recalled [[Auth Tokens]] · jev 0.94` when the note was
scored; a dim `recall` span that hides under 560px with `waited` and the other facts, and
nothing at all for a decision that kept no note. When K14 lands `ContextInjection.decision`, an
injection row can take the same words by id. **The decisions lens (AJ1):** `w` in the memory
pane (`memory.decisions`, palette `decisions`) opens `decisions · <session>` for the working
session (the focused conversation, kept while the memory pane holds focus), newest first, one
row per decision in the facts grammar: the question in words (`recall before write
src/layout/rects.ts`, `triage entry 2026-10-15#3`, `relate [[Old]] and [[New]]`, `does [[Note]]
still hold`, `link [[A]] to [[B]]`), the choice (`kept 1 of 3`, `newer supersedes older`), the
decider with its odds (`builtin`, `jev 0.94`: the confidence, else the weakest kept note's
score, else the chosen option's), `fallback late` when the builtin stood in, and the latency.
The mark is density, never a verdict: odds step the ramp by quarters, a rule with no odds reads
heavy (`by rule`), `unsure` light. `j`/`k` move, `enter` folds a row open to its candidates
marked kept or dropped with their scores and the rule sentence, `esc` goes back to the garden;
rows arrive live through the session's projection; the empty lens teaches (`no decisions yet ·
memory decides what to recall before each write, edit or command`) and, with no session, asks
for one. **Odds on the inbox (AJ3):** the memory store keeps the latest decision per entry from
any `memory.decided` envelope, process-level or a session's (`entryDecisions`), and a
`borderline-promotion` card whose `source` is that entry gains one fact, `new durable · jev
0.93`. The builtin answers `unsure` for every entry it triages and the card renders that as
nothing, which a test says. No entry decision reaches the app yet: K10's sweep decisions ride no
bus until 121-5's process-level event, so AJ3 is wired and waiting. **Not built (AJ4, AJ5):** the
card that sends a person to `keywork connect typesafe` and the once-per-workspace invitation
read the decider's state, which nothing serves; S25 in the server lane names what they need.
The numbering is this lane's; 121's own table calls the mirror AJ1, the lens AJ2, why-this-note
AJ3, the card AJ4 and the inbox odds AJ5. Tests: 39 new (the protocol mirror against the events
doc 6, the projection 4 and the recorded `decided` fixture with its snapshot, the words 8, the
lens rows and the triage odds 9, the odds ramp 1, the card's odds through rows and the store 3,
the pane 5: keys and fold, a live arrival, both empty lines, the card's odds and the builtin's
nothing; the transcript fact and its stylesheet 2). Gate: app 137 files, 1788 tests (from 134
and 1744; five suites import the memory store's tests, so its one new test counts six times); `KEYWORK_REPO=C:\src\keywork bun run
check` green, `check:contract` ok at 77 routes from keywork's working tree.

**The turn ledger.** The concept lane's idea 4, built on the mirror's `restoreTurn`. Every settled
turn now closes with one dim line in the tool rows' facts grammar: `turn 1 · 1 file · +2 −0 ·
500ms in tools · $0.0123 ·· ↵ files · u restores to before · f forks here`. No word is coloured,
because the turn's state already has its own row (`· interrupted`, the error notice). The facts
come from four places, and a fact with no source is left out. A line with no facts is not drawn.
**The number** is the server's own count, the 1-based place of the prompt among the user
messages on the active path (`restorePointOf`'s rule). It is read from `GET /sessions/{id}/entries`
by `client/projection/ledger.ts` (`pathReading`, memoised per snapshot; `transcriptLedger`;
`latestLedger`; `restoreReach`). The transcript's settled prompts are matched to the path newest
first, by entry id when a replay names one, else by text. A compaction summary or an injected
message shown as a prompt stays unplaced and does not shift every number after it, and a repeated
`continue` keeps its own turn. **Files** are the `GET /sessions/{id}/changes` rows whose `turn` is
that number, with their lines summed. **Time in tools** is the sum of the turn's tool rows'
`durationMs`, waits excluded, live rows only. **Cost** adds `usage.costUsd` over the turn's assistant
entries in the log, which `serve` records per model call, and is formatted the way the status line
prices. It is shown only when every reply in the turn carries a price, and because it is read from
the log, replayed turns are priced too. `turn.completed` carries only the last call's usage, so it
could not price a turn. The
conversation pane opens its session's tree and changes, which the store then keeps fresh.

**Restore and fork.** The ledger line is a row in the transcript's own focus walk, like tool and
child rows: tab reaches it and a click focuses it. `enter` or `space` unfolds the turn's files
with their counts, `u` restores to before the turn, and `f` forks there. No chord is claimed. The
palette gets `restore-turn` and `fork-turn` (`conversation.restore-turn`,
`conversation.fork-turn`, chords `none`), which act on the line that last held focus, else on the
latest placed turn. A test holds that no binding a conversation hears takes a bare `u` or `f`.
Both verbs reread the tree first (forced `openTree`), so a confirm never names a stale number. A
turn the path no longer holds says `that turn has no place on the server's path · it was folded or
taken back`. A restore asks `restore to before turn 1, "write two lines to notes.txt"? 2 turns and
1 file go back · redo brings them back · y/n`. It counts turns from the path and files from the
changes' attribution, and drops the files clause when nothing is attributed. `y` posts
`restoreTurn`, staged in the controls store exactly like undo: the turn's prompt seeds the
composer and the transcript reloads. It then says `restored to before turn 1 · 2 turns went back ·
1 file put back · the prompt is back in the composer` (the server's `filesNote` when no file moved).
A refusal reads in undo's words (`refusalNotice`: `a turn is running`, `no turn 9 on this
session's path`, `this session is gone`), and `n` leaves it unchanged. The server's `restore`
entry is drawn as a row where the path puts it, after the turn it follows, or first when it
precedes every turn: `restored to before turn 1 · redo brings the turns back` while it is the leaf
and `redoable`, then plain `restored to before turn 1`. A `restore-undone` reads `the restore to
before turn 1 was taken back`. Fork posts `fork` at the turn's last message entry (the existing
path the tree pane uses), opens the fork through `openSession` and says `forked after turn 1 ·
the fork opens as its own session`.

**The ribbon.** A new `ribbon` adornment fills a `turn` title zone at broadsheet only. It is the
last child of the detail zone, after the theme name, worn in `--kw-text-dim`, and it reads
`turn 12 · 3 files · $0.41` for the latest settled, placed turn. Only conversation panes supply
it. The stamp, the quiet mark, the pane mark, the name, the arc tag, the bot and the theme keep
their order. The frame snapshots did not change, on purpose: no snapshotted frame carries a ribbon,
and its place is pinned by the title-row and pane-frame tests instead.

**A defect found and fixed.** `openTree` and `openChanges` seeded a session with the shared
`emptyTreeState` and `emptyChangesState` objects. Solid merges an object set onto the object
already there, so the first snapshot was written into the shared constants, and every session's
tree and changes were one object, later reads overwriting earlier ones. The diff and tree panes
hid this by showing one session each. A ledger per conversation exposed it. Each session now gets
its own copy, and `session-store.test.ts` holds two sessions apart.

**Gallery and gate.** `stage--turn-ledger` in the chrome gallery (`screenshots/turn-ledger-stage.tsx`,
staged through the real `transcriptLedger` over the `tool` and `plain` fixtures) is rendered to
`artifacts/shots/windows/themes/stage--turn-ledger.png`: two closed turns, the second focused with
its files unfolded, a restore row, and the ribbon. Tests: `ledger.test.ts` (client: the recorded
`restored` log, placement, pricing, reach), `page/ledger.test.tsx` (facts, ribbon, marks, keys, the
page's rows), `panes/conversation/turn-ledger.test.tsx` (a real session store over the recorded
scenario: lines, the restore asked, confirmed, declined and refused, the restore row, the redo's
row, fork, the palette's target, no path, no chord), plus the controls store, the title row, the
pane frame and the session store. Gate: app 136 files, 1764 tests (from 133 and 1719). Types, pins,
guardrails, colors (168 files), themes (21), textures and lint are green with
`KEYWORK_REPO=C:\src\keywork`. `check:contract` is green in fixture mode (77 routes). Against
keywork's working tree it reports only `memory.decided`, an event another keywork lane added
during this lane, as the baseline did. **For the server lane:** `ChangedPath.turn` (and
`changes.updated`'s `turn`) is the checkpoint store's ordinal, turns counted since this server's
checkpoints opened, not the path's place. After an undo, a restore or a restart the two part, and
the ledger's files and the confirm's file count follow the changes' numbering. Attributing changes
by the prompt's entry id, or by the path ordinal `restore` takes, would close this. Left: diffs
inline on `enter` (the field scan's sketch, now files and counts), the ribbon as one cell per turn,
and tool time for replayed turns, since `serve` keeps no durations.

**The desk.** Jordan decided on 2026-10-15 that the desk absorbs the needs-you queue, and N9's
pane became the desk: one pane kind, still `needs-you` under `ShellSeams.needsYou`, summoned by
`leader q` with the palette name `desk` and `needs-you` and `waiting` kept as aliases, titled by
its count (`desk · 3 need you`, plain `desk` when nothing waits). It moved from the right dock to
the main area, since its rows carry a session's facts and the dock's 22% shed every one of them.
The strip, `leader n`, `leader shift+n`, the return stack, the `needs-you-strip` toggle, the tray
badge and the toasts are untouched and still read the queue. **The groups**
(`panes/needs-you/desk.ts`): *needs you* is the queue in its own order, asks, airlock deliveries,
inbox items and failed turns alike, each a row that jumps, with workspace headings only when two
workspaces wait; *working* is every session whose projection holds a live turn, latest activity
first; *back* is every idle session whose `lastActivityAt` is newer than the person's read mark,
newest first; *quiet* is every session in `shell.quiet`. A session appears once: waiting wins,
then quiet (a session left to run stays out of the way while it works and when it finishes, until
it asks), then working, then back. An idle session already read is not on the desk; the head
still counts it (`8 sessions · 4 need you · 2 working · $1.55`) and the tree lists it. **Read
marks** are new and held by the window (`shell/session-reads.ts`): a session's first sighting
counts as read, since the window cannot know what the person saw before it opened; focusing a
conversation pane reads its session; `d` on a back row marks it read (`marked read · the sessions
tree still lists it`). **The rows** carry only what a store holds: the title (`sessionName`), the
arc chip and slug in the arc's ramp hue, inverted under the name while it asks, the bot's sigil
and name (`botNamed`), the theme the session's pane wears as an eight-swatch strip when dressed
(`NeedsYouSeams.dressed`: the outfit of the pane that shows it, else its arc's theme), the context
gauge in steps (the controls reading, else the reported usage), the cost from `costNanos`, the age
(`waiting 6m` on a waiting row) and `»` on any row whose session is quiet, asks included, since
quiet changes what `y` sends. The second line is the ask or the failure in the strip's words
(`ask: rm -rf dist`) or a working session's live tool row (`edit src/page/page.css · running`,
else `thinking`). The prototype's changes line (`3 files · +42 −7`) is left out: no store holds
it before S17. **In place:** the cursor row's ask shows the card's own offers (`askOffers` and
`answerLabel`, now exported) and `y`, `o`, `s`, `w`, `n` answer it through `answerHeldAsk`
(`shell/answer-ask.ts`), the one path `ActionTarget.answerAsk` now runs too: the asking run from
the session's projection, `askChoiceFor` with the session's quiet posture, `answerAsk`, and a
refusal from the server in its own words, which the global chords now say on the status line as
well. The desk opens each asking session it lists so the run is in hand. `tab` walks the waiting
rows and wraps; `enter` jumps a waiting row as before and visits a session row through the jumps
(`toPlace`), so `leader shift+n` comes back to the desk; `d` dismisses as before and says why an
ask cannot be (`an ask is answered, never dismissed · y or n answers it here`); the foot of the
pane teaches `j k move · enter goes there · y o s w n answer an ask · d dismisses · tab next
waiting` and gives the line to a notice while one stands. The prototype modules
(`dev/concepts/desk*`) are deleted, and with every prototype now landed, `dev/concepts/` and
`screenshots/concept-stages.tsx` are gone entirely. The gallery's `needs-you-pane` and `concept-desk` scenes became one
`desk` scene that stages the real pane beside the asking session in rose-pine-dawn and the
working one in whiplash (`artifacts/shots/windows/themes/stage--desk.png`); `stage--needs-you`
keeps the strip. Tests: the model as a table (`desk.test.ts`), the pane (groups, facts, both
quiet postures, a once-only ask, a server refusal, the keys, dismissals, headings, the clear
desk), the one answer path, the read marks, the visit jump, and two shell flows: the restored
ask answered from the desk with `s`, and a session that moved unseen coming back to the desk and
leaving it once visited. **For the server lane:** S17 is what makes *working* and
*back* right for a session this window never opened: `live` on `GET /sessions` rows and a
`changes` summary; until then a session driven only from the TUI shows as working only once a pane
here has loaded it, and comes back by its `lastActivityAt` alone. Left: `ctrl+y` and its siblings
answer the focused conversation's ask, not the desk's cursor row, which answers to the card's
keys; `leader shift+s` quiets the focused conversation only. Gate: app 134 files, 1733 tests
(from 133 and 1719); `bun run check` green with `KEYWORK_REPO=C:\src\keywork` but for
`check:contract`, which reports keywork's working tree adding the event `memory.decided`
(another lane's), and is ok in fixture mode at 77 routes.

**Gate (2026-10-16).** Wave 7.5 folded the last three lanes into this tree in the order above,
memory decisions, the turn ledger, then the desk, each as a three-way patch over wave 7 with the
mirror, the context map and the asks. Every conflict resolved as a union of both sides: this
ledger's paragraphs, the gallery's scenes and imports, the session store's test (the preview
seeded from `GET /asks` beside each session's own tree and changes), the workspace view's frame
props (the gauge's opener beside the ribbon), and the stage tests. The ask card merged on its
own into the consequence view, the exported `askOffers` and `answerLabel`, the quiet line and the
accepted line. The ribbon ends the title row's facts, after the quiet mark, the arc tag, the bot
and the theme name; no frame snapshot moved, because no snapshotted frame carries a ribbon and
its place is pinned by the title-row and pane-frame tests. With the desk landed every field-scan
prototype is a real surface, so `ui/src/dev/concepts/` and `screenshots/concept-stages.tsx` are
gone, with the gallery's concept scene type and its `concept stage` test, and the field scan's
prototype table says so. The desk stage's asking pane now replays the asks scene's edit, so the
real card beside the desk shows keywork's preview. App 141 files, 1883 tests (from 134 and 1780).
`KEYWORK_REPO=C:\src\keywork bun run check` is green: `tsc --build`; `check:pins: ok (5
manifests, 2 workflows)`; `check:guardrails: ok`; `check:colors: ok (170 styled files)`;
`check:contract: ok (77 routes, server version 0.2.0, from C:\src\keywork)`; `check:themes: ok
(21 themes)`; `check:textures: ok (21 themes, 17 grapheme samples, held against HEAD)`; biome
over 426 files with nothing to fix. `bun run screenshots -g stage` renders all eight stages to
`artifacts/shots/windows/themes/`, among them `stage--desk`, `stage--turn-ledger`,
`stage--asks`, `stage--context`, `stage--children` and `stage--needs-you`.

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
| **S9 themes** | 1 | `GET /themes` listing the gallery and user themes so the app and the TUI agree on what exists | M2.3 (optional) |

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
at three width tiers in both shipped themes, the tool row, the ask card, the title row's
five stamp states, the palette, the status line, and the first-run screen. The serif is
decided (AD7); the canvas picks the two faces and the measure by showing the same fixture
transcript in both themes. Nothing decorative that is not also informative.

## Next up (2026-10-12): the series after the outfits

The order the next items should land in, written after wave 6.5. Each is small enough for
one lane; the rungs are the dependency order, not a calendar. Points as elsewhere.

**Rung 1: close the loop, ship once.**

- **N1 (1pt) The lane worktrees retire.** Corrected 2026-10-12: PR #7 is already merged
  into keywork `main` (8952a27) and `main` carries whiplash (K8). Only K9, the bounded
  derived rules, still sits unstaged in the `next` worktree; the patch is extracted at the
  session scratchpad as `k9.patch` (trust/*, `server.test.ts`, `docs/events.md`, the 118
  ledger) and applying it to `main` is Jordan's call, after which the `keywork-lanes` and
  `.claude/worktrees` checkouts can go. keywork's last release is `v0.1.1` (2026-09-09),
  before the themes route, so the sidecar pin needs a `v0.2.0` cut from `main`.
- **N2 (3pt) First release of the app (W7.1).** Pin the keywork release as the sidecar, tag
  `v0.1.0`, prove the three-platform rail and the updater with `v0.1.1`. The outfits stage
  joins the committed screenshot baselines.
- **N3 (2pt) Outfits follow-through.** The arcs pane and the tree show an arc's theme beside
  its hue chip; `arcs` rows get a `w` key that opens the themes pane on that arc; palette
  entries `mark-<pane>` and `theme-marked` from marks; a dressed pane's seam against the gap
  audited in every chrome weight; the themes head keeps its key word at the narrowest tier.
- **N4 (1pt) S15 arc theme on the record (keywork).** Optional `theme` on an arc with
  `POST /arcs/{slug}/theme` and `surface.changed: arcs`; the app reads it as the arc rung
  when present and keeps its local choice as the fallback. The TUI may colour arc chips by it.

**N3 and N4 ledger (2026-10-12).** Landed uncommitted, two lanes in parallel. N3: arc rows
read `1 session · wears rose-pine · now`, `w` (`arc-theme`) opens the themes pane on that arc
and `shift+w` (`arc-inherit`) drops it; tree rows add `· wears x` above 560px; palette
`mark-<slug>` per dressable open pane with mark/unmark wording; the seam rule is the pane's own
weight inside, the house's weight at the edge, through a root-only `--kw-house-border` and a
`data-house` attribute, shown in `stage--outfit-seams`; the themes head puts the theme first
(`whiplash · 2 marked`); `shell.openPane` summons so an open themes pane is rebound. N4 (S15):
keywork `main` gained `theme?` on `ArcRecord`/`ArcSummary`, `ArcsPort.setTheme`, and
`POST /arcs/{slug}/theme` (`setArcTheme`, `{ theme: string | null }`; 400 malformed, 404 no
arc, 409 archived or `no theme named "x" · GET /themes lists the ones served`), firing
`surface.changed: arcs`, contract 1.1, the TUI arc row ending `· wears nord`; the app's protocol
and client know it, `surfaces-store` exposes `arcTheme`, and the attire's arc rung reads the
server first with this window's choice as the fallback, writing through on wear and undress
(`<refusal> · worn in this window only`). The app also mirrored keywork's new
`POST /permissions/session/{sessionId}/revoke` (`revokeSessionGrant`) in the protocol, client
and doc fixture; its pane surface is W7.2. N2 was held: the permission layer refused version
bumps and packing as a shared-resource change, so the release order is written up for Jordan
in the report instead. Gate: app 108 files, 1295 tests, every check green except
`check:contract` against keywork `main`'s working tree, which is mid-edit by another session
adding `child.started`/`child.finished`; keywork 355 files, 4913 tests, its own types failing
on that same in-flight work.

**N1 ledger and the v0.2.0 pin (2026-10-15).** K9 is on keywork `main` (615cc5c), taken
from the `next` worktree (read only, not touched): the code and `docs/events.md` hunks as they
were, the two new trust files copied, and the 118 ledger hunk rewritten as its own "K9" entry
since K8's half had already landed there as theme parity; one fix rode along (`programName`
now splits Windows paths, so `C:\tools\RM.EXE -rf out` is still a delete). keywork's CLI
manifest is `0.2.0`, and this repo pins `protocolVersion = "0.2.0"`, which the sidecar fetch,
`expectedServerVersion` and `check:contract` all read; `fetch-sidecar`'s usage shows a
`<x.y.z>` placeholder instead of a stale number. `scripts/lib/repo-files.ts` now skips
`.claude` like keywork's walker and Biome already do, since agent worktrees under
`.claude/worktrees` were failing `check:guardrails` with their own copies of the exempt
pattern table. Nothing else in `next` is unlanded: its whiplash file and gallery change match
`main` byte for byte and only its `themes.md` wording differs, so that checkout can retire. N2
waits on keywork's `v0.2.0` release existing. Gate: app 109 files, 1296 tests, every check green
except `check:contract`'s two known unknown events (`child.started`, `child.finished`), with no
version disagreement; keywork 364 files, 5025 passed, 3 skipped, `bun run check` green.

**Rung 2: the daily driver.**

- **N0 Children.** (landed 2026-10-15, see the Wave 7 ledger) keywork's delegated child
  sessions, shown in the parent's transcript and nested in the tree.
- **N5 (2pt) Open loops (W7.2).** (landed 2026-10-15, see the Wave 7 ledger) `purgeTrash`
  in the tree's trash section; mode cycling (needs PD12); the arc slug and bot sigil in the
  title row at broadsheet; the `textFaint` token; `/open` with a README fallback; a posix
  identity fixture.
- **N6 (2pt) S14 findings (keywork).** `POST /redo` after an undo that announced `redoable`;
  context from reported usage; cost that survives a restart; compaction summaries marked;
  `surface.changed` on grants; zero-turn cost rows dropped.
- **N7 (3pt) Dogfood week (W7.3).** `docs/dogfood.md` kept daily; each reach for the TUI
  recorded with its reason and triaged into N5 or the waves below. Acceptance is the list
  getting shorter.
- **N8 (2pt) Second workspace (W7.4 + S10).** Two windows on two servers; the user-level
  ticket stops blocking the second `serve`; asks pending across both in the tray.

**Rung 3: many sessions, one head (the start of wave 8).**

- **N9 (3pt) The needs-you queue (W8.1).** (landed 2026-10-15, see the Wave 7 ledger) One
  ordered list across sessions and workspaces; a chord that jumps to the next waiting item and
  back; tray badge and toasts from the same queue.
- **N10 (3pt) Session groups (W8.2).** Arcs as the grouping in the tree with collapse and
  per-group waiting counts; a session started inside an arc with its bot bound in one step;
  the arc's theme worn by the new session's pane from its first paint.
- **N11 (2pt) Quiet mode (W8.4).** (landed 2026-10-15, see the Wave 7 ledger) A per-session
  "let it run" posture on the K7 session scope, marked in the title row, one key back.

What is deliberately after these: fan-out and compare (W8.3), performance at scale (W8.5),
and review as a surface (wave 9), each needing the daily-driver week's evidence first.

## Waves 7 to 11: after the merge (outline, 2026-10-12)

M0 through M5 have landed across waves 4 to 6, PR #7 carries the themes and the trusted
read posture into keywork `main`, and the live round on 2026-10-11 found only small defects.
The app is a complete client. What follows is ordered by what turns it into the surface
Jordan reaches for every day, each wave sized in the same points as the milestones above
and split into lanes that can run in parallel on agents. Waves are outlines, not ledgers:
each one gets its brief when it starts and its ledger when it lands.

### Wave 7 (12pt): the daily driver

The goal is one week of Jordan using the app instead of the TUI, with the release rail
proving the install.

- **W7.1 (3pt) First release.** keywork cuts a release carrying K6 and K7; the app pins it
  as the sidecar, tags `v0.1.0`, and the three-platform rail produces signed installers
  with the 60-second clock measured. The updater is proven by shipping `v0.1.1` over it.
  **Needs** keywork's release after PR #7.
- **W7.2 (2pt) Open loops from the live round.** `purgeTrash` in the tree pane's trash
  section; mode cycling once keywork PD12 lands; the arc slug and bot sigil in the title
  row; the `textFaint` token; `/open` with a README fallback; a posix identity fixture.
- **W7.3 (3pt) Dogfood ledger.** A `docs/dogfood.md` kept during the week: every moment
  the TUI was reached for instead, with the reason, triaged into this wave's fixes or the
  waves below. The acceptance test for the wave is that list getting shorter.
- **W7.4 (2pt) Second-workspace story.** Two windows on two workspaces with their own
  servers, the MRU order, asks pending across both in the tray, and the keywork user-level
  ticket no longer blocking the second `serve` (S10 below).
- **W7.5 (2pt) Three-platform baselines.** The screenshot parity job gets its first
  committed baselines for the transcript, the diff view, the terminal and the themes pane,
  in `keywork-night` and `whiplash`; font fallback stays the only allowed difference.

### Wave 8 (14pt): many sessions, one head

The app's advantage over a terminal is that several sessions can be in view and the person
answers whichever needs them. This wave makes that the primary posture rather than a
layout trick.

- **W8.1 (3pt) The needs-you queue.** (landed 2026-10-15 as N9, its pane grown into the
  desk; see the Wave 7 ledger) One ordered list of everything waiting on the
  person across sessions and workspaces: asks, airlock deliveries, memory inbox items,
  failed turns. A pane and a chord that jumps to the next item and back. The tray badge
  and toasts read from the same queue.
- **W8.2 (3pt) Session groups.** Arcs as the grouping in the tree with collapse, counts
  of waiting items per group, and bots shown by sigil; a new session can be started inside
  an arc with its bot bound in one step.
- **W8.3 (3pt) Fan-out and compare.** Fork a session N ways with one prompt each (the
  existing fork and prompt routes), tile the children, and a compare pane that shows the
  changed files of two siblings side by side with turn provenance. No engine logic: the
  server already holds every piece; the app only composes.
- **W8.4 (2pt) Quiet mode.** A per-session "let it run" posture built on the session
  scope from K7, with a visible mark in the title row and a one-key way back. The gate
  stays on the server: the app only chooses a scope the server already offers.
- **W8.5 (3pt) Performance at scale.** Ten live sessions streaming, a 20k-entry transcript,
  reducer steps per frame and paint time ratcheted in `scripts/textures/ratchets.json`;
  a virtualized transcript if the numbers demand it.

### Wave 9 (12pt): review as a first-class surface

The changes pane is a viewer today. Reviewing an agent's work is where the app can beat
every terminal, and Zed's review UI stays observed behaviour only.

- **W9.1 (3pt) Hunk-level verdicts.** Keep or revert per hunk through checkpoints: a
  keywork route that reverts one hunk's range (S11) and an app pane that walks hunks
  with `n` and `p`, keeps with `k`, reverts with `r`, and keeps a summary line of what is
  still unreviewed.
- **W9.2 (2pt) Talk to the diff.** A comment typed on a hunk becomes an inject carrying
  the file, the range and the hunk text (the `inject` route exists); the agent's answer
  threads back under the hunk.
- **W9.3 (2pt) The review ledger.** Per session: files touched, hunks reviewed, hunks
  reverted, tests run (from bash rows), with the undo and redo tree shown as a timeline.
- **W9.4 (2pt) Open in editor, done properly.** `$EDITOR` at the line on every platform,
  with the app noticing the file changed underneath and offering the agent the diff.
- **W9.5 (3pt) Spills and large outputs.** The keywork spill route (S12) so tool outputs
  that spilled to disk open in a pane with search; the withdrawn spill viewer returns.

### Wave 10 (10pt): the vault and the airlock

- **W10.1 (3pt) Memory as a garden you tend.** Inbox triage with keys, editing of the
  person's own notes only (the server writes), entity pages, the daily log with provenance
  density, and the curing state visible per note.
- **W10.2 (2pt) The airlock.** Deliveries and finishes shown with their arc context, so
  what an arc sends out is read where it lands.
- **W10.3 (2pt) Search everywhere.** One search over transcripts, notes, changed files and
  spills, served by keywork (S13), opened from the palette.
- **W10.4 (3pt) Export and share.** The session export gains a reviewable HTML with the
  diff and the review ledger inline; copy-as-markdown for a selection of entries.

### Wave 11 (10pt): platform and craft

- **W11.1 (3pt) Accessibility.** Every pane reachable by screen reader with the same
  grammar as the keys; reduced motion honoured through the tempo tokens; APCA floors
  enforced on the app's own chrome, not only on themes.
- **W11.2 (2pt) Theme craft.** A theme designer's pane: live token editing against the
  floors with the refusal text inline, saved as a user theme file keywork reads; `whiplash`
  and the gallery's light themes tuned from real use.
- **W11.3 (2pt) macOS and Linux as first-class.** Menu and chord parity (`cmd` as the
  leader modifier where it belongs), the tray and notifications on each shell, the
  AppImage and deb installed cold on the clock.
- **W11.4 (3pt) Keyboard craft.** A chord recorder in the keys overlay, conflicts shown as
  they are typed, the config file edited in place from the overlay, and a printable key
  card per theme.

### Server lane, continued (keywork repo)

| Task | Size | What | Needed by |
|---|---|---|---|
| **S10 one serve per workspace, for real** | 1 | The user-level ticket stops blocking a second workspace's `serve`; the legacy read path is dropped after its one release | W7.4 |
| **S11 hunk revert** | 2 | `POST /sessions/{id}/changes/{path}/revert { range }` over checkpoints, recorded as a session entry | W9.1 |
| **S12 spills** | 1 | `GET /sessions/{id}/spills/{id}` with a range, served from the session's own directory, never the tool jail | W9.5 |
| **S13 search** | 2 | `GET /search?q=&in=transcripts,notes,changes,spills` with ranges and provenance | W10.3 |
| **S14 the open findings** | 2 | `POST /redo` after an undo that announced `redoable`; context from reported usage; cost that survives a restart; compaction summaries marked; `surface.changed` on grants; `?layer` on notes; zero-turn cost rows dropped | W7.3 |
| **PD12 mode cycling** | 1 | The one decision the app has waited on since M3.6 | W7.2 |
| **S15 arc theme on the record** | 1 | An optional `theme` on an arc, set by `POST /arcs/{slug}/theme`, so a second client (the TUI, another window) can wear what the app chose; the app keeps its local choice as the fallback | W8.2 |
| **S16 quiet sessions** | 2 | A per-session quiet posture the gate applies itself, so "let it run" needs no person at the keyboard for what the session scope already covers: `POST /sessions/{id}/quiet { on: boolean }` recorded as a session entry and carried on `session.state` as `quiet`; while on, a call whose derived `rules` a `session` answer would record, none blanket (`<program> *`) and no part destructive in K9's sense, is granted by the gate, its rules join the session layer, and the decision reads `gate.permission { gate: "quiet", scope: "session" }`, a new origin so no surface mistakes it for a person's answer; `write`, `edit`, K9's exact-only and remember-nothing forms, blanket rules and the trusted reads' carve-outs still fire `gate.ask`; turning it off revokes nothing; `GET /permissions` names the quiet sessions; `keywork run` and every headless gate never go quiet | W8.4 |
| **S23 grants ahead of an ask** | 2 | `POST /permissions/workspace/grant` (`grantWorkspaceRule`) and `POST /permissions/session/{sessionId}/grant` (`grantSessionRule`), body `{ rule: { action, resource, effect: "allow" } }` as the revoke routes take it; `200 { granted: rule }`, `400` malformed, `409` in keywork's words for a `write`, `edit` or `*` action, a wildcard over a K9 destructive form, or an untrusted workspace; persisted where a `scope: "workspace"` answer persists; fires `surface.changed { kind: "permissions" }`. Trust setup records an accepted rule the moment it is accepted instead of at its first ask | Trust onboarding (wave 7) |
| **S24 posture facts** | 1 | `GET /workspace/toolchain` → `{ manifests: [{ path, kind }], families: [{ rule, reason }] }`, detected by keywork across the workspace in its grant grammar with K9 applied; `GET /permissions` serves the destructive forms (exact-only and never-remembered) so the app stops mirroring them from `docs/events.md` | Trust onboarding (wave 7) |
| **S25 the decider's state** | 1 | 121-12's `decider` block on `GET /memory`, read the way K12's doctor row reads it (config, the credential store, connect's observations; no network call): `{ selected: "builtin" \| "jev", active: "builtin" \| "jev", credential: "saved" \| "environment" \| "missing" \| "refused", model?, proven: string[], lastFailure?: { at, reason }, nextAction? }`, the credential a fact and never a value, `nextAction` the command in keywork's words (`keywork connect typesafe`); a new `surface.changed` kind, `decider`, whenever any of it moves (a connect, a removal, a 401 latching `refused`), so a card clears without polling; and 121-5's process-level `memory.decided` (`sessionId: ""`) for sweep decisions, with staged items carrying `decision`, `score` and `decider`. The persistent card shows while `selected` is `jev` and `credential` is `missing` or `refused`; the invitation while `selected` is `builtin` and `credential` is `missing`, dismissed per workspace in the app; neither has a key field or a decider toggle, and the one action opens a terminal pane on `nextAction` | AJ4, AJ5 (needs K12, K13, K17) |

## What is deliberately not in this plan

- Shared workspaces across machines (keywork P2.3) and any multi-user story.
- Embedded editing of any kind.
- A settings GUI: the one config file and its schema are the editor.
- Voice, dictation, or any audio surface: the app is a keyboard citizen like the terminal.
