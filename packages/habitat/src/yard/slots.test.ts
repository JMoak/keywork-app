import type { SettingKind } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MotionPrefs } from "../pose/pose.ts";
import {
  codeWidth,
  defaultHub,
  overlaps,
  placeYard,
  readableSize,
  unfoldWidth,
  yardIds,
  yardMetrics,
} from "./place.ts";
import { aYardSetting } from "./testing.ts";
import type { Placement, Rect, YardSetting } from "./types.ts";

const prefs: MotionPrefs = { reducedMotion: false, tier: "active" };
const desktop: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const laptop: Rect = { x: 0, y: 0, width: 1280, height: 800 };
const roomy: Rect = { x: 0, y: 0, width: 1600, height: 900 };
const narrowHub: Rect = { x: 16, y: 16, width: 300, height: 868 };

function unfold(id: string, depth: number, more: Partial<YardSetting> = {}): YardSetting {
  return aYardSetting({ id, shown: "unfold", depth, ...more });
}

function inSlot(slot: number, kind: SettingKind = "note"): Partial<YardSetting> {
  return {
    unfolded: { at: slot, slot, focus: undefined, byHand: false },
    what: { kind, ref: `${kind} ${slot}` },
  };
}

function place(
  settings: readonly YardSetting[],
  viewport: Rect = desktop,
  hub: Rect = defaultHub(viewport),
): readonly Placement[] {
  return placeYard({ viewport, hub, settings, prefs });
}

function satellites(placements: readonly Placement[]): string[] {
  return placements
    .filter((placement) => placement.rung === "unfold")
    .map(({ id, slot, rect }) => `${id} ${slot} ${rect.x},${rect.y} ${rect.width}`);
}

describe("satellites keep their ring slot", () => {
  it("puts a satellite in the slot it unfolded into and labels it, and nothing else", () => {
    const placed = place([unfold("a", 5, inSlot(1)), unfold("b", 3, inSlot(0))]);
    expect(satellites(placed)).toEqual(["b 0 972,632 648", "a 1 1256,16 648"]);
    const others = placed.filter((placement) => placement.rung !== "unfold");
    expect(others.every((placement) => placement.slot === undefined)).toBe(true);
  });

  it("never backfills a freed slot by moving another satellite", () => {
    const both = place([unfold("a", 5, inSlot(0)), unfold("b", 3, inSlot(1))]);
    const left = place([unfold("b", 3, inSlot(1))]);
    expect(satellites(both)).toEqual(["a 0 972,632 648", "b 1 1256,16 648"]);
    expect(satellites(left)).toEqual(["b 1 1256,16 648"]);
  });

  it("gives a newcomer the lowest free slot, oldest unfold first", () => {
    const placed = place([
      unfold("kept", 1, inSlot(1)),
      unfold("late", 9, { unfolded: { at: 50, slot: 7, focus: undefined, byHand: false } }),
    ]);
    expect(satellites(placed)).toEqual(["late 0 972,632 648", "kept 1 1256,16 648"]);
  });

  it("still lets depth decide what unfolds when the ring is full", () => {
    const placed = place([
      unfold("shallow", 1, inSlot(0)),
      unfold("deep", 5, inSlot(1)),
      unfold("deeper", 4, inSlot(2)),
    ]);
    expect(satellites(placed)).toEqual(["deeper 0 972,632 648", "deep 1 1256,16 648"]);
    expect(placed.find((placement) => placement.id === "shallow")?.rung).toBe("card");
  });

  it("holds the ring to a fixed number of slots", () => {
    const wall: Rect = { x: 0, y: 0, width: 4000, height: 1200 };
    const many = Array.from({ length: 10 }, (_, index) => unfold(`u${index}`, 20 - index));
    const placed = place(many, wall, { x: 16, y: 16, width: 200, height: 1168 });
    expect(satellites(placed)).toHaveLength(yardMetrics.slots);
  });
});

