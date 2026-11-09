import {
  byArrival,
  chainOf,
  fromOf,
  stillShown,
  type TrailRow,
  trailOf,
  trailOrderOf,
  type YardSetting,
  type YardState,
} from "@keywork-app/habitat";
import type { Accessor } from "solid-js";
import type { TrailStep } from "./actions.ts";

export interface YardLineage {
  parentOf(id: string): string | undefined;
  childrenOf(id: string): readonly string[];
  chainOf(id: string): string;
  trailOrder(): readonly TrailRow[];
}

export function yardLineageOf(yard: Accessor<YardState>): YardLineage {
  const shown = (id: string): YardSetting | undefined => {
    const setting = yard().settings[id];
    return setting !== undefined && stillShown(setting) && setting.folded === undefined
      ? setting
      : undefined;
  };
  return {
    parentOf: (id) => {
      const trail = trailOf(yard(), id);
      const above = trail.slice(0, -1).findLast((step) => shown(step) !== undefined);
      return above ?? conversationRootOf(yard(), trail[0]);
    },
    childrenOf: (id) =>
      Object.values(yard().settings)
        .filter((setting) => fromOf(setting) === id && shown(setting.id) !== undefined)
        .toSorted((a, b) => byArrival(b, a))
        .map((setting) => setting.id),
    chainOf: (id) => chainOf(yard(), id),
    trailOrder: () => trailOrderOf(yard()),
  };
}

export type CameFrom = (id: string) => string | undefined;

export function stepAlong(
  lineage: YardLineage,
  at: string,
  step: TrailStep,
  cameFrom: CameFrom = () => undefined,
): string | undefined {
  if (step === "rootward") return lineage.parentOf(at);
  const children = lineage.childrenOf(at);
  const back = cameFrom(at);
  return back !== undefined && children.includes(back) ? back : children[0];
}

function conversationRootOf(yard: YardState, root: string | undefined): string | undefined {
  const mark = root === undefined ? undefined : (yard.settings[root] ?? yard.ancestors?.[root]);
  const from = mark === undefined ? null : fromOf(mark);
  return from === null || yard.settings[from] !== undefined || yard.ancestors?.[from] !== undefined
    ? undefined
    : from;
}
