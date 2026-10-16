# Field scan, October 2026: what the best agent surfaces do that keywork-app does not

> Concept lane, wave 7 (2026-10-15). Research and three prototypes; nothing here is decided.
> An idea becomes work only when a wave brief takes it into `docs/plan.md`.
>
> **Licensing posture.** Everything below is observed behaviour from public docs, changelogs and
> write-ups. No code, asset or text was adapted from any product, so `NOTICE` is unchanged.
> Claude Code, the Codex app, Cursor, Warp and Conductor are proprietary: observed only. Zed is
> GPL: observed only. Superset and Vibe Kanban are open source but nothing was read from their
> code: observed only. OpenCode and Pi are MIT and could be adapted with attribution; nothing was.
> Crush was not consulted. Anthropic access stays API-key / Agent-SDK only; watching how Claude
> Code's desktop app behaves is research, not integration.

## The question

What would make keywork-app the surface Jordan reaches for every day instead of the TUI? The
TUI already has the engine, the keys and the trust ladder; the app wins only where a window
does something a terminal cannot do as well. So the scan asks one thing of every product: what
does its desktop or panel surface do that a terminal agent does not, and does that fit keywork's
grammar (keyboard first, one bus, the gate on the server, density for state and hue for
identity, themes as the thing that catches the eye)?

The keywork repo's own research was read first so this does not repeat it:
`docs/influencers/opencode.md` and `pi.md` (the architecture and the tree), and
`docs/research/coding-agent-nuances.md` (the context gauge, `/btw`, the away summary and the
copy verbs, several already landed in the TUI). `backlog/120-subagents.md` covers how the
field spawns children. This note is about the surface, not the engine.

## What the field converged on

Read between 2026-10-12 and 2026-10-15. "Today" is keywork-app at the wave 6.5 ledger plus N3
and N4.

