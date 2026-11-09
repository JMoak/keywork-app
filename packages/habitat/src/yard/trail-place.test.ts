import type { SettingKind } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MotionPrefs } from "../pose/pose.ts";
import { byDepth } from "./depth.ts";
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
import {
  type Placement,
  type Rect,
  rankOf,
  type Size,
  stillShown,
  type YardSetting,
} from "./types.ts";

const prefs: MotionPrefs = { reducedMotion: false, tier: "active" };
const laptop: Rect = { x: 0, y: 0, width: 1280, height: 800 };
const desktop: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const roomy: Rect = { x: 0, y: 0, width: 3200, height: 1200 };
const leftHub: Rect = { x: 16, y: 16, width: 400, height: 1168 };

function satellite(id: string, depth: number, more: Partial<YardSetting> = {}): YardSetting {
  return aYardSetting({
    id,
    shown: "unfold",
    depth,
    what: { kind: "note", ref: id },
    unfolded: { at: depth, slot: 0, focus: undefined, byHand: true },
    ...more,
  });
}

function child(id: string, from: string, depth: number, slot: number, lane = 0): YardSetting {
  return satellite(id, depth, {
    from,
    unfolded: { at: 100 - depth, slot, lane, focus: undefined, byHand: true },
  });
}

function seed(id: string, depth: number, slot: number): YardSetting {
  return satellite(id, depth, {
    unfolded: { at: 100 - depth, slot, focus: undefined, byHand: true },
  });
}

function place(
  settings: readonly YardSetting[],
  viewport: Rect = desktop,
  inside?: string,
  hub: Rect = defaultHub(viewport),
): readonly Placement[] {
  return placeYard({ viewport, hub, settings, prefs, inside });
}

function find(placed: readonly Placement[], id: string): Placement {
  const found = placed.find((placement) => placement.id === id);
  if (found === undefined) throw new Error(`${id} was not placed`);
  return found;
}

const plot = [satellite("d", 9), child("f", "d", 8, 1), child("t", "f", 7, 2)];

describe("children beside their parent", () => {
  it("sit outward of the parent where there is room, naming it as their parent", () => {
    const placed = place(plot, roomy, undefined, leftHub);
    const parent = find(placed, "d");
    const outward = find(placed, "f");
    expect(outward).toMatchObject({ parent: "d", size: "readable" });
    expect(outward.slot).toBeUndefined();
    expect(outward.rect).toMatchObject({
      x: parent.rect.x + parent.rect.width + yardMetrics.gap,
      y: parent.rect.y,
    });
    expect(find(placed, "t")).toMatchObject({ parent: "f" });
    expect(placed.slice(1, 4).map((p) => p.id)).toEqual(["d", "f", "t"]);
  });

  it("take the free ring slot nearest the parent when nothing beside it is free", () => {
    const placed = place(plot);
    expect(find(placed, "f")).toMatchObject({ slot: 1, parent: "d", rung: "unfold" });
  });

  it("wait on the rail as a card in their plot when the ring is full", () => {
    expect(find(place(plot), "t")).toMatchObject({ rung: "card", parent: "f", layer: "front" });
  });

  it("never move a satellite of another plot to make room", () => {
    const other = satellite("o", 1, {
      unfolded: { at: 0, slot: 1, focus: undefined, byHand: true },
    });
    const alone = place([satellite("d", 9), other]);
    const withChild = place([satellite("d", 9), other, child("f", "d", 8, 2)]);
    expect(find(withChild, "o").rect).toEqual(find(alone, "o").rect);
    expect(find(withChild, "f").rung).toBe("card");
  });
  it("are never displaced by a newcomer: a seed finding no free space waits on the rail", () => {
    const settings = [satellite("d", 9), child("f", "d", 8, 1, 1)];
    const before = find(place(settings, laptop), "f");
    expect(before).toMatchObject({ rung: "unfold", parent: "d", rect: { x: 784, y: 348 } });
    const after = place([...settings, seed("n", 1, 1)], laptop);
    expect(find(after, "f")).toEqual(before);
    expect(find(after, "n")).toMatchObject({ rung: "card", layer: "front" });
  });
});

