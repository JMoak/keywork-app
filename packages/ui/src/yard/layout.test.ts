import { defaultHub, placeYard, yardIds, yardMetrics } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { Rect } from "../layout/index.ts";
import { yardLayout } from "./layout.ts";
import { aYardSetting } from "./testing.ts";

const viewport: Rect = { x: 0, y: 0, width: 1440, height: 900 };
const prefs = { reducedMotion: false, tier: "interact" } as const;

describe("the yard's layout", () => {
  it("gives the hub the whole field while nothing is set out", () => {
    const layout = yardLayout({ viewport, settings: [], railWanted: false, prefs });
    expect(layout).toEqual({ hub: viewport, rail: undefined, satellites: [], selectable: [] });
  });

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

  it("hands the panel the keeper is inside to placement, so it never yields under them", () => {
    const settings = ["a", "b"].map((id, index) =>
      aYardSetting({ id, shown: "unfold", depth: 9 - index, what: { kind: "note", ref: id } }),
    );
    const inside = yardLayout({ viewport, settings, railWanted: false, prefs, inside: "b" });
    const placed = placeYard({ viewport, hub: inside.hub, settings, prefs, inside: "b" });
    expect(inside.satellites).toEqual(placed.filter((placement) => placement.rung === "unfold"));
  });
});

function overlaps(a: Rect | undefined, b: Rect): boolean {
  if (a === undefined) return true;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
