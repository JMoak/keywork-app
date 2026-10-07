export type NeedsYouTrigger =
  | { kind: "ask"; workspace: string; sessionId: string; callId: string }
  | { kind: "memory-inbox"; workspace: string; pending: number };

export interface Notice {
  title: string;
  body: string;
  trigger: NeedsYouTrigger;
}

export const memoryInboxThreshold = 3;

export function shouldNotify(trigger: NeedsYouTrigger, windowFocused: boolean): boolean {
  if (windowFocused) return false;
  switch (trigger.kind) {
    case "ask":
      return true;
    case "memory-inbox":
      return trigger.pending >= memoryInboxThreshold;
  }
}

export function isNotice(candidate: unknown): candidate is Notice {
  if (typeof candidate !== "object" || candidate === null) return false;
  const notice = candidate as Record<string, unknown>;
  return (
    typeof notice.title === "string" && typeof notice.body === "string" && isTrigger(notice.trigger)
  );
}

function isTrigger(candidate: unknown): candidate is NeedsYouTrigger {
  if (typeof candidate !== "object" || candidate === null) return false;
  const trigger = candidate as Record<string, unknown>;
  if (typeof trigger.workspace !== "string") return false;
  if (trigger.kind === "ask") {
    return typeof trigger.sessionId === "string" && typeof trigger.callId === "string";
  }
  return trigger.kind === "memory-inbox" && typeof trigger.pending === "number";
}