describe("space within a plot", () => {
  const deeper = [...plot, child("u", "t", 6, 3)];

  it("goes to the member the keeper is in: a third member waiting as a card takes its parent's space", () => {
    const placed = place(plot, laptop, "t");
    expect(find(placed, "f")).toMatchObject({
      rung: "unfold",
      size: "card",
      rect: { x: 784, y: 348, width: 272, height: 64 },
    });
    expect(find(placed, "t")).toMatchObject({
      rung: "unfold",
      size: "readable",
      parent: "f",
      rect: { x: 784, y: 424, width: 480, height: 244 },
    });
    expect(find(placed, "d")).toMatchObject({ size: "readable", rect: { x: 784, y: 16 } });
  });

  it("restores the previous arrangement when the keeper leaves", () => {
    expect(place(plot, laptop, undefined)).toEqual(place(plot, laptop, "d"));
    expect(find(place(plot, laptop), "f")).toMatchObject({ size: "readable", rect: { y: 348 } });
    expect(find(place(plot, laptop), "t")).toMatchObject({ rung: "card", parent: "f" });
  });

  it("hands a deeper member the nearest seated ancestor's space", () => {
    const placed = place(deeper, laptop, "u");
    expect(find(placed, "u")).toMatchObject({ rung: "unfold", rect: { x: 784, y: 424 } });
    expect(find(placed, "f")).toMatchObject({ size: "card", rect: { x: 784, y: 348 } });
    expect(find(placed, "t")).toMatchObject({ rung: "card", parent: "f" });
  });
});

describe("plot cards on the rail", () => {
  const folded = (setting: YardSetting): YardSetting => ({ ...setting, folded: "plot:d" });

  it("stand for every folded member, ordered by the deepest one", () => {
    const settings = [
      ...plot.map(folded),
      aYardSetting({ id: "c", shown: "card", depth: 8.5, what: { kind: "note", ref: "c" } }),
    ];
    const placed = place(settings);
    const rail = placed.filter((p) => p.rung === "card").map((p) => p.id);
    expect(rail).toEqual([yardIds.card, "plot:d", "c"]);
    expect(find(placed, "plot:d")).toMatchObject({ size: "card", parent: null });
    expect(foldedOf(placed, settings)).toEqual([]);
  });

  it("count their members as folded when the rail has no room for the card", () => {
    const cards = Array.from({ length: 6 }, (_, index) =>
      aYardSetting({
        id: `c${index}`,
        shown: "card",
        depth: 20 + index,
        what: { kind: "note", ref: `${index}` },
      }),
    );
    const settings = [...plot.map(folded), ...cards];
    const placed = place(settings);
    expect(placed.map((p) => p.id)).not.toContain("plot:d");
    expect(
      foldedOf(placed, settings)
        .map((s) => s.id)
        .toSorted(),
    ).toEqual(["c0", "d", "f", "t"]);
  });
});

