import type { Placement, YardSetting } from "@keywork-app/habitat";
import { type Accessor, createEffect, createMemo, createSignal } from "solid-js";
import type { Rect } from "../layout/index.ts";

export interface FoldingPanel {
  readonly placement: Placement;
  readonly setting: YardSetting;
}

export interface PlotMotionSeams {
  readonly satellites: Accessor<readonly Placement[]>;
  readonly cards: Accessor<ReadonlyMap<string, Rect>>;
  readonly reducedMotion: Accessor<boolean>;
  settingOf(id: string): YardSetting | undefined;
}

export interface PlotMotion {
  readonly folding: Accessor<readonly FoldingPanel[]>;
  origin(id: string): Rect | undefined;
  rested(id: string): void;
}

interface Motion {
  readonly seen: readonly Placement[];
  readonly folding: readonly FoldingPanel[];
}

export function createPlotMotion(seams: PlotMotionSeams): PlotMotion {
  const [resting, setResting] = createSignal<readonly string[]>([]);
  const motion = createMemo<Motion>((held) => {
    const seen = seams.satellites();
    const present = new Set(seen.map((placement) => placement.id));
    const leaving = (held?.seen ?? []).flatMap((placement) =>
      present.has(placement.id) ? [] : foldingInto(placement, seams),
    );
    const left = new Set([...present, ...resting(), ...leaving.map(idOf)]);
    const still = (held?.folding ?? []).filter((panel) => !left.has(idOf(panel)));
    return { seen, folding: [...still, ...leaving] };
  });
  const folding = (): readonly FoldingPanel[] => motion().folding;
  const lastCard = new Map<string, Rect>();
  createEffect(() => {
    for (const [member, rect] of seams.cards()) lastCard.set(member, rect);
  });
  return {
    folding,
    origin: (id) => {
      const rect = lastCard.get(id);
      lastCard.delete(id);
      return rect;
    },
    rested: (id) =>
      setResting(() => folding().flatMap((panel) => (idOf(panel) === id ? [id] : []))),
  };
}

function foldingInto(placement: Placement, seams: PlotMotionSeams): FoldingPanel[] {
  const card = seams.cards().get(placement.id);
  const setting = seams.settingOf(placement.id);
  if (card === undefined || setting === undefined || seams.reducedMotion()) return [];
  return [{ placement: { ...placement, rect: card }, setting }];
}

function idOf(panel: FoldingPanel): string {
  return panel.placement.id;
}
