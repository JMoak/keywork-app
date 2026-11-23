import type { MotionPrefs } from "@keywork-app/habitat";
import type { SteadPlace } from "@keywork-app/protocol";
import { type Accessor, createEffect, on, onCleanup } from "solid-js";
import type { PaneSignal } from "../chrome/signals.ts";
import { type Chord, chordsOfKey } from "../keys/chord.ts";
import type { Direction, PaneId, Rect, Screen, Verdict } from "../layout/index.ts";
import type { PaneKind, PaneSpec } from "../panes/index.ts";
import { outsideKindOfSetting, settingShownBy } from "../panes/setting/index.tsx";
import {
  type OutsideHandlers,
  paneOutsideActionId,
  panesDealActionId,
  panesSpreadActionId,
} from "../surfaces/actions.ts";
import type { OutsideKind } from "../surfaces/feel/arrange.ts";
import type { Mood } from "../surfaces/feel/pace.ts";
import type { PoppedOutside } from "../surfaces/feel/perf-hook.ts";
import { nearestAcross, pageOnDesk } from "../surfaces/outside/across.ts";
import {
  type Arranged,
  type Arranging,
  type Arrived,
  type CameHome,
  createPanesOutside,
  type DealtAs,
  type PaneFacts,
  type PanesOutside,
  type Placed,
  type PlacesChange,
  type Reshaped,
  type RoomAsked,
  type Sending,
  type Tenant,
} from "../surfaces/outside/panes-outside.tsx";
import { leastRecentFirst } from "../surfaces/outside/stacking.ts";
import type { Desk, ScreenRect, SurfacesPort } from "../surfaces/port.ts";
import type { SurfaceRuntimeOptions } from "../surfaces/runtime/index.ts";
import { type OutsideEntry, refusalNotices, type Tiler } from "./tiler.ts";

export interface OutsidePanesSeams {
  readonly tiler: Tiler;
  readonly port: SurfacesPort | undefined;
  readonly windows?: SurfaceRuntimeOptions | undefined;
  screen(): Screen;
  viewport(): Screen;
  shownOnPage(): ReadonlyMap<PaneId, Rect>;
  bodyOf(pane: PaneId): HTMLElement | undefined;
  factsOf(pane: PaneId): PaneFacts;
  motion(): MotionPrefs;
  backdrop(): string;
  frameInk?(signal: PaneSignal): string | undefined;
  chord(action: string): string | undefined;
  say(line: string): void;
  act(verdict: Verdict): void;
  placesChanged?(what: PlacesChange): void;
  readonly makeRoom?: ((asked: RoomAsked) => Promise<Desk>) | undefined;
  backOnTheRail?(pane: PaneId, why: CameHome): boolean;
  putAway?(pane: PaneId): boolean;
  setOutAgain?(seats: ReadonlyMap<PaneId, ScreenRect>): void;
  placeOnPage?(place: SteadPlace): Rect | undefined;
}

export interface OutsidePanes extends OutsideHandlers {
  readonly holdingFocus: Accessor<PaneId | undefined>;
  readonly reachesOutside: boolean;
  restore(which?: (spec: PaneSpec) => boolean): void;
  popOutside(): Promise<PoppedOutside>;
  standOutside(spec: PaneSpec, sending: Sending): Promise<PaneId | undefined>;
  leave(pane: PaneId, mood?: Mood, intoPlace?: boolean): Promise<void>;
  arrange(asked: Arranging): Promise<Arranged | "desktop-refused">;
  settle(company?: string): Promise<void>;
  standings(): ReadonlyMap<PaneId, Placed>;
  desk(): Promise<Desk | undefined>;
  paneAt(node: Node): PaneId | undefined;
  focus(pane: PaneId): void;
  focusConsole(): void;
  focusAcross(direction: Direction, otherwise: () => void): void;
  stepFocused(direction: Direction): boolean;
  resizeFocused(delta: number): boolean;
  heardWhileLettered(event: KeyboardEvent): boolean;
  closed(pane: PaneId): void;
}

