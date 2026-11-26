import type { MotionPrefs } from "@keywork-app/habitat";
import { samePlace } from "@keywork-app/habitat/block";
import type { Setting, SteadPlace } from "@keywork-app/protocol";
import type { PaneId, Rect, Verdict } from "../layout/index.ts";
import type { PaneSpec } from "../panes/index.ts";
import { riseTiming, steppedBetween } from "../surfaces/feel/choreography.ts";
import type { ScreenRect } from "../surfaces/port.ts";
import type { OutsidePanes } from "./outside-panes.ts";
import "./place-panes.css";
import type { Tiler } from "./tiler.ts";

export interface PlacePanesSeams {
  readonly tiler: Tiler;
  readonly outside: OutsidePanes;
  onPage(place: SteadPlace): Rect | undefined;
  settingPlaceOf(pane: PaneId): SteadPlace | undefined;
  slotOf(pane: PaneId): HTMLElement | undefined;
  openInside(spec: PaneSpec): void;
  keptInside(spec: PaneSpec): boolean;
  motion(): MotionPrefs;
  act(verdict: Verdict): void;
  nextFrame?(): Promise<void>;
}

export interface PlacePanes {
  setOut(spec: PaneSpec, place: SteadPlace): void;
  setOutTogether(specs: readonly PaneSpec[], place: SteadPlace): void;
  bringForward(place: SteadPlace): boolean;
  returning(pane: PaneId): Promise<void> | undefined;
  placeOf(pane: PaneId): SteadPlace | undefined;
}

export const framesBeforeRising = 2;

export function createPlacePanes(seams: PlacePanesSeams): PlacePanes {
  const { tiler, outside } = seams;
  const risenFrom = new Map<PaneId, SteadPlace>();
  const goingHome = new Set<PaneId>();
  const nextFrame = seams.nextFrame ?? animationFrame;

  const placeOf = (pane: PaneId): SteadPlace | undefined =>
    tiler.spec(pane) === undefined
      ? undefined
      : (risenFrom.get(pane) ?? seams.settingPlaceOf(pane));

  const moving = (): boolean => !seams.motion().reducedMotion && seams.motion().tier !== "hidden";

  const standingAs = (spec: PaneSpec): PaneId | undefined =>
    tiler.findPane((held) => JSON.stringify(held) === JSON.stringify(spec));

  const riseInside = (spec: PaneSpec, place: SteadPlace): void => {
    const from = seams.onPage(place);
    seams.openInside(spec);
    const pane = standingAs(spec);
    if (pane === undefined) return;
    risenFrom.set(pane, place);
    const slot = seams.slotOf(pane);
    if (from === undefined || slot === undefined || !moving()) return;
    slot.dataset.rise = "waiting";
    void risenInside(slot, place, from);
  };

  const risenInside = async (slot: HTMLElement, place: SteadPlace, from: Rect): Promise<void> => {
    for (let frame = 0; frame < framesBeforeRising; frame += 1) await nextFrame();
    const end = slot.getBoundingClientRect();
    if (end.width <= 0 || end.height <= 0) return stopStepping(slot);
    await stepped(slot, steppedBetween(seams.onPage(place) ?? from, rectOf(end)));
    stopStepping(slot);
  };

  const sendOutside = (spec: PaneSpec, place: SteadPlace, focus: boolean): void => {
    void outside
      .standOutside(spec, { origin: "keeper", focus, follows: true, place })
      .then((pane) => {
        if (pane === undefined) riseInside(spec, place);
        else risenFrom.set(pane, place);
      });
  };

  const setOut = (spec: PaneSpec, place: SteadPlace, focus = true): void => {
    const standing = standingAs(spec);
    if (standing !== undefined) {
      if (focus) seams.act(tiler.focus(standing));
      return;
    }
    if (!outside.reachesOutside || seams.keptInside(spec)) riseInside(spec, place);
    else sendOutside(spec, place, focus);
  };

  const bringForward = (place: SteadPlace): boolean => {
    for (const pane of risenFrom.keys()) if (tiler.spec(pane) === undefined) risenFrom.delete(pane);
    const setOutHere = [...risenFrom]
      .filter(([, from]) => samePlace(from, place))
      .map(([pane]) => pane);
    const settingsHere = tiler
      .panes()
      .filter((pane) => !risenFrom.has(pane) && samePlace(seams.settingPlaceOf(pane), place));
    const panes = [...setOutHere, ...settingsHere];
    if (panes.length === 0) return false;
    const [lead, ...rest] = panes;
    for (const pane of [...rest.toReversed(), lead]) {
      if (pane !== undefined) seams.act(tiler.focus(pane));
    }
    return true;
  };

  const returning = (pane: PaneId): Promise<void> | undefined => {
    const place = placeOf(pane);
    if (place === undefined || goingHome.has(pane) || seams.onPage(place) === undefined) {
      return undefined;
    }
    const home = tiler.isOutside(pane)
      ? outside.leave(pane, undefined, true)
      : steppedHome(pane, place);
    if (home === undefined) return undefined;
    goingHome.add(pane);
    return home.finally(() => {
      goingHome.delete(pane);
      risenFrom.delete(pane);
    });
  };

  const steppedHome = (pane: PaneId, place: SteadPlace): Promise<void> | undefined => {
    const slot = seams.slotOf(pane);
    const into = seams.onPage(place);
    const from = slot?.getBoundingClientRect();
    if (slot === undefined || into === undefined || from === undefined || !moving())
      return undefined;
    if (from.width <= 0 || from.height <= 0) return undefined;
    return stepped(slot, steppedBetween(rectOf(from), into));
  };

  return {
    setOut: (spec, place) => setOut(spec, place),
    setOutTogether: (specs, place) => {
      specs.forEach((spec, at) => {
        const standing = standingAs(spec);
        if (standing === undefined) setOut(spec, place, at === 0);
        else risenFrom.set(standing, place);
      });
    },
    bringForward,
    returning,
    placeOf,
  };
}

export function settingPlaceOf(
  settings: readonly Pick<Setting, "id" | "place">[],
  spec: PaneSpec | undefined,
): SteadPlace | undefined {
  const shown = spec?.kind === "setting" ? spec.setting : undefined;
  return shown === undefined ? undefined : settings.find((held) => held.id === shown.id)?.place;
}

async function stepped(slot: HTMLElement, steps: readonly ScreenRect[]): Promise<void> {
  const frame = slot.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  for (const step of steps) {
    slot.style.setProperty("--kw-rise-x", `${step.x - frame.left}px`);
    slot.style.setProperty("--kw-rise-y", `${step.y - frame.top}px`);
    slot.style.setProperty("--kw-rise-width", `${step.width}px`);
    slot.style.setProperty("--kw-rise-height", `${step.height}px`);
    slot.dataset.rise = "stepping";
    await pause(riseTiming.stepMs);
  }
}

function stopStepping(slot: HTMLElement): void {
  delete slot.dataset.rise;
  for (const name of ["x", "y", "width", "height"]) slot.style.removeProperty(`--kw-rise-${name}`);
}

function rectOf(box: DOMRect): ScreenRect {
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function animationFrame(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => done()));
}
