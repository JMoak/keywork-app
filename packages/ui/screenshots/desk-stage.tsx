import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type { BusEnvelope, PermissionRule, SessionSummary } from "@keywork-app/protocol";
import { createSignal, type JSX } from "solid-js";
import { NeedsYouStrip, stripLine } from "../src/chrome/needs-you-strip.tsx";
import { PaneFrame } from "../src/chrome/pane-frame.tsx";
import { StatusLine } from "../src/chrome/status-line.tsx";
import { scenarios } from "../src/dev/scenarios.ts";
import { assumedContextLevel } from "../src/instruments/context.ts";
import { keymapFromConfig } from "../src/keys/index.ts";
import { ConversationPane } from "../src/page/pane.tsx";
import { deskTitle } from "../src/panes/needs-you/desk.ts";
import { needsYouPane } from "../src/panes/needs-you/index.tsx";
import type { ShellSeams } from "../src/panes/registry.ts";
import { type NeedsYouItem, orderNeedsYou, waitingKey, whereOf } from "../src/shell/needs-you.ts";
import type { NeedsYouQueue } from "../src/shell/needs-you-queue.ts";
import { createQuietSessions } from "../src/shell/quiet.ts";
import { createSessionReads } from "../src/shell/session-reads.ts";
import type { Outfit } from "../src/theme/attire.ts";
import { keyworkNight, themeNamed } from "../src/theme/index.ts";
import { stagedAsks } from "./ask-stage.ts";

export function DeskStage() {
  const shell = deskShell();
  return (
    <div class="kw-workspace">
      <div class="kw-stage" style={stageGrid}>
        <div style={{ ...slot, "grid-row": "1 / span 2" }}>
          <PaneFrame name={deskTitle(waiting.length)} state="needs-you" focused spawnRank={0}>
            <needsYouPane.component
              id="desk"
              spec={{ kind: "needs-you" }}
              focused
              shell={shell}
              onAction={() => {}}
            />
          </PaneFrame>
        </div>
        <div style={slot}>
          <PaneFrame
            name="rename the tiler verbs"
            state="needs-you"
            focused={false}
            spawnRank={1}
            hueRank={1}
            arc="pricing"
            bot={{ sigil: "◆", name: "editor" }}
            outfit={wearing("rose-pine-dawn", "arc", "pricing")}
          >
            <ConversationPane projection={renameAsking()} onAnswerAsk={() => undefined} />
          </PaneFrame>
        </div>
        <div style={slot}>
          <PaneFrame
            name="explain the page grammar"
            state="working"
            focused={false}
            spawnRank={2}
            hueRank={2}
            context={assumedContextLevel(92_000)}
            outfit={wearing("whiplash", "pane")}
          >
            <ConversationPane projection={scenario("prose")} />
          </PaneFrame>
        </div>
      </div>
      <NeedsYouStrip
        line={stripLine({
          shown: true,
          count: waiting.length,
          head: waiting[0],
          paneOpen: true,
          hint: "ctrl+k n",
          where: whereIn,
        })}
      />
      <StatusLine
        serverLabel="127.0.0.1:4770"
        projection={emptyProjection}
        usage="8 sessions · $1.55"
        preset="careful"
        trust={undefined}
        leader={undefined}
        notice={undefined}
        gap={undefined}
        lost={undefined}
      />
    </div>
  );
}

const stageGrid: JSX.CSSProperties = {
  display: "grid",
  "grid-template-columns": "7fr 5fr",
  "grid-template-rows": "1fr 1fr",
};

const slot: JSX.CSSProperties = { "min-width": "0", "min-height": "0" };

const workspace = "C:/src/keywork-app";

const trashCommand = "bun test src/shell/trash.test.ts --rerun-each 20 | tee artifacts/trash.log";

const sessions: readonly SessionSummary[] = [
  staged("rename", "rename the tiler verbs", 6, 0.42, { arc: "pricing", bot: "editor" }),
  staged("trash", "fix the flaky trash test", 2, 0.18, { arc: "keywork" }),
  staged("page", "explain the page grammar", 0, 0.31, { arc: "concept" }),
  staged("scan", "scan the field for the desk", 1, 0.07, { arc: "concept", bot: "scout" }),
  staged("seam", "why is the seam drag sticky", 4, 0.55, { arc: "pricing" }),
  staged("sidecar", "bump the sidecar pin", 11, 0.02, {}),
  staged("wardrobe", "wardrobe follow-ups", 26 * 60, undefined, { arc: "keywork" }),
  staged("outfits", "outfits live round", 3 * 24 * 60, undefined, {}),
];

const waiting: readonly NeedsYouItem[] = orderNeedsYou([
  askWaiting("rename", "r1", "edit", "src/layout/verbs.ts", 6),
  askWaiting("trash", "t1", "bash", trashCommand, 2),
  {
    kind: "airlock",
    key: waitingKey(workspace, "airlock", "pricing"),
    workspace,
    since: minutesAgo(52),
    arc: "pricing",
    candidates: 2,
    questions: 1,
  },
  {
    kind: "failed",
    key: waitingKey(workspace, "failed", "sidecar:9"),
    workspace,
    since: minutesAgo(11),
    sessionId: "sidecar",
    message: "provider overloaded (529)",
  },
]);