export const outsideNotices = {
  isOutside: (insideChord: string | undefined) =>
    withChord("this pane is outside the window", insideChord, "brings it inside"),
  staysInside: (title: string) => `${title} stays inside the window for now`,
  noneOutside: "no pane is outside the window",
  nothingSpreads: "nothing to spread · a pane that fills its display stays as it is",
  windowKeepsItsPanes: "this window keeps its panes inside",
  couldNotLeave: (why: string) => `this pane stays inside · ${why}`,
  desktopRefused: (why: string) => `the desktop would not do that · ${why}`,
  spread: (spreadChord: string | undefined) =>
    withChord(
      "spread so no pane overlaps another · a letter goes to its pane",
      spreadChord,
      "returns each where it stood",
    ),
  lettered: "a letter goes to its pane · escape leaves them be",
  onlyOutsideGoesBehind: "this pane is inside the window · only a pane outside goes behind",
  noOtherOutside: "no other pane is outside the window to stand in front",
  fillsItsDisplay: "this pane fills its display and stays as it is",
  dealt: ({ name, turn, of }: DealtAs, dealChord: string | undefined) =>
    of === 1
      ? `dealt as ${name} · the only arrangement for this many panes`
      : withChord(`dealt as ${name} · ${turn} of ${of}`, dealChord, "deals the next"),
  nothingDeals: "nothing to deal · no arrangement holds this many panes on this display",
  noRoomOutside: (count: number) =>
    count === 1
      ? "no room outside the window for one more pane · it waits as a card on the rail"
      : `no room outside the window for ${count} more panes · they wait as cards on the rail`,
  steppedAside: (count: number) =>
    count === 1
      ? "one pane stepped back to make room · it waits as a card on the rail"
      : `${count} panes stepped back to make room · they wait as cards on the rail`,
};

export const kindsKeptInside: ReadonlySet<PaneKind> = new Set<PaneKind>(["terminal", "screen"]);

export const mostOutsideAtOnce = 12;

export const plainPane: PaneSpec = { kind: "conversation" };

