import type { HabitatState } from "@keywork-app/habitat";
import type { SteadPlace } from "@keywork-app/protocol";
import { onCleanup } from "solid-js";
import { reducedMotionActive } from "../painter.ts";
import { type BlockWorldControls, wellShown } from "./block-world.tsx";
import type { SteadPlaceBoard } from "./board.ts";
import { turnMs } from "./motion.ts";

export interface FacingSeams {
  readonly board: SteadPlaceBoard | undefined;
  controls(): BlockWorldControls | undefined;
  world(): HabitatState;
  root(): HTMLElement | undefined;
  say(line: string): void;
  onScreen?(): boolean;
  now?(): number;
  reducedMotion?(): boolean;
}

export interface Facing {
  touched(): void;
  face(place: SteadPlace, creature: string | null): Promise<void> | undefined;
}

export const keeperHoldMs = 4_000;

export const keeperTouches = ["pointermove", "pointerdown", "wheel", "keydown"] as const;

export function fewestTurns(shownFrom: (steps: number) => number): number | undefined {
  const here = shownFrom(0);
  if (here >= wellShown) return undefined;
  const quarters = [1, -1].map((steps) => ({ steps, share: shownFrom(steps) }));
  const [nearest] = quarters.filter(({ share }) => share >= wellShown).sort(bySharesShown);
  if (nearest !== undefined) return nearest.steps;
  const half = { steps: 2, share: shownFrom(2) };
  if (half.share >= wellShown) return half.steps;
  const [best] = [...quarters, half].sort(bySharesShown);
  return best !== undefined && best.share > here ? best.steps : undefined;
}

export function turnedLine(world: HabitatState, creature: string, place: SteadPlace): string {
  const name = world.creatures[creature]?.name ?? creature;
  return `${name} turned the stead to ${placeSaidBy(world, creature, place)}`;
}

export function createFacing(seams: FacingSeams): Facing {
  const now = seams.now ?? Date.now;
  const reduced = seams.reducedMotion ?? reducedMotionActive;
  const onScreen = seams.onScreen ?? (() => shownOnScreen(seams.root()));
  let keeperAt = Number.NEGATIVE_INFINITY;
  let ourTurnEndsAt = Number.NEGATIVE_INFINITY;

  const touched = (): void => {
    keeperAt = now();
  };

  const face = (place: SteadPlace, creature: string | null): Promise<void> | undefined => {
    const at = now();
    if (at < ourTurnEndsAt) return wait(ourTurnEndsAt - at);
    const controls = seams.controls();
    if (controls === undefined || !onScreen()) return undefined;
    if (at - keeperAt < keeperHoldMs || controls.turning()) return undefined;
    const steps = fewestTurns((offset) => controls.shownFrom(place, offset));
    if (steps === undefined) return undefined;
    controls.turn(steps);
    if (creature !== null) seams.say(turnedLine(seams.world(), creature, place));
    const lasts = reduced() ? 0 : turnMs;
    ourTurnEndsAt = at + lasts;
    return wait(lasts);
  };

  let heard: HTMLElement | undefined;
  let disposed = false;
  const stopHearing = (): void => {
    disposed = true;
    for (const touch of keeperTouches) heard?.removeEventListener(touch, touched, true);
    heard = undefined;
  };
  queueMicrotask(() => {
    if (disposed) return;
    heard = seams.root();
    for (const touch of keeperTouches) heard?.addEventListener(touch, touched, true);
  });
  onCleanup(stopHearing);
  onCleanup(seams.board?.stand({ onPage: () => undefined, face }) ?? (() => undefined));

  return { touched, face };
}

function placeSaidBy(world: HabitatState, creature: string, place: SteadPlace): string {
  const owner = (slug: string): string =>
    slug === creature ? "its" : `${world.creatures[slug]?.name ?? slug}'s`;
  switch (place.kind) {
    case "workshop":
      return `${owner(place.creature)} workshop`;
    case "project":
      return `${owner(place.creature)} ${lastPart(place.directory)}`;
    case "porch":
      return "the porch";
    case "store":
      return "the storehouse";
    case "mill":
      return "the mill";
    case "green":
      return "the green";
  }
}

function bySharesShown(one: { share: number }, other: { share: number }): number {
  return other.share - one.share;
}

function shownOnScreen(root: HTMLElement | undefined): boolean {
  if (root === undefined || !root.isConnected) return false;
  if (root.ownerDocument.visibilityState === "hidden") return false;
  return root.getClientRects().length > 0;
}

function lastPart(directory: string): string {
  return (
    directory
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) ?? directory
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, Math.max(0, ms)));
}
