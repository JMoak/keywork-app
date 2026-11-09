import {
  attend,
  emptyYard,
  plotCardId,
  proposeSetting,
  restorePlot,
  settleSetting,
  stepYard,
  type YardContext,
  type YardSetting,
  type YardState,
} from "@keywork-app/habitat";
import type { Setting } from "@keywork-app/protocol";
import type { RailView } from "../src/yard/control.ts";
import { type YardLineage, yardLineageOf } from "../src/yard/trail.ts";
import type { PlotScene } from "./yard-scenes.ts";

export interface PlotStage {
  readonly settings: readonly YardSetting[];
  readonly lineage: YardLineage;
  readonly view: RailView;
  readonly railActive: boolean;
  readonly railAt: string | undefined;
  readonly inside: string | undefined;
}

export function plotStageOf(scene: PlotScene): PlotStage {
  const yard = yardAt(scene);
  return {
    settings: Object.values(yard.settings),
    lineage: yardLineageOf(() => yard),
    view: scene === "yard-trail" ? "trail" : "now",
    railActive: scene === "yard-trail",
    railAt: scene === "yard-trail" ? "test" : undefined,
    inside: yard.visit?.id,
  };
}

const thread = "s1";

const diff = set("diff", 1, {
  what: {
    kind: "note",
    ref: "a sum and its test, written this turn",
    title: "the sum and its test",
  },
  why: "the sum and its test are written; read them here",
  from: thread,
  origin: "creature",
});
const file = set("file", 2, {
  what: { kind: "note", ref: "export const sum = (a, b) => a + b;", title: "src/sum.ts" },
  from: "diff",
});
const test = set("test", 3, {
  what: { kind: "note", ref: "if (sum(2, 3) !== 5) throw new Error();", title: "src/sum.test.ts" },
  from: "file",
});
const note = set("note", 0, {
  what: { kind: "note", ref: "the nightly chore found two stale branches" },
  rung: "card",
  why: "set out because you asked about it this morning",
  origin: "creature",
});

const grown: Readonly<Record<PlotScene, readonly Setting[]>> = {
  "yard-plot-seed": [note, diff],
  "yard-plot-file": [note, diff, file],
  "yard-plot-test": [note, diff, file, test],
  "yard-plot-entered": [note, diff, file, test],
  "yard-plot-folded": [note, diff, file, test],
  "yard-plot-restored": [note, diff, file, test],
  "yard-trail": [note, diff, file, test],
};

function yardAt(scene: PlotScene): YardState {
  const planted = grown[scene].reduce(
    (yard, setting) => stepYard(proposeSetting(yard, setting), context, minuteOf(setting.at)),
    emptyYard,
  );
  if (scene === "yard-plot-entered") {
    return attend(planted, { id: "test", kind: "enter", at: minute(4) });
  }
  if (scene !== "yard-plot-folded" && scene !== "yard-plot-restored") return planted;
  const folded = settleSetting(
    planted,
    { id: "diff", outcome: "dismissed", by: "keeper" },
    stamp(4),
  );
  return scene === "yard-plot-folded" ? folded : restorePlot(folded, plotCardId("diff"), minute(5));
}

const context: YardContext = {
  visible: true,
  focused: true,
  fullscreen: false,
  doNotDisturb: false,
  tier: "interact",
  reducedMotion: true,
  quietHours: false,
  focusedThread: thread,
  keeperSpokeAt: { [thread]: minute(0) },
  rules: [],
};

function set(id: string, at: number, overrides: Partial<Setting>): Setting {
  return {
    id,
    creature: "wren",
    sessionId: thread,
    what: { kind: "note", ref: id },
    rung: "unfold",
    why: "",
    at: stamp(at),
    until: "seen",
    state: "live",
    from: null,
    origin: "keeper",
    ...overrides,
  };
}

function minute(at: number): number {
  return Date.UTC(2026, 10, 8, 9, at);
}

function stamp(at: number): string {
  return new Date(minute(at)).toISOString();
}

function minuteOf(at: string): number {
  return Date.parse(at);
}
