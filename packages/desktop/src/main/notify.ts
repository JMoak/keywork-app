import { keyworkProfile, type ProductProfile } from "@keywork-app/product";

export type NeedsYouTrigger =
  | { kind: "ask"; workspace: string; sessionId: string; callId: string }
  | { kind: "memory-inbox"; workspace: string; pending: number }
  | { kind: "chore"; workspace: string; creature: string; routineId: string };

export interface Notice {
  title: string;
  body: string;
  trigger: NeedsYouTrigger;
}

export const memoryInboxThreshold = 3;

export const packagedAppUserModelId = keyworkProfile.appId;

export interface Launch {
  platform: NodeJS.Platform;
  packaged: boolean;
  execPath: string;
}

export function appUserModelIdFor(
  launch: Launch,
  profile: ProductProfile = keyworkProfile,
): string | undefined {
  if (launch.platform !== "win32") return undefined;
  return launch.packaged ? profile.appId : launch.execPath;
}

export type ForegroundWitness = () => boolean | undefined;

export function witnessForeground(witness: ForegroundWitness): () => void {
  foregroundWitness = witness;
  return () => {
    if (foregroundWitness === witness) foregroundWitness = unwitnessed;
  };
}

export function consoleHoldsFocus(electronFocused: boolean): boolean {
  return electronFocused && foregroundWitness() !== false;
}

export function shouldNotify(trigger: NeedsYouTrigger, windowFocused: boolean): boolean {
  if (consoleHoldsFocus(windowFocused)) return false;
  switch (trigger.kind) {
    case "ask":
      return true;
    case "memory-inbox":
      return trigger.pending >= memoryInboxThreshold;
    case "chore":
      return true;
  }
}

export function isNotice(candidate: unknown): candidate is Notice {
  if (typeof candidate !== "object" || candidate === null) return false;
  const notice = candidate as Record<string, unknown>;
  return (
    typeof notice.title === "string" && typeof notice.body === "string" && isTrigger(notice.trigger)
  );
}

const unwitnessed: ForegroundWitness = () => undefined;

let foregroundWitness: ForegroundWitness = unwitnessed;

function isTrigger(candidate: unknown): candidate is NeedsYouTrigger {
  if (typeof candidate !== "object" || candidate === null) return false;
  const trigger = candidate as Record<string, unknown>;
  if (typeof trigger.workspace !== "string") return false;
  if (trigger.kind === "ask") {
    return typeof trigger.sessionId === "string" && typeof trigger.callId === "string";
  }
  if (trigger.kind === "chore") {
    return typeof trigger.creature === "string" && typeof trigger.routineId === "string";
  }
  return trigger.kind === "memory-inbox" && typeof trigger.pending === "number";
}
