import type { HabitatState, MotionPrefs, Pose, StepContext } from "@keywork-app/habitat";
import { restingPose } from "@keywork-app/habitat/render";
import { type FieldPicture, restfulMotion, samplingTier, standingStill } from "./field.ts";
import {
  composeStead,
  type PlacedFigure,
  placeFigure,
  type SteadScene,
  sailDriftMs,
  sailQuickMs,
} from "./habitat-render.ts";
import {
  earliestWake,
  figurePoseOf,
  gatherHerd,
  type Herd,
  type Member,
  posesOf,
  stepHerd,
} from "./herd.ts";
import {
  type CanvasFit,
  devicePixelRatioOf,
  fitCanvas,
  forcedColorsActive,
  type Palettes,
  paintWhenChanged,
  paletteSourceOf,
  palettesOf,
} from "./painter.ts";

export type SceneContext = Omit<StepContext, "pointer" | "gestures">;

export interface PlacedMember {
  readonly member: Member;
  readonly pose: Pose;
  readonly placed: PlacedFigure;
}

export interface SteadView {
  readonly world: HabitatState;
  readonly herd: Herd;
  readonly mountedAt: number;
  readonly now: number;
  readonly context: SceneContext;
  readonly memberContext: (member: Member) => StepContext;
  readonly stageWidth: number;
  readonly canvas: HTMLCanvasElement | undefined;
}

export interface SteadDrawing {
  readonly herd: Herd;
  readonly scene: SteadScene;
  readonly fit: CanvasFit;
  readonly figures: readonly PlacedMember[];
  readonly painted: boolean;
  readonly motionless: boolean;
  readonly picture: FieldPicture;
}

export interface SteadDrawer {
  draw(view: SteadView): SteadDrawing;
}

export const minuteMs = 60_000;

export function steadDrawer(): SteadDrawer {
  const paintCanvas = paintWhenChanged();
  let palettes: Palettes | undefined;
  let motionless = true;

  const paint = (
    view: SteadView,
    scene: SteadScene,
    fit: CanvasFit,
    figures: readonly PlacedMember[],
  ): boolean => {
    if (view.canvas === undefined) return false;
    palettes = palettesOf(
      paletteSourceOf(view.canvas),
      scene.sky.phase,
      scene.sky.season,
      forcedColorsActive(),
      palettes,
    );
    const resolved = palettes;
    return paintCanvas(
      view.canvas,
      {
        scene,
        width: fit.artWidth,
        scale: fit.scale,
        sky: resolved.sky,
        world: resolved.world,
        glyphs: resolved.glyphs,
        figures: figures.map((figure) => ({
          placed: figure.placed,
          render: figure.member.render,
          palette: resolved.coat(figure.member.hueStop),
        })),
      },
      fit,
    );
  };

  return {
    draw: (view) => {
      const herd = stepHerd(
        gatherHerd(view.herd, view.world, view.mountedAt),
        view.world,
        view.now,
        view.memberContext,
      );
      const poses = posesFor(herd, view.context, motionless);
      const scene = composeStead(view.world, view.now);
      const fit = fitCanvas(view.stageWidth, scene, devicePixelRatioOf());
      const figures = placeMembers(herd, poses, scene, view.context.tier === "rest");
      const painted = paint(view, scene, fit, figures);
      motionless = figures.every((figure) => standingStill(figure.pose));
      return {
        herd,
        scene,
        fit,
        figures,
        painted,
        motionless,
        picture: {
          still: figures.every((figure) =>
            restfulMotion(figure.pose, figure.member.creature.body.clip.lane),
          ),
          nextWakeAt: earliestWake([
            ...[...poses.values()].map((pose) => pose.nextWakeAt),
            worldWakeAt(view.world, view.now, {
              ...view.context,
              pointer: undefined,
              gestures: [],
            }),
          ]),
        },
      };
    },
  };
}

export function worldWakeAt(
  world: HabitatState,
  now: number,
  context: StepContext,
): number | undefined {
  if (context.tier === "hidden" || !context.visible) return undefined;
  const mills = Object.values(world.mills).filter((mill) => mill.loaded.length > 0);
  if (mills.length > 0 && !context.reducedMotion) {
    return now + (mills.some((mill) => mill.busy) ? sailQuickMs : sailDriftMs);
  }
  return now + (minuteMs - (now % minuteMs));
}

function posesFor(
  herd: Herd,
  context: Pick<StepContext, "reducedMotion" | "tier">,
  everyoneStill: boolean,
): Map<string, Pose> {
  const quiet: MotionPrefs = {
    reducedMotion: context.reducedMotion,
    tier: samplingTier(context.tier, everyoneStill),
  };
  const poses = posesOf(herd, quiet);
  if (quiet.tier === context.tier || [...poses.values()].every(standingStill)) return poses;
  return posesOf(herd, { reducedMotion: context.reducedMotion, tier: context.tier });
}

function placeMembers(
  herd: Herd,
  poses: ReadonlyMap<string, Pose>,
  scene: SteadScene,
  atRest: boolean,
): PlacedMember[] {
  return herd.members.flatMap((member): PlacedMember[] => {
    const pose = poses.get(member.slug);
    if (pose === undefined) return [];
    const shown = atRest ? restingPose(figurePoseOf(pose)) : figurePoseOf(pose);
    const placed = placeFigure(scene, member.slug, member.skin, shown);
    return [{ member, pose, placed }];
  });
}
