import type { Cue, Plan } from "../feel/choreography.ts";
import type { Glide, SurfaceId, SurfaceShow, SurfacesPort } from "../port.ts";

export type PlanPort = Pick<SurfacesPort, "show" | "glide" | "hide">;

export interface Performance {
  readonly finished: Promise<void>;
  cancel(): void;
}

export interface Stagehand {
  readonly shown?: ((show: SurfaceShow) => void) | undefined;
  readonly skips?: ((id: SurfaceId) => boolean) | undefined;
}

export function perform(plan: Plan, port: PlanPort, stagehand: Stagehand = {}): Performance {
  const waiting = new Set<Waiting>();
  const skips = (id: SurfaceId): boolean => stagehand.skips?.(id) === true;
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
  return {
    finished: Promise.all(plan.cues.map(onCue)).then(() => undefined),
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

function cueSubject(cue: Exclude<Cue, { kind: "glide" }>): SurfaceId {
  return cue.kind === "show" ? cue.show.id : cue.id;
}
