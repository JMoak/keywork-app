import { readFileSync } from "node:fs";
import type {
  BusEnvelope,
  Message,
  MessagePart,
  PendingAsk,
  ReportMark,
  SessionDetail,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { replayBase } from "./history.ts";
import { projectAll } from "./project.ts";
import { closesTurn, joinSnapshot, opensTurn } from "./seam.ts";
import { emptyProjection, type SessionProjection, type TranscriptEntry } from "./types.ts";

const recorded = ["plain", "tool", "asked-granted", "injected"].map((name) => ({
  name,
  stream: envelopesOf(name),
}));

const timings: readonly Timing[] = [
  { promptBeforeAnnounced: false, stepAfterDone: false },
  { promptBeforeAnnounced: true, stepAfterDone: true },
];

describe("joining a session snapshot to the live stream", () => {
  it("draws every recorded stream exactly once, however the snapshot and the open interleave", () => {
    for (const { name, stream } of recorded) {
      const last = stream.at(-1)?.id ?? 0;
      for (const timing of timings) {
        for (let asOf = 0; asOf <= last; asOf += 1) {
          for (let opened = 0; opened <= asOf; opened += 1) {
            for (let loaded = asOf; loaded <= last; loaded += 1) {
              const joined = joinedAt(stream, timing, { asOf, opened, loaded });
              for (let shown = Math.max(loaded, ahead(timing, asOf)); shown <= last; shown += 1) {
                const caught = projectAll(joined, between(stream, loaded, shown));
                const where = `${name} asOf ${asOf} opened ${opened} loaded ${loaded} shown ${shown} ${JSON.stringify(timing)}`;
                expect(drawn(caught), where).toEqual(drawn(truthAt(stream, shown)));
              }
            }
          }
        }
      }
    }
  });

  it("keeps the first word a creature streamed before its thread was opened", () => {
    const stream = framedIntroduction();
    const moments = { asOf: 3, opened: 3, loaded: 4 };
    const joined = joinedAt(stream, timings[0] as Timing, moments, { reports: [frameReport] });
    const caught = projectAll(joined, between(stream, 4, 6));
    expect(drawn(caught)).toEqual(["assistant I am Wren."]);
  });

  it("keeps a creature's frame out of the transcript when its report reached the snapshot before its notice fired", () => {
    const stream = framedIntroduction();
    const detail: SessionDetail = { ...snapshotOf([], 0), reports: [frameReport] };
    const joined = projectAll(
      replayBase(detail),
      joinSnapshot({ detail, pending: [], heard: [], arrived: stream }),
    );
    expect(drawn(joined)).toEqual(["assistant I am Wren."]);
  });

  it("keeps the frame out when its notice arrives only after a snapshot that held its report", () => {
    const stream = framedIntroduction();
    const detail: SessionDetail = { ...snapshotOf([], 0), reports: [frameReport] };
    const loaded = projectAll(
      replayBase(detail),
      joinSnapshot({ detail, pending: [], heard: [], arrived: [] }),
    );
    expect(drawn(projectAll(loaded, stream))).toEqual(["assistant I am Wren."]);
  });
});

interface Timing {
  readonly promptBeforeAnnounced: boolean;
  readonly stepAfterDone: boolean;
}

interface Moments {
  readonly asOf: number;
  readonly opened: number;
  readonly loaded: number;
}

function joinedAt(
  stream: readonly BusEnvelope[],
  timing: Timing,
  moments: Moments,
  marks: Pick<SessionDetail, "reports"> = {},
): SessionProjection {
  const heard = stream.filter((envelope) => envelope.id <= moments.loaded);
  const detail = {
    ...snapshotOf(rememberedBy(stream, moments.asOf, timing), moments.asOf),
    ...marks,
  };
  const joined = joinSnapshot({
    detail,
    pending: pendingAt(stream, moments.asOf),
    heard: keptBy(heard, moments.opened),
    arrived: heard.filter((envelope) => envelope.id > moments.opened),
  });
  return projectAll(replayBase(detail), joined);
}

function ahead(timing: Timing, asOf: number): number {
  return timing.promptBeforeAnnounced ? asOf + 1 : asOf;
}

function truthAt(stream: readonly BusEnvelope[], shown: number): SessionProjection {
  return projectAll(
    emptyProjection,
    stream.filter((envelope) => envelope.id <= shown),
  );
}

function between(stream: readonly BusEnvelope[], after: number, upTo: number): BusEnvelope[] {
  return stream.filter((envelope) => envelope.id > after && envelope.id <= upTo);
}

function drawn(projection: SessionProjection): string[] {
  const lines = projection.entries.map(lineOf);
  return projection.turn === undefined ? lines : [...lines, "turn running"];
}

function lineOf(entry: TranscriptEntry): string {
  switch (entry.kind) {
    case "tool":
      return `tool ${entry.run.callId} ${entry.run.phase} ${entry.run.detail?.join("|") ?? ""}`;
    case "notice":
      return `notice ${entry.text}`;
    default:
      return `${entry.kind} ${entry.text}`;
  }
}

function rememberedBy(stream: readonly BusEnvelope[], asOf: number, timing: Timing): Message[] {
  const messages: Message[] = [];
  let step: MessagePart[] = [];
  stream.forEach((envelope, at) => {
    const next = stream[at + 1]?.id ?? envelope.id + 1;
    switch (envelope.type) {
      case "turn.started": {
        const remembered = timing.promptBeforeAnnounced ? envelope.id - 1 : envelope.id;
        if (remembered <= asOf) messages.push(userMessage(envelope.payload.userText));
        return;
      }
      case "turn.delta": {
        const { delta } = envelope.payload;
        if (delta.type === "text") step = withText(step, delta.text);
        else if (delta.type === "tool-call") step = [...step, delta.call];
        else if (delta.type === "done") {
          const remembered = timing.stepAfterDone ? next : envelope.id;
          if (remembered <= asOf) messages.push({ role: "assistant", parts: step });
          step = [];
        }
        return;
      }
      case "tool.finished":
        if (envelope.id <= asOf) {
          const { callId, output, isError } = envelope.payload;
          messages.push({
            role: "tool",
            parts: [{ type: "tool-result", callId, output, isError }],
          });
        }
        return;
      default:
        return;
    }
  });
  return messages;
}

function withText(parts: readonly MessagePart[], text: string): MessagePart[] {
  const last = parts.at(-1);
  if (last?.type !== "text") return [...parts, { type: "text", text }];
  return [...parts.slice(0, -1), { ...last, text: last.text + text }];
}

function userMessage(text: string): Message {
  return { role: "user", parts: [{ type: "text", text }] };
}

function pendingAt(stream: readonly BusEnvelope[], asOf: number): PendingAsk[] {
  const known = stream.filter((envelope) => envelope.id <= asOf);
  return known.flatMap((envelope): PendingAsk[] => {
    if (envelope.type !== "gate.ask") return [];
    const { ask } = envelope.payload;
    const answered = known.some(
      (later) => later.type === "gate.permission" && later.payload.decision.callId === ask.callId,
    );
    if (answered) return [];
    return [
      {
        sessionId: envelope.sessionId,
        callId: ask.callId,
        tool: ask.tool,
        arguments: ask.arguments,
        askedAt: envelope.ts,
        rules: ask.rules ?? [],
      },
    ];
  });
}

function keptBy(heard: readonly BusEnvelope[], opened: number): BusEnvelope[] {
  let kept: BusEnvelope[] = [];
  for (const envelope of heard) {
    const loading = envelope.id > opened;
    if (opensTurn(envelope) && (!loading || kept.length === 0)) kept = [envelope];
    else if (kept.length > 0) kept = [...kept, envelope];
    if (closesTurn(envelope) && !loading) kept = [];
  }
  return kept;
}

function snapshotOf(messages: readonly Message[], asOf: number): SessionDetail {
  return {
    id: "s1",
    title: "(untitled session)",
    createdAt: "2026-09-07T12:00:00.000Z",
    lastActivityAt: "2026-09-07T12:00:00.000Z",
    messageCount: messages.length,
    cwd: "/work",
    live: true,
    asOf,
    messages,
  };
}

const wren = { kind: "creature", creature: "wren", thread: "s1" } as const;

const frameReport: ReportMark = {
  index: 0,
  entryId: "f1",
  at: "2026-09-07T12:00:00.000Z",
  text: "You are Wren.",
  origin: wren,
  kind: "frame",
};

function framedIntroduction(): BusEnvelope[] {
  const at = "2026-09-07T12:00:00.000Z";
  const envelopes: Omit<BusEnvelope, "ts" | "sessionId">[] = [
    {
      id: 1,
      type: "extension.notice",
      payload: {
        extension: "creature",
        level: "info",
        message: "You are Wren.",
        detail: { origin: wren, entryId: "f1", kind: "frame" },
      },
    },
    { id: 2, type: "turn.started", payload: { userText: "You are Wren.", origin: wren } },
    { id: 3, type: "turn.delta", payload: { delta: { type: "text", text: "I" } } },
    { id: 4, type: "turn.delta", payload: { delta: { type: "text", text: " am Wren." } } },
    {
      id: 5,
      type: "turn.delta",
      payload: { delta: { type: "done", usage: { inputTokens: 1, outputTokens: 1 } } },
    },
    {
      id: 6,
      type: "turn.completed",
      payload: {
        message: { role: "assistant", parts: [{ type: "text", text: "I am Wren." }] },
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    },
  ] as Omit<BusEnvelope, "ts" | "sessionId">[];
  return envelopes.map((envelope) => ({ ...envelope, ts: at, sessionId: "s1" }) as BusEnvelope);
}

function envelopesOf(name: string): BusEnvelope[] {
  const text = readFileSync(new URL(`../fixtures/${name}.jsonl`, import.meta.url), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}
