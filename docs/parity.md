# Parity: keywork (TUI) and keywork-app

> Written 2026-10-25 from the code of both repos at keywork `992bd37` and keywork-app `50adf8e`,
> both trees clean. The route tables already agree exactly (77 operations each,
> `check:contract` green against keywork `main`); the differences below are in payload shapes,
> in surfaces one client has and the other does not, and in the server lane the app's plan still
> waits on. Each item names the owning repo so lanes can run in parallel. Sizes use the plan's
> point scale (1pt ≈ an hour or two · 2pt ≈ a half-day · 3pt ≈ a full day).

## 0. The shape of the gap

| | keywork TUI | keywork-app |
|---|---|---|
| Pane kinds | 11 (`tui/src/pane-kinds.ts:136`) | 16 (`ui/src/panes/index.ts:20`) |
| Contract | 1.4 (`server/src/contract.ts:1`) | fixtures pinned at 1.2; `protocolVersion "0.2.0"` is the only version checked |
| Themes | 21 gallery + `system`, one global theme | same 21 + `GET /themes`, worn per window, pane, arc and mark |
| Review | read-only diff pane | read-only merge view with turn undo/redo, restore-to-turn, turn ledger |
| Waiting on the person | per-pane needs-you stamp, OSC notifications | the desk (needs-you queue) across sessions and workspaces, tray badge, toasts |
| Modes (Plan · Recall · Agent) | spec only (`docs/modes.md`) | stub that prints a notice |

The app is ahead on review, themes and the multi-session posture. The TUI is ahead on
conversation-local verbs, pane-tray commands, the spill viewer, `/forget`, `/btw`, `/image`,
copy verbs, `/commit-draft`, `/doctor`, `/bug`, and configurable keybindings. Neither has
modes, quiet on the server, hunk verdicts, search, or spills over the wire.

## 1. Wire drift the route check cannot see (keywork-app, 2pt total)

The contract gate compares route ids and the CLI version. These fields moved under it.

| Field | keywork | app | Fix |
|---|---|---|---|
| `PermissionDecision.asked` (contract 1.3) and `.reason` (1.4) | `engine/src/session/journal.ts:12-20`, `docs/events.md:276-302` | `protocol/src/events.ts:210-216` has neither | add to the type and to the gate.permission row rendering |
| `POST /asks/{callId}` body `reason` | `server/src/routes/asks.ts:28,89-100`: `unsafe` / `not-now` / `other` on a denial | `client/src/client.ts:352-356` sends `{ verdict, scope }` only; the ask card and desk have one deny key | a second keystroke after `n` on the card, the desk and `ctrl+n`, exactly as the TUI's `[u] unsafe [n] not now [o] other` (`tui/src/mutation-ask.ts:149-181`) |
| `turn.delta` variants `progress`, and `done { responseId?, cacheMiss? }` | `engine/src/provider.ts:9-10` | `protocol/src/events.ts:149-154` lacks them; `project.ts:161` drops `redacted-thinking` and `done` | carry `progress` as the TUI does (a working line), surface `cacheMiss` in the cost reading |
| `extension.notice.detail` | emitted | ignored at `project.ts:385-387` | render it |
| Contract pin | `x-keywork-contract: 1.4` | fixtures at 1.2; `check-contract.ts:92` compares only `info.version` | pin the contract major (the 115 open call), re-record fixtures, add a field-shape diff of `event-shapes.fixture.json` to `check:contract` so this class of drift fails CI |

## 2. TUI has, app lacks (keywork-app)

| # | Capability | TUI reference | Size | Notes |
|---|---|---|---|---|
| A1 | `/forget [replacement]` picker: take a prompt or tool result out of context | `conversation-model.ts:386-397` | 2 | needs a server verb: `POST /sessions/{id}/forget { entryId, replacement? }` (keywork, 1pt) since the TUI does it in-process |
| A2 | `/btw <question>` side question | `side-question.ts` | 2 | server verb needed: the aside the field scan called S22 (keywork, 2pt) |
| A3 | `/image [path]`, `ctrl+v` clipboard image attach | `app-core.ts:1159-1172` | 2 | `POST /sessions/{id}/prompt` must accept attachments (keywork, 1pt); the renderer reads the clipboard through the host |
| A4 | Queue editing: `alt+↑/↓` enters the queue, reorder, cancel, send now | `conversation-model.ts:908-932` | 2 | app shows the queue count only; needs `POST /sessions/{id}/queue` reorder and cancel verbs (keywork, 1pt) over `queue.changed` |
| A5 | `ctrl+enter` send-now (queue set aside) as a third behavior beside steer and queue | `prompt-editor.ts:188-193` | 1 | `behavior: "now"` on prompt (keywork, 1pt) |
| A6 | Spill viewer: `o` on a tool row opens the spill at its elided range | `conversation-model.ts:845-854` | 2 | S12 `GET /sessions/{id}/spills/{id}` (keywork, 1pt); the app's withdrawn viewer returns with search |
| A7 | Copy verbs: `copy-message`, `copy-code`, `copy-diff` | `copy-commands.ts:15-36` | 1 | clipboard through the host port |
| A8 | `/commit-draft`: model drafts a commit message from the diff and copies it | `commit-draft.ts:26-35` | 2 | server verb `POST /sessions/{id}/commit-draft` (keywork, 1pt), app never commits |
| A9 | `/doctor`, `/crashlog`, `/bug` diagnostics bundle | `crash-log.ts:41-73`, `bug-bundle.ts:54-69` | 2 | `GET /doctor` (keywork, 1pt); the bundle is written by the main process with the renderer log appended |
| A10 | `/thinking` visible on/off as a toggle plus `/effort` typed with a level | present | 0.5 | app has both as chords; add palette args once the palette passes arguments (A14) |
| A11 | Pane tray: `/` or `:` inside a row pane opens that pane's own commands | `pane-tray.ts:40-42` | 2 | one tray component over each pane's local actions; also fixes discoverability of the 16 panes' keys |
| A12 | Configurable keybindings from `~/.keywork/keywork.json`, hot reload, `"none"` unbinds | `cli/src/keybindings.ts:19-36` | 2 | the app has the schema (`ui/src/keys/config.ts:7`) but `keymapFromConfig()` is always called with no argument (`workspace-view.tsx:98`, `open-screen.tsx:19`); load the same file through the host, watch it |
| A13 | `/open <path>` with an argument; `/terminal shell` with an argument | `core-commands.ts:46-54` | 1 | the palette cannot pass arguments yet (plan ledger "Left") |
| A14 | Palette argument grammar: commands that take a word (`/model x`, `/arc slug`, `/open path`, `/workspace slug`) | `palette.ts:92-101` hides them in command mode but the prompt's `/` accepts them | 2 | the app has no `/` in the composer at all; add slash commands in the composer that resolve to palette entries with an argument |
| A15 | `/arc-new`, `/arc-close [direction]`, `/arc-release`, `/arc-open`, `/bot-switch`, `/bot-release`, `/workspace-new`, `/workspace-default`, `/policy` as commands | `core-commands.ts:175-261` | 1 | the app has these as pane keys only; registering them as palette commands is wiring over existing client calls |
| A16 | Bot creation overlay with purpose, name and scope; `/bot <slug>` opens a bot session | `overlays/bot-create.ts`, `bot-commands.ts:75-83` | 1 | app's bots pane has `n` define and `enter` run; add purpose and the palette jump `bot-<name>` |
| A17 | Away digest on return; status-bar tips; keep-awake during a turn | `away-summary.ts`, `tips.ts`, `app.ts:251` | 2 | away digest needs the TUI's summary logic to move server-side or be recomputed from the stream; keep-awake is `powerSaveBlocker` in main |
| A18 | Extensions: `/extensions` listing and hosted extension commands | `extension-host.ts:50-106` | 2 | needs `GET /extensions` and `POST /extensions/{name}/commands/{cmd}` (keywork, 2pt); app has nothing |
| A19 | Workspace slash-command templates (user and project commands layer) | `extension-commands.ts:63-88` | 1 | served alongside A18 |
| A20 | Browser pane: `enter` opens a file pane with the cursor at a line; `o` open in editor at the line | `browser-model.ts`, `file-references.ts:28` | 1 | the app's open-in-editor drops the `#L<n>` fragment (`main/open-external.ts`); honor `$EDITOR` per platform (W9.4) |
| A21 | Memory pane `g` note lens and `o` open the note file on disk | `memory-pane-model.ts:242-360` | 1 | app shows notes read-only; add open-externally through the host |
| A22 | `/workspace` switch and `/init` reopen flow parity: the TUI reopens itself; the app restarts the sidecar | `workspace-commands.ts:72-79` | 0 | built; listed so nobody re-does it |
| A23 | `keywork run` headless and `keywork chat`: not app features | | 0 | out of scope by design |

## 3. App has, TUI lacks (keywork)

