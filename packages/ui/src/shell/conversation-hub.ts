import { yardMetrics } from "@keywork-app/habitat";
import type { PaneId, Rect, Screen } from "../layout/index.ts";
import type { PaneSlot } from "./tiler.ts";

export interface ConversationHub {
  readonly slots: readonly PaneSlot[];
  readonly tabs: readonly HubTab[];
}

export interface HubTab {
  readonly id: PaneId;
  readonly active: boolean;
}

export const hubTileFloor = yardMetrics.hub.min;

export const hubTabsHeight = 32;

export const emptyHub: ConversationHub = { slots: [], tabs: [] };

export function conversationHub(
  slots: readonly PaneSlot[],
  screen: Screen,
  conversation: PaneId | undefined,
): ConversationHub {
  const focused = slots.find((slot) => slot.focused);
  const hub =
    slots.find((slot) => slot.id === conversation && slot.spec.kind === "conversation") ?? focused;
  const whole: Rect = { x: 0, y: 0, width: screen.width, height: screen.height };
  if (hub === undefined) return emptyHub;
  if (focused === undefined || focused.id === hub.id) {
    return { slots: [{ ...hub, rect: whole }], tabs: [] };
  }
  const half = Math.round(whole.width / 2);
  if (Math.min(half, whole.width - half) < hubTileFloor) return tabbed(hub, focused, whole);
  return {
    slots: [
      { ...hub, rect: { ...whole, width: half } },
      { ...focused, rect: { ...whole, x: half, width: whole.width - half } },
    ],
    tabs: [],
  };
}

export function tabbedOut(hub: ConversationHub, id: PaneId): boolean {
  return hub.tabs.some((tab) => tab.id === id && !tab.active);
}

function tabbed(hub: PaneSlot, visiting: PaneSlot, whole: Rect): ConversationHub {
  const body: Rect = { ...whole, y: hubTabsHeight, height: whole.height - hubTabsHeight };
  return {
    slots: [
      { ...hub, rect: body },
      { ...visiting, rect: body },
    ],
    tabs: [
      { id: hub.id, active: false },
      { id: visiting.id, active: true },
    ],
  };
}