| Pattern | Who does it, as observed | keywork-app today |
|---|---|---|
| Many sessions in one window, sorted by what they want | Claude Code desktop (redesigned 2026-04-14): a sidebar of every session, filtered by status, project or environment, Ctrl+Tab to cycle, Cmd-click to open beside. Codex app: projects hold threads; a **Triage** inbox collects automation runs with an unread filter. Cursor 3: an Agents Window listing every agent on the machine or in the cloud, tabs side by side or in a grid. Conductor: every workspace's thread at once, finished, errored or conflicting. Superset: working indicators, completion chimes, dock badges. Warp: an Agent Management Panel with a status icon per tab. VS Code: the Agent Sessions view | The tree pane lists sessions; stamps live only on panes that are open. Nothing answers "who wants me, across everything" in one place (W8.1 is planned) |
| A worktree per session | Claude Code desktop's worktree toggle (`.claude/worktrees/`, auto-archive after the PR merges). Codex threads run Local, Worktree or Cloud. Cursor's `/worktree` and `/apply-worktree`. Conductor, Superset and Vibe Kanban: a worktree, branch and terminal per task. OpenCode v2.0.27: `worktree_create`, `worktree_list`, `worktree_remove` | Every session edits the one workspace tree; two sessions on one file trample each other |
| Review with comments sent back as one batch | Claude Code desktop: click a diff line, comment, Cmd+Enter sends every comment at once and Claude answers with a new diff; `/code-review` findings arrive as a card that walks them in the diff. Codex: comment on diffs, then approve, revise or reject from Triage. Warp: a review panel that batches inline comments back to the agent (one write-up; Warp's docs say only "review agent written code in context"). Vibe Kanban: comments the agent picks up on a re-run. Zed: accept or reject each hunk in a multibuffer | The diff pane is read-only with per-turn undo and redo; hunk verdicts and talk-back are W9.1 and W9.2 |
| Each turn ends with what it changed | OpenCode desktop v2.0.30 (2026-10-15): a Timeline where each completed turn shows changed files, line counts and expandable diffs. Zed: a "Restore Checkpoint" button above each message. Claude Code: `/rewind` | The diff pane groups changes by turn; the transcript itself never says what a turn did |
| Context you can see into | Claude Code `/context`: a coloured grid, 10×10 for 200k windows and 20×10 for 1M, a legend of tokens per category, a distinct mark for the autocompact buffer. The desktop's usage ring. OpenCode v2.0.29: context tokens and the session family's cost. Zed: token use beside the profile selector, a "Context Compacted" entry | One gauge: four step cells or a ten-cell bar, and a readout that is honest about its basis. Nothing says *what* fills the window |
| Asks that show what they would do | Claude Code's permission prompt for an edit shows the diff. Cursor shows each agent edit as a diff to keep or undo. Gemini CLI (Apache-2.0) offers to open the proposed diff in `$EDITOR` before approving | The ask card prints the tool's arguments as JSON cut at sixty characters (`compactJson`) |
| A side question that leaves no trace | Claude Code desktop side chats (Cmd+; or `/btw`): read the main thread, write nothing back, gone on close. OpenCode `/btw` (2026-09-18) | Nothing; keywork's TUI has `/btw` open as V2.17 |
| Terminal output as context | Warp "Blocks as Context": Cmd+Up attaches the previous command block, the input hint offers it when the last command failed. Zed: Cmd+> adds a terminal selection to the thread | A real terminal pane and a mirror of the agent's bash; output never reaches a session except by copy and paste |
| Follow the agent | Zed: a crosshair makes the editor jump to every file the agent touches | The file tree lights touched files for four seconds; no file view follows |
| Previews and automations | Claude Code desktop: a browser pane, dev servers, auto-verify screenshots, scheduled tasks. Cursor 3: a browser with DevTools and a design mode. Codex: automations on cron, webhook or manual triggers, results in Triage | Out of scope (see Rejected) |

**Pi** has no desktop surface; its contribution is the session tree (fold, search, bookmark),
which the tree pane already carries.

**What keywork-app has that none of them do.** Tiling by the terminal's verbs rather than
drag-only grids; a theme per pane and per arc, so several sessions are told apart by what they
wear; density as the one material for state; a trust ladder whose grants are scoped and held by
the server; two surfaces, terminal and window, on one bus; notifications that fire only when a
keystroke is wanted. The ideas below are chosen to make those stronger, not to catch up on
features that would dilute them.

## The ten, ranked

Sizes are in the plan's points (1 to 3 per task). Server asks carry provisional numbers S17 to
S22 after the plan's S15; the lead renumbers them if another lane claims those first. No idea
here takes a chord: where a key is named it is a pane-local key in the pane's own grammar, and
anything global goes through the keys registry when a wave adopts it.

### 1. The desk (3pt app, 1pt server) · landed 2026-10-15

**What it is.** One pane that lists every session in the workspace, grouped by what it wants
from you: **needs you** (oldest ask first), **working**, **back** (finished unseen, or failed),
**quiet**. Each row is a headline and a tail. The headline is the stamp, the session's name
(inverted in its arc's hue when it is asking, exactly as the title row does; drawn ▐like this▌
below), its arc chip and
slug, its bot's sigil and name, the theme its pane wears as a swatch strip, then a steps gauge,
its spend and how long it has waited. The tail is the one line that matters now: what it asks
(`asks · edit src/layout/verbs.ts`), what it is doing (the live tool row), what it changed
(`3 files · +42 −7`), or why it failed. The cursor row's ask is answerable in place with the ask
card's own keys (`y` once, `s` session, `w` workspace, `n` deny, the remembering pair only when
the server could remember), and `enter` opens the session where it lives. This is what every
desk product built; keywork's version answers without moving you.

**Why it fits.** It is the app's one structural advantage over a terminal made into the home
screen: many sessions, one head. It is a pure projection of the bus (one unfiltered `/events`
stream already arrives), answers go through `POST /asks/{callId}` with the same scopes, it is an
admin pane so it wears the house while showing each session's own theme, and the needs-you
group is the needs-you formula drawn as a list. It replaces the separate pane W8.1 imagined: the
queue is the desk's first group, and W8.1's next-waiting chord jumps along it.