| # | Capability | App reference | Size | Notes |
|---|---|---|---|---|
| T1 | The desk: every session grouped by needs you / working / back / quiet, asks answered in place, next and back chords | `panes/needs-you/index.tsx:39`, `shell/needs-you.ts` | 3 | the TUI has the per-pane stamp (113) and the sessions overview; a `desk` pane kind over the same `SessionSummary` and ask list, `leader q`. S17 (`live`, `waiting`, `changes` on `GET /sessions` rows) makes both clients honest for sessions they never opened (keywork server, 1pt) |
| T2 | Quiet mode: `leader shift+s` changes the approve key's scope to session | `shell/quiet.ts` | 2 | build it once as S16 on the server (`POST /sessions/{id}/quiet`, `quiet` on `session.state`, `gate: "quiet"`) and both clients read it; the app's client-side version then becomes a thin toggle. Keeps the gate on the server (AD8) |
| T3 | Themes per pane, per arc and per mark; themes pane with live preview and target cycling; follow-the-OS | `panes/themes/index.tsx:43`, `theme/attire.ts` | 3 | the TUI has `theme-<name>` only. Per-arc is already on the record (S15 `POST /arcs/{slug}/theme`), so the TUI's arc chips and arc-bound panes should wear it; per-pane attire needs a pane-scoped palette in OpenTUI |
| T4 | Turn ledger: a row per settled prompt with the turn's files, `u` restore, `f` fork, inline file counts | `page/ledger.tsx:109`, `turn-ledger.ts:71` | 2 | `POST /restore` exists and the TUI has no caller; a transcript row kind over the checkpoint ordinals |
| T5 | Restore to a turn and fork-from-turn as commands | `restoreSessionTurn` | 1 | `/restore <n>` beside `/undo`; the backtrack picker already forks |
| T6 | Rename a session | `renameSession` | 1 | `/rename <title>`; the route pins the title against the auto-titler already |
| T7 | Context map pane: one cell per percent with parts and fences | `panes/context/index.tsx:46` | 2 | `GET /sessions/{id}/context` parts exist (S19); the TUI has `/context` as a text report and the gauge styles; a `context` pane kind |
| T8 | Diff pane: side-by-side merge view, `n`/`p` hunk walk, per-turn `u`/`shift+u` | `panes/diff/index.tsx:23` | 2 | the TUI's diff is unified and read-only with no hunk cursor; add the hunk walk and turn grouping |
| T9 | Permissions as a pane (rules, workspace grants, session grants, `x` revoke) rather than an overlay | `panes/permissions/index.tsx:18` | 1 | the TUI's overlay already does `r`/`d`; promote to a dockable pane for parity of posture |
| T10 | Trust setup (posture pane): proposes rules from manifests, MCP servers and bots after trust; records grants ahead of the first ask | `panes/posture/index.tsx:26`, `posture/trust-setup.ts:291` | 3 | S23 grant routes exist; the TUI's `/init` grants trust and stops. S24 `GET /workspace/toolchain` moves detection server-side so both clients share one proposal list (keywork server, 1pt) |
| T11 | Bots pane, MCP pane tool listing `enter`, workspaces pane: parity exists except the bots pane | `panes/bots/index.tsx:26` | 1 | a `bots` pane kind in the TUI (`/bots`); the app's MCP pane lacks the TUI's sign-in hint (0.5 app) |
| T12 | Memory decisions lens (`w`) reading `memory.decided` | `panes/memory` decisions lens | 1 | K18 in 121: the TUI subscribes already (`conversation-model.ts:518`) but shows nothing |
| T13 | Session tree: nested delegate children, `shift+x` show trash, `shift+d` empty trash, `d` discard | `panes/tree/index.tsx:47` | 1 | the TUI has `t` trash view and `enter` restore; add discard and purge keys (the CLI verbs exist) |
| T14 | `alt+1..9` focus pane N, `alt+z` zoom, rotate split | `keys/actions.ts` | 1 | small keymap additions |
| T15 | Native toasts click-to-focus, tray badge | main process | 0 | terminal has no tray; OSC 777/9 is the TUI's equivalent, already built |
| T16 | Fan-out and compare (W8.3), hunk verdicts (W9.1), talk to the diff (W9.2), review ledger (W9.3), search (W10.3), richer export (W10.4) | planned, not built in the app | | shared future; see §5 |

## 4. Defects found on the way

| Repo | Defect | Where | Size |
|---|---|---|---|
| app | Palette collisions are silently dropped: `register()` returns `{ kind: "collision" }` and the caller ignores it. Memory's `approve` loses to the core `approve`; `garden` is claimed twice | `ui/src/shell/workspace-view.tsx:372`, `palette/commands.ts:19-26` | 1 |
| app | The updater downloads but never installs: `onUpdateReady` and `acceptUpdate` have no renderer caller, `autoInstallOnAppQuit` stays false | `desktop/src/main/updater-electron.ts`, `ui/src/host/port.ts:13` | 1 |
| app | Keybinding overrides never load (see A12) | `ui/src/keys/config.ts:37` | with A12 |
| app | `moveSessionLeaf` and `injectPrompt` are wrapped in the client and called by no pane; `listMemoryInbox` and `readMemoryLedger` likewise | `shell/session-store.ts:350` | 1 (wire leaf jump into the tree; inject feeds W9.2) |
| app | Context pane `f` prints "keywork has no route to flush now" | `panes/context/index.tsx:99` | needs `POST /sessions/{id}/flush` (keywork, 1pt) |
| keywork | `docs/backlog/README.md:97` still says 118 has "nothing else built"; 121's ledger says K10/K13/K15 are uncommitted and they are committed | docs | 0.5 |
| keywork | `keywork attach` mounts only `conversation` and `session-tree`; file and workspace panes are refused and `/permissions` is absent in attach mode | `cli/src/attach.ts:20-62`, 115 pickup item 2 | 2 (attach parity is what makes the TUI a real second client of one server) |
| keywork | S14 leftovers: cost does not survive a restart, zero-turn cost rows kept, compaction summaries unmarked, `?layer` ignored on a single note, `used` still `basis: "estimated"` | `cli/src/serve.ts:1058-1077`, `routes/memory.ts:181-186`, `session-verbs.ts:405` | 2 |

## 5. Shared future: build once on the server, render twice

These are in the app's waves 8 to 10 and absent from the TUI. Each is a keywork route first,
then one lane per client.

| Server task | Route | Then in the app | Then in the TUI |
|---|---|---|---|
| PD12 modes | `POST /sessions/{id}/mode`, live `session.mode` | replace the stub, `shift+tab` cycles | `shift+tab` cycles (today it steps the fold cursor), `modeWord` in the title bar |
| S16 quiet | above (T2) | thin toggle | `leader shift+s` |
| S17 desk rows | `live`, `waiting`, `changes` on `GET /sessions` | desk honest for unopened sessions | desk pane (T1) |
| S11 hunk revert | `POST /sessions/{id}/changes/{path}/revert { range }` | W9.1 keep/revert | diff pane `k`/`r` |
| S12 spills | `GET /sessions/{id}/spills/{id}` | spill viewer returns | already local; switch to the route under attach |
| S13 search | `GET /search?q=&in=` | W10.3 palette search | `/search` picker |
| S21 isolated sessions | `POST /sessions { isolated: true }` | fan-out and compare | `/split-isolated` |
| S22 asides | `POST /sessions/{id}/aside` | side question | `/btw` moves off the in-process path |
| S24 toolchain | `GET /workspace/toolchain` | posture pane stops mirroring `events.md` | trust setup after `/init` |
| S25 decider state | `decider` on `GET /memory`, `surface.changed: decider` | AJ4/AJ5 cards | doctor row already; a memory-pane line |
| S10 one serve per workspace | drop the user-level ticket | second window (W7.4) | second terminal on a second workspace |

## 6. Suggested lane order

1. **Wire drift and defects first** (§1, §4): one app lane, one keywork lane, both small, both make the
   contract gate catch the next drift. Nothing else should land on a contract the app misreads.
2. **Server lane for the shared future** (§5): PD12, S16, S17, S10, S24, flush, forget, attachments,
   queue verbs, `GET /extensions`, `GET /doctor`. Engine-dictated shapes, tests in `server.test.ts`,
   `docs/events.md` in the same change, contract bumped.
3. **App catches up to the TUI** (§2): A11 tray and A14 slash grammar first because they unlock
   A10, A13, A15; then A1 to A9 as the server verbs land; A12 keybindings and A20/A21 anytime.
4. **TUI catches up to the app** (§3): T2 quiet and T1 desk once S16/S17 exist; T3 themes; T4 to
   T8 are pure TUI work over routes that already exist and can start immediately.
5. **Attach parity** (§4 keywork row): every TUI pane mountable over `serve`, so the terminal and
   the app are truly peers on one bus (AD2).

Totals, rough: app ≈ 38pt, keywork server ≈ 22pt, keywork TUI ≈ 26pt.

## Round 1 ledger (2026-10-25, uncommitted, no tests written or run by Jordan's call)

