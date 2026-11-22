import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { grouped } from "./flood.ts";
import { defaultHub, placeYard, yardIds } from "./place.ts";
import { withYardStep } from "./step.ts";
import { aSetting, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import {
  belongsTo,
  type Placement,
  type Rect,
  type YardContext,
  type YardOwner,
  yardOf,
} from "./types.ts";

const viewport: Rect = { x: 0, y: 0, width: 1280, height: 800 };

interface Scenario {
  readonly stream: readonly BusEnvelope[];
  readonly context: YardContext;
}

const bea: YardOwner = { kind: "creature", slug: "bea" };
const looking = "s1";
const spoke = noon - 40 * second;
const askedContext: YardContext = {
  ...calm,
  focusedThread: looking,
  keeperSpokeAt: { [looking]: spoke },
};

function show(id: number, overrides: Partial<Setting>): BusEnvelope {
  return proposed(id, aSetting({ id: `set-${id}`, at: isoAt(noon + id * second), ...overrides }));
}

const scenarios: Readonly<Record<string, Scenario>> = {
  "a busy hour, past the budget and the rail": {
    context: askedContext,
    stream: [
      show(1, { what: { kind: "note", ref: "keep this" } }),
      settled(2, isoAt(noon + 2 * second), looking, {
        id: "set-1",
        outcome: "pinned",
        by: "keeper",
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        show(index + 3, {
          rung: "unfold",
          what: { kind: "file", ref: `src/part-${index + 1}.ts` },
        }),
      ),
      show(11, { sessionId: "s3", creature: null, what: { kind: "url", ref: "https://x.dev" } }),
    ],
  },
  "a report staged by the keeper's rule": {
    context: {
      ...askedContext,
      rules: [{ creature: "bea", kind: "report", rung: "stage", lasts: "always" }],
    },
    stream: [
      show(1, { what: { kind: "report", ref: "r-12", title: "Weekly" } }),
      show(2, { rung: "unfold", what: { kind: "diff", ref: "cs-42" } }),
      show(3, { sessionId: "s2", what: { kind: "chore", ref: "triage" } }),
    ],
  },
};

describe("the yard's goldens on the laptop", () => {
  for (const [scenario, { stream, context }] of Object.entries(scenarios)) {
    it(scenario, () => {
      const at = noon + minute;
      const habitat = withYardStep(projectAll(emptyHabitat(), stream), context, at);
      const settings = grouped(
        Object.values(yardOf(habitat).settings).filter((setting) => belongsTo(setting, bea)),
      );
      const placed = placeYard({
        viewport,
        hub: defaultHub(viewport),
        settings,
        prefs: { reducedMotion: false, tier: "active" },
      });
      expect(
        placeYard({
          viewport,
          hub: defaultHub(viewport),
          settings: settings.toReversed(),
          prefs: { reducedMotion: true, tier: "active" },
        }),
      ).toEqual(placed);
      expect({
        sketch: sketch(viewport, placed),
        placements: placed.map(line),
      }).toMatchSnapshot();
    });
  }
});

const columns = 96;
const rows = 27;

function sketch(viewport: Rect, placed: readonly Placement[]): string[] {
  const marks = placed.map((placement, index) => ({
    rect: placement.rect,
    mark: markOf(placement, index),
  }));
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const x = viewport.x + ((column + 0.5) * viewport.width) / columns;
      const y = viewport.y + ((row + 0.5) * viewport.height) / rows;
      const hit = marks.find(
        ({ rect }) =>
          x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
      );
      return hit?.mark ?? ".";
    }).join(""),
  );
}

function markOf(placement: Placement, index: number): string {
  if (placement.id === yardIds.hub) return placement.layer === "front" ? "h" : "H";
  if (placement.id === yardIds.card) return "y";
  if (placement.id === yardIds.fold) return "f";
  if (placement.rung === "stage") return "S";
  if (placement.rung === "unfold") return placement.size === "card" ? "k" : String(index);
  if (placement.id.startsWith("plot:")) return "p";
  return "c";
}

function line(placement: Placement): string {
  const { x, y, width, height } = placement.rect;
  const slot = placement.slot === undefined ? "" : ` slot ${placement.slot}`;
  const parent = placement.parent === null ? "" : ` from ${placement.parent}`;
  const { id, rung, size, layer } = placement;
  return `${id} ${rung} ${size} ${layer} ${x},${y} ${width}x${height}${slot}${parent}`;
}