**Server.** S17 (1pt): `GET /sessions` rows gain `live` (a turn is running), `waiting` (pending
ask count) and a `changes` summary (files, added, removed), so a desk opened mid-day is right
before the first event arrives. Everything after that is the bus.

```text
 desk
 8 sessions · 2 need you · 2 working · $1.55
 needs you
 █ ▐rename the tiler verbs▌ ■ pricing · ◆ editor · wears rose-pine-dawn   ▒·· 61k $0.42 waiting 6m
   asks · edit src/layout/verbs.ts                                               once y · deny n
 █ ▐fix the flaky trash test▌ ■ keywork                                   ▓▒· 182k $0.18 waiting 2m
   asks · bash bun test src/shell/trash.test.ts --rerun-each 20 | tee artifacts/trash.log
 working
 ▀ explain the page grammar ■ concept · wears whiplash                    ▒·· 92k $0.31 now
   edit src/page/page.css · 12s
 ▗ scan the field for the desk ■ concept · ◇ scout                        ░·· 18k $0.07 1m
   read docs/plan.md · 1.4k lines
 back
 █ why is the seam drag sticky ■ pricing                                  ░·· 47k $0.55 4m
   3 files · +42 −7
 ▛ bump the sidecar pin                                                       $0.02 11m
   the turn failed · provider overloaded (529)
 quiet
   wardrobe follow-ups ■ keywork                                                  26h
 j k move · enter opens · y s w n answer the row's ask · tab next waiting
```

**Landed (2026-10-15).** The needs-you pane became the desk: `leader q` (palette `desk`, aliases
`needs-you` and `waiting`), the queue's order kept as the needs-you group, the cursor row's ask
answered in place through the ask card's own answer path, quiet honoured. Two departures from the
sketch: an unseen finish has no changes line until S17 serves one, and a failed turn stays in
needs you, where the queue puts it, rather than in back. See the plan's Wave 7 ledger, **The
desk**, and `artifacts/shots/windows/themes/stage--desk.png`.

### 2. Asks that show their consequence (2pt app, 1pt server) · landed

**Landed 2026-10-16** on keywork's contract 1.2 (S18 as `preview`, S23 for trust setup): the real
ask card shows the merge view, the typeset command with what each remembering key would cover,
and the MCP argument table; the prototype is retired. The plan's Wave 7 ledger, **Asks with
their consequence**, has the detail; the stage is `artifacts/shots/windows/themes/stage--asks.png`.

**What it is.** The ask card shows what will happen before you answer. An edit or a write shows
the file's diff in the diff pane's own merge view (syntax from `--kw-syntax-*`, grounds from
`--kw-diff-*`, unchanged lines collapsed) under a head that says where and how much:
`edit src/layout/verbs.ts · line 12 · +6 −6`, or `write notes.md · new file · 24 lines`. A bash
call typesets the command with every program, flag and operator marked, so a pipe into `tee` or
a `&&` cannot hide at the end of a long line, and says where it runs. An MCP call names its
server and tool and lists its arguments one per row. The card's answers, the derived rules and
the blanket warning stay exactly as they are.

**Why it fits.** An ask is the moment the keyboard decides something, and today it decides on
sixty characters of JSON. The gate stays on the server and the answers are unchanged; the card
only becomes legible. It is the needs-you state given its content, and every careful-preset day
is full of these.

**Server.** S18 (1pt): `gate.ask` gains an optional `preview` for edit and write, computed by
the tool's own dry run (`path`, `before`, `after`, bounded like
`GET /sessions/{id}/changes/{path}`), so the app never re-applies an edit to guess its effect;
that would be engine logic and could disagree with the engine (line endings, `replaceAll`).
Bash and MCP need nothing new: `gate.ask` already carries the arguments.

