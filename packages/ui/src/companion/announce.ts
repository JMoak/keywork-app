import type { CompanionSnapshot } from "./port.ts";
import { bubbleShown } from "./snapshot.ts";

export interface Announcement {
  text: string;
  priority: "polite" | "assertive";
}

export function accessibleName(snapshot: CompanionSnapshot): string {
  const threads =
    snapshot.activeThreads === 1 ? "1 active thread" : `${snapshot.activeThreads} active threads`;
  return `${snapshot.creature.name}, ${snapshot.stateLabel}, ${threads}`;
}

export interface Announcer {
  next(snapshot: CompanionSnapshot): Announcement | undefined;
}

export function announcer(): Announcer {
  let previous: CompanionSnapshot | undefined;
  const announced = new Set<string>();
  return {
    next: (snapshot) => {
      const before = previous;
      previous = snapshot;
      if (
        before?.state === snapshot.state &&
        before.needsYou?.callId === snapshot.needsYou?.callId &&
        choreKeyOf(before) === choreKeyOf(snapshot)
      ) {
        return undefined;
      }
      switch (snapshot.state) {
        case "porch": {
          const key = `porch:${snapshot.threadId ?? ""}:${snapshot.needsYou?.callId ?? ""}:${choreKeyOf(snapshot)}`;
          if (announced.has(key)) return undefined;
          announced.add(key);
          return { text: needsYouText(snapshot), priority: "assertive" };
        }
        case "back":
        case "blocked":
          return { text: accessibleName(snapshot), priority: "polite" };
        default:
          return undefined;
      }
    },
  };
}

function needsYouText(snapshot: CompanionSnapshot): string {
  const bubble = bubbleShown(snapshot);
  const detail = bubble === undefined ? "" : `: ${bubble.title}, ${bubble.line}`;
  return `${accessibleName(snapshot)}${detail}`;
}

function choreKeyOf(snapshot: CompanionSnapshot): string {
  const held = snapshot.heldChore;
  return held === undefined ? "" : `${held.creature}/${held.routineId}`;
}
