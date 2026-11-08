import type { Rung, SettingState } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MotionPrefs } from "../pose/pose.ts";
import {
  defaultHub,
  foldedOf,
  overlaps,
  placeYard,
  readableSize,
  yardIds,
  yardMetrics,
} from "./place.ts";
import { aYardSetting, isoAt, noon } from "./testing.ts";
import { type Placement, type Rect, rankOf, stillShown, type YardSetting } from "./types.ts";

const prefs: MotionPrefs = { reducedMotion: false, tier: "active" };
const desktop: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

function shown(id: string, rung: Rung, depth: number, more: Partial<YardSetting> = {}) {
  return aYardSetting({ id, shown: rung, depth, ...more });
}

function place(
  settings: readonly YardSetting[],
  viewport: Rect = desktop,
  hub: Rect = defaultHub(viewport),
): readonly Placement[] {
  return placeYard({ viewport, hub, settings, prefs });
}

function ids(placements: readonly Placement[]): string[] {
  return placements.map((placement) => placement.id);
}

describe("placing the yard", () => {
  it("places only the hub when nothing is set out past a lantern, or while the yard is hidden", () => {
    const quiet = [
      shown("l", "lantern", 3),
      shown("g", "glyph", 3),
      shown("d", "card", 3, { state: "dismissed" }),
      shown("s", "card", 3, { state: "seen", until: "seen" }),
    ];
    expect(ids(place(quiet))).toEqual([yardIds.hub]);
    const hidden = placeYard({
      viewport: desktop,
      hub: defaultHub(desktop),
      settings: [shown("u", "unfold", 3)],
      prefs: { reducedMotion: false, tier: "hidden" },
    });
    expect(ids(hidden)).toEqual([yardIds.hub]);
  });

  it("opens an unfolded setting at readable size beside the hub, to the right first", () => {
    const hub = defaultHub(desktop);
    const [, unfolded] = place([shown("u", "unfold", 3)]);
    expect(unfolded).toMatchObject({ id: "u", rung: "unfold", layer: "mid" });
    expect(unfolded?.rect).toMatchObject(readableSize(desktop));
    expect(unfolded?.rect.x).toBeGreaterThanOrEqual(hub.x + hub.width);
    expect(overlaps(unfolded?.rect as Rect, hub)).toBe(false);
  });

  it("goes round the ring: left when the right is full, below and above when the sides are", () => {
    const hugRight: Rect = { x: 1300, y: 16, width: 604, height: 1048 };
    const [, left] = place([shown("u", "unfold", 3)], desktop, hugRight);
    expect((left?.rect.x ?? 0) + (left?.rect.width ?? 0)).toBeLessThanOrEqual(hugRight.x);

    const tall: Rect = { x: 0, y: 0, width: 1280, height: 1800 };
    const band: Rect = { x: 16, y: 600, width: 1248, height: 500 };
    const placed = place([shown("a", "unfold", 3), shown("b", "unfold", 2)], tall, band);
    const [below, above] = placed.filter((placement) => placement.rung === "unfold");
    expect(below?.rect.y).toBeGreaterThanOrEqual(band.y + band.height);
    expect((above?.rect.y ?? 0) + (above?.rect.height ?? 0)).toBeLessThanOrEqual(band.y);
  });

  it("holds the five deepest cards on the rail and folds the rest into a count", () => {
    const settings = Array.from({ length: 8 }, (_, index) =>
      shown(`c${index}`, "card", index, { at: isoAt(noon + index) }),
    );
    const placed = place(settings);
    const cards = placed.filter((placement) => placement.id.startsWith("c"));
    expect(ids(cards)).toEqual(["c7", "c6", "c5", "c4", "c3"]);
    expect(ids(placed)).toContain(yardIds.card);
    expect(ids(placed)).toContain(yardIds.fold);
    expect(foldedOf(placed, settings).map((setting) => setting.id)).toEqual(["c2", "c1", "c0"]);
    expect(ids(place(settings.slice(0, 5)))).not.toContain(yardIds.fold);
  });

  it("puts pinned settings first on the rail", () => {
    const placed = place([
      shown("fresh", "card", 9),
      shown("pinned", "card", 13, { state: "pinned" }),
    ]);
    expect(ids(placed).filter((id) => !id.startsWith("yard:"))).toEqual(["pinned", "fresh"]);
  });

  it("moves an unfold with no room left onto the rail as a card", () => {
    const placed = place([
      shown("a", "unfold", 5),
      shown("b", "unfold", 4),
      shown("c", "unfold", 3),
    ]);
    expect(placed.find((placement) => placement.id === "c")).toMatchObject({
      rung: "card",
      layer: "front",
    });
  });

  it("gives one staged setting the main area and shrinks the hub to a corner node", () => {
    const placed = place([shown("st", "stage", 2), shown("u", "unfold", 5), shown("c", "card", 1)]);
    const [hub, stage] = placed;
    expect(hub).toMatchObject({ id: yardIds.hub, rung: "glyph", layer: "front" });
    expect(hub?.rect).toMatchObject({
      width: yardMetrics.rail.width,
      height: yardMetrics.node.height,
    });
    expect(stage).toMatchObject({ id: "st", rung: "stage", layer: "back" });
    expect(stage?.rect.width).toBeGreaterThan(desktop.width / 2);
    expect(placed.filter((placement) => placement.rung === "card").map((p) => p.id)).toEqual([
      yardIds.card,
      "u",
      "c",
    ]);
  });

  it("unfolds a staged setting instead when the viewport cannot hold a stage", () => {
    const narrow: Rect = { x: 0, y: 0, width: 760, height: 900 };
    const hub: Rect = { x: 16, y: 16, width: 200, height: 868 };
    const placed = place([shown("st", "stage", 2)], narrow, hub);
    expect(placed[0]?.rect).toEqual(hub);
    expect(placed.find((placement) => placement.id === "st")?.rung).toBe("unfold");
  });

  it("reads at least 480 by 320, or forty percent of the viewport's short side", () => {
    expect(readableSize({ x: 0, y: 0, width: 1280, height: 720 })).toEqual({
      width: 480,
      height: 320,
    });
    expect(readableSize(desktop)).toEqual({ width: 648, height: 432 });
    expect(readableSize({ x: 0, y: 0, width: 1440, height: 2560 })).toEqual({
      width: 864,
      height: 576,
    });
  });

  it("keeps the default hub inside the viewport with room on its right for the rail and a setting", () => {
    for (const viewport of [desktop, { x: 0, y: 0, width: 1280, height: 800 }]) {
      const hub = defaultHub(viewport);
      const room = viewport.width - yardMetrics.margin - (hub.x + hub.width);
      expect(hub.x).toBeGreaterThanOrEqual(yardMetrics.margin);
      expect(room).toBeGreaterThanOrEqual(
        2 * yardMetrics.gap + yardMetrics.rail.width + readableSize(viewport).width,
      );
    }
  });
});