```text
 ░ edit src/layout/verbs.ts · waiting for your answer
   ▎edit src/layout/verbs.ts · line 12 · +6 −6
   ▎⦚ 8 unchanged lines ⦚
   ▎  export const verbNames: Record<TilerVerb["kind"], string> = {
   ▎-   split: "split",
   ▎-   rotate: "rotate",
   ▎+   split: "pane.split",
   ▎+   rotate: "pane.rotate",
   ▎  };
   this tool changes things                                              once y   deny n

 ░ bash bun test src/shell/trash.test.ts --reru… · waiting for your answer
   ▎bash · in C:\src\keywork-app
   ▎bun test src/shell/trash.test.ts --rerun-each 20 | tee artifacts/trash.log
   this tool changes things
   s or w would allow  bun test *  tee *
   this would allow every tee command
                                 once y   this session s   this workspace w   deny n
```

**Prototyped.** `artifacts/shots/windows/concepts/stage--asks.png`, since replaced by the real
card's `artifacts/shots/windows/themes/stage--asks.png`.

### 3. The context map (2pt app, 1pt server) · landed

**Landed** (2026-10-16, see "The context map." in the plan's Wave 7 ledger): the `context` pane,
`leader shift+g` or a click on a conversation's gauge, drawn from S19's `parts` and `thresholds`
as the server sends them. Two things differ from the sketch below. `f` cannot flush: keywork
flushes memory only when a turn settles past the line and exposes no route to ask for one, so
`f` says where the flush will happen and the route is a server-lane ask. And the map found that
the lines sit past the window once the fixed parts outgrow the reserve, which the pane says in
one dim line.

**What it is.** A pane, opened from the title row's gauge, that shows what fills the window.
One square per percent of a 200k window (ten by ten), one per half percent of a larger one
(twenty by ten). Squares fill in order of distance from you, and the ink in each square grows
with closeness: the system prompt smallest, then tool schemas, then memory and skills, then the
conversation as full squares in the density-full ink. Free room is a dot. The room past the
memory-flush line is a hairline square and the room past the compaction line a heavier one, so
"how long until compaction" is the count of dots before the fence. A legend gives tokens and
share per part and where the two lines sit, and a basis line says honestly what the parts rest
on. `c` compacts and `f` flushes from there, both existing routes.

**Why it fits.** It is keywork's instrument grammar at full size: density for the parts, one
reading, honest about its basis. In pixels the density ramp becomes ink area (AD7: density
renders as fill), which reads in monochrome and in every theme; in a dressed pane it takes that
theme's ramp, so the same session looks like itself. It is also the most eye-catching instrument
the app could have, and it is true.

**Server.** S19 (1pt): `GET /sessions/{id}/context` gains `parts` (system, tools, injected,
conversation) with a `basis` of `reported` or `estimated`, plus the wave 6 finding that the
reading ignores reported usage (S14). The app draws what it is told.

```text
 context                                                                      ▓·· 142k
 explain the page grammar                                             142k of 200k · 71%
   ░ ░ ░ ▒ ▒ ▒ ▒ ▒ ▒ ▓        ░ system prompt        6.1k    3%
   ▓ ▓ ▓ █ █ █ █ █ █ █        ▒ tool schemas          11k    6%
   █ █ █ █ █ █ █ █ █ █        ▓ memory and skills    8.2k    4%
   █ █ █ █ █ █ █ █ █ █        █ conversation         116k   58%
   █ █ █ █ █ █ █ █ █ █        · free                  58k   29%
   █ █ █ █ █ █ █ █ █ █        ┄ memory flush       at 175k
   █ █ █ █ █ █ █ █ █ █        ┅ compaction         at 184k
   █ · · · · · · · · ·
   · · · · · · · · ┄ ┄
   ┄ ┄ ┅ ┅ ┅ ┅ ┅ ┅ ┅ ┅
 parts split from the usage the provider reported at the last turn · window declared in keywork.json
 c compacts now · f flushes memory · esc closes
```

**Prototyped**, then landed: `artifacts/shots/windows/themes/stage--context.png` is the real pane.

### 4. The turn ledger (2pt app, 1pt server) · landed

> **Landed in wave 7 (2026-10-16);** see "The turn ledger." in the plan's Wave 7 ledger. Two
> changes from this sketch: `enter` unfolds the turn's files with their lines, not their diffs,
> and the ribbon is words (`turn 12 · 3 files · $0.41`, the latest settled turn) rather than a
> cell per turn. S20 is keywork's `restoreSessionTurn` (contract 1.2).

**What it is.** Every settled turn ends with one quiet line: the files it changed, the lines,
the time spent in tools and the spend. `enter` on it unfolds the turn's files with their diffs
inline; `u` restores the workspace to before this turn in one step (not one undo per turn after
it); `f` forks the conversation from this turn's prompt. The title row gains a turn ribbon at
broadsheet, one cell per turn whose ink is how much it changed, so a long session shows where
the work happened.

**Why it fits.** Undo per turn, fork and changes with turn provenance already exist; they live
in three panes. The ledger puts them where you read. The ribbon is density used for exactly what
density means.

**Server.** S20 (1pt): `POST /sessions/{id}/restore { turn }` over the checkpoints, recorded as
one session entry, so restoring five turns back is one verdict, not five undos.

```text
 █ rename the tiler verbs to keywork's action ids
 ▓ keywork names these pane.*; renaming the table keeps every caller as it is.
 ░ edit src/layout/verbs.ts · 0.4s · done
 ░ bash bun run check:types · 8.1s · done
 ── turn 4 · 2 files · +9 −6 · 8.5s in tools · $0.04 ── enter diffs · u restores to before · f forks here

 ╭ ▎rename the tiler verbs · ◆ editor ─ turns ░ ▒ ░ █ ▓ ▒ ─ ▒·· 61k ╮
```

### 5. The review stream with talk-back (5pt app, S11)

**What it is.** One scroll of every unreviewed hunk in a session, newest turn first, each with
its turn and file. `k` keeps, `r` reverts (S11), `c` writes a comment under the hunk; comments
queue visibly and `ctrl+enter` sends them as one inject carrying each file, range and hunk text,
so the agent answers once with a new diff. A summary line counts what is kept, reverted and still
unread. This is W9.1 and W9.2 with one change the field settled: comments are batched, not sent
one at a time (Claude Code desktop and, by report, Warp).

**Why it fits.** Review is where pixels beat cells, and where the person is the gate after the
gate. Revert goes through checkpoints on the server; talk-back is the existing inject route.

**Server.** S11 (planned). Nothing else.

```text
 review · rename the tiler verbs · 3 files · 7 hunks · 4 unread               kept 2 · reverted 1
 src/layout/verbs.ts · hunk 2 of 3 · turn 4
   -  split: "split",
   +  split: "pane.split",
   ▸ keep the old names as aliases for one release                         queued · 2 comments
 k keeps · r reverts · c comments · n p next and previous · ctrl+enter sends 2 comments
```

### 6. Terminal blocks to the agent (2pt app)

**What it is.** The terminal pane learns command boundaries from shell integration (OSC 133,
which pwsh, bash, zsh and fish can all emit), so each command and its output is a block with an
outcome in the gutter. `alt+up` and `alt+down` walk blocks; one key sends the focused block to
the session the terminal was opened beside, as an inject with provenance `terminal`, the command,
its exit code and its output bounded like a tool result. When the last command failed, the
terminal's hint line offers exactly that.

**Why it fits.** The inner loop is: run the tests, they fail, tell the agent. Today that is a
copy and a paste across panes. The terminal stays a real terminal; the app only gains the block
as a unit, which is the tool row's grammar applied to your own commands.

**Server.** None: inject exists with provenance. If keywork wants a distinct origin word, it is
one line in `events.md`.

```text
 terminal · pwsh · C:\src\keywork-app
 ▎$ bun run check:types                                          done · 12.4s
 ▎$ bun test src/shell/trash.test.ts                             failed 1 · 3.1s
 ▎  FAIL trash.test.ts > restores the session it trashed
 ▎  expected "gone" to be "restored"
  $ ▌
 the last command failed · a sends it to "fix the flaky trash test" · alt+up walks blocks
```

### 7. The follow cam (2pt app)

**What it is.** A file pane can follow the agent: it opens whatever the agent reads or edits,
scrolls to the range, and inks the edit in place when the tool finishes (deleted lines fade out,
inserted lines gain ink over one settle tempo). `space` holds the camera on the current file;
pressing it again follows again. The tree already lights touched files; this is the view.

**Why it fits.** Watching an agent work is where the app can feel alive without decoration:
motion in ink, driven by real events, one mover in the region, input settles it. It needs nothing
but `tool.started`, `tool.finished` and `/files`. Zed's crosshair is the reference (GPL, observed
only).

