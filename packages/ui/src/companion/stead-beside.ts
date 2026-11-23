import { createSignal } from "solid-js";
import { isTextField } from "../keys/typing.ts";
import type { PaneId } from "../layout/index.ts";
import type { PaneSpec } from "../panes/index.ts";
import { steadName } from "../panes/stead/copy.ts";
import type { OutsidePanes } from "../shell/outside-panes.ts";
import type { Tiler } from "../shell/tiler.ts";
import type { Desk, ScreenRect } from "../surfaces/port.ts";
import { isElement, listenInEveryDocument } from "../surfaces/runtime/index.ts";

export interface SteadBesideSeams {
  readonly tiler: Pick<Tiler, "outside" | "findPane" | "spec" | "focus" | "close" | "version">;
  readonly outside: Pick<
    OutsidePanes,
    "standOutside" | "desk" | "paneAt" | "reachesOutside" | "holdingFocus"
  >;
  deliver(pane: PaneId, action: string, argument?: string): void;
  summonInside(): void;
  hearKeys?: ((heard: (event: KeyboardEvent) => void) => () => void) | undefined;
}

export interface SteadBeside {
  shown(): boolean;
  kit(): string | undefined;
  reveal(creature: string | undefined, beside: ScreenRect): Promise<void>;
  putAway(takeKeyboardBack: () => Promise<void>): Promise<boolean>;
  onAway(asked: () => void): () => void;
  dispose(): void;
}

export const steadAtActionId = "stead.at";

export const steadSeat = {
  share: { width: 0.5, height: 0.7 },
  least: { width: 560, height: 460 },
  most: { width: 1000, height: 760 },
  gap: 8,
  companionMargin: 24,
} as const;

export const awayKeys: readonly string[] = [" ", "Escape"];

interface Revealed {
  readonly pane: PaneId;
  readonly opened: boolean;
}

export function createSteadBeside(seams: SteadBesideSeams): SteadBeside {
  const { tiler, outside } = seams;
  const [revealed, setRevealed] = createSignal<Revealed>();
  const askedAway = new Set<() => void>();

  const standingOutside = (): PaneId | undefined =>
    tiler.outside().find((entry) => entry.spec.kind === steadName)?.id;

  const steadKept = (): PaneSpec | undefined => {
    tiler.version();
    const pane = tiler.findPane((spec) => spec.kind === steadName);
    return pane === undefined ? undefined : tiler.spec(pane);
  };

  const stillOut = (): Revealed | undefined => {
    tiler.version();
    const held = revealed();
    return held !== undefined && standingOutside() === held.pane ? held : undefined;
  };

  const pointAt = (pane: PaneId, creature: string | undefined): void => {
    if (creature !== undefined) seams.deliver(pane, steadAtActionId, creature);
  };

  const seatFor = async (beside: ScreenRect): Promise<ScreenRect | undefined> => {
    const desk = await outside.desk().catch(() => undefined);
    return desk === undefined ? undefined : seatBeside(desk, beside);
  };

  const reveal = async (creature: string | undefined, beside: ScreenRect): Promise<void> => {
    const already = standingOutside();
    if (already !== undefined) {
      setRevealed({ pane: already, opened: false });
      tiler.focus(already);
      pointAt(already, creature);
      return;
    }
    if (!outside.reachesOutside) {
      seams.summonInside();
      return;
    }
    const last = await seatFor(beside);
    const pane = await outside.standOutside(steadKept() ?? { kind: steadName }, {
      origin: "keeper",
      focus: true,
      follows: false,
      by: "keeper",
      last,
    });
    if (pane === undefined) return;
    setRevealed({ pane, opened: true });
    pointAt(pane, creature);
  };

  const putAway = async (takeKeyboardBack: () => Promise<void>): Promise<boolean> => {
    const held = stillOut();
    setRevealed(undefined);
    if (held === undefined) return false;
    const heldTheKeyboard = outside.holdingFocus() === held.pane;
    if (heldTheKeyboard) await takeKeyboardBack().catch(() => undefined);
    if (held.opened && tiler.spec(held.pane) !== undefined) tiler.close(held.pane);
    return heldTheKeyboard;
  };

  const heard = (event: KeyboardEvent): void => {
    const held = stillOut();
    if (held === undefined || !awayKeys.includes(event.key) || !plainKey(event)) return;
    if (!isElement(event.target) || outside.paneAt(event.target) !== held.pane) return;
    if (keptByItsTarget(event.target, event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    for (const asked of [...askedAway]) asked();
  };
  const stopHearing = (seams.hearKeys ?? hearEveryKey)(heard);

  return {
    shown: () => stillOut() !== undefined,
    kit: () => {
      const spec = steadKept();
      return spec?.kind === steadName ? spec.kit : undefined;
    },
    reveal,
    putAway,
    onAway: (asked) => {
      askedAway.add(asked);
      return () => askedAway.delete(asked);
    },
    dispose: stopHearing,
  };
}

export function seatBeside(desk: Desk, companion: ScreenRect): ScreenRect {
  const area = workAreaHolding(desk, companion);
  const width = Math.min(area.width, sized(area.width, "width"));
  const height = Math.min(area.height, sized(area.height, "height"));
  const body = inset(companion, steadSeat.companionMargin);
  const right = body.x + body.width;
  const bottom = body.y + body.height;
  const across = clamp(right - width, area.x, area.x + area.width - width);
  const down = clamp(bottom - height, area.y, area.y + area.height - height);
  const seats: ScreenRect[] = [
    { x: across, y: body.y - steadSeat.gap - height, width, height },
    { x: across, y: bottom + steadSeat.gap, width, height },
    { x: body.x - steadSeat.gap - width, y: down, width, height },
    { x: right + steadSeat.gap, y: down, width, height },
  ];
  return (
    seats.find((seat) => within(area, seat)) ?? {
      x: across,
      y: clamp(body.y - steadSeat.gap - height, area.y, area.y + area.height - height),
      width,
      height,
    }
  );
}

function sized(room: number, side: "width" | "height"): number {
  return clamp(
    Math.round(room * steadSeat.share[side]),
    steadSeat.least[side],
    steadSeat.most[side],
  );
}

function workAreaHolding(desk: Desk, rect: ScreenRect): ScreenRect {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const display = desk.displays.find(({ bounds }) => holds(bounds, centre));
  return display?.workArea ?? desk.workArea;
}

function holds(rect: ScreenRect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function within(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

function inset(rect: ScreenRect, by: number): ScreenRect {
  const dx = Math.min(by, rect.width / 2);
  const dy = Math.min(by, rect.height / 2);
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width - dx * 2,
    height: rect.height - dy * 2,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.round(Math.min(Math.max(value, low), Math.max(low, high)));
}

function plainKey(event: KeyboardEvent): boolean {
  return !(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat);
}

function keptByItsTarget(target: Element, key: string): boolean {
  if (isTextField(target) || target.closest("[data-keys-owned], [role='dialog']") !== null) {
    return true;
  }
  return key === " " && target.closest("button, [role='button'], [role='switch']") !== null;
}

function hearEveryKey(heard: (event: KeyboardEvent) => void): () => void {
  return listenInEveryDocument("keydown", heard, true);
}