Five lanes landed in one sitting. keywork went to contract 1.5 with five new route families
(quiet S16, flush, forget, queue verbs and `behavior: "now"`, spills S12), S17 desk rows
(`working`, `waiting`, `changes`, `costNanos` on `GET /sessions`), S10 one serve per workspace,
the S14 leftovers (cost survives a restart on the session entries, zero-turn rows dropped,
`?layer` on a note, `summaries` on `readSession`, reported `basis`), and `setArcTheme` on the
typed client. The TUI gained the turn ledger with `/restore`, `/rename`, the `context` pane,
diff hunk walk with turn grouping and `u`/`shift+u`, `permissions` and `bots` panes (the
permissions overlay retired), the memory `w` decisions lens, trash `d`/`shift+d` and nested
children, `alt+1..9` and `alt+z`, arcs worn in their theme with `/theme-arc`, quiet on
`leader shift+s` (split-arc moved to `leader shift+a`), attach parity for eleven pane kinds,
and a keybindings file that skips unknown actions. The app reads contract 1.5 field for field
with a shape-diffing contract gate, asks why on a denial, installs updates, jumps the leaf,
loads and hot-reloads keybinding overrides, has the pane tray, one slash grammar across
composer and palette with arguments, copy verbs, the bot purpose step, open-in-editor at the
line, quiet as the server's posture, desk and tree rows from the server, context `f` flushing,
`/forget`, queue editing and `ctrl+enter`, the spill viewer with find, and `¶` summary rows.
Gates: `bun run check` green in both repos on the non-test checks; vitest not run, and each
lane listed the expectations that moved. Open from the lanes: PD12 modes, S11, S13, S21, S22,
S24, S25, extensions and doctor routes, per-pane themes in the TUI, forgotten rows unmarked
until reload in the app, macOS terminal editors, `ci.yml` not running `check:contract`.

## Taste pass 1 (2026-10-25): what two hands-on runs found

Two report-only runs on the uncommitted round 1 trees: the TUI driven through the e2e harness
in `C:\src\tastepass-tui`, the app driven through Playwright's Electron launcher against a
`keywork serve` in `C:\src\tastepass-app`, each building a small `tally` CLI with a real
model (OpenRouter, under $0.10 total). Frames and screenshots are in the session scratchpad
(`tui-taste\frames\*`, `app-taste\shots\*`). Items marked ✓ were re-read in the code by the
lead; the rest are the runs' observations.

### Broken (fix before anything else)

| # | Where | What | Direction |
|---|---|---|---|
| B1 ✓ | TUI | An ask takes the composer's keys with no arming delay: typing "why" approved a write on its `y`; a session grant was recorded 5 ms after the ask appeared | route keys to the ask only once it is shown focused, dim the composer, ignore `y`/`a`/`enter` for ~400 ms (`conversation-model.ts:345`, `mutation-ask.ts`) |
| B2 ✓ | app | Server loss is invisible: the status line keeps `attached`, a sent prompt vanishes, reattach never happens, reopen spins on `starting keywork` forever | `desktop/src/main/workspace.ts` holds an attached server with no process to watch (`hold(path, opened, undefined)`), so `onServerLost` never fires; add an SSE-loss and ticket re-probe signal, keep the unsent prompt, time out the spawn fallback with a reason |
| B3 ✓ | app | Trust on an attached server does nothing: `reopens: true` reattaches the same process, `GET /permissions` stays untrusted, the posture pane sits on `reading what keywork knows` | server lane: `serve` recomposes itself on trust (or exits with a reopen code the app honours); app: say plainly when the server must restart; posture `begin()` must not race the trust arrival |
| B4 ✓ | TUI | Diff pane `u` undoes the whole turn with no confirm while the rule line says `hunk 1 of 1 · u undo` | make `u` hunk-scoped (needs S11) or ask the way the ledger restore does; same confirm in the app's changes pane |
| B5 ✓ | TUI | `keywork attach --pane <any>` crashes: `Cannot access 'core' before initialization` (`app.ts:316` via `attach.ts` posting a notice synchronously inside `subscribe`); predates this round | defer the first post until after `runApp` builds `core`; fix the usage text that still lists two panes |
| B6 | app | Changes pane `shift+u` says `nothing to redo` right after its own `u`; palette `redo` works | `panes/diff/turn-verbs.tsx` reads a stale `redoable`; refresh it from the undo reading |
| B7 | app | Keyboard cannot reach the turn ledger; `tab` from the composer escapes into other panes' buttons | ledger rows join the transcript focus walk; trap `tab` inside the pane |
| B8 ✓ | TUI | A staged restore is never persisted: after relaunch the files are gone, the transcript shows the old turn, `/redo` has nothing | journal the rewind and redo ref at staging (`prompt-undo.ts`) |

### Wrong (lands with the broken set, one lane per repo)

| # | Where | What | Direction |
|---|---|---|---|
| W1 ✓ | engine | A denial reaches the model only as `declined by user`; it retries the same write and later claims it saved | carry `reason` into the tool output with a do-not-retry sentence; `other` gets a free-text line in both clients (`agent.ts:838`) |
| W2 ✓ | engine | Bash output is head-clipped at 30k chars below the 64 KB spill threshold, so tails (test summaries) vanish and spills never happen for bash; no `CI=1` so vitest watch mode hung two minutes | let spill bound output with head and tail; set `CI=1` in the bash env (`tools/command-run.ts:4`) |
| W3 | engine | Turn facts drift: ledger `7 files · +1988` became `1163 files · +816233` after relaunch (node_modules), change counts are workspace-wide not per session in both clients, a restore wiped another session's edits without saying | freeze per-turn facts in the journal at turn end; exclude node_modules and .git from snapshots; S17 `changes` per session; restore confirm names files other sessions touched since |
| W4 | engine | Journal order: permission entries are written live, the turn's messages at settle, so the tree and the export open with ~20 raw `permission_ask` rows before the prompt; `assistant:` and `tool:` rows blank; prompt timestamp is the settle time | write the prompt entry first; label tree rows; hide journal-only kinds in tree and export (both clients) |
| W5 | engine + TUI | Context numbers disagree: `/context` estimates, the pane reports; after compaction the text says 21k and the pane 26k; app title shows `14k 31k` unlabelled | one reading with `basis` everywhere; re-measure after compaction; format `3.8k`; label the two numbers |
| W6 | app | `/forget` says the transcript keeps the original, but after reload the prompt is gone and the ledger numbering skips | draw forgotten entries as dim rows in replay (`client/projection/history.ts`) |
| W7 | app | The memory flush renders as a user prompt (`Context is nearly full…`) and counts as a turn | a dim `memory flush · 11 facts kept` row; the flush must not be a user message on the wire |
| W8 | app | Open in editor fails silently when `code` is not on PATH, then hands `.ts` to the OS (Windows Media Player) | show the reason; reveal in Explorer instead of a non-associated opener |
| W9 | app | Same denial worded two ways: live `refused · you said no`, replayed `failed · declined by user` | one projection path for live and replay |
| W10 | TUI | Help overlay drops the chords it teaches (quiet has none, `focus pane 1` nine times with no `alt+N`, chord column clipped) | fixed chord column, clip text, collapse to `alt+1..9`, type-to-filter |
| W11 | TUI | Palette hides argument commands; `>theme-arc dracula` says no match | parse `name args` and run, as the app now does |
| W12 | TUI | Bots pane stale after creating a bot; a border paints across the new-bot dialog | refresh on the bots port change; overlay z-order |
| W13 | TUI | Session grants vanish on relaunch; `/permissions` `r` and `d` are two verbs for one act | persist session grants to the ledger; one key |
| W14 | app | Permissions pane: `(untitled session)` names, ~50 bundle rows first, cursor never scrolls into view | `sessionName()`, scroll-follow, bundle folded by default |

### Rough and polish (one sweep lane per repo after the above)

TUI: clipped text in every docked pane at split width (wrap, or keys first); ask rows show raw JSON instead of `write package.json · new · 20 lines`; tool times include approval wait; `alt+1..9` ordinals invisible; slash completion offers node_modules paths with glued descriptions; `/init` needs a restart and loses the conversation pane; plurals (`1 panes`, `1 hunks`); tree says `no sessions yet` during the first turn; steer and queue share `⋯`; turn numbering jumps over shell escapes; `/forget` offers shell rows then refuses; `serve` prints its token to stdout; `keywork --help` unknown; doctor counts crash-log lines as crashes; no `¶` summary rows after `/compact`.

App: notices overflow with a horizontal scrollbar instead of wrapping; narrow dock at 1000x700 shows no session rows; `deleted … for good` notice never clears; no follow-scroll after sending while scrolled up; session names are the full first prompt and forks share them; slash menu leads with `/exit /zoom /rotate`; `/model` offers only the current model, `/arc` only `none`, `/effort` values repeat one description; palette search returns `mark <full prompt>` rows; keys overlay has two chords with one help line; decisions lens heading in caps; trust setup offered `npm test *` but the agent ran `npx vitest`; export defaults to `session.html` inside the repo and overwrites the clipboard with 27 KB.

### Genuinely good, keep

Ask cards with inline write diffs and exact coverage words; the why step; the desk answering asks for sessions this window never opened; quiet's mark and notices in both clients; trash, restore and fork confirms; the context map as an instrument; `/theme-arc` dressing a pane and surviving relaunch; queue editing; the diff `n` crossing files and `enter` opening at the hunk; keybinding hot reload with exact refusals; keywork-day and keywork-night both finished; bot naming and purpose.

### Environment notes

Bun 1.3.9 segfaulted twice in the TUI harness right after `ctrl+c` cleared the composer; re-run on the pinned 1.3.14 before blaming keywork. The app's bundled sidecar is a stale 0.1.1 (gitignored); the app attached to a repo-run `serve` instead. One taste lane's process cleanup killed the other's server, which is how B2 was found.

### Round 2 ledger: engine + server