**Server.** None.

```text
 ╭ ▌following · src/page/page.css · line 212 ─ edit by "explain the page grammar" ╮
   210  .kw-ask-actions {
   211    display: flex;
   212 ▓  gap: 0.25rem 1rem;                          inked in over one settle tempo
   213    margin-left: auto;
 space holds the camera here · space again follows
```

### 8. Isolated sessions (2pt app, 3pt server)

**What it is.** A session can run in its own worktree that keywork creates and owns. The title
row says which branch it is on; the desk shows its changes; **bring back** applies its diff to
the workspace as uncommitted changes, and **discard** removes the worktree. Fan-out (W8.3) needs
this, because N siblings on one tree trample each other.

**Why it fits.** Every desk product converged on it. It keeps the user-commits rule intact:
bring back stops at the working tree, and neither the app nor the server commits or pushes. The
jail moves to the worktree on the server, so the gate's confinement is unchanged in kind.

**Server.** S21 (3pt): `POST /sessions { isolation: "worktree" }`, the confinement rooted at the
worktree, `POST /sessions/{id}/bring-back` (a three-way apply that reports conflicts by path and
never commits), and removal on discard or trash.

```text
 ╭ ▀ try the virtualized transcript · on kw/virtual-transcript · +212 −40 ─ ▒·· 34k ╮
 ...
 bring back · 6 files into C:\src\keywork-app as uncommitted changes · 1 conflict in page.css
 y brings back the rest · n keeps it isolated
```