const projections: Readonly<Record<string, SessionProjection>> = {
  rename: projectAll(emptyProjection, [...priorTurn(61_000), asked("r1", "edit", [])]),
  trash: projectAll(emptyProjection, [
    ...priorTurn(182_000),
    asked("t1", "bash", [bashRule("bun test *"), bashRule("tee *")]),
  ]),
  page: projectAll(emptyProjection, [
    ...priorTurn(92_000),
    ...running("edit", "src/page/page.css"),
  ]),
  scan: projectAll(emptyProjection, [...priorTurn(18_000), ...running("read", "docs/plan.md")]),
  seam: projectAll(emptyProjection, priorTurn(47_000)),
};

const dressing: Readonly<Record<string, Outfit>> = {
  rename: wearing("rose-pine-dawn", "arc", "pricing"),
  page: wearing("whiplash", "pane"),
};

function deskShell(): ShellSeams {
  const reads = createSessionReads();
  reads.sight(sessions);
  reads.read(lookedAt("seam", 30));
  const quiet = createQuietSessions();
  quiet.toggle("wardrobe");
  const keymap = keymapFromConfig();
  const [items] = createSignal(waiting);
  const queue: NeedsYouQueue = {
    items,
    count: () => items().length,
    head: () => items()[0],
    where: whereIn,
    dismiss: () => "dismissed",
    attach: () => () => undefined,
    onArrival: () => () => undefined,
  };
  const store = {
    state: { summaries: sessions, projections, trash: [] },
    summary: (id: string | undefined) => sessions.find((held) => held.id === id),
    projection: (id: string | undefined) =>
      (id === undefined ? undefined : projections[id]) ?? emptyProjection,
    controls: { readings: () => ({ context: undefined, cost: undefined }) },
    surfaces: {
      state: {
        bots: [
          { name: "editor", sigil: "◆" },
          { name: "scout", sigil: "◇" },
        ],
        ordinals: { keywork: 0, pricing: 1, concept: 2 },
      },
    },
    open: async () => undefined,
  };
  const shell: Partial<ShellSeams> = {
    store: store as unknown as ShellSeams["store"],
    keys: { chord: (action) => keymap.describe(action) ?? action, leader: () => keymap.leader },
    workspace,
    quiet,
    needsYou: {
      queue,
      reads,
      revealing: () => undefined,
      jump: () => undefined,
      visit: () => undefined,
      dressed: (sessionId) => dressing[sessionId],
    },
  };
  return shell as ShellSeams;
}

function lookedAt(sessionId: string, minutes: number): SessionSummary {
  const held = sessions.find((candidate) => candidate.id === sessionId);
  return {
    ...(held ?? staged(sessionId, sessionId, minutes, undefined, {})),
    lastActivityAt: minutesAgo(minutes),
  };
}

function whereIn(item: NeedsYouItem): string {
  return whereOf(item, (sessionId) => sessions.find((held) => held.id === sessionId)?.title ?? "");
}

function staged(
  id: string,
  title: string,
  minutes: number,
  usd: number | undefined,
  extra: Partial<SessionSummary>,
): SessionSummary {
  const at = minutesAgo(minutes);
  return {
    id,
    title,
    createdAt: at,
    lastActivityAt: at,
    messageCount: 6,
    ...(usd === undefined ? {} : { costNanos: Math.round(usd * 1e9) }),
    ...extra,
  };
}

function askWaiting(
  sessionId: string,
  callId: string,
  tool: string,
  subject: string,
  minutes: number,
): NeedsYouItem {
  return {
    kind: "ask",
    key: waitingKey(workspace, "ask", callId),
    workspace,
    since: minutesAgo(minutes),
    sessionId,
    callId,
    tool,
    subject,
  };
}

function priorTurn(contextTokens: number): BusEnvelope[] {
  const message = { role: "assistant", parts: [{ type: "text", text: "done" }] };
  return [
    envelope(1, "turn.started", { userText: "go on" }),
    envelope(2, "turn.completed", {
      message,
      usage: { inputTokens: contextTokens, outputTokens: 400 },
    }),
  ];
}

function running(tool: string, path: string): BusEnvelope[] {
  const call = { type: "tool-call", callId: `${tool}-1`, name: tool, arguments: { path } };
  return [
    envelope(3, "turn.started", { userText: "keep going" }),
    envelope(4, "tool.started", { call }),
  ];
}

function asked(callId: string, tool: string, rules: PermissionRule[]): BusEnvelope {
  const args = tool === "bash" ? { command: trashCommand } : { path: "src/layout/verbs.ts" };
  return envelope(5, "gate.ask", {
    ask: { tool, callId, arguments: args, rule: "default", rules },
  });
}

function renameAsking(): SessionProjection {
  return projectAll(emptyProjection, stagedAsks[0]?.envelopes ?? []);
}

function bashRule(resource: string): PermissionRule {
  return { action: "bash", resource, effect: "allow" };
}

function envelope(id: number, type: string, payload: unknown): BusEnvelope {
  return { id, ts: minutesAgo(0), sessionId: "staged", type, payload } as BusEnvelope;
}

function scenario(name: string): SessionProjection {
  const found = scenarios.find((candidate) => candidate.name === name);
  return found === undefined ? emptyProjection : projectAll(emptyProjection, found.envelopes);
}

function wearing(name: string, source: Outfit["source"], arc?: string): Outfit {
  return { theme: themeNamed(name) ?? keyworkNight, source, arc };
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