Landed 2026-10-25 in `C:\src\keywork`, uncommitted, no tests written or run. Contract `1.5` to
`1.6`; both fixtures regenerated. The full write-up is the "Round 2 engine and server lane" entry
in keywork's `docs/backlog/118-app-surface.md`; this is what each client has to know.

**Wire changes (all additive in shape; three change what a 1.x field means, marked).**

| # | Where | Change |
|---|---|---|
| W1 | `POST /asks/{callId}` | Body takes `note?: string`, trimmed, 1 to 1000 characters, beside `reason`; anything else is a 400 whose `error` names the full shape. The app's `other` answer should send the typed words as `note`. |
| W1 | `gate.permission` | `decision.note?: string` on a denial that carried one. |
| W1 | `tool.finished` of a refused call | **Meaning moved.** `output` is now several lines: `declined by user` plus the reason on the first (`· they judged this call unsafe`, `· not now, though the call itself may be fine later`), `The user said: "…"` when there was a note, then a do-not-retry line. W9's single projection should word the row from `gate.permission` (`verdict`, `reason`, `note`) and show at most the first line of `output`. |
| W3 | `GET /sessions/{id}/changes`, `changes.updated` | **Meaning moved.** Only files this session's turns touched, each with its net change since the session's first checkpoint; `turn` is this session's own ordinal. Another session's files no longer appear. |
| W3 | `GET /sessions` rows | `changes` falls back to the totals the session's latest `turn_facts` froze, so a desk keeps the figure after a restart. |
| W3 | `GET /sessions/{id}/restore?turn=N` (new, `previewSessionRestore`) | `{ turn, prompt: { entryId, text }, undoneTurns, files: [{ path, added, deleted }], others: [{ sessionId, title, paths }] }`; 400 for a bad `turn`, 404 for an unknown session or turn. The ledger's restore confirm should call it and name `others` (for example `turn 3 and 4 files go back · 1 of them session "tally tests" changed since`). |
| W3/W4 | session log | A `custom` entry `turn_facts { prompt, checkpoint?, settled?, files: [{ path, added, deleted }], session?: { files, added, deleted } }` closes every settled turn under `serve`. A ledger should read `files` from it instead of diffing checkpoints. The prompt entry is written when the turn starts (its `timestamp` is the real start) and carries `checkpoint` in `GET /sessions/{id}/entries` once its facts exist; on disk the checkpoint lives in the facts entry. |
| W4 | `GET /sessions/{id}/entries` | `journal: string[]`, the ids of evidence-only entries (permission asks and decisions, context injections, memory decisions, shell resets, session grants, turn facts). Tree, transcript and export hide every id it names; go by the list, not by `customType`. The HTML export already leaves them out. |
| W5 | `GET /sessions/{id}/context` | **Meaning moved.** `used` is everything the next request carries (equal to the parts less `free`), and `flushAt`/`compactAt` sit on that same axis (`thresholds` repeats them). `fullness`, `flushDue` and `compactionDue` decide exactly as before. Use `used` with `basis` for every number the app shows (title, gauge, pane); after a compaction the next read is a fresh `estimated` measure. |
| B3 | `POST /workspace/trust` | Answer gains `recomposed: boolean`. On `keywork serve` the server recomposes before answering: `recomposed: true, reopens: false`, then `surface.changed { kind: "permissions" }`; `GET /permissions` is trusted at once. Open sessions were closed and reopen on their next request (a running turn was interrupted, pending asks refused); URL, token, ticket and SSE stay. The app should re-read posture and permissions on `recomposed`, never restart for it, and keep its restart path only for `reopens: true`. |
| rough | `keywork serve` stdout | `token <value>` prints only when stdout is not an interactive terminal; the app's spawn reads a pipe, so it still gets the line. |

**keywork's typed client** (`@keywork/server`): `answerAsk(callId, verdict, scope?, denial?)`
takes `{ reason?, note? }` as its fourth argument (it was a bare reason), and `previewRestore(id,
turn)` is new.

**Existing tests whose expectations need moving** (left as they are):
`engine/src/agent.test.ts` lines 261 and 651 (exact `declined by user`);
`engine/src/tools/command-run.test.ts` "forwards every chunk but keeps only the first
maxOutputChars" (head and tail now, 1 Mi ceiling; its import is aliased so it compiles);
`engine/src/session/context-map.test.ts` "anchors on the usage of the agent's last request"
(pins `used` to the conversation estimate; it is now the whole request);
`server/src/server.test.ts` "splits the window into the
parts the next request carries" (`used`) and the trust `toEqual` near line 1858 (gains
`recomposed: false`); `cli/src/serve.test.ts` the trust `toEqual` near line 1590 (gains
`recomposed: false`), "splits the context window into the parts the composed request carries"
(`used`), and any case that counts or orders raw session entries (a `turn_facts` entry now
closes each turn and the prompt comes first).

**Not done here.** The terminal still writes prompts at settle and writes no `turn_facts`; the
118 entry spells out the few lines the TUI lane needs (`settledTurnFacts`, `recordTurnFacts`).
Until then a TUI session's edits are invisible to a `serve` session's restore preview.
`keywork sessions decisions` does not export `note` yet (`cli/src/sessions/decisions.ts`). A
timed-out ask under `serve` still reads `this run has no one to ask`, which is wrong for a server
whose person stepped away. The memory flush still lands as a user message on the wire (W7).

### Round 2 ledger: app

Landed 2026-10-25 in `C:\src\keywork-app`, uncommitted, no tests written or run.
`KEYWORK_REPO=C:/src/keywork bun run check` is green: contract mirrored to `1.6`
(`previewSessionRestore`, `decision.note`, `journal` on entries, `recomposed` on trust),
keywork's event-shapes fixture copied, client fixtures re-recorded with `fixtures:record`.

| # | What changed | Where |
|---|---|---|
| B2 | Main watches an attached server: a 4 s ticket heartbeat (two misses) and the relay's own signal (a failed fetch, or a stream that breaks mid-body) both lead to one loss path. A lost entry stops handing out its ticket, so requests fail fast, then reattaches: four ticket probes over 7.5 s, then a spawn of its own. `host:server-regained` tells the window; the feed's retry wait is woken so SSE reconnects at once, and the session store resyncs on reconnect (sessions, open transcripts, trees, changes) beside the stores that already did. A spawned server's crash reports `retrying` and regains the same way. `open` on a held attached entry probes it first, so a reload never hands back a dead ticket. Spawn gives up after 30 s with the last stderr line; the `--version` and `where` probes give up after 5 s; the open screen counts seconds after 3. Status reads `server lost · reattaching`, then `server lost · <why> · /reconnect tries again`; the composer holds the prompt while lost, and a send that fails anyway lands back in the composer with the reason. Relay refusals carry a JSON `error`, and failures sent to the renderer no longer carry the server token (they did for `unreachable` and `version-mismatch`). | `desktop/src/main/{workspace,serve-process,server-relay,child,host}.ts`, `shared/channels.ts`, `preload/index.ts`, `client/src/{client,feed}.ts`, `ui/src/app.tsx`, `ui/src/shell/{server-standing.ts,workspace-view.tsx,session-store.ts,open-screen.tsx}`, `ui/src/chrome/status-line.tsx`, `ui/src/host/{port,browser}.ts`, `panes/conversation/index.tsx` |
| B3 | Trust follows what the server says. `recomposed: true` re-reads trust and posture and names the costs (`open sessions reload on their next prompt · any running turn stopped and its asks were refused`). `reopens: true` first waits 2 s for an in-place recompose, then restarts a spawned server, or on an attached one waits up to 20 s for `GET /permissions` to turn trusted (an exit and reopen rides the B2 reattach). Still untrusted after that is a new `stale` state: `trust is recorded … but the keywork serve this window attached to started before it`, with `check again`. Trust only reads as trusted once `/permissions` agrees. The posture review mounts only on `trusted`, its reads are sequenced so a late one cannot overwrite a newer one, and it begins again on reconnect. | `ui/src/shell/{trust.ts,trust-card.tsx,workspace-view.tsx}`, `posture/trust-setup.ts`, `panes/posture/index.tsx`, `protocol/src/workspace.ts` |
| B6 | The changes pane keeps the `undoable`/`redoable` its own undo or redo reading returned until the session's standing moves. Root cause fixed as well: a `session.state` arriving while a session reloads is no longer dropped by the `asOf` filter. | `panes/diff/turn-verbs.tsx`, `shell/session-store.ts` |
| B7 | Every pane traps `tab` inside its body. In the conversation, `tab` from the composer lands on the newest transcript row; `j`/`k` or the arrows walk rows (ledger, tool, thinking, summary, flush); `tab` or `esc` goes back to the composer; stamp fold buttons left the tab order. The changes pane's `u` asks first and names what goes, from the restore preview: `undo turn 3, "…"? 2 files go back · it also undoes 1 file "tally tests" changed · shift+u redoes it · y confirms · any other key cancels`. The ledger's restore confirm names `others` the same way. | `chrome/{tab-trap.ts,pane-frame.tsx}`, `panes/conversation/{walk.ts,index.tsx,turn-ledger.ts}`, `page/{pane.tsx,ledger.tsx}`, `panes/diff/{turn-verbs.tsx,index.tsx,diff.css}` |
| W6 | A session now replays with its entry log: prompts are aligned to the path from the end (checked text for text, else plain replay as before), forgotten prompts come back at their turn, every replayed prompt carries its `entryId`, and the transcript draws forgotten prompts dim with `forgotten · out of the model's context`. A forget reloads the session, so the mark shows at once. Ledger numbering stays whole because the forgotten turn is a turn again. | `client/src/projection/{journal,history}.ts`, `shell/{session-store,controls-store}.ts`, `page/{pane.tsx,page.css}` |
| W7 | A user message that starts with the flush prompt becomes a `flush` entry: one dim row, `memory flush · 11 facts kept` (or `nothing worth keeping`), unfolding to the facts. It never starts a ledger turn. The marker is mirrored as `memoryFlushLead` in the protocol package. | `protocol/src/memory.ts`, `client/src/projection/{types,project}.ts`, `page/pane.tsx` |
| W8 | Nothing falls back to the OS opener any more. With `VISUAL`/`EDITOR` unset, the first of code, cursor, windsurf, codium, zed, subl on PATH is used; a configured editor missing from PATH, failing to start, or a terminal editor with no terminal reveals the file in Explorer or Finder instead, and the notice says why: `couldn't open an editor · code isn't on PATH · showed src/x.ts in Explorer instead`. File links in the transcript take the same path. Status notices stay up for a reading time (2.4 to 9 s by length). | `desktop/src/main/{editor,host}.ts`, `shared/channels.ts`, `ui/src/host/{editor,port}.ts`, `chrome/reading-time.ts` |
| W9 | Replay feeds the journal's `permission_decision` entries back as `gate.permission`, so live and reloaded denials pass through one `decide()` and read the same (`refused · you said no`). A denial's `note` shows after the reason, clipped at 60 characters. The why step's `o` now opens a line for the person's own words, sent as `note`; `esc` there denies without words. | `client/src/projection/{journal,history,project}.ts`, `client/src/client.ts`, `page/{ask-card.tsx,ask-card-why.ts,ask-card.css}` |
| W14 | Session groups use the session name helper (a short id when nothing better is known), the bundle folds to `bundle · trusted · 48 read rules · b shows them`, and every overview row scrolls to stay in view under the cursor (all overview panes, not only this one). | `panes/permissions/index.tsx`, `panes/overview/rows.tsx` |
| W4 | The tree hides every id in `journal` and hoists their children; a leaf on a journal entry marks its nearest shown ancestor; blank message rows now read `assistant: calls bash` or `tool: 1 tool result`. The ledger reads each turn's files from its `turn_facts` when present. The export is the server's and already filtered. | `client/src/projection/{tree,ledger}.ts`, `protocol/src/sessions.ts` |
| W5 | The title gauge number reads `in context`, so it no longer sits unlabelled beside the session's token total. | `instruments/gauge.tsx`, `chrome/title-row.tsx` |
| rough | Control-row notices wrap instead of scrolling sideways. The sessions tree's trash notices clear after a reading time. The transcript follows its tail while you sit at the bottom and jumps back to it when you send. An empty `/` lists the focused pane's own commands first. Export saves to Downloads and leaves the clipboard alone. | `panes/conversation/{conversation.css,index.tsx,controls.ts}`, `panes/tree/index.tsx`, `panes/overview/rows.tsx`, `page/follow.ts`, `palette/slash.ts`, `desktop/src/main/host.ts` |

