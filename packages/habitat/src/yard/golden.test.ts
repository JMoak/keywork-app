import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import type { HabitatInput } from "../world/inputs.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { attend } from "./attention.ts";
import { grouped } from "./flood.ts";
import { chainOf } from "./lineage.ts";
import { defaultHub, placeYard, yardIds } from "./place.ts";
import { moveByHand, restorePlot, withYardStep } from "./step.ts";
import { aSetting, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import {
  type AttendKind,
  belongsTo,
  type Placement,
  type Rect,
  type YardContext,
  type YardOwner,
  type YardState,
  yardOf,
} from "./types.ts";

const viewports: Readonly<Record<string, Rect>> = {
  laptop: { x: 0, y: 0, width: 1280, height: 800 },
  desktop: { x: 0, y: 0, width: 1920, height: 1080 },
  wide: { x: 0, y: 0, width: 2560, height: 1440 },
};

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
  "quiet cards from a background thread": {
    context: calm,
    stream: [
      show(1, { sessionId: "s2", what: { kind: "note", ref: "the build is green" } }),
      show(2, { sessionId: "s2", what: { kind: "url", ref: "https://example.com/run/7" } }),
      show(3, { sessionId: "s2", what: { kind: "file", ref: "docs/plan.md" } }),
    ],
  },
  "you asked, it shows": {
    context: askedContext,
    stream: [
      show(1, { rung: "unfold", what: { kind: "diff", ref: "cs-41", title: "The fix" } }),
      show(2, { rung: "unfold", sessionId: "s2", what: { kind: "report", ref: "r-9" } }),
      show(3, { what: { kind: "note", ref: "tests are running" } }),
    ],
  },
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

describe("the yard's goldens: three viewports by four scenarios", () => {
  for (const [scenario, { stream, context }] of Object.entries(scenarios)) {
    for (const [name, viewport] of Object.entries(viewports)) {
      it(`${scenario} on the ${name}`, () => {
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
  }
});

describe("the yard's goldens: a plot grows, folds and restores", () => {
  const diff = aSetting({
    id: "set-1",
    rung: "unfold",
    what: { kind: "diff", ref: "cs-41", title: "The fix" },
    at: isoAt(noon + second),
  });
  const opened = (id: string, from: string, ref: string, seconds: number): Setting =>
    aSetting({
      id,
      from,
      origin: "keeper",
      rung: "unfold",
      why: "",
      what: { kind: "file", ref },
      at: isoAt(noon + seconds * second),
    });
  const stream: readonly HabitatInput[] = [
    proposed(1, diff),
    proposed(2, opened("set-f", "set-1", "src/yard/place.ts", 20)),
    proposed(3, opened("set-t", "set-f", "src/yard/place.test.ts", 30)),
  ];
  const attended: readonly HabitatInput[] = [
    attendAt("set-f", "enter", 60),
    ...Array.from({ length: 22 }, (_, index) => attendAt("set-f", "interact", 61 + index * 2)),
  ];

  for (const [name, viewport] of Object.entries(viewports)) {
    it(`on the ${name}`, () => {
      const settled = withYardStep(projectAll(emptyHabitat(), stream), askedContext, noon + minute);
      const grown = yardOf(projectAll(settled, attended));
      const left = attend(grown, { id: "set-f", kind: "leave", at: noon + 2 * minute });
      const folded = moveByHand(left, "set-1", "card", noon + 3 * minute);
      const restored = restorePlot(folded, "plot:set-1", noon + 4 * minute);
      const placed = (yard: YardState) =>
        placeYard({
          viewport,
          hub: defaultHub(viewport),
          settings: Object.values(yard.settings),
          prefs: { reducedMotion: false, tier: "active" },
          inside: yard.visit?.id,
        });
      expect(placed(restored)).toEqual(placed(left));
      expect(chainOf(folded, "plot:set-1")).toBe("The fix → place.ts → place.test.ts");
      expect(
        Object.fromEntries(
          [
            ["grown, the keeper in the file", grown],
            ["folded by hand", folded],
            ["restored", restored],
          ].map(([stage, yard]) => {
            const stagePlacements = placed(yard as YardState);
            return [
              stage,
              { sketch: sketch(viewport, stagePlacements), placements: stagePlacements.map(line) },
            ];
          }),
        ),
      ).toMatchSnapshot();
    });
  }
});

describe("the yard's goldens: a size the creature named", () => {
  const first: readonly BusEnvelope[] = [
    show(1, {
      rung: "unfold",
      size: "working",
      what: { kind: "report", ref: "r-3", title: "Run" },
    }),
  ];
  const later: readonly BusEnvelope[] = [
    show(2, {
      rung: "unfold",
      size: "working",
      creature: "ash",
      what: { kind: "diff", ref: "cs-7", title: "Fix" },
    }),
    show(3, { what: { kind: "note", ref: "the rest can wait" } }),
  ];

  for (const [name, viewport] of Object.entries(viewports)) {
    it(`the first opens working and keeps its space when a second arrives, on the ${name}`, () => {
      const out = withYardStep(projectAll(emptyHabitat(), first), askedContext, noon + minute);
      const habitat = withYardStep(projectAll(out, later), askedContext, noon + minute + second);
      const placed = placeYard({
        viewport,
        hub: defaultHub(viewport),
        settings: Object.values(yardOf(habitat).settings),
        prefs: { reducedMotion: false, tier: "active" },
      });
      expect({
        sketch: sketch(viewport, placed),
        placements: placed.map(line),
      }).toMatchSnapshot();
    });
  }
});

function attendAt(id: string, kind: AttendKind, seconds: number): HabitatInput {
  return { type: "keeper.attend", ts: isoAt(noon + seconds * second), id, kind };
}

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