describe("code unfolds at eighty columns", () => {
  it("measures eighty columns of the code font, never below the readable floor", () => {
    expect(codeWidth).toBe(720);
    expect(unfoldWidth("file", laptop)).toBe(720);
    expect(unfoldWidth("diff", desktop)).toBe(720);
    expect(unfoldWidth("note", desktop)).toBe(readableSize(desktop).width);
    expect(unfoldWidth("file", { x: 0, y: 0, width: 2560, height: 1440 })).toBe(864);
  });

  it("widens a file or a diff into free space, and leaves prose at the floor", () => {
    const code = place([unfold("f", 5, inSlot(0, "file"))]);
    const prose = place([unfold("n", 5, inSlot(0, "note"))]);
    expect(satellites(code)).toEqual(["f 0 972,632 720"]);
    expect(satellites(prose)).toEqual(["n 0 972,632 648"]);
  });

  it("falls back to the floor where there is no room, and never into another slot", () => {
    expect(satellites(place([unfold("f", 5, inSlot(0, "diff"))], laptop))).toEqual([
      "f 0 784,16 480",
    ]);
    const ring = ["file", "file", "file"].map((kind, slot) =>
      unfold(`f${slot}`, 9 - slot, inSlot(slot, kind as SettingKind)),
    );
    expect(satellites(place(ring, roomy, narrowHub))).toEqual([
      "f0 0 328,524 540",
      "f1 1 612,16 720",
      "f2 2 880,524 540",
    ]);
    expect(satellites(place(ring.slice(0, 1), roomy, narrowHub))).toEqual(["f0 0 328,524 540"]);
  });
});

const kindArb = fc.constantFrom<SettingKind>("file", "diff", "note", "report");

const ringArb = fc
  .record({
    width: fc.integer({ min: 600, max: 3200 }),
    height: fc.integer({ min: 500, max: 2000 }),
    hub: fc.tuple(
      fc.double({ min: 0, max: 0.7, noNaN: true }),
      fc.double({ min: 0.1, max: 0.5, noNaN: true }),
    ),
    unfolds: fc.array(fc.record({ kind: kindArb, depth: fc.integer({ min: 0, max: 30 }) }), {
      minLength: 1,
      maxLength: 8,
    }),
    order: fc.array(fc.nat(), { minLength: 8, maxLength: 8 }),
  })
  .map(({ width, height, hub: [left, wide], unfolds, order }) => {
    const viewport: Rect = { x: 0, y: 0, width, height };
    const hub: Rect = {
      x: 16 + Math.round(left * (width - 32)),
      y: 16,
      width: Math.max(1, Math.round(wide * (width - 32))),
      height: height - 32,
    };
    const slots = unfolds
      .map((_, index) => index)
      .toSorted((a, b) => (order[a] ?? 0) - (order[b] ?? 0) || a - b);
    const settings = unfolds.map(({ kind, depth }, index) =>
      unfold(`u${index}`, depth, inSlot(slots[index] ?? index, kind)),
    );
    return { viewport, hub, settings };
  });

describe("the ring, for any viewport, hub and unfolds", () => {
  it("never overlaps, stays inside, and reads at least the floor and at most eighty columns", () => {
    fc.assert(
      fc.property(ringArb, ({ viewport, hub, settings }) => {
        const placed = place(settings, viewport, hub);
        const floor = readableSize(viewport);
        placed.forEach((a, index) => {
          for (const b of placed.slice(index + 1)) expect(overlaps(a.rect, b.rect)).toBe(false);
        });
        for (const placement of placed.filter((p) => p.rung === "unfold")) {
          const setting = settings.find((held) => held.id === placement.id);
          const most = unfoldWidth(setting?.what.kind ?? "note", viewport);
          expect(placement.rect.width).toBeGreaterThanOrEqual(floor.width);
          expect(placement.rect.width).toBeLessThanOrEqual(most);
          expect(placement.rect.height).toBe(floor.height);
        }
        const slots = placed.flatMap((p) => (p.slot === undefined ? [] : [p.slot]));
        expect(new Set(slots).size).toBe(slots.length);
        expect(slots).toEqual(slots.toSorted((a, b) => a - b));
      }),
    );
  });

  it("never moves a satellite in its own slot when another one leaves", () => {
    fc.assert(
      fc.property(ringArb, fc.nat(), ({ viewport, hub, settings }, pick) => {
        const before = place(settings, viewport, hub);
        const leaving = settings[pick % settings.length]?.id;
        const after = place(
          settings.filter((setting) => setting.id !== leaving),
          viewport,
          hub,
        );
        for (const placement of after.filter((p) => p.rung === "unfold")) {
          const own = settings.find((setting) => setting.id === placement.id)?.unfolded?.slot;
          const earlier = before.find((p) => p.id === placement.id);
          if (earlier !== undefined && own === placement.slot && earlier.slot === own) {
            expect(placement.rect).toEqual(earlier.rect);
          }
        }
        expect(after[0]?.id).toBe(yardIds.hub);
      }),
    );
  });
});