**Wire asks for keywork.**
1. W7: write the flush as its own entry (a `memory_flush` custom message, or a journal entry holding the kept facts) instead of a user message. Today it counts in `userPrompts`, so the turn after a flush is numbered one higher, and the app cannot renumber without breaking `POST /restore`.
2. W6: let `GET /sessions/{id}` say where context edits sit, the way `summaries` does (`edits: [{ index, entryId, kind, text }]`), or give each message its entry id. The app's alignment is checked and falls back cleanly, but a forgotten tool result that empties an assistant message, or a forget just before a compaction boundary, can still place a forgotten prompt a row off.
3. Live `turn.started` carries no `entryId` (`agent.ts:452`). Now that the prompt entry is written at turn start it could, so live prompts match the ledger by id instead of by text.
4. Optional: a periodic SSE comment from `serve` would let the app tell a hung server from a quiet one without its own probe.

**Existing tests whose expectations move** (left as they are; three test fakes gained one `previewRestore` line so the types compile: `ui/src/shell/{shell,trust-arrival,workflows}.test.tsx`):
`desktop/src/main/workspace.test.ts` "reuses an open workspace… and relays losses" (a loss now carries `reattaching`);
`ui/src/panes/conversation/conversation.test.tsx` "offers a save named for the session beside the clipboard copy" and "says a cancelled save plainly and keeps the clipboard copy" (export no longer copies);
`ui/src/panes/permissions/permissions.test.tsx` "lists the trusted bundle read-only…" (the bundle folds by default) and the `sessionGrantGroups` case near line 277 (an unknown session reads `session <id>`);
`client/src/fixtures.test.ts` with its snapshot, `client/src/projection/tree.test.ts`, and any tree pane case built on the re-recorded fixtures (journal ids hidden, `turn_facts` entries, the new denial output);
`ui/src/shell/session-store.test.ts`, `ui/src/panes/conversation/turn-ledger.test.tsx` and `ui/src/shell/trust-arrival.test.tsx` if they count entry fetches or expect the posture review before trust settles (a session load now fetches its entries, and the review waits for `trusted`).

**Not done.** The desk's deny path has no words line (only the transcript card does). Nothing here was driven in the real app; the heartbeat, reattach and recompose paths want a hand run (kill an attached `serve`, start it again, trust an attached workspace).

### Round 2 ledger: TUI

Landed 2026-10-25 in `C:\src\keywork` on top of round 1 and the engine lane, uncommitted, no
tests written or run. `bun run check` is green (types, pins, guardrails, prose, contract, lint).
Files outside `packages/tui` that this lane touched: `cli/src/dispatch.ts`, `cli/src/remote-panes.ts`,
and the local session port (`cli/src/sessions/ports.ts` plus three new neighbours,
`rewind-journal.ts`, `grants-journal.ts`, `turn-journal.ts`), because the journal for B8, W13 and
turn facts can only be written where the store lives.

| # | What changed | Where |
|---|---|---|
| B1 | An ask arms 400 ms after it is first painted in a focused pane, and again whenever that pane regains focus. Until it arms, every key goes to the composer, so typing `why` lands as `why` and approves nothing. A key that isn't an ask key while it is armed also goes to the composer and holds the arming another 400 ms, so a typist can't trip it mid-word. While armed the composer dims and loses its cursor and the busy-prompt hint goes away; the `[y] allow  [n] deny` controls only show once they are live (dim on an unfocused pane), which doubles as the e2e marker. Pasting during an ask goes to the composer. Ask rows read `write package.json · new · 20 lines`, `edit src/a.ts · +2 -1`, `bash npm test` instead of raw JSON. | `mutation-ask.ts`, `conversation-model.ts` (`handleAskKey`), `conversation-pane.ts` |
| B1 + W1 | The why step: `o` opens a free-text line under the ask (`› …▌`, enter sends, esc skips, 1000 chars max), and the denial goes out as `reason: other` plus `note` on the local engine path. `[a]` now answers `scope: "session"`, so the journal records an always-grant as a session grant instead of a one-off. | `mutation-ask.ts`, `conversation-pane.ts` |
| B4 | Diff pane `u` asks first: `undo turn 3? y undoes, any other key keeps it · its prompt, reply and 2 files go back · /redo brings them back`. The rule line says what `u` does: `hunk 1 of 2 · n p hunks · u undoes turn 3 · shift+u redoes · enter opens`. Hunk-scoped undo still needs S11. | `diff-model.ts`, `diff-pane.ts` |
| B5 | `runApp` subscribes to notices, MCP drops and extension notices after `core` exists, so a notice posted inside `subscribe` (attach does this) no longer hits the TDZ. Usage lists every attachable kind. | `app.ts`, `cli/src/dispatch.ts` |
| B8 | Staging a restore or `/undo` journals a `restore` entry `{ from, files, redo }` at the rewound leaf, so a relaunch opens on the rewound transcript; `redo` is the snapshot taken before the files went back. On reopen the pane re-stages it: the title says `undo staged`, the prompt goes back into an empty composer, and `/redo` puts the files back, moves the leaf to `from`, writes `restore-undone` and splices the retold turn back into the transcript. Sending a prompt keeps the restore, as before. A restore whose files moved but has no snapshot (a server-written one) is not offered after relaunch. | `prompt-undo.ts`, `session-attachment.ts`, `conversation-model.ts` (`adoptStagedUndo`), `cli/src/sessions/rewind-journal.ts` |
| W5 | `/context`, the context pane and the title all read the engine's one `AgentContext` (`readAgentContext`, the request axis, with `basis`). `/context` prints `context 8.7k of 200k · 4% · conversation 3.8k as the provider reported it last turn`, then `memory flush at 180k · compaction at 188k`, then the window line. The title gauge labels its number `context 8.7k` (bar style `… context 8.7k of 200k`), and the unpriced spend reads `12k in 3.4k out` instead of `12000▸3400`. It re-reads after compaction because the agent swaps. | `context-map.ts` (`contextReadout`), `context-gauge.ts`, `session-ledger.ts`, `conversation-model.ts` |
| W10 | Help overlay: a fixed chord column sized to the widest chord (cap 18), help text clips and chords don't, the nine `focus pane N` rows fold into one `alt+1..9` row when all nine sit on their digits, and typing filters (backspace edits, esc clears the filter, a second esc closes). The panel is 72 wide. | `overlays/help.ts`, `view/overlays.ts` |
| W11 | The palette parses `name args`: `>theme-arc dracula` shows `theme-arc dracula` and enter runs it with `dracula`. Commands that need an argument are listed now; enter or tab on one completes `>theme-arc ` instead of running it bare. | `overlays/palette.ts`, `commands.ts` (`named`) |
| W12 | The bots port gains `subscribe`; the TUI wraps any port so a create announces itself, and the served port relays `surface.changed { kind: "bots" }`, so the bots pane refreshes after the new-bot dialog. Every overlay now sits on a one-cell moat of background, so pane borders stop short of a dialog instead of running into its edge. | `bots.ts`, `app.ts`, `cli/src/remote-panes.ts`, `view/overlays.ts` |
| W13 | Session grants persist: every change writes a `session_grants { rules }` snapshot (journal-only per the engine) and reopening adopts the latest one, revokes included. `/permissions` has one verb, `r`, for workspace and session grants alike (`d` is gone). | `held-grants.ts`, `mutation-ask.ts`, `permissions-model.ts`, `permissions-pane.ts`, `cli/src/sessions/grants-journal.ts` |
| W3/W4 | The terminal now writes the prompt entry when the turn starts and a `turn_facts` entry right after the turn's messages at settle (`settledTurnFacts` plus `recordTurnFacts`, checkpoint from `takeTurnTag()`), through a serial `SessionWriter`. The tree hides journal-only entries and stops showing blank `assistant:` and `tool:` rows (`calls write, bash`, `2 tool results`, `restored to an earlier turn`). | `session-writer.ts`, `session-attachment.ts`, `session-tree-model.ts`, `cli/src/sessions/turn-journal.ts` |
| rough | Plurals (`1 pane`, `1 hunk`, `1 entry`, `1 line`); `keywork <command> --help` prints usage instead of `Unknown option`; shell escape output goes through `clipToolOutput` before it reaches the transcript or the model. | `pluralize.ts`, `view/status-bar.ts`, `diff-pane.ts`, `browser-pane.ts`, `file-pane.ts`, `session-tree-pane.ts`, `cli/src/dispatch.ts`, `conversation-model.ts` |

