import type { Rung, SettingState } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { floodSize, grouped, groupsOf } from "./flood.ts";
import { defaultHub, foldedOf, placeYard, yardIds } from "./place.ts";
import { aYardSetting, isoAt, noon } from "./testing.ts";
import { ownerKeyOf, ownerOf, type Rect, type YardSetting } from "./types.ts";

function card(id: string, depth: number, more: Partial<YardSetting> = {}): YardSetting {
  return aYardSetting({ id, shown: "card", depth, at: isoAt(noon + depth), ...more });
}

function ids(settings: readonly { readonly id: string }[]): string[] {
  return settings.map((setting) => setting.id);
}

const desktop: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

describe("grouping a flood", () => {
  it("groups four or more live cards from one owner under the deepest of them", () => {
    const flood = [card("a", 1), card("b", 4), card("c", 2), card("d", 3)];
    const [group] = groupsOf(flood);
    expect(group?.key).toBe("creature:bea");
    expect(group?.owner).toEqual({ kind: "creature", slug: "bea" });
    expect(group?.head.id).toBe("b");
    expect(ids(group?.members ?? [])).toEqual(["b", "d", "c", "a"]);
    expect(ids(grouped(flood))).toEqual(["b"]);
    expect(groupsOf(flood.slice(0, floodSize - 1))).toEqual([]);
  });

  it("counts only live cards: never a pinned card, an unfold or a lantern", () => {
    const settings = [
      card("a", 1),
      card("b", 2),
      card("c", 3),
      card("p", 9, { state: "pinned" }),
      card("u", 8, { shown: "unfold" }),
      card("l", 7, { shown: "lantern" }),
    ];
    expect(groupsOf(settings)).toEqual([]);
    const flooded = [...settings, card("d", 4)];
    expect(ids(grouped(flooded)).sort()).toEqual(["d", "l", "p", "u"]);
  });

  it("groups a creature-less thread apart from other threads and from creatures", () => {
    const loose = (id: string, sessionId: string, depth: number): YardSetting =>
      card(id, depth, { creature: null, sessionId });
    const settings = [
      ...["a", "b", "c", "d"].map((id, index) => loose(id, "t1", index)),
      loose("e", "t2", 5),
      loose("f", "t2", 6),
      card("g", 7),
    ];
    expect(groupsOf(settings).map((group) => group.key)).toEqual(["thread:t1"]);
    expect(ids(grouped(settings)).sort()).toEqual(["d", "e", "f", "g"]);
  });

  it("leaves a group the keeper opened expanded in place", () => {
    const flood = ["a", "b", "c", "d", "e"].map((id, index) => card(id, index));
    expect(ids(grouped(flood, ["creature:bea"]))).toEqual(ids(flood));
  });

  it("puts one card for the group on the rail, so the fold counts only what is past it", () => {
    const flood = Array.from({ length: 8 }, (_, index) => card(`b${index}`, index));
    const others = ["vey", "kit"].map((creature, index) =>
      card(creature, 10 + index, { creature }),
    );
    const settings = grouped([...flood, ...others]);
    const placed = placeYard({
      viewport: desktop,
      hub: defaultHub(desktop),
      settings,
      prefs: { reducedMotion: false, tier: "active" },
    });
    expect(ids(placed)).toEqual([yardIds.hub, yardIds.card, "kit", "vey", "b7"]);
    expect(foldedOf(placed, settings)).toEqual([]);
  });
});

const settingsArb = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 4 }),
    creature: fc.constantFrom("bea", "vey", null),
    sessionId: fc.constantFrom("t1", "t2"),
    shown: fc.constantFrom<Rung>("lantern", "card", "card", "unfold"),
    state: fc.constantFrom<SettingState>("live", "live", "pinned"),
    depth: fc.integer({ min: 0, max: 20 }),
  }),
  { selector: (drawn) => drawn.id, maxLength: 16 },
);

describe("grouping a flood, for any settings", () => {
  it("tucks only the non-head members of groups, each group one owner's live cards", () => {
    fc.assert(
      fc.property(settingsArb, (drawn) => {
        const settings = drawn.map((shape) => aYardSetting(shape));
        const groups = groupsOf(settings);
        const kept = new Set(ids(grouped(settings)));
        const tucked = settings.filter((setting) => !kept.has(setting.id));
        const groupedIds = new Set(groups.flatMap((group) => ids(group.members.slice(1))));
        expect(ids(tucked).sort()).toEqual([...groupedIds].sort());
        for (const group of groups) {
          expect(group.members.length).toBeGreaterThanOrEqual(floodSize);
          expect(kept.has(group.head.id)).toBe(true);
          for (const member of group.members) {
            expect(ownerKeyOf(ownerOf(member))).toBe(group.key);
            expect(member).toMatchObject({ state: "live", shown: "card" });
          }
        }
        const owners = new Set(groups.map((group) => group.key));
        expect(owners.size).toBe(groups.length);
      }),
    );
  });
});