describe("sizes in the yard", () => {
  const working = (setting: YardSetting): YardSetting => ({ ...setting, size: "working" });

  it("grow the panel the keeper is in to the full height beside the hub, its neighbour yielding to a card", () => {
    const settings = [satellite("d", 9), working(seed("f", 8, 1))];
    const placed = place(settings, desktop, "f");
    const grown = find(placed, "f");
    expect(grown).toMatchObject({
      size: "working",
      rect: { x: 1256, y: 16, width: 648, height: 1048 },
    });
    expect(find(placed, "d")).toMatchObject({
      size: "card",
      rect: { x: 972, y: 632, width: 272, height: 64 },
    });
  });

  it("grow into free space in any direction but the hub's, upward included (item 19)", () => {
    const settings = [working(satellite("d", 9)), seed("f", 8, 1)];
    const placed = place(settings);
    expect(find(placed, "d")).toMatchObject({
      size: "working",
      rect: { x: 972, y: 492, width: 932, height: 572 },
    });
    expect(find(placed, "f").size).toBe("readable");
    expect(find(place(settings, laptop), "d").size).toBe("working");
  });

  it("stay readable where the free rectangle is under one and a half times readable", () => {
    const settings = [satellite("d", 9), working(seed("f", 8, 1))];
    const placed = place(settings, laptop);
    expect(find(placed, "f")).toMatchObject({
      size: "readable",
      rect: { width: 480, height: 320 },
    });
    expect(find(placed, "d").size).toBe("readable");
  });

  it("never make the panel the keeper is in yield", () => {
    const settings = [working(satellite("d", 9)), seed("f", 8, 1)];
    const placed = place(settings, laptop, "f");
    expect(find(placed, "f")).toMatchObject({ size: "readable", rung: "unfold" });
    expect(find(placed, "d").size).toBe("readable");
  });

  it("send a yielding panel with no free corner to the rail", () => {
    const settings = [working(satellite("d", 9)), seed("f", 8, 1)];
    expect(find(place(settings, laptop), "f")).toMatchObject({ rung: "card", layer: "front" });
  });

  it("read the hub as working, the rail as cards, a stage as working and the corner hub as a card", () => {
    const placed = place(plot);
    expect(find(placed, yardIds.hub).size).toBe("working");
    expect(find(placed, yardIds.card).size).toBe("card");
    const staged = place([satellite("s", 3, { shown: "stage" }), ...plot]);
    expect(find(staged, "s").size).toBe("working");
    expect(find(staged, yardIds.hub).size).toBe("card");
  });
});

interface Drawn {
  readonly parent: number;
  readonly rooted: boolean;
  readonly shown: "card" | "unfold";
  readonly depth: number;
  readonly working: boolean;
  readonly code: boolean;
  readonly folded: boolean;
}

const drawnArb: fc.Arbitrary<Drawn> = fc.record({
  parent: fc.nat(),
  rooted: fc.boolean(),
  shown: fc.constantFrom<"card" | "unfold">("card", "unfold", "unfold"),
  depth: fc.integer({ min: 0, max: 30 }),
  working: fc.boolean(),
  code: fc.boolean(),
  folded: fc.boolean(),
});

const yardArb = fc
  .record({
    width: fc.integer({ min: 900, max: 3400 }),
    height: fc.integer({ min: 600, max: 1800 }),
    drawn: fc.array(drawnArb, { minLength: 1, maxLength: 9 }),
    inside: fc.nat(),
    folds: fc.boolean(),
  })
  .map(({ width, height, drawn, inside, folds }) => {
    const viewport: Rect = { x: 0, y: 0, width, height };
    const settings = drawn.map((shape, index) => {
      const from = shape.rooted || index === 0 ? null : `s${shape.parent % index}`;
      const lane = from === null ? undefined : index % 3;
      const kind: SettingKind = shape.code ? "file" : "note";
      return aYardSetting({
        id: `s${index}`,
        from,
        shown: shape.shown,
        depth: shape.depth,
        at: isoAt(noon + index),
        what: { kind, ref: `s${index}` },
        unfolded:
          shape.shown === "unfold"
            ? {
                at: index,
                slot: index,
                focus: undefined,
                byHand: true,
                ...(lane === undefined ? {} : { lane }),
              }
            : undefined,
        size: shape.working ? "working" : undefined,
        folded: folds && shape.folded ? "plot:s0" : undefined,
      });
    });
    return { viewport, settings, inside: `s${inside % drawn.length}` };
  });

