import type { Cue, Plan } from "../feel/choreography.ts";
import type { Glide, PlayPart, SurfaceId, SurfaceShow, SurfacesPort } from "../port.ts";

export type PlanPort = Pick<SurfacesPort, "show" | "glide" | "hide" | "play">;

export interface Performance {
  readonly finished: Promise<void>;
  cancel(): void;
}

export interface Stagehand {
  readonly shown?: ((show: SurfaceShow) => void) | undefined;
  readonly skips?: ((id: SurfaceId) => boolean) | undefined;
}

// Where the host can play a whole arrangement, every glide of a pane that is already out is
// handed over in one call, each with its own start, so the host times them and not this page.
// A pane the same plan shows keeps its own cue, because it has to be shown before it can move.
export function perform(plan: Plan, port: PlanPort, stagehand: Stagehand = {}): Performance {
  const waiting = new Set<Waiting>();
  const skips = (id: SurfaceId): boolean => stagehand.skips?.(id) === true;
  const together = handedOver(plan, port);
  const playThoseStillWanted = (): Promise<void> => {
    const parts = together.flatMap(partsOf).filter((part) => !skips(part.id));
    return parts.length === 0 || port.play === undefined ? Promise.resolve() : port.play({ parts });
  };
  const enact = async (cue: Cue): Promise<void> => {
    if (cue.kind === "glide") return glideThoseStillWanted(cue.glide);
    if (skips(cueSubject(cue))) return;
    if (cue.kind === "hide") return port.hide(cue.id);
    await port.show(cue.show);
    stagehand.shown?.(cue.show);
  };
  const glideThoseStillWanted = (glide: Glide): Promise<void> => {
    const moves = glide.moves.filter((move) => !skips(move.id));
    return moves.length === 0 ? Promise.resolve() : port.glide({ ...glide, moves });
  };
  const onCue = (cue: Cue): Promise<void> => {
    if (cue.atMs <= 0) return enact(cue);
    return new Promise((resolve, reject) => {
      const held: Waiting = {
        timer: setTimeout(() => {
          waiting.delete(held);
          enact(cue).then(resolve, reject);
        }, cue.atMs),
        skip: resolve,
      };
      waiting.add(held);
    });
  };
  const handed = new Set<Cue>(together);
  const alone = plan.cues.filter((cue) => !handed.has(cue));
  return {
    finished: Promise.all([playThoseStillWanted(), ...alone.map(onCue)]).then(() => undefined),
    cancel: () => {
      for (const held of waiting) {
        clearTimeout(held.timer);
        held.skip();
      }
      waiting.clear();
    },
  };
}

interface Waiting {
  readonly timer: ReturnType<typeof setTimeout>;
  skip(): void;
}

type GlideCue = Extract<Cue, { kind: "glide" }>;

function handedOver(plan: Plan, port: PlanPort): GlideCue[] {
  if (port.play === undefined) return [];
  const shownHere = new Set(plan.cues.flatMap((cue) => (cue.kind === "show" ? [cue.show.id] : [])));
  return plan.cues.filter(
    (cue): cue is GlideCue =>
      cue.kind === "glide" && cue.glide.moves.every((move) => !shownHere.has(move.id)),
  );
}

function partsOf(cue: GlideCue): PlayPart[] {
  const { moves, durationMs } = cue.glide;
  return moves.map((move) => ({ id: move.id, bounds: move.bounds, atMs: cue.atMs, durationMs }));
}

function cueSubject(cue: Exclude<Cue, { kind: "glide" }>): SurfaceId {
  return cue.kind === "show" ? cue.show.id : cue.id;
}
