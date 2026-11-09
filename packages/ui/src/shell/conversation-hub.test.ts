import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Screen } from "../layout/index.ts";
import { conversationHub, hubTabsHeight, hubTileFloor, tabbedOut } from "./conversation-hub.ts";
import type { PaneSlot } from "./tiler.ts";

const nowhere = { x: 0, y: 0, width: 0, height: 0 };

const talk: PaneSlot = {
  id: "talk",
  spec: { kind: "conversation", sessionId: "s1" },
  rect: nowhere,
  focused: false,
  spawnRank: 0,
};
const visiting: PaneSlot = {
  id: "diff",
  spec: { kind: "tree" },
  rect: nowhere,
  focused: true,
  spawnRank: 1,
};

describe("the keywork hub", () => {
  it("holds the focused conversation alone", () => {
    const hub = conversationHub([{ ...talk, focused: true }], { width: 640, height: 868 }, "talk");
    expect(hub.slots.map((held) => [held.id, held.rect.width])).toEqual([["talk", 640]]);
    expect(hub.tabs).toEqual([]);
  });

  it("draws a visiting tile beside the conversation when both halves stay readable", () => {
    const hub = conversationHub([talk, visiting], { width: 1440, height: 900 }, "talk");
    expect(hub.slots.map((held) => [held.id, held.rect.x, held.rect.width])).toEqual([
      ["talk", 0, 720],
      ["diff", 720, 720],
    ]);
    expect(hub.tabs).toEqual([]);
  });

  it("makes the visiting tile a tab instead of a sliver once unfolds squeeze the hub", () => {
    const hub = conversationHub([talk, visiting], { width: 640, height: 868 }, "talk");
    const body = { x: 0, y: hubTabsHeight, width: 640, height: 868 - hubTabsHeight };
    expect(hub.slots.map((held) => [held.id, held.rect])).toEqual([
      ["talk", body],
      ["diff", body],
    ]);
    expect(hub.tabs).toEqual([
      { id: "talk", active: false },
      { id: "diff", active: true },
    ]);
    expect(tabbedOut(hub, "talk")).toBe(true);
    expect(tabbedOut(hub, "diff")).toBe(false);
  });

  it("never shows a tile narrower than the floor while it shares the hub, at any width", () => {
    fc.assert(
      fc.property(fc.integer({ min: hubTileFloor, max: 4000 }), (width) => {
        const screen: Screen = { width, height: 900 };
        const hub = conversationHub([talk, visiting], screen, "talk");
        const shown = hub.slots.filter((held) => !tabbedOut(hub, held.id));
        for (const held of shown) expect(held.rect.width).toBeGreaterThanOrEqual(hubTileFloor);
        expect(shown.length).toBe(width >= 2 * hubTileFloor ? 2 : 1);
      }),
    );
  });
});