describe("the yard with trails, for any viewport and settings", () => {
  it("never overlaps, never covers the hub, stays inside, and answers the same in any order", () => {
    fc.assert(
      fc.property(yardArb, ({ viewport, settings, inside }) => {
        const placed = place(settings, viewport, inside);
        expect(placed[0]?.id).toBe(yardIds.hub);
        placed.forEach((a, index) => {
          for (const b of placed.slice(index + 1)) {
            expect(overlaps(a.rect, b.rect), `${a.id} over ${b.id}`).toBe(false);
          }
          if (index > 0) expect(within(a.rect, viewport)).toBe(true);
        });
        expect(place(settings.toReversed(), viewport, inside)).toEqual(placed);
        for (const satellite of placed.filter((p) => p.rung === "unfold" && p.size !== "card")) {
          expect(satellite.rect.width).toBeGreaterThanOrEqual(readableSize(viewport).width);
        }
      }),
    );
  });

  it("accounts for every setting once: placed, tucked in a placed plot card, or folded past the rail", () => {
    fc.assert(
      fc.property(yardArb, ({ viewport, settings, inside }) => {
        const placed = place(settings, viewport, inside);
        const ids = new Set(placed.map((p) => p.id));
        const ladder = settings.filter((s) => stillShown(s) && rankOf(s.shown) >= rankOf("card"));
        const folded = new Set(foldedOf(placed, settings).map((s) => s.id));
        for (const setting of ladder) {
          const tucked = setting.folded !== undefined && ids.has(setting.folded);
          expect(
            [ids.has(setting.id), tucked, folded.has(setting.id)].filter(Boolean),
          ).toHaveLength(1);
        }
      }),
    );
  });

  it("never displaces anyone for a newcomer, seed or child, however deep it is", () => {
    fc.assert(
      fc.property(
        yardArb,
        fc.nat(),
        fc.integer({ min: -5, max: 40 }),
        fc.boolean(),
        ({ viewport, settings, inside }, pick, depth, asChild) => {
          const readable = settings.map(({ size: _size, ...rest }) => rest);
          const parent = readable[pick % readable.length];
          const newcomer =
            asChild && parent !== undefined
              ? child("newcomer", parent.id, depth, 99, pick % 3)
              : seed("newcomer", depth, 99);
          const before = place(readable, viewport, inside);
          const after = place([...readable, newcomer], viewport, inside);
          for (const held of before.filter((placement) => placement.rung === "unfold")) {
            const now = after.find((placement) => placement.id === held.id);
            expect(now && placeOf(now), held.id).toEqual(placeOf(held));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("moves nothing that outranks a satellite whose size changes; only those below it yield", () => {
    fc.assert(
      fc.property(yardArb, fc.nat(), ({ viewport, settings, inside }, pick) => {
        const before = place(settings, viewport, inside);
        const satellites = before.filter((p) => p.rung === "unfold");
        const changing = satellites[pick % Math.max(1, satellites.length)];
        if (changing === undefined) return;
        const flipped: Size =
          settings.find((s) => s.id === changing.id)?.size === "working" ? "readable" : "working";
        const after = place(
          settings.map((s) => (s.id === changing.id ? { ...s, size: flipped } : s)),
          viewport,
          inside,
        );
        const rank = precedenceOf(settings, inside);
        for (const held of satellites) {
          if (held.id === changing.id) continue;
          const now = after.find((p) => p.id === held.id);
          if (now !== undefined && now.rect === held.rect) continue;
          const moved = now === undefined || JSON.stringify(now.rect) !== JSON.stringify(held.rect);
          if (moved) expect(rank(held.id)).toBeGreaterThan(rank(changing.id));
        }
      }),
    );
  });
});

function placeOf({ rect, slot, size, rung, layer }: Placement) {
  return { rect, slot, size, rung, layer };
}

function precedenceOf(settings: readonly YardSetting[], inside: string): (id: string) => number {
  const order = settings
    .toSorted((a, b) => Number(b.id === inside) - Number(a.id === inside) || byDepth(a, b))
    .map((s) => s.id);
  return (id) => order.indexOf(id);
}

function within(rect: Rect, viewport: Rect): boolean {
  return (
    rect.x >= viewport.x &&
    rect.y >= viewport.y &&
    rect.x + rect.width <= viewport.x + viewport.width &&
    rect.y + rect.height <= viewport.y + viewport.height
  );
}