### 9. The side question (1pt app, 1pt server)

**What it is.** A small aside pane opened from a conversation: it reads that session's context,
answers one question, and writes nothing back; closing it forgets it. It wears the summoning
pane's theme so it reads as that session's margin note.

**Why it fits.** Context frugality as a keystroke, and a pane is the natural home for a thing
that must not enter the transcript. keywork's TUI has the same idea open as V2.17; the server
form serves both.

**Server.** S22 (1pt): `POST /sessions/{id}/aside { prompt }`, a throwaway fork the tree never
keeps, streamed on the bus under its own session id and removed when the client lets go.

```text
 ╭ aside · reads "explain the page grammar" · writes nothing back ╮
 █ what does the 70ch measure apply to again?
 ▓ Prose only. Fences, tables and tool rows run full bleed.
 esc closes and forgets it
```

### 10. Workspace houses (1pt app)

**What it is.** The house theme is remembered per workspace, with the global choice as the
fallback, and the window's title bar overlay and taskbar badge take the house's accent. Two
windows on two workspaces are told apart at a glance; the open screen shows each recent
workspace beside the house it wears.

**Why it fits.** W7.4 puts two windows on screen. The theme system already separates house from
outfit; this moves one stored key and makes identity-by-hue work at the window level, which is
what hue is for. It needs an AD6 sentence: the house is per workspace, the global is the
default.

**Server.** None.

```text
 open
   C:\src\keywork         ▇▇▇▇▇▇ gruvbox-dark      2h
   C:\src\keywork-app     ▇▇▇▇▇▇ keywork-night    26h
```

## Rejected

Each of these was seen in the field and is declined because it would break a decision of
record, not because it is a bad idea elsewhere.

