import { defaultHub, yardIds, yardMetrics } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { Rect } from "../layout/index.ts";
import { yardLayout } from "./layout.ts";
import { aYardSetting } from "./testing.ts";

const viewport: Rect = { x: 0, y: 0, width: 1440, height: 900 };
const prefs = { reducedMotion: false, tier: "interact" } as const;

describe("the yard's layout", () => {
  it("keeps a lantern off the rail and the hub whole", () => {
    const lantern = aYardSetting({ shown: "lantern" });
    const layout = yardLayout({ viewport, settings: [lantern], railWanted: false, prefs });
    expect(layout.hub).toEqual(viewport);
    expect(layout.rail).toBeUndefined();
  });

  it("puts cards on a rail at the hub's edge in depth order and folds past five", () => {
    const settings = Array.from({ length: 7 }, (_, index) =>
      aYardSetting({ id: `set-${index}`, depth: index, what: { kind: "note", ref: `n${index}` } }),
    );
    const layout = yardLayout({ viewport, settings, railWanted: false, prefs });
    const rail = layout.rail;
    expect(rail).toBeDefined();
    expect(rail?.cards.map((card) => card.id)).toEqual([
      "set-6",
      "set-5",
      "set-4",
      "set-3",
      "set-2",
    ]);
    expect(rail?.folded).toBe(2);
    expect(rail?.fold).toBeDefined();
    expect(layout.hub.width).toBe(
      viewport.width - yardMetrics.margin - yardMetrics.rail.width - yardMetrics.gap,
    );
    expect(rail?.region.x).toBeGreaterThanOrEqual(layout.hub.x + layout.hub.width);
    expect(layout.satellites).toEqual([]);
  });

  it("unfolds a setting beside the compact hub at readable size, never over it", () => {
    const unfolded = aYardSetting({ id: "open", shown: "unfold", depth: 9 });
    const card = aYardSetting({ id: "card", depth: 1, what: { kind: "note", ref: "n" } });
    const layout = yardLayout({ viewport, settings: [card, unfolded], railWanted: false, prefs });
    expect(layout.hub).toEqual(defaultHub(viewport));
    expect(layout.satellites).toHaveLength(1);
    const satellite = layout.satellites[0];
    expect(satellite?.id).toBe("open");
    expect(satellite?.rect.width).toBeGreaterThanOrEqual(480);
    expect(satellite?.rect.height).toBeGreaterThanOrEqual(320);
    expect(overlaps(satellite?.rect, layout.hub)).toBe(false);
    expect(layout.rail?.cards.map((placement) => placement.id)).toEqual(["card"]);
    expect(layout.selectable.map((setting) => setting.id)).toEqual(["open", "card"]);
  });

  it("gives the stage the main area and shrinks the hub to a corner node", () => {
    const staged = aYardSetting({ id: "staged", shown: "stage", depth: 9 });
    const layout = yardLayout({ viewport, settings: [staged], railWanted: false, prefs });
    expect(layout.satellites.map((placement) => placement.rung)).toEqual(["stage"]);
    expect(layout.hub.width).toBe(yardMetrics.rail.width);
    expect(layout.hub.height).toBe(yardMetrics.node.height);
    expect(layout.satellites.some((placement) => placement.id === yardIds.hub)).toBe(false);
  });

  it("drops what the keeper or time settled and keeps what was pinned", () => {
    const settings = [
      aYardSetting({ id: "dismissed", state: "dismissed" }),
      aYardSetting({ id: "seen", state: "seen" }),
      aYardSetting({ id: "pinned", state: "pinned" }),
    ];
    const layout = yardLayout({ viewport, settings, railWanted: false, prefs });
    expect(layout.selectable.map((setting) => setting.id)).toEqual(["pinned"]);
  });

  it("opens an empty rail beside the hub when the keeper asks for it", () => {
    const layout = yardLayout({ viewport, settings: [], railWanted: true, prefs });
    expect(layout.rail?.cards).toEqual([]);
    expect(layout.rail?.region.x).toBe(layout.hub.width + yardMetrics.gap);
  });
});

describe("the yard's layout where the conversation cannot keep its reading width beside the rail", () => {
  const narrow: Rect = { x: 0, y: 0, width: 504, height: 1016 };
  const notes = (count: number, shown: "card" | "unfold" = "card") =>
    Array.from({ length: count }, (_, index) =>
      aYardSetting({ id: `set-${index}`, depth: index, shown, what: { kind: "note", ref: "n" } }),
    );

  it("lays the rail along the top as one slim row and gives the conversation the full width beneath", () => {
    const layout = yardLayout({ viewport: narrow, settings: notes(6), railWanted: false, prefs });
    const rail = layout.rail;
    expect(rail?.band).toBe(true);
    expect(layout.hub).toEqual({ x: 0, y: 56, width: 504, height: 960 });
    expect(rail?.region).toEqual({ x: 16, y: 8, width: 472, height: 32 });
    expect(rail?.head).toEqual({ x: 16, y: 8, width: 144, height: 32 });
    expect(rail?.cards.map((card) => [card.id, card.rect])).toEqual([
      ["set-5", { x: 172, y: 8, width: 124, height: 32 }],
      ["set-4", { x: 308, y: 8, width: 124, height: 32 }],
    ]);
    expect(rail?.fold).toEqual({ x: 444, y: 8, width: 44, height: 32 });
    expect(rail?.folded).toBe(4);
    expect(layout.selectable.map((setting) => setting.id)).toEqual(
      [5, 4, 3, 2, 1, 0].map((index) => `set-${index}`),
    );
  });

  it("keeps what would unfold as a card in the band, since nothing can stand beside the conversation", () => {
    const layout = yardLayout({
      viewport: narrow,
      settings: notes(2, "unfold"),
      railWanted: false,
      prefs,
    });
    expect(layout.satellites).toEqual([]);
    expect(layout.hub.width).toBe(504);
    expect(layout.rail?.cards).toHaveLength(2);
  });

  it("opens an empty band when the keeper asks for the rail, and none while nothing is set out", () => {
    const asked = yardLayout({ viewport: narrow, settings: [], railWanted: true, prefs });
    expect(asked.rail).toMatchObject({ band: true, cards: [], head: { x: 16, y: 8, width: 144 } });
    expect(asked.hub.y).toBe(56);
    const idle = yardLayout({ viewport: narrow, settings: [], railWanted: false, prefs });
    expect(idle).toEqual({ hub: narrow, rail: undefined, satellites: [], selectable: [] });
  });

  it("stands the rail as a column again from the width that holds the conversation beside it", () => {
    const { margin, gap, rail, hub } = yardMetrics;
    const least = hub.min + margin + rail.width + gap;
    const beside = yardLayout({
      viewport: { ...narrow, width: least },
      settings: notes(2),
      railWanted: false,
      prefs,
    });
    expect(beside.rail?.band).toBe(false);
    expect(beside.hub).toEqual({ x: 0, y: 0, width: hub.min, height: 1016 });
    const below = yardLayout({
      viewport: { ...narrow, width: least - 1 },
      settings: notes(2),
      railWanted: false,
      prefs,
    });
    expect(below.rail?.band).toBe(true);
  });
});

function overlaps(a: Rect | undefined, b: Rect): boolean {
  if (a === undefined) return true;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