**Decisions where the brief was open.** B1 types through rather than swallowing: keys during
the arming window land in the composer, so nothing typed is ever eaten and nothing is approved
by accident. B4 confirms rather than going hunk-scoped. W13 journals a snapshot of the held
rules rather than replaying decisions, so a revoke survives a relaunch too; the TUI keeps its own
`HeldGrants` (shared `SessionGrants` plus `adopt`) because shared was off limits this round.
Grants read from the whole log, not the active path, so a restore doesn't quietly drop them.

**Asks of other lanes.**
- Shared: give `SessionGrants` an `adopt(rules)` so `tui/src/held-grants.ts` can go.
- Server: `serve`'s `restore` entries carry no `redo` snapshot and its staged undo lives in
  memory, so an attached session can't `/redo` after a server restart; the local shape
  (`{ from, files, redo }` plus `restore-undone`) is ready to share. Session grants under `serve`
  live in `PermissionLedger` memory; `session_grants` snapshots would carry them across a restart.
- Server: the local `turn_facts` carry no `session` totals (`sessionFilesAt` lives in
  `serve-changes.ts`).
- `cli/src/sessions/decisions.ts` still doesn't export `note`; untouched here.
- An attached TUI never answers asks (the server answers no), so `POST /asks` with a `note` has
  no TUI caller yet.

**Existing tests whose expectations need moving** (left as they are, apart from one block):
`tui/src/mutation-ask.test.ts` and `unconfined-ask.test.ts` (answers now need `seen()` plus
400 ms on the clock; summaries; `[a]` carries `scope: "session"`; `o` opens the note);
`conversation-model.test.ts` (ask keys, `paste` during an ask, `contextReading` and `/context`
text, the quiet-off notice, prompt ids now arrive at turn start); `conversation-pane.test.ts`
(ask row, dim composer, `[o] other, say why`); `workflows-conversation.test.ts`,
`session-panes.test.ts`, `app.test.ts` and `copy-commands.test.ts` wherever they press `y` right
after an ask; `diff-model.test.ts` (`u` asks); `palette.test.ts`, `workflows-palette.test.ts` and
`extension-commands.test.ts` (argument commands are listed, enter completes them);
`overlays/overlay.test.ts`, `view/overlays.test.ts`, `workflows-layout.test.ts` and
`workflows-pointer.test.ts` (help rows, filter line, moat, `1 pane`); `permissions-model.test.ts`
(`d`, hint, notices); `session-ledger.test.ts` (`used` is the whole request, readout text,
`in`/`out` spend); `context-gauge.test.ts` (labelled gauges; its old `contextReadout` block was
deleted because it targeted a removed function and stopped the type check);
`session-tree-model.test.ts` and `session-tree-pane.test.ts` (hidden journal rows, gist text);
`cli/src/dispatch.test.ts` and `main.test.ts` (`--help` anywhere); any CLI or TUI test that
counts or orders a TUI session's entries (prompt first, `turn_facts` after each turn, `restore`
and `session_grants` entries). e2e: `arc-fold` presses `y` right after refocusing the member,
which re-arms the ask, so it wants another `until(askRowMarker)` first; the other scenarios
already wait for the controls.

**Not done.** Hunk-scoped `u` (needs S11). The ledger restore confirm doesn't name other
sessions' files yet (`restorePreviewOf` is there to use). The W12 border didn't reproduce in the
frames as a z-order fault; the moat is my read of what the tester saw.

### Round 2 ledger: app polish

Landed 2026-10-25 in `C:\src\keywork-app`, uncommitted, no tests written or run.
`KEYWORK_REPO=C:/src/keywork bun run check` is green with the contract mirrored to `1.7` (last
row). The narrow dock and the keys overlay were rendered with the real CSS in a headless
browser; nothing was driven in the real app.

