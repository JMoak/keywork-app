import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { attend } from "./attention.ts";
import { chainOf, parentOf } from "./lineage.ts";
import { defaultHub, placeYard } from "./place.ts";
import { plotCardsOf } from "./plot.ts";
import { restorePlot, stepYard } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import { type Rect, type YardContext, type YardState, yardOf } from "./types.ts";

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };
const at = (seconds: number): number => noon + seconds * second;
const viewport: Rect = { x: 0, y: 0, width: 1920, height: 1080 };

const diff = aSetting({
  id: "d",
  rung: "unfold",
  what: { kind: "diff", ref: "cs-1", title: "The fix" },
  at: isoAt(noon),
});

function openedFrom(from: string, id: string, seconds: number): Setting {
  return aSetting({
    id,
    from,
    origin: "keeper",
    rung: "unfold",
    why: "",
    what: { kind: "file", ref: `${id}.ts` },
    at: isoAt(at(seconds)),
  });
}

function withStream(yard: YardState, stream: readonly BusEnvelope[]): YardState {
  return yardOf(projectAll({ ...emptyHabitat(), yard }, stream));
}

function outWith(settings: readonly Setting[]): YardState {
  const stream = settings.map((setting, index) => proposed(index + 1, setting));
  return stepYard(yardOf(projectAll(emptyHabitat(), stream)), asked, at(20));
}

function withdrawn(yard: YardState, id: string, seconds: number): YardState {
  return withStream(yard, [
    settled(50, isoAt(at(seconds)), "s1", { id, outcome: "withdrawn", by: "creature" }),
  ]);
}

function shownOnTheYard(yard: YardState): readonly string[] {
  return placeYard({
    viewport,
    hub: defaultHub(viewport),
    settings: Object.values(yard.settings),
    prefs: { reducedMotion: false, tier: "active" },
  }).map((placement) => placement.id);
}

describe("a creature taking back what it set out", () => {
  it("leaves nothing behind when nothing grew from it", () => {
    const gone = withdrawn(outWith([diff]), "d", 30);
    expect(gone.settings).toEqual({});
    expect(gone.ancestors).toBeUndefined();
    expect(shownOnTheYard(gone)).not.toContain("d");
  });

  it("keeps what grew from it out, folded under a chain that still names it", () => {
    const yard = withdrawn(
      outWith([diff, openedFrom("d", "f", 10), openedFrom("f", "t", 11)]),
      "d",
      30,
    );
    expect(yard.settings.d).toBeUndefined();
    expect(yard.settings.f).toMatchObject({ folded: "plot:d" });
    expect(yard.settings.t).toMatchObject({ folded: "plot:d" });
    expect(parentOf(yard, "f")).toBe("d");
    expect(chainOf(yard, "plot:d")).toBe("The fix → f.ts → t.ts");
    expect(plotCardsOf(Object.values(yard.settings)).map((plot) => plot.id)).toEqual(["plot:d"]);
    const restored = restorePlot(yard, "plot:d", at(40));
    expect(restored.settings.f?.folded).toBeUndefined();
    expect(restored.settings.t?.folded).toBeUndefined();
  });

  it("drops its trail mark once the last thing that grew from it settles", () => {
    const yard = withdrawn(outWith([diff, openedFrom("d", "f", 10)]), "d", 30);
    const settledChild = withStream(yard, [
      settled(60, isoAt(at(40)), "s1", { id: "f", outcome: "dismissed", by: "keeper" }),
    ]);
    expect(settledChild.settings).toEqual({});
    expect(settledChild.ancestors).toBeUndefined();
  });

  it("closes the keeper's visit when they leave the panel it was taken from", () => {
    const inside = attend(outWith([diff]), { id: "d", kind: "enter", at: at(25) });
    const gone = withdrawn(inside, "d", 30);
    expect(gone.visit?.id).toBe("d");
    const left = attend(gone, { id: "d", kind: "leave", at: at(35) });
    expect(left.visit).toBeUndefined();
    expect(left.settings).toEqual({});
  });

  it("lands the fold of what grew from it when the keeper leaves the withdrawn panel", () => {
    const inside = attend(outWith([diff, openedFrom("d", "f", 10)]), {
      id: "d",
      kind: "enter",
      at: at(25),
    });
    const gone = withdrawn(inside, "d", 30);
    expect(gone.settings.f?.folded).toBeUndefined();
    expect(gone.ancestors?.d?.pendingFold).toBe(true);
    const left = attend(gone, { id: "d", kind: "leave", at: at(35) });
    expect(left.visit).toBeUndefined();
    expect(left.settings.f?.folded).toBe("plot:d");
    expect(left.ancestors?.d?.pendingFold).toBeUndefined();
  });

  it("keeps a child standing while the keeper works inside it, and folds when they leave", () => {
    const inside = attend(outWith([diff, openedFrom("d", "f", 10)]), {
      id: "f",
      kind: "enter",
      at: at(25),
    });
    const gone = withdrawn(inside, "d", 30);
    expect(gone.settings.f?.folded).toBeUndefined();
    const left = attend(gone, { id: "f", kind: "leave", at: at(40) });
    expect(left.settings.f?.folded).toBe("plot:d");
    expect(stepYard(left, asked, at(40) + minute).settings.f?.folded).toBe("plot:d");
  });
});