const rungArb = fc.constantFrom<Rung>("glyph", "lantern", "card", "unfold", "stage");
const stateArb = fc.constantFrom<SettingState>("live", "seen", "pinned", "dismissed", "withdrawn");

const settingsArb = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    shown: rungArb,
    state: stateArb,
    until: fc.constantFrom("seen", "rests"),
    depth: fc.integer({ min: 0, max: 30 }),
    at: fc.integer({ min: 0, max: 600_000 }),
  }),
  { selector: (setting) => setting.id, maxLength: 14 },
);

const layoutArb = fc
  .record({
    width: fc.integer({ min: 0, max: 4000 }),
    height: fc.integer({ min: 0, max: 2400 }),
    x: fc.integer({ min: -50, max: 50 }),
    y: fc.integer({ min: -50, max: 50 }),
    hub: fc.tuple(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
    ),
    tier: fc.constantFrom("interact", "active", "ambient", "rest", "hidden"),
    settings: settingsArb,
  })
  .map(({ width, height, x, y, hub: [left, top, wide, tall], tier, settings }) => {
    const viewport: Rect = { x, y, width, height };
    const hubX = x + Math.round(left * width);
    const hubY = y + Math.round(top * height);
    const hub: Rect = {
      x: hubX,
      y: hubY,
      width: Math.round(wide * (x + width - hubX)),
      height: Math.round(tall * (y + height - hubY)),
    };
    return {
      viewport,
      hub,
      prefs: { reducedMotion: false, tier } as MotionPrefs,
      settings: settings.map((drawn) =>
        aYardSetting({
          ...drawn,
          at: isoAt(noon + drawn.at),
          what: { kind: "note", ref: drawn.id },
        }),
      ),
    };
  });

