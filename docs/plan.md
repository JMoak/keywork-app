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
and anchors only; the version check is exact on the pinned `protocolVersion` (0.1.1 since wave 4); a dead or corrupt ticket counts
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
fallback on context loss), themed from `--kw-*` tokens and re-themed on flavor change,
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
Parity scaffold: Playwright 1.63.0 captures the transcript scenarios per flavor and width
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
  `GET /flavors` with a `system` placeholder; `/mcp` + restart/enabled/tools, `/arcs` +
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
  and flavors, refetching exactly the kind a `surface.changed` names. Panes `mcp` (tile-fill
  while connecting, missing tile down, `enter` tools, `r`, `t`), `arcs` on `leader a` (hue
  chip by ordinal, sessions grouped, `n`/`c`/`shift+a` with a confirm, `b`/`u`), `bots`
  (`sigil name`, never hue; `enter` switches, a mid-turn 409 shown as the server says),
  `workspaces` (`enter` uses one and restarts the sidecar on `reopens`). The conversation
  title row shows the bound bot typographically and takes its hue from the arc's ordinal
  (AD5). `flavor/wardrobe.ts` lists server flavors beside the gallery, `system` from the OS,
  a flavor below the APCA floor refused with keywork's exact message. Live verification
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
one `surface.changed` or four, context-dir linking, the `system` flavor placeholder); the
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
submit; **finding: the composer had no paste handling at all**. T6: `flavor/contrast-audit.ts`
applies keywork's APCA floors to every pair plus a measured polarity check so a tinted dark
flavor fails as light; keywork-night's smallest headroom is 3.1 Lc. T7: every pane's zero state
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
- `GET /flavors` serves only `keywork-night` plus the `system` placeholder: no keywork-day, no
  user flavors, so "server flavors beside the gallery" has nothing to show yet.
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
