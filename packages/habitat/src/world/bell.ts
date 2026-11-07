import type {
  DecidedForKeeper,
  HabitatState,
  HeldChore,
  SessionId,
  Slug,
  Thread,
} from "./types.ts";

export type BellItem =
  | AskAtTheBell
  | FailureAtTheBell
  | InboxAtTheBell
  | ChoreAtTheBell
  | DecidedAtTheBell;

export interface AskAtTheBell {
  readonly kind: "ask";
  readonly key: string;
  readonly sessionId: SessionId;
  readonly callId: string;
  readonly tool: string;
  readonly subject: string;
  readonly since: string;
}

export interface FailureAtTheBell {
  readonly kind: "failed";
  readonly key: string;
  readonly sessionId: SessionId;
  readonly eventId: number;
  readonly message: string;
  readonly since: string;
}

export interface InboxAtTheBell {
  readonly kind: "inbox";
  readonly key: string;
  readonly count: number;
}

export interface ChoreAtTheBell extends HeldChore {
  readonly kind: "chore";
  readonly key: string;
}

export interface DecidedAtTheBell extends DecidedForKeeper {
  readonly kind: "decided";
  readonly key: string;
  readonly since: string;
}

export function ringingTheBell(state: HabitatState): BellItem[] {
  const threads = Object.values(state.threads).flatMap(bellItemsOf);
  const chores = Object.values(state.porch.chores).map(choreAtTheBell);
  const decided = Object.values(state.porch.decided).map(decidedAtTheBell);
  const inbox = state.porch.inbox;
  if (inbox === undefined || inbox.count === 0) return [...threads, ...chores, ...decided];
  return [...threads, ...chores, ...decided, { kind: "inbox", key: "inbox", count: inbox.count }];
}

export function bellItemsOf(thread: Thread): BellItem[] {
  const asks = Object.values(thread.asks).map(
    (ask): AskAtTheBell => ({
      kind: "ask",
      key: `ask:${ask.callId}`,
      sessionId: thread.id,
      callId: ask.callId,
      tool: ask.tool,
      subject: ask.subject,
      since: ask.askedAt,
    }),
  );
  if (thread.failure === undefined) return asks;
  return [
    ...asks,
    {
      kind: "failed",
      key: `failed:${thread.id}:${thread.failure.eventId}`,
      sessionId: thread.id,
      eventId: thread.failure.eventId,
      message: thread.failure.message,
      since: thread.failure.at,
    },
  ];
}

export function decidedFor(state: HabitatState, creature: Slug): DecidedForKeeper | undefined {
  return Object.values(state.porch.decided)
    .filter(
      (decided) =>
        decided.creature === creature ||
        (decided.creature === undefined && state.threads[decided.sessionId]?.creature === creature),
    )
    .sort((a, b) => a.at.localeCompare(b.at))[0];
}

export function bellLine(item: BellItem): string {
  switch (item.kind) {
    case "ask":
      return item.tool === "edit" || item.tool === "write"
        ? "asks to edit a file"
        : item.tool === "bash"
          ? "asks to run a command"
          : `asks to use ${item.tool}`;
    case "failed":
      return "blocked";
    case "inbox":
      return item.count === 1 ? "one memory item waits" : `${item.count} memory items wait`;
    case "chore":
      return item.need === "grants" ? "asks to accept its grants" : "blocked";
    case "decided":
      return decidedForYouLine(item.tool);
  }
}

export function decidedForYouLine(tool: string): string {
  return `decided for you · approved ${tool}`;
}

function choreAtTheBell(held: HeldChore): ChoreAtTheBell {
  return { ...held, kind: "chore", key: `chore:${held.creature}/${held.routineId}/${held.need}` };
}

function decidedAtTheBell(decided: DecidedForKeeper): DecidedAtTheBell {
  return { ...decided, kind: "decided", key: `decided:${decided.recordId}`, since: decided.at };
}