describe("placing the yard, for any viewport, hub and settings", () => {
  it("always answers, with the hub first and every rect finite", () => {
    fc.assert(
      fc.property(layoutArb, (input) => {
        const placed = placeYard(input);
        expect(placed[0]?.id).toBe(yardIds.hub);
        for (const { rect } of placed) {
          for (const value of [rect.x, rect.y, rect.width, rect.height]) {
            expect(Number.isFinite(value)).toBe(true);
          }
          expect(Math.min(rect.width, rect.height)).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it("is deterministic, whatever order the settings arrive in", () => {
    fc.assert(
      fc.property(layoutArb, (input) => {
        const placed = placeYard(input);
        expect(placeYard(input)).toEqual(placed);
        expect(placeYard({ ...input, settings: input.settings.toReversed() })).toEqual(placed);
      }),
    );
  });

  it("never covers the hub, and nothing it places overlaps anything else", () => {
    fc.assert(
      fc.property(layoutArb, (input) => {
        const placed = placeYard(input);
        placed.forEach((a, index) => {
          for (const b of placed.slice(index + 1)) {
            expect(overlaps(a.rect, b.rect), `${a.id} over ${b.id}`).toBe(false);
          }
        });
      }),
    );
  });

  it("keeps the rail to five cards, the yard inside the viewport, and unfolds readable", () => {
    fc.assert(
      fc.property(layoutArb, (input) => {
        const placed = placeYard(input);
        const settingIds = new Set(input.settings.map((setting) => setting.id));
        const railCards = placed.filter(
          (placement) => placement.rung === "card" && settingIds.has(placement.id),
        );
        expect(railCards.length).toBeLessThanOrEqual(yardMetrics.rail.length);
        const readable = readableSize(input.viewport);
        for (const placement of placed.slice(1)) {
          expect(inside(placement.rect, input.viewport)).toBe(true);
          if (placement.rung === "unfold") {
            expect(placement.rect.width).toBeGreaterThanOrEqual(readable.width);
            expect(placement.rect.height).toBeGreaterThanOrEqual(readable.height);
          }
        }
        expect(placed.filter((placement) => placement.rung === "stage").length).toBeLessThanOrEqual(
          1,
        );
      }),
    );
  });

  it("accounts for every setting on the ladder exactly once, placed or folded", () => {
    fc.assert(
      fc.property(layoutArb, (input) => {
        const placed = placeYard(input);
        const ladder = input.settings.filter(
          (setting) => stillShown(setting) && rankOf(setting.shown) >= rankOf("card"),
        );
        const settingIds = new Set(input.settings.map((setting) => setting.id));
        const placedIds = ids(placed).filter((id) => settingIds.has(id));
        expect(new Set(placedIds).size).toBe(placedIds.length);
        const accounted = [...placedIds, ...foldedOf(placed, input.settings).map((s) => s.id)];
        expect(accounted.sort()).toEqual(ladder.map((setting) => setting.id).sort());
      }),
    );
  });
});

function inside(rect: Rect, viewport: Rect): boolean {
  return (
    rect.x >= viewport.x &&
    rect.y >= viewport.y &&
    rect.x + rect.width <= viewport.x + viewport.width &&
    rect.y + rect.height <= viewport.y + viewport.height
  );
}
