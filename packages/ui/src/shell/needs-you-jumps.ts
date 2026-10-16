import { createSignal } from "solid-js";
import type { NeedsYouTrigger } from "../host/port.ts";
import type { PaneId } from "../layout/index.ts";
import type { NeedsYouItem } from "./needs-you.ts";

export type NeedsYouPlace =
  | { readonly kind: "session"; readonly workspace: string; readonly sessionId: string }
  | { readonly kind: "memory"; readonly workspace: string };

export interface Reveal {
  readonly item: NeedsYouItem;
  readonly pane: PaneId;
  readonly seq: number;
}

export interface JumpSeams {
  items(): readonly NeedsYouItem[];
  focused(): PaneId | undefined;
  show(place: NeedsYouPlace): void;
  refocus(pane: PaneId): boolean;
}

export interface Jumps {
  next(): NeedsYouItem | undefined;
  to(item: NeedsYouItem): void;
  toPlace(place: NeedsYouPlace): void;
  toTrigger(trigger: NeedsYouTrigger): void;
  back(): boolean;
  revealing(): Reveal | undefined;
}

export const returnDepth = 8;

export function createJumps(seams: JumpSeams): Jumps {
  const returns: PaneId[] = [];
  const [revealing, setRevealing] = createSignal<Reveal>();
  let landing: Landing | undefined;
  let seq = 0;

  const remember = (pane: PaneId): void => {
    if (returns.at(-1) === pane) return;
    returns.push(pane);
    if (returns.length > returnDepth) returns.shift();
  };

  const go = (place: NeedsYouPlace, item: NeedsYouItem | undefined): void => {
    const from = seams.focused();
    seams.show(place);
    const landed = seams.focused();
    if (from !== undefined && from !== landed) remember(from);
    if (item === undefined || landed === undefined) {
      landing = undefined;
      return;
    }
    landing = { key: item.key, landed };
    setRevealing({ item, pane: landed, seq: ++seq });
  };

  return {
    next: () => {
      const item = nextWaiting(seams.items(), landing, seams.focused());
      if (item !== undefined) go(placeOf(item), item);
      return item;
    },
    to: (item) => go(placeOf(item), item),
    toPlace: (place) => go(place, undefined),
    toTrigger: (trigger) => go(placeOfTrigger(trigger), itemOfTrigger(seams.items(), trigger)),
    back: () => {
      for (let pane = returns.pop(); pane !== undefined; pane = returns.pop()) {
        if (seams.refocus(pane)) return true;
      }
      return false;
    },
    revealing,
  };
}

export interface Landing {
  readonly key: string;
  readonly landed: PaneId;
}

export function nextWaiting(
  items: readonly NeedsYouItem[],
  landing: Landing | undefined,
  focused: PaneId | undefined,
): NeedsYouItem | undefined {
  if (landing === undefined || landing.landed !== focused) return items[0];
  const at = items.findIndex((item) => item.key === landing.key);
  return at === -1 ? items[0] : items[(at + 1) % items.length];
}

export function placeOf(item: NeedsYouItem): NeedsYouPlace {
  switch (item.kind) {
    case "ask":
    case "failed":
      return { kind: "session", workspace: item.workspace, sessionId: item.sessionId };
    case "airlock":
    case "inbox":
      return { kind: "memory", workspace: item.workspace };
  }
}

export function placeOfTrigger(trigger: NeedsYouTrigger): NeedsYouPlace {
  return trigger.kind === "ask"
    ? { kind: "session", workspace: trigger.workspace, sessionId: trigger.sessionId }
    : { kind: "memory", workspace: trigger.workspace };
}

export function itemOfTrigger(
  items: readonly NeedsYouItem[],
  trigger: NeedsYouTrigger,
): NeedsYouItem | undefined {
  return items.find((item) =>
    trigger.kind === "ask"
      ? item.kind === "ask" && item.callId === trigger.callId
      : item.kind === "inbox" && item.workspace === trigger.workspace,
  );
}