| # | What changed | Where |
|---|---|---|
| dock | The sessions pane keeps its rows first. The live list and the trash share one scroll body under the `+ new session` head, so a short dock slot (three panes stacked at 1000x700 leave each about 225px) shows rows and scrolls, where before the trash and the notice took every pixel and the list got none. The cursor row scrolls into view, trashed rows included. | `panes/tree/{index.tsx,tree.css,session-rows.tsx}` |
| names | `sessionName` lives in `chrome/session-name.ts` and shortens: the first line, then its first clause when that has three words or more (a `.` `?` `!` `:` `;` before a space, or a spaced dash), capped at 48 characters on a word. A fork reads `<name> · fork`, from `forkedFrom` on its detail (the projection carries it now). The sessions list numbers whatever still collides, oldest first (`Set up a tiny TypeScript CLI · 2`), which covers a fork nobody has opened since a relaunch. Pane titles, desk rows, permissions groups, the decisions heading and the palette's go rows all read it. | `chrome/{session-name,telemetry}.ts`, `client/src/projection/{types,history}.ts`, `shell/session-store.ts`, `panes/tree/{index.tsx,rows.ts}`, `panes/needs-you/desk-row.tsx`, imports in eight panes |
| menus | Argument values carry their own line (`ArgumentChoice { value, description }`), and the slash menu and the palette show it. `/effort`: one line per level, `· now` on the current one. `/thinking`: on and off each say what they do. `/model`: the session's model first, then every model the sessions list, the cost reports (models that ran turns) and resolution failures name, each saying where it came from; when it is the only one, it says `type provider/model for another`. `/arc`: each active arc with its session count or `this session's arc`, and `none` says what it will do, or `no arcs yet · /arc-new starts one`, or the server's own notice when arcs are refused. `/arc-open`, `/arc-abandon`, `/bot`, `/bot-switch`, `/workspace` and `/terminal` describe their values too. | `palette/{commands,slash,surface-commands}.ts`, `palette/palette.tsx`, `composer/slash-menu.tsx`, `panes/registry.ts`, `panes/conversation/{arguments.ts,index.tsx}`, `panes/terminal/index.tsx`, `shell/controls-store.ts` |
| palette | The per-pane `mark <title>` commands are gone. One `/mark [pane]` marks the focused pane bare and takes any dressable pane as a value (its short title slugged, `marked · this unmarks it` on a marked one), so a search for `restore` no longer turns up mark rows. | `palette/mark-commands.ts`, `shell/workspace-view.tsx`, `keys/actions.ts` (`pane.mark` keeps its chord; the shell registers the command) |
| keys | The overlay is grouped: `anywhere`, then one heading per pane (`on the desk`, `in changes`, ...), then `in the prompt`, on one subgrid so the chord column lines up across groups. Actions that share a help line share a row (`ctrl+y · alt+o` approve the pending ask once, the desk's `y · o`), and the nine focus rows fold to `alt+1..9` as the TUI's do. | `palette/{palette.tsx,palette.css}`, `shell/workspace-view.tsx` |
| caps | Memory headings (the decisions lens and the garden's sections) drop the uppercase and the bold for the desk's dim lowercase, and clip on one line. | `panes/memory/memory.css` |
| trust | Trust setup reads the script bodies as well as their names. A script whose command is a program the package installs (any dependency field, `typescript` as `tsc`, a scoped package by its last part, `@types/*` skipped) earns a direct offer in the package manager's runner beside the script forms: `npx vitest *` reads `package.json script test · runs vitest directly`; pnpm offers `pnpm exec`, yarn `yarn`, bun `bunx`. | `posture/{toolchains,facts,proposal}.ts` |
| desk | The desk's why step has the card's words line: `o` or the other button opens `in your words` under the row, enter denies with the words as `note`, esc denies without them. The line moved out of the ask card into `page/note-line.tsx` so both use one. | `panes/needs-you/{index,desk-row}.tsx`, `desk.css`, `page/{note-line,ask-card}.tsx`, `shell/answer-ask.ts` |
| 1.7 | The server lane moved the contract to `1.7`; the protocol mirrors it. `SessionDetail` gains `flushes` (`FlushMark { index, entryId, facts }`) and `edits` (`ContextEditMark`). The flush text match is gone (`memoryFlushLead`, `isMemoryFlushPrompt` and `keptFacts` left the protocol): replay takes a flush's entry id from its mark, and the projection draws the dim row from the server's `facts` and swallows the reply. Forgotten prompts come back at their `edits` index, so the reply-length placement left `journal.ts`; prompt ids still align with the journal by text, now skipping flush indices and ids. Live `turn.started` brings `entryId`, which the projection already kept, so live prompts meet the ledger by id; the text fallback is left for replays the journal can't align. Fixtures re-recorded; keywork's event shapes already matched. | `protocol/src/{routes,sessions,memory,index}.ts`, `client/src/projection/{types,project,history,journal}.ts`, `client/src/fixtures/*`, `page/pane.tsx` |

**Decisions where the brief was open.** Keys: two actions with one help line become one row with
both chords (the duplicate was the defect the run saw); a pane's own keys sit under its heading
so three `escape` rows stop looking like one key. Names shorten in the app because the server
hands over the excerpted first prompt; clause cutting needs three words so a pinned title like
`Auth: phase two` stays whole. Forks are marked only where the app has the detail, and numbered
where it doesn't. The dock fix is in the pane, not the layout: slots stay equal shares. No
automatic reload after an in-turn flush; a reload drops the live rows' timings, so the flush row
shows on the next load as before.

**Wire asks for keywork.**
1. `GET /sessions` rows carry `forkedFrom` (the parent id is enough), so a fork reads as one before anyone opens it.
2. `keywork serve` names sessions the way the TUI's titler does; the app only shortens what it is handed.
3. A model catalog (`GET /models`, or `models` on `/workspace`): the references keywork could switch to, so `/model` offers more than what sessions happened to run.
4. A log from before 1.7 still counts its flush prompt as a turn in the app's ledger, because `GET /sessions/{id}/entries` doesn't say which plain user message is a flush (the server marks them in `flushes` on the detail). Naming flush ids on the entries answer would let the ledger number those logs as the server does.

**Existing tests whose expectations move** (two were touched only so the types compile):
`palette/mark-commands.test.ts` (first case rewritten for `/mark [pane]`);
`posture/facts.test.ts` (`factsWith` gained `runners: []`); `client/src/fixtures.test.ts` with its
snapshot and anything else built on the re-recorded fixtures (`session-detail.json` now carries
`flushes` and `edits`); any case that names a session from a long or clause-punctuated first
prompt, or lists two sessions with one name (the newer gains `· 2`). None of the current pane
tests seemed to, from a read.

**Not done.** The SSE keepalive isn't used yet; B2's ticket heartbeat already catches a dead
server, and a silence watchdog on the stream is a small follow-up. Legacy flush numbering waits
on ask 4.

### Round 2 ledger: TUI polish

Landed 2026-10-25 in `C:\src\keywork` on top of rounds 1 and 2, uncommitted, no tests written or
run. `bun run check` is green. Everything sits in `packages/tui`; no CLI, engine, server or
shared file changed. Each item was read in the code first and then driven through the e2e
harness with throwaway scenarios (mock provider, scratchpad only) at 160, 120, 110 and 76
columns.

| # | What changed | Where |
|---|---|---|
| 1 | Split width stops eating keys. Hints, notices, confirms and empty states wrap at their ` · ` phrase breaks, so a chord stays next to its verb (`wrapPhrases`, `wrappedLines`); a phrase longer than the pane flows on from the open line instead of leaving it half empty. Row budgets count the wrapped lines. Covered: the bots key hint and empty state, the context pane (its key hint stays and the map gives up rows instead), the diff rule line with its undo confirm and unavailable reasons, permissions prose rows (wrapped when they fit, clipped when the window is full), the session tree group-by and trash hints and removal confirm, the arc and arcs confirms, the workspace switch question, the MCP calm row, and in the conversation the restore question, the picker, disclosure, queue-edit and busy hints plus the `[a] remembers …` line. Tool rows give way from the subject so the time and the outcome word survive (`write a-very-long-director… · 61ms · done` at 49 columns). Diff file rows clip the path from the left and keep `+a -d`. Ask diff rows clip instead of wrapping past their budget. A long note typed into a denial shows its tail. | `width.ts`, `pane-chrome.ts`, `bots-pane.ts`, `context-pane.ts`, `diff-pane.ts`, `connect-row-view.ts`, `permissions-pane.ts`, `session-tree-pane.ts`, `arc-pane.ts`, `arcs-pane.ts`, `workspaces-pane.ts`, `mcp-pane.ts`, `conversation-pane.ts`, `transcript-view.ts` |
| 2 | A tool row times the run, not the ask. The feed now follows `gate.ask` and `gate.permission`: while an ask is open the row reads `waiting for you`, a grant restarts the clock, and a refused call shows no time at all. Shell escapes restart their clock the same way through their decision sink. A write held 2.5 s on its ask settles as `61ms`. | `transcript-feed.ts` (`ToolGate`, `ruleOn`), `conversation-model.ts` (`noteShellDecision`), `session-panes.ts` |
| 3 | Every pane title starts with its `alt+N` ordinal when more than one pane is laid out (`1 session tree`, `2 bots`, `3 session-1`), first in the row so it survives the title clip. Panes past the ninth get none. | `view/frame.ts`, `pane.ts`, `pane-chrome.ts` |
| 4 | `node_modules` is never indexed, so neither `/` file jumps nor `@` mentions offer it. It used to be offered whenever no `.gitignore` covered it, most likely how the taste run saw it after a restore had deleted the project's `.gitignore`. The tray keeps its columns: a name past the column cap clips with `…` and keeps its two-cell gap, paths clip from the left so the file name stays (`/…edo-panel-component.ts  open this file`), and a shortcut gets a cell of its own so it never glues to a clipped description. With no descriptions in the list (mentions) the name column takes the row. | `file-index.ts`, `tray.ts`, `prompt-editor.ts` |
| 5 | The conversation pane no longer vanishes. A fresh session isn't written until its first prompt, so the reopen after `/init` found nothing and dropped the pane; a shown conversation whose session can't be opened now comes back as a fresh conversation in the same slot (held ones are still dropped). The restart itself already happens in process for `keywork`: `runPanes` passes the reopen seam, `/init` says `reopening with memory and arcs live`, and the layout comes back. The taste run read `reopen keywork` because the e2e live world composes without that seam. | `restore-plan.ts` |
| 6 | Already right after round 2: the prompt entry is written when the turn starts and that write emits a change, so the tree lists the live session during its first turn (seen in the harness: `█ take a nap · now · working` while the first turn ran). The empty state now says what starts one: `░ no sessions yet · the first prompt you send starts one`. | `session-tree-pane.ts` |
| 7 | Queue and steer rows differ: `⋯` waits for the turn to end, `↪` lands at the next tool boundary (tier 0 `~` and `>`). The busy hint teaches them: `enter queues ⋯ · alt+enter steers ↪ · …`. Queue rows clip to one line. | `marks.ts`, `conversation-model.ts` (`queuedSends`), `conversation-pane.ts` |
| 8 | Turn numbers count model turns. A recorded shell escape's entry id is kept on its row, a replayed shell transcript is recognised by its `$ cmd` head when no reply followed it, and the ledger folds those records into the turn before them with their files merged, so restore reach and the diff grouping stay whole. The ledger, `/restore N`, the diff pane and the desk all read the same numbers. Seen in the harness: three turns, `!echo hi`, then `turn 4`. | `turn-ledger.ts` (`modelTurns`), `transcript-feed.ts` (`shellTranscriptIds`), `shell-escape.ts`, `conversation-model.ts`, `session-panes.ts` |
| 9 | `/forget` offers a shell row only once its transcript is saved, and then forgets it for real: the target is the transcript's user message, and the note reads `forgot that shell escape and its output · out of the model's context · …`. A shell row still running or never recorded isn't offered. | `forget.ts` (`forgetPickOf`), `conversation-model.ts` |
| 10 | `/compact` draws the summary row the design already had for replay: `≡ compacted history · 17 words`, folded, and tab unfolds it to the text. It lands for manual, between-batches and after-turn compaction alike, ahead of the `compacted … tokens` notice. Replayed summaries fold the same way instead of printing the whole summary at the top of a reopened session. | `transcript-feed.ts` (`postSummary`, `summaryRowSpans`), `transcript-view.ts`, `conversation-model.ts` (`reportSettlement`), `session-attachment.ts` |
| 11 | Two more. The TUI's `crashLogFacts` counts crash heads rather than lines, matching `cli/src/doctor.ts`, which already did. And a `!cmd` typed while a turn was still settling slipped past the shell peel and reached the model as a prompt; the settle now peels again after persisting, so it runs as a shell escape. | `crash-log.ts`, `conversation-model.ts` (`settleThenRecordShells`) |

**Decisions where the brief was open.** Wrap rather than abbreviate: phrases keep their verbs,
and the clip only wins where wrapping can't fit (list rows, permissions when the window is
full). The approval wait isn't shown anywhere; the ask row already told you a person was asked.
The summary row folds like a thinking row, because a summary printed in full read as a wall of
text on reopen. Shell escapes join the turn before them rather than vanishing, so their file
changes stay counted. `/init` keeps its in-process reopen and the fix makes it lossless; a true
hot recompose means rebuilding the whole composition under a live app.

**Asks of other lanes.**
- Sessions and server: number turns the same way. `cli/src/sessions/turns.ts` (`pathTurns`),
  the engine's `turnsAlong` and the HTML export still count a shell escape's transcript as a
  turn, so `keywork sessions`, the export and the app disagree with the TUI after a `!cmd`. The
  TUI renumbers its own ledger in `modelTurns`; `readsAsShellEscapeTranscript` in
  `tui/src/shell-escape.ts` is the recogniser to share until there's something better.
- Engine: a marker on the shell escape's user message (an origin, or its own entry kind) would
  let replay and numbering tell it from a typed prompt that happens to start with `$ `. Replay
  still draws a shell transcript as a user prompt carrying its whole output.
- Harness: `scripts/e2e/live.ts` composes without a reopen seam, so `/init` there still ends at
  `reopen keywork`.
- Attached sessions: I didn't check whether a served compaction hands the pane a `compacted`
  entry; if it doesn't, the summary row shows there only after a reload.

**Existing tests whose expectations need moving** (left as they are, apart from two fakes in
`conversation-model.test.ts` that now return `undefined` from `recordShellEscape` so the types
compile):
`restore-plan.test.ts` "drops a conversation whose session cannot be opened…" (it comes back
fresh); `session-tree-pane.test.ts` wherever it matches the whole empty line (the substring
`no sessions yet` still matches, so the e2e scenarios hold); `transcript-feed.test.ts` and
`transcript-view.test.ts` for summaries (`folded` on `SummaryEntry`, a folded row instead of the
text) and for tool rows wider than the body (the subject gives way first); any test that reads a
tool row during an ask (`waiting for you`) or times a call across an ask;
`conversation-model.test.ts` and `session-attachment.test.ts` cases that count entries after a
compaction (a summary row now lands before the notices); `conversation-pane.test.ts` for the
busy hint, queue rows (`↪` for steer, clipped), wrapped hints at narrow widths and the remember
line; `tray.test.ts`, `palette.test.ts`, `workflows-palette.test.ts` and the e2e `discovery`
goldens wherever a shortcut or a long name shows (one more gap cell, names clip at the cap);
`prompt-editor.test.ts` where mention suggestions are compared whole (`jump: true`);
`file-index.test.ts` if it indexes `node_modules`; `crash-log.test.ts` if it counts lines
without heads; `diff-pane.test.ts` (wrapped rule, left-clipped paths); `context-pane` cases at
short heights (the key hint stays); `mcp-pane.test.ts` if it inspects the calm row (now a column
of lines); `view/frame.test.ts`, `workflows-layout.test.ts` and every e2e golden with two or
more panes (title rows gain ordinals).

**Not done.** Session tree rows still clip their tail facts at split width; they're list rows
and the cursored one leads with its title. Replayed shell escapes still render as prompts. A
true in-place `/init` without the reopen.

### Round 2 ledger: server follow-up

Landed 2026-10-25 in `C:\src\keywork`, uncommitted, no tests written or run. Contract `1.6` to
`1.7`; both fixtures regenerated, so `fixtures:record` and a copy of the event-shapes fixture
bring the app along. The full write-up is the "Round 2 server follow-up" entry in keywork's
`docs/backlog/118-app-surface.md`. This answers the four wire asks in "Round 2 ledger: app" and
the server asks in "Round 2 ledger: TUI".

**Wire changes (all additive; two change what an existing field means, marked).**

| # | Where | Change |
|---|---|---|
| W7 | session log | A memory flush is a `custom_message` entry `{ customType: "memory_flush", content, display: false }`, `content` being the flush prompt with its lead text intact (`Context is nearly full and will soon be compacted.`), followed by the reply as an `assistant` message entry. It is no longer a `message` entry with `role: "user"`. |
| W7 | `GET /sessions/{id}` | `flushes: [{ index, entryId, facts }]`, beside `summaries`. `messages[index]` is the flush prompt (still a `user` message there, so `memoryFlushLead` keeps working until the app adopts the marks), `messages[index + 1]` the reply, `facts` the reply's kept lines (empty for `NO_REPLY`). Draw `memory flush · N facts kept` from it. Legacy logs (flush as a user message) are marked too. |
| W7 | turn numbering | **Meaning moved.** A flush is not a turn anywhere on the server: `POST /sessions/{id}/restore`, `GET /sessions/{id}/restore`, `turn_facts`, `changes.updated` `turn` and undo all count prompts only, legacy flush prompts included. The app's ledger, which already skips flushes, now agrees with the server. |
| W6 | `GET /sessions/{id}` | `edits: [{ index, entryId, role, kind, text }]`, where context edits sit. `entryId` and `role` name the edited message; `kind: "forgotten"` means it left `messages` and `index` is where it sat (before the message that now follows it, `messages.length` at the end); `kind: "rewritten"` means it is `messages[index]` with its replacement; `text` is its own text before the edit (empty for a tool result). A forgotten prompt goes at `index` with `entryId` and `text`, with no alignment needed. |
| ask 3 | `turn.started` (live, `keywork serve`) | Carries `entryId`, the prompt's session entry, written before the event fires. **Order moved:** the `session.state` that follows `POST /prompt` acceptance can now arrive before `turn.started`. Don't rely on their order. |
| ask 4 | `GET /events` | A `: keepalive` comment every 15 s on every stream. Silence longer than that means the server is gone or hung; parsers that drop comments need no change. |
| TUI ask | session log, `POST /undo`, `POST /restore`, `POST /redo` | **Meaning moved.** Undo now journals a `restore` entry too, `{ from, files, redo }`, and restore's entry gains `redo` (`{ turn, from, files, redo }`). A session reopened on an unsettled restore comes back staged: `redoable: true`, and `POST /redo` puts the files back from `redo` after a server restart. An undo survives a restart (the transcript reopens rewound) where it used to be lost. |
| TUI ask | session grants | `serve` writes `session_grants { rules }` on every grant, quiet grant and revoke, and a reopen adopts the latest, so revokes survive a restart. `POST /permissions/session/{id}/grant` and `/revoke` open the session first; `GET /permissions` still lists the sessions open in the process. |
| TUI ask | `turn_facts` | The terminal's facts now carry `session` totals too; both hosts write one shape. |
| rough | timed-out ask | The refused call's `tool.finished` output opens `not approved: nobody answered the ask in time, so the person probably stepped away and the call was refused` (the decision is still `gate: "headless"`). |
| rough | restore | A restore to a checkpoint taken before the `node_modules` exclusion no longer writes `node_modules` (or `.git`) back. |
| rough | `keywork sessions decisions` | `answer.note`, scrubbed, at most 1000 characters. |

**keywork's typed client** (`@keywork/server`): `SessionDetail` gains `flushes: FlushMark[]` and
`edits: ContextEditMark[]` (types from `@keywork/engine`); `keepaliveIntervalMs` and
`keepaliveComment` are exported. Engine additions a client can mirror: `isPromptEntry`,
`isMemoryFlushEntry`, `memoryFlushType`, `messageMarksOf`, `keptFacts`.

**Existing tests whose expectations need moving** (left as they are): `cli/src/serve.test.ts`
"creates a session, runs a tool-using turn on prompt, streams it, and persists it" (`types[0]`
is now `session.state`; `turn.started` follows once the prompt entry is written), and any
`serve` case that orders `turn.started` before the acceptance `session.state`, or that counts a
session's raw entries after an undo (a `restore` entry now follows it) or after a flush (one
`custom_message` where a `user` message was). The memory host in `@keywork/server/testing` writes
no log, so `server.test.ts` and `client.test.ts` keep their order. In keywork-app,
`client/src/fixtures.test.ts` and its snapshot once the fixtures are re-recorded.

**Not done.** The app still finds flushes by text and places forgotten prompts by alignment;
`flushes` and `edits` are ready for it. An attached TUI still doesn't answer asks, so nothing
there sends `note` yet. A forget right after a restore clears the staged undo in memory, but a
restart re-stages it (the context edit sits after the `restore` entry); rare, left as is.