export function createOutsidePanes(seams: OutsidePanesSeams): OutsidePanes {
  const { tiler, port } = seams;
  if (port === undefined) return panesKeptInside(seams);
  const desktopRefused = (why: string): void => seams.say(outsideNotices.desktopRefused(why));
  const outside = createPanesOutside({
    port,
    windows: seams.windows ?? { burst: mostOutsideAtOnce },
    motion: seams.motion,
    backdrop: seams.backdrop,
    frameInk: (signal) => seams.frameInk?.(signal),
    insideHint: () => seams.chord(paneOutsideActionId),
    refused: (_tenant, why) => seams.say(outsideNotices.couldNotLeave(why)),
    desktopRefused,
    changed: (what) => seams.placesChanged?.(what),
    makeRoom: seams.makeRoom,
    noRoom: (tenants) => seams.say(outsideNotices.noRoomOutside(tenants.length)),
    steppedAside: (tenants) => seams.say(outsideNotices.steppedAside(tenants.length)),
    setOutAgain: (seats) => seams.setOutAgain?.(seats),
    placeOnDesk: (place, desk) => {
      const onPage = seams.placeOnPage?.(place);
      return onPage === undefined ? undefined : pageOnDesk(desk.console, seams.viewport(), onPage);
    },
  });
  onCleanup(outside.dispose);

  const focusConsole = (): void => {
    port.focusConsole().catch((refusal: unknown) => desktopRefused(messageOf(refusal)));
  };
  followTheFocusedPane(tiler, outside, focusConsole);

  const bringInside = async (panes: readonly PaneId[]): Promise<void> => {
    await outside.recall(panes);
    for (const pane of panes) {
      if (tiler.isOutside(pane)) seams.act(tiler.bringInside(pane, seams.screen()));
    }
  };

  const cameHome = (pane: PaneId, why: CameHome): void => {
    if (why !== "closed" && seams.backOnTheRail?.(pane, why) === true) return;
    seams.act(tiler.bringInside(pane, seams.screen()));
  };

  const tenantOf = (pane: PaneId, spec: PaneSpec): Tenant | undefined => {
    const body = seams.bodyOf(pane);
    if (body === undefined) return undefined;
    return {
      key: pane,
      body,
      kind: outsideKindOf(spec),
      facts: () => seams.factsOf(pane),
      left: () => void tiler.sendOutside(pane),
      placed: (bounds, by, placer) => void tiler.placeOutside(pane, bounds, by, placer),
      cameHome: (why) => cameHome(pane, why),
      askedInside: () => void bringInside([pane]),
      tookFocus: () => void tiler.focus(pane),
    };
  };

  const send = (pane: PaneId, spec: PaneSpec, sending: Sending): Promise<Arrived | undefined> => {
    const tenant = tenantOf(pane, spec);
    const company = sending.company ?? settingShownBy(spec)?.sessionId;
    return tenant === undefined
      ? Promise.resolve(undefined)
      : outside.send(tenant, { ...sending, company });
  };

  const standOutside = async (spec: PaneSpec, sending: Sending): Promise<PaneId | undefined> => {
    const pane = tiler.openOutside(spec, seams.screen());
    if (pane === undefined) return undefined;
    if ((await send(pane, spec, sending)) !== undefined) return pane;
    if (tiler.spec(pane) === undefined) return undefined;
    if (!tiler.isOutside(pane)) return pane;
    tiler.close(pane);
    return undefined;
  };

  const returning = ({ spec, rect, follows, by }: OutsideEntry): Sending => ({
    origin: settingShownBy(spec) === undefined ? "keeper" : "creature",
    focus: false,
    follows,
    last: rect,
    by: by ?? "console",
  });

  const sendFocused = (pane: PaneId, spec: PaneSpec): void => {
    if (kindsKeptInside.has(spec.kind)) seams.say(outsideNotices.staysInside(titleOf(pane)));
    else void send(pane, spec, { origin: "keeper", focus: true, follows: true });
  };

  const titleOf = (pane: PaneId): string => seams.factsOf(pane).title;

  const bringEveryPaneInside = async (): Promise<void> => {
    const focused = tiler.focused();
    const out = tiler.outside().map((entry) => entry.id);
    await outside.recall(out);
    for (const pane of out) seams.putAway?.(pane);
    if (tiler.outside().length > 0) seams.act(tiler.bringAllInside(seams.screen()));
    const stillOpen = focused !== undefined && tiler.spec(focused) !== undefined;
    if (stillOpen && tiler.focused() !== focused) void tiler.focus(focused);
  };

  const spreadOrGather = async (): Promise<void> => {
    const verdict = await outside.toggleSpread();
    if (verdict === "nothing-outside") seams.say(outsideNotices.noneOutside);
    else if (verdict === "nothing-to-spread") seams.say(outsideNotices.nothingSpreads);
    else if (verdict === "spread")
      seams.say(outsideNotices.spread(seams.chord(panesSpreadActionId)));
  };

  const dealTheNext = async (): Promise<void> => {
    const verdict = await outside.deal();
    if (verdict === "nothing-outside") seams.say(outsideNotices.noneOutside);
    else if (verdict === "nothing-to-deal") seams.say(outsideNotices.nothingDeals);
    else if (verdict !== "desktop-refused")
      seams.say(outsideNotices.dealt(verdict, seams.chord(panesDealActionId)));
  };

  const letterOrClear = (): void => {
    const verdict = outside.toggleHints();
    if (verdict === "nothing-outside") seams.say(outsideNotices.noneOutside);
    else if (verdict === "shown") seams.say(outsideNotices.lettered);
  };

  const heardWhileLettered = (event: KeyboardEvent): boolean => {
    if (!outside.hinting()) return false;
    const chords = chordsOfKey(event);
    if (chords.length === 0) return false;
    if (chords.some(commands)) {
      outside.endHints();
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return true;
    const picked = outside.pickHint(chords.map((chord) => chord.name));
    if (picked !== undefined) seams.act(tiler.focus(picked));
    return true;
  };

  const sendFocusedBehind = (): void => {
    const pane = tiler.focused();
    if (pane === undefined || !tiler.isOutside(pane)) {
      seams.say(outsideNotices.onlyOutsideGoesBehind);
      return;
    }
    const nowOnTop = outside.sendBehind(pane);
    if (nowOnTop === undefined) seams.say(outsideNotices.noOtherOutside);
    else seams.act(tiler.focus(nowOnTop));
  };

  const focusedOutside = (): PaneId | undefined => {
    const pane = tiler.focused();
    return pane !== undefined && outside.has(pane) ? pane : undefined;
  };

  const insideOnDesk = (console: ScreenRect): Array<readonly [PaneId, ScreenRect]> =>
    [...seams.shownOnPage()].map(
      ([id, onPage]) => [id, pageOnDesk(console, seams.viewport(), onPage)] as const,
    );

  const neighbourAcross = async (direction: Direction): Promise<PaneId | undefined> => {
    const desk = await outside.desk();
    const from = tiler.focused();
    if (desk === undefined || from === undefined) return undefined;
    const standing = [...outside.places()];
    const inside = insideOnDesk(desk.console);
    const origin = [...standing, ...inside].find(([id]) => id === from)?.[1];
    if (origin === undefined) return undefined;
    const reachable = outside.has(from) ? [...standing, ...inside] : standing;
    return nearestAcross(
      origin,
      reachable.filter(([id]) => id !== from),
      direction,
    );
  };

  const focusAcross = async (direction: Direction, otherwise: () => void): Promise<void> => {
    const neighbour = await neighbourAcross(direction);
    if (neighbour === undefined) otherwise();
    else seams.act(tiler.focus(neighbour));
  };

  const sayWhyItStays = (reshaped: Reshaped, atItsLimit: string): void => {
    if (reshaped === "stays") seams.say(atItsLimit);
    else if (reshaped === "fills-its-display") seams.say(outsideNotices.fillsItsDisplay);
  };

  return {
    holdingFocus: outside.holdingFocus,
    reachesOutside: true,
    standOutside,
    leave: async (pane, mood, intoPlace) => {
      await outside.recall([pane], mood, intoPlace);
    },
    arrange: outside.arrange,
    settle: outside.settle,
    standings: outside.standings,
    desk: outside.desk,
    togglePaneOutside: () => {
      const pane = tiler.focused();
      const spec = tiler.focusedSpec();
      if (pane === undefined || spec === undefined) seams.say(refusalNotices.nothingFocused);
      else if (outside.has(pane) || tiler.isOutside(pane)) void bringInside([pane]);
      else sendFocused(pane, spec);
    },
    bringPanesInside: () => {
      if (tiler.outside().length === 0) seams.say(outsideNotices.noneOutside);
      else void bringEveryPaneInside();
    },
    toggleOutsideSpread: () => void spreadOrGather(),
    toggleOutsideHints: letterOrClear,
    sendPaneBehind: sendFocusedBehind,
    dealPanesOutside: () => void dealTheNext(),
    restore: (which = everyPane) => {
      for (const entry of leastRecentlyUsedFirst(tiler)) {
        if (which(entry.spec)) void send(entry.id, entry.spec, returning(entry));
      }
    },
    popOutside: async () => {
      const requestedAt = performance.now();
      const pane = tiler.openOutside(plainPane, seams.screen());
      const arrived =
        pane === undefined
          ? undefined
          : await send(pane, plainPane, { origin: "creature", focus: false, follows: true });
      if (arrived === undefined) throw new Error("no pane reached its place outside the window");
      const { id, warm, bounds, shownAt } = arrived;
      return { id, warm, bounds, requestedAt, shownAt, paintedAt: await arrived.painted };
    },
    paneAt: outside.keyAt,
    focus: outside.focus,
    focusConsole,
    focusAcross: (direction, otherwise) => {
      if (outside.places().size === 0) otherwise();
      else void focusAcross(direction, otherwise);
    },
    stepFocused: (direction) => {
      const pane = focusedOutside();
      if (pane === undefined) return false;
      void outside
        .stepAcross(pane, direction)
        .then((reshaped) => sayWhyItStays(reshaped, refusalNotices.cannotMove(direction)));
      return true;
    },
    resizeFocused: (delta) => {
      const pane = focusedOutside();
      if (pane === undefined) return false;
      void outside
        .stepSize(pane, Math.sign(delta))
        .then((reshaped) => sayWhyItStays(reshaped, refusalNotices.atItsLimit(delta)));
      return true;
    },
    heardWhileLettered,
    closed: outside.gone,
  };
}

function panesKeptInside(seams: OutsidePanesSeams): OutsidePanes {
  const refuse = (): void => seams.say(outsideNotices.windowKeepsItsPanes);
  return {
    holdingFocus: () => undefined,
    reachesOutside: false,
    standOutside: () => Promise.resolve(undefined),
    leave: () => Promise.resolve(),
    arrange: () => Promise.resolve("desktop-refused"),
    settle: () => Promise.resolve(),
    standings: () => new Map(),
    desk: () => Promise.resolve(undefined),
    togglePaneOutside: refuse,
    bringPanesInside: refuse,
    toggleOutsideSpread: refuse,
    toggleOutsideHints: refuse,
    sendPaneBehind: refuse,
    dealPanesOutside: refuse,
    restore: (which = everyPane) => {
      for (const { id, spec } of seams.tiler.outside()) {
        if (!which(spec) || seams.backOnTheRail?.(id, "refused") === true) continue;
        seams.tiler.bringInside(id, seams.screen());
      }
    },
    popOutside: () => Promise.reject(new Error(outsideNotices.windowKeepsItsPanes)),
    paneAt: () => undefined,
    focus: () => undefined,
    focusConsole: () => undefined,
    focusAcross: (_direction, otherwise) => otherwise(),
    stepFocused: () => false,
    resizeFocused: () => false,
    heardWhileLettered: () => false,
    closed: () => undefined,
  };
}

function followTheFocusedPane(tiler: Tiler, outside: PanesOutside, focusConsole: () => void): void {
  createEffect(
    on(
      () => tiler.focused(),
      (pane) => {
        if (pane !== undefined && outside.has(pane)) outside.focus(pane);
        else if (outside.holdingFocus() !== undefined) focusConsole();
      },
      { defer: true },
    ),
  );
}

function leastRecentlyUsedFirst(tiler: Tiler): OutsideEntry[] {
  const entries = tiler.outside();
  const order = leastRecentFirst(
    entries.map((entry) => entry.id),
    tiler.layout.recentlyFocused(),
  );
  return order.flatMap((id) => entries.find((entry) => entry.id === id) ?? []);
}

function everyPane(): boolean {
  return true;
}

function commands(chord: Chord): boolean {
  return chord.ctrl || chord.alt;
}

function outsideKindOf(spec: PaneSpec): OutsideKind {
  switch (spec.kind) {
    case "conversation":
    case "file":
    case "diff":
    case "stead":
      return spec.kind;
    case "setting":
      return outsideKindOfSetting(spec.setting);
    default:
      return "note";
  }
}

function messageOf(refusal: unknown): string {
  return refusal instanceof Error ? refusal.message : String(refusal);
}

function withChord(said: string, chord: string | undefined, does: string): string {
  return chord === undefined ? said : `${said} · ${chord} ${does}`;
}