- **Cloud and remote agents** (Codex Cloud, Cursor cloud agents, Claude Code's cloud sessions).
  AD12 refuses cloud and accounts; AD2 keeps the server on loopback.
- **Commits, pushes, pull requests and auto-merge from the review surface** (Codex's approve
  stages and commits; Claude Code desktop's CI bar with auto-merge; Cursor's commit and push from
  the worktree; Conductor's PR path). Guardrail 5: the user commits. Isolated sessions bring work
  back as uncommitted changes and stop there.
- **An embedded file editor** (Claude Code desktop's file pane edits and saves). AD12: no
  embedded editor; references deep-link to `$EDITOR` (W9.4).
- **Loosening the gate from the client** (OpenCode's per-project auto-accept toggled from the
  desktop app, Warp's auto-approve for trusted agents, a classifier that approves on the person's
  behalf like Claude Code's Auto mode). Guardrail 3 and AD8: the app never loosens policy, and a
  classifier is engine work that would have to arrive as a keywork preset. Quiet mode (W8.4) on
  the server's session scope is the honest version.
- **Best-of-N with an automatic judge** (Cursor's `/best-of-n` recommendation). Judging is model
  work, which is engine logic (AD1). Fan-out without a judge stays W8.3.
- **Voice dictation** (Codex's hold-to-talk). The plan's "deliberately not": no audio surface.
- **An agent-driven browser, design mode, computer use and auto-verify screenshots** (Cursor 3,
  Claude Code desktop). A tool the agent drives is an engine tool behind the gate (AD1, AD8), and
  an Electron pane clicking on the agent's behalf would be the app running a tool (guardrail 3).
  Parked until keywork has such a tool; then a pane renders it.
- **Automations on a schedule with a triage inbox** (Codex automations, Claude Code scheduled
  tasks). A scheduler that runs while the app is closed is a daemon and server work outside the
  simplicity budget. If keywork grows one, the desk's "back" group is where its results land.
- **Driving Claude Code, Codex or other agents from the app** (Conductor, Superset, Zed's
  external agents over ACP). AD1: the app is a client of `keywork serve` and nothing else; for
  Claude Code it would also brush the Anthropic guardrail. ACP stays a keywork server question.
- **A kanban board of tasks** (Vibe Kanban). Project-management state the server does not hold,
  and AD12's no speculative panes; the desk covers the daily need.
- **Ratings and feedback sent to a vendor** (Zed's thumbs). Telemetry; AD12.
- **Signing in with a subscription** (tools that run on the user's Claude plan). Guardrail 2.

## The prototypes

The top three were built as dev-only modules with real tokens and real components, fed by
fixture data. They took no chord, added nothing to the panes or keys registries and touched
neither the protocol nor the client; the app never imported them. All three have landed as real
surfaces, so `ui/src/dev/concepts/` is gone, and with it the gallery's concept scenes and
`screenshots/concept-stages.tsx`.

| Prototype | Code | What is real | What is faked |
|---|---|---|---|
| The desk (landed; prototype deleted) | was `desk.ts`, `desk-pane.tsx`, `desk.css`; now the needs-you pane grown into the desk, `ui/src/panes/needs-you/` (`desk.ts`, `desk-row.tsx`, `desk.css`) | Everything: the queue, the session store, the read marks, the quiet set and the attire | Nothing now: the gallery's `desk` scene stages the real pane over staged stores |
| Asks with their consequence (landed; prototype deleted) | was `consequence.ts`, `consequence-card.tsx`, `consequence.css`; now `ui/src/page/consequence.ts` and `consequence-view.tsx` in the real card | The real `AskCard` and its rule wording, the diff pane's `mountMergeView` with syntax and diff tokens, transcript rows from the page's classes and `toolRowSpans`, asks projected from envelopes by the real reducer | Nothing now: the diff is keywork's `preview` |
| The context map (landed; prototype deleted) | was `context-map.ts`, `context-map-pane.tsx`, `context-map.css`; now `ui/src/panes/context/` and `ui/src/instruments/context-map.ts` | Everything: the real pane over the server's `parts` and `thresholds` | Nothing now: the gallery's `context` scene stages the real pane over a fake shell |

Each is a real scene in the chrome gallery under the dev server
(`screenshots/chrome.html?scene=desk`, `?scene=asks`, `?scene=context`), rendered by
`chrome.spec.ts` from `packages/ui` with
`bun run screenshots -g "desk stage|asks stage|context stage"` at 1440×900 to:

- `artifacts/shots/windows/themes/stage--desk.png`: the desk at broadsheet beside the asking
  session in rose-pine-dawn and the working session in whiplash.
- `artifacts/shots/windows/themes/stage--asks.png`: an edit with its merge view in the house
  theme, a compound bash command in gruvbox-dark, an MCP call in catppuccin-latte.
- `artifacts/shots/windows/themes/stage--context.png`: a 200k map in the house theme, a map at
  91% in whiplash whose lines fall past the window, a 1M map in rose-pine-dawn.
- `artifacts/shots/windows/concepts/stage--desk.png`, `concepts/stage--asks.png` and
  `concepts/stage--context.png`: retired with their prototypes.

What the prototypes taught: the desk's two-line row (headline, tail) reads better than one wide
row at every tier, and putting the ask's answers only on the cursor row keeps the needs-you group
calm; the context map in glyphs looked like a bar chart, and in ink area it reads as a quantity,
so the pixel translation of density is area, not texture; and the consequence card made a real
defect visible: the merge view's collapsed-lines bar painted CodeMirror's own `#f3f3f3` gradient
because the theme set `backgroundColor` instead of `background`, fixed in
`panes/diff/merge-view.ts`.

## Server asks, collected

| Ask | Size | What | For |
|---|---|---|---|
| S17 desk rows | 1 | `GET /sessions` rows gain `live`, `waiting`, and a `changes` summary | The desk |
| S18 ask previews | 1 | `gate.ask` gains `preview { path, before, after }` for edit and write, from the tool's own dry run, bounded | Asks with their consequence |
| S19 context parts | 1 | `GET /sessions/{id}/context` gains `parts` and their `basis`; the reading uses reported usage (S14) | The context map |
| S20 restore to a turn | 1 | `POST /sessions/{id}/restore { turn }`, one entry (met: contract 1.2) | The turn ledger (landed) |
| S21 isolated sessions | 3 | Worktree sessions, the jail at the worktree, bring back without committing, removal | Isolated sessions, W8.3 |
| S22 asides | 1 | `POST /sessions/{id}/aside { prompt }`, a fork the tree never keeps | The side question |

## Sources

- Claude Code desktop docs: <https://code.claude.com/docs/en/desktop.md>
- "Redesigning Claude Code on desktop for parallel agents":
  <https://claude.com/resources/articles/claude-code-desktop-redesign>
- Claude Code `/context`, third-party description of the grid:
  <https://blog.vincentqiao.com/en/posts/claude-code-context/>
- Codex desktop app launch coverage:
  <https://techinformed.com/openai-ships-codex-macos-app-as-ai-coding-shifts-toward-parallel-agents/>
- Codex automations, triggers and the review queue:
  <https://codex.danielvaughan.com/2026/04/08/codex-desktop-automations/>
- Cursor 3 and the Agents Window: <https://www.datacamp.com/blog/cursor-3>
- Zed agent panel docs: <https://zed.dev/docs/ai/agent-panel.md>
- OpenCode changelog (v2.0.27 to v2.0.30): <https://opencode.ai/changelog>
- Warp, running multiple agents:
  <https://docs.warp.dev/guides/agent-workflows/running-multiple-agents-at-once-with-warp/>
- Warp, blocks as context: <https://docs.warp.dev/agents/using-agents/agent-context/blocks-as-context>
- Conductor, parallel Claude Code workspaces:
  <https://www.conductor.build/workflows/run-parallel-claude-codes>
- Superset: <https://superset.sh/compare/best-terminal-for-ai-coding>
- Vibe Kanban: <https://www.vibekanban.com/docs/getting-started>
- VS Code 1.106, Agent Sessions: <https://code.visualstudio.com/updates/v1_106>
- Pi: <https://agentic-ai.readthedocs.io/en/latest/AgentHarness/pi-dev/>
- keywork, already studied: `docs/influencers/opencode.md`, `docs/influencers/pi.md`,
  `docs/research/coding-agent-nuances.md`, `docs/backlog/120-subagents.md`
