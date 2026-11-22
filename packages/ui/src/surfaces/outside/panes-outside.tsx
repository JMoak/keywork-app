import { type Extent, type MotionPrefs, overlaps, type Random } from "@keywork-app/habitat";
import { type Accessor, createSignal, type Setter } from "solid-js";
import { render } from "solid-js/web";
import type { LifecycleState } from "../../chrome/stamp.ts";
import { listenForKeys } from "../../keys/listen.ts";
import type { Direction } from "../../layout/index.ts";
import type { OutsideKind, Standing, Wanted } from "../feel/arrange.ts";
import {
  arisePlan,
  arrivalPlan,
  dealPlan,
  gatheredBy,
  type Hold,
  keeperTyped,
  movePlan,
  nextReleaseAt,
  nothingHeld,
  offered,
  type Plan,
  recallPlan,
  regroupedBy,
  releasedBy,
  retreatPlan,
  type Start,
  spreadPlan,
} from "../feel/choreography.ts";
import { type Mood, type Pacing, paceOf } from "../feel/pace.ts";
import { chosenWay, nextDeal } from "../feel/pattern-choice.ts";
import { type Authored, madeSafe } from "../feel/pattern-compose.ts";
import type { Deal, Share } from "../feel/pattern-deals.ts";
import { consoleOn, firstFound, type Ground, wholeDisplay } from "../feel/pattern-ground.ts";
import { composed, inTurn, seatedAsWritten, type Way } from "../feel/patterns.ts";
import { firstFramePaintedIn } from "../feel/perf-hook.ts";
import { SurfaceChrome } from "../feel/surface-chrome.tsx";
import type {
  Desk,
  ScreenRect,
  SurfaceEvent,
  SurfaceId,
  SurfaceMover,
  SurfaceOrigin,
  SurfaceShow,
  SurfacesPort,
} from "../port.ts";
import {
  createSurfaceRuntime,
  type OutsideFrame,
  type OutsidePane,
  type SurfaceRuntimeOptions,
} from "../runtime/index.ts";
import { drillSeats } from "./drill-seats.ts";
import { type SizeName, sameRect, standsFull, steppedAlongLadder, steppedOnGrid } from "./grid.ts";
import { type Hinted, type Hints, hintLeft, hintsFor, hintTyped } from "./hints.ts";
import { type Performance, perform } from "./perform.ts";
import {
  arisenBeside,
  besideItsParent,
  type DealsFor,
  fillsADisplay,
  type Landing,
  paneWeights,
  restingPlaces,
  type Seeking,
  steadily,
  troupePlaces,
  weightOf,
} from "./resting.ts";
import { lowered, raised, slippedUnder } from "./stacking.ts";
import { cutBackToClear, holdsACard, roomsToDealOn, stageBeside } from "./stage.ts";

export interface PaneFacts {
  readonly title: string;
  readonly hueRank: number;
  readonly state: LifecycleState;
  readonly ordinal?: string | undefined;
  readonly frame?: string | undefined;
}

export interface Tenant {
  readonly key: string;
  readonly body: HTMLElement;
  readonly kind: OutsideKind;
  facts(): PaneFacts;
  left(): void;
  placed(bounds: ScreenRect, by: SurfaceMover, placer: Placer): void;
  cameHome(why: CameHome): void;
  askedInside(): void;
  tookFocus?(): void;
  lostFocus?(): void;
}

export interface Sending {
  readonly origin: SurfaceOrigin;
  readonly focus: boolean;
  readonly follows: boolean;
  readonly last?: ScreenRect | undefined;
  readonly by?: Placer | undefined;
  readonly company?: string | undefined;
  readonly seat?: Share | undefined;
  readonly size?: SizeName | undefined;
  readonly weight?: number | undefined;
  readonly from?: string | undefined;
  readonly leads?: boolean | undefined;
  readonly mood?: Mood | undefined;
  readonly arranging?: boolean | undefined;
}

export type Placer = "creature" | "keeper" | "console";

export type CameHome = "closed" | "refused" | "no-room" | "stepped-aside";

export interface RoomAsked {
  readonly company: string | undefined;
  readonly desk: Desk;
  fits(desk: Desk): boolean;
}

export type PlacesChange = "seated" | "moved" | "left";

export interface Placed {
  readonly bounds: ScreenRect;
  readonly by: Placer;
}

export interface Written {
  readonly key: string;
  readonly share: Share;
}

export type Instruction =
  | { readonly kind: "written"; readonly seats: readonly Written[] }
  | { readonly kind: "dealt"; deals(count: number): readonly (readonly Deal[])[] };

export interface Arranging {
  readonly keys: readonly string[];
  readonly instruction: Instruction;
  readonly lead?: string | undefined;
  readonly over?: "room" | "display" | undefined;
  readonly mood?: Mood | undefined;
}

export interface Arranged {
  readonly look: string | undefined;
  readonly stands: "beside" | "over" | undefined;
  readonly seated: readonly string[];
  readonly authored: readonly string[];
  readonly keepers: readonly string[];
  readonly unseated: readonly string[];
  readonly aside: readonly string[];
  readonly backBeside: readonly string[];
  readonly said: readonly string[];
  readonly letGo: boolean;
}

export const arrangeNotices = {
  composedLook: "composed",
  noRoom: "no room on this display holds that arrangement, so nothing moved",
  cutBack: (seat: number) => `seat ${seat} was cut back to clear a pane that is not yours to move`,
  leftOut: (seat: number) =>
    `seat ${seat} lay under a pane that is not yours to move, with no room beside it, and was left out`,
} as const;

export interface Arrived {
  readonly id: SurfaceId;
  readonly warm: boolean;
  readonly bounds: ScreenRect;
  readonly requestedAt: number;
  readonly shownAt: number;
  readonly painted: Promise<number>;
}

export type SpreadVerdict =
  | "spread"
  | "gathered"
  | "nothing-outside"
  | "nothing-to-spread"
  | "desktop-refused";

export type HintsVerdict = "shown" | "hidden" | "nothing-outside";

export type Reshaped = "moved" | "stays" | "fills-its-display" | "not-outside" | "desktop-refused";

export interface DealtAs {
  readonly name: string;
  readonly turn: number;
  readonly of: number;
}

export type DealVerdict = DealtAs | "nothing-outside" | "nothing-to-deal" | "desktop-refused";

export interface ComposedAs {
  readonly name: string;
  readonly said: readonly string[];
}

export interface NotComposed {
  readonly refused: "nothing-free" | "too-few-seats" | "no-room";
  readonly said: readonly string[];
}

export type ComposeVerdict = ComposedAs | NotComposed | "nothing-outside" | "desktop-refused";

export interface PanesOutsideOptions {
  readonly port: SurfacesPort;
  readonly windows?: SurfaceRuntimeOptions | undefined;
  motion(): MotionPrefs;
  backdrop(): string;
  insideHint(): string | undefined;
  refused(tenant: Tenant, why: string): void;
  desktopRefused(why: string): void;
  changed?(what: PlacesChange): void;
  readonly makeRoom?: ((asked: RoomAsked) => Promise<Desk>) | undefined;
  noRoom?(tenants: readonly Tenant[]): void;
  steppedAside?(tenants: readonly Tenant[]): void;
  setOutAgain?(seats: ReadonlyMap<string, ScreenRect>): void;
  now?(): number;
  readonly random?: Random | undefined;
}

export interface PanesOutside {
  readonly holdingFocus: Accessor<string | undefined>;
  readonly hinting: Accessor<boolean>;
  send(tenant: Tenant, sending: Sending): Promise<Arrived | undefined>;
  recall(keys: readonly string[], mood?: Mood): Promise<readonly string[]>;
  toggleSpread(): Promise<SpreadVerdict>;
  deal(): Promise<DealVerdict>;
  compose(authored: Authored): Promise<ComposeVerdict>;
  arrange(asked: Arranging): Promise<Arranged | "desktop-refused">;
  settle(company?: string): Promise<void>;
  standings(): ReadonlyMap<string, Placed>;
  toggleHints(): HintsVerdict;
  pickHint(letters: readonly string[]): string | undefined;
  endHints(): void;
  focus(key: string): void;
  sendBehind(key: string): string | undefined;
  stepAcross(key: string, direction: Direction): Promise<Reshaped>;
  stepSize(key: string, step: number): Promise<Reshaped>;
  places(): ReadonlyMap<string, ScreenRect>;
  desk(): Promise<Desk | undefined>;
  has(key: string): boolean;
  keyAt(node: Node): string | undefined;
  gone(key: string): void;
  dispose(): void;
}

export function createPanesOutside(options: PanesOutsideOptions): PanesOutside {
  const { port } = options;
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  let leavingWithTheApp = false;
  const leaveWithTheApp = (): void => {
    leavingWithTheApp = true;
  };
  window.addEventListener("pagehide", leaveWithTheApp);
  const stopHearingTheAppLeave = port.onLeaving?.(leaveWithTheApp);
  const runtime = createSurfaceRuntime(port, options.windows);
  const stands = new Map<string, Stand>();
  const bySurface = new Map<SurfaceId, Stand>();
  const pending = new Map<string, Request>();
  const departing = new Map<string, Promise<unknown>>();
  const spreadFrom = new Map<Stand, ScreenRect>();
  const performances = new Set<Performance>();
  const troupes = new Map<string, Troupe>();
  const [holdingFocus, setHoldingFocus] = createSignal<string>();
  const [hinting, setHinting] = createSignal<Hinting>();
  const setOff: Request[] = [];
  let hold: Hold<Request> = nothingHeld();
  let release: ReturnType<typeof setTimeout> | undefined;
  let company: Company | undefined;
  let seating: ReturnType<typeof setTimeout> | undefined;
  let stack: readonly string[] = [];
  let lastLook: string | undefined;
  let disposed = false;

  const awaitingALanding = new Set<() => void>();

  const has = (key: string): boolean => stands.has(key) || pending.has(key);
  const landedNow = (): void => {
    for (const look of [...awaitingALanding]) look();
  };
  const haveLanded = (keys: readonly string[]): Promise<void> =>
    new Promise((done) => {
      const look = (): void => {
        if (!disposed && keys.some((key) => pending.has(key))) return;
        awaitingALanding.delete(look);
        done();
      };
      awaitingALanding.add(look);
      look();
    });
  const awaitsItsArrangement = (stand: Stand): boolean =>
    stand.request.sending.arranging === true &&
    standsStill(stand) &&
    !stand.request.shown() &&
    stand.at === undefined;
  const standsStill = (stand: Stand): boolean => stands.get(stand.request.tenant.key) === stand;
  const restsOutside = (stand: Stand): boolean =>
    standsStill(stand) && stand.request.shown() && !stand.returning;
  const resting = (): Stand[] => [...stands.values()].filter(restsOutside);
  const stacked = (): Stand[] => stack.flatMap((key) => stands.get(key) ?? []).filter(restsOutside);

  const desktopRefused = (refusal: unknown): void => {
    if (!disposed) options.desktopRefused(messageOf(refusal));
  };

  const unlessTheyLeft = (asked: readonly Stand[], request: Promise<unknown>): void => {
    request.catch((refusal: unknown) => {
      if (asked.every(restsOutside)) desktopRefused(refusal);
    });
  };

  const deskNow = (): Promise<Desk | undefined> =>
    port.desk().catch((refusal: unknown) => {
      desktopRefused(refusal);
      return undefined;
    });

  const placesChanged = (what: PlacesChange): void => {
    if (!disposed) options.changed?.(what);
  };

  const pacingOf = (moving: readonly Stand[], mood?: Mood, lead?: SurfaceId): Pacing => ({
    mood: mood ?? moving.flatMap((stand) => stand.request.sending.mood ?? [])[0] ?? "brisk",
    lead: lead ?? moving.find((stand) => stand.request.sending.leads)?.pane.id,
    random,
  });

  const send = (tenant: Tenant, sending: Sending): Promise<Arrived | undefined> =>
    new Promise((settle) => {
      if (has(tenant.key)) return settle(undefined);
      const [shown, setShown] = createSignal(false);
      const [focused, setFocused] = createSignal(false);
      const request: Request = {
        tenant,
        sending,
        origin: sending.origin,
        requestedAt: now(),
        settle,
        shown,
        setShown,
        focused,
        setFocused,
      };
      pending.set(tenant.key, request);
      joinTheStack(request);
      const offer = offered(hold, request, now());
      hold = offer.hold;
      arriveTogether(offer.release);
      releaseWhenDue();
    });

  const joinTheStack = (request: Request): void => {
    const { key } = request.tenant;
    const standing = stack.filter(has);
    stack = takesTheKeeperFocus(request.sending)
      ? raised(standing, key)
      : slippedUnder(standing, key, holdingFocus());
  };

  const restack = (): void => {
    const order = stacked();
    if (port.stack === undefined || order.length < 2) return;
    unlessTheyLeft(order, port.stack(order.map((stand) => stand.pane.id)));
  };

  const raise = (stand: Stand): void => {
    const onTop = stacked().at(-1);
    stack = raised(stack, stand.request.tenant.key);
    if (onTop !== stand) restack();
  };

  const releaseWhenDue = (): void => {
    clearTimeout(release);
    const due = nextReleaseAt(hold);
    if (due !== undefined) release = setTimeout(releaseTheHeld, Math.max(0, due - now()));
  };

  const releaseTheHeld = (): void => {
    const released = releasedBy(hold, now());
    hold = released.hold;
    arriveTogether(released.release);
    releaseWhenDue();
  };

  const keeperIsTyping = (): void => {
    hold = keeperTyped(hold, now());
    if (hold.held.length > 0) releaseWhenDue();
  };

  const arriveTogether = (requests: readonly Request[]): void => {
    if (requests.length === 0) return;
    if (setOff.length === 0) queueMicrotask(theKeepersFirst);
    setOff.push(...requests);
  };

  const theKeepersFirst = (): void => {
    const leaving = setOff.splice(0);
    void arrive(leaving.filter((request) => request.origin === "keeper"));
    void arrive(leaving.filter((request) => request.origin === "creature"));
  };

  const arrive = async (requests: readonly Request[]): Promise<void> => {
    if (requests.length === 0) return;
    const asked = askedAhead(port.desk());
    const arrived = (await Promise.all(requests.map(leaveInTurn))).flatMap((stand) => stand ?? []);
    landedNow();
    const joining = arrived.filter((stand) => stand.request.sending.arranging !== true);
    if (joining.length === 0) return;
    if (joining.every(sentByACreature)) gather(joining, asked);
    else await seated(joining, asked);
  };

  const gather = (landed: readonly Stand[], asked: Promise<Desk>): void => {
    const at = now();
    const since = company?.since ?? at;
    company = {
      stands: [...(company?.stands ?? []), ...landed],
      since,
      desk: company?.desk ?? asked,
    };
    clearTimeout(seating);
    seating = setTimeout(seatTheCompany, Math.max(0, gatheredBy(since, at) - at));
  };

  const seatTheCompany = (): void => {
    const gathered = company;
    company = undefined;
    if (gathered !== undefined) void seated(gathered.stands, gathered.desk);
  };

  const seated = async (landed: readonly Stand[], asked: Promise<Desk>): Promise<void> => {
    try {
      const desk = await asked;
      const pacing = pacingOf(landed);
      const plans = landed.every(sentByACreature)
        ? await troupesJoined(desk, landed, pacing)
        : keepersEntrances(desk, landed, pacing);
      placesChanged("seated");
      await Promise.all(plans.map((plan) => staged(plan, isLeaving, appeared)));
      if (landed.length > 1 || landed.some(shownWithoutFocusByTheKeeper)) restack();
    } catch (failure) {
      for (const stand of landed) if (!awaitsItsTroupe(stand)) turnedBack(stand, failure);
    }
  };

  const enteringAs = (way: Way, entering: readonly Stand[], desk: Desk, pacing: Pacing): void => {
    if (entering.length === 0) return;
    for (const stand of entering) {
      const seat = seatIn(way, stand)[0]?.[1];
      if (seat === undefined) continue;
      stand.at = seat;
      stand.placer = "creature";
      stand.request.tenant.placed(seat, "host", "creature");
    }
    const plans = entrances(desk, entering, way.arrives, pacing, whereItsParentStands);
    placesChanged("seated");
    Promise.all(plans.map((plan) => staged(plan, isLeaving, appeared)))
      .then(restack)
      .catch((failure: unknown) => {
        for (const stand of entering) if (!stand.request.shown()) turnedBack(stand, failure);
      });
  };

  const keepersEntrances = (desk: Desk, landed: readonly Stand[], pacing: Pacing): Plan[] => {
    const arising = landed.filter((stand) => parentOf(stand) !== undefined);
    const arriving = landed.filter((stand) => !arising.includes(stand));
    return [
      entrance(desk, arriving, settleOn(desk, arriving), pacing),
      ...arising.filter(standsStill).map((stand) => planToArise(desk, stand, pacing)),
    ];
  };

  const entrance = (
    desk: Desk,
    arriving: readonly Stand[],
    turns: readonly Start[],
    pacing: Pacing,
  ): Plan =>
    arrivalPlan(desk, seatedForReal(arriving).map(showOf), turns, options.motion(), pacing);

  const entrances = (
    desk: Desk,
    entering: readonly Stand[],
    turns: readonly Start[],
    pacing: Pacing,
    parentStood: (stand: Stand) => ScreenRect | undefined,
  ): Plan[] => {
    const seated = seatedForReal(entering);
    const arising = seated.filter((stand) => parentStood(stand) !== undefined);
    const arriving = seated.filter((stand) => !arising.includes(stand));
    return [
      arrivalPlan(desk, arriving.map(showOf), turns, options.motion(), pacing),
      ...arising.flatMap((stand) => {
        const from = parentStood(stand);
        return from === undefined
          ? []
          : [arisePlan(desk, from, showOf(stand), options.motion(), pacing)];
      }),
    ];
  };

  const seatedForReal = (arriving: readonly Stand[]): Stand[] => {
    const still = arriving.filter(standsStill);
    sentBackToTheRail(still.filter((stand) => !hasARealSeat(stand)));
    return still.filter(hasARealSeat);
  };

  const whereItsParentStands = (stand: Stand): ScreenRect | undefined => {
    const parent = stands.get(stand.arisesFrom ?? "");
    return parent !== undefined && restsOutside(parent) ? parent.at : undefined;
  };

  const awaitsItsTroupe = (stand: Stand): boolean =>
    stand.request.shown() || stand.next !== undefined;

  const troupesJoined = async (
    desk: Desk,
    landed: readonly Stand[],
    pacing: Pacing,
  ): Promise<Plan[]> => {
    const plans: Plan[] = [];
    for (const company of new Set(landed.map(companyOf))) {
      const newcomers = landed.filter((stand) => companyOf(stand) === company);
      plans.push(...(await troupeJoined(desk, troupeOf(company), newcomers, pacing)));
    }
    return plans;
  };

  const troupeJoined = async (
    standing: Desk,
    troupe: Troupe,
    landed: readonly Stand[],
    pacing: Pacing,
  ): Promise<Plan[]> => {
    const strays = troupe.company === undefined;
    const arisingApart = strays ? landed.filter((stand) => parentOf(stand) !== undefined) : [];
    const arriving = landed.filter((stand) => !arisingApart.includes(stand));
    const desk = await deskWithRoom(standing, troupe.company, (candidate) =>
      holdsThemAll(candidate, troupe, arriving),
    );
    const seated = troupeSeated(desk, troupe, arriving.filter(standsStill), pacing);
    const arisen = arisingApart
      .filter(standsStill)
      .map((stand) => planToArise(desk, stand, pacing));
    return [...seated, ...arisen];
  };

  const troupeSeated = (
    desk: Desk,
    troupe: Troupe,
    newcomers: readonly Stand[],
    pacing: Pacing,
  ): Plan[] => {
    if (newcomers.length === 0) return [];
    theDrillTidied(desk, troupe);
    drilledInBy(troupe, newcomers);
    const beside = besideTheirParents(desk, troupe, newcomers);
    const dealing = newcomers.filter((stand) => !beside.has(stand));
    const settling = dealing.some((stand) => placeKept(desk, stand) === undefined);
    const moving = settling ? movingWith(troupe, newcomers) : [];
    const fit = fittedAround(desk, troupe, moving, dealing, [...beside.values()]);
    if (fit === undefined && troupe.company === undefined) {
      return [entrance(desk, dealing, settleOn(desk, dealing), pacing)];
    }
    for (const [stand, place] of beside) headFor(stand, place, "console");
    railedByTheDrill(troupe, fit?.dropped ?? []);
    sentBackToTheRail(fit?.dropped ?? dealing);
    const entering = [...(fit?.kept ?? []), ...beside.keys()].filter(
      (stand) => newcomers.includes(stand) && standsStill(stand),
    );
    troupe.desk = desk;
    troupe.turns = fit?.turns ?? [];
    if (othersAwaitTheirSeats(troupe, newcomers)) return regroupSoon(troupe);
    for (const stand of entering) takeItsSeat(stand);
    return entrances(desk, entering, troupe.turns, pacing, whereItsParentStands);
  };

  const othersAwaitTheirSeats = (troupe: Troupe, newcomers: readonly Stand[]): boolean =>
    troupe.company !== undefined &&
    [...stands.values()].some(
      (stand) =>
        !newcomers.includes(stand) &&
        companyOf(stand) === troupe.company &&
        stand.next !== undefined,
    );

  const fittedAround = (
    desk: Desk,
    troupe: Troupe,
    moving: readonly Stand[],
    newcomers: readonly Stand[],
    alsoTaken: readonly ScreenRect[],
  ): Fitted | undefined => {
    const moves = (stand: Stand): boolean => moving.includes(stand);
    if (troupe.drill !== undefined) {
      const ranked = byClaim(troupe, [...moving, ...newcomers]);
      return (
        drawnAsADrill(desk, troupe, ranked, moves, alsoTaken) ??
        fitted(desk, troupe, ranked, moves, 1, alsoTaken)
      );
    }
    const everyone = [...moving, ...newcomers];
    const fewest = troupe.company === undefined ? everyone.length : moving.length + 1;
    return fitted(desk, troupe, everyone, moves, fewest, alsoTaken);
  };

  const fitted = (
    desk: Desk,
    troupe: Troupe,
    ranked: readonly Stand[],
    moves: (stand: Stand) => boolean,
    fewest: number,
    alsoTaken: readonly ScreenRect[],
  ): Fitted | undefined => {
    for (let count = ranked.length; count >= Math.max(1, fewest); count -= 1) {
      const kept = ranked.slice(0, count);
      const dropped = ranked.slice(count);
      const moving = kept.filter(moves);
      const joining = kept.filter((stand) => !moves(stand));
      const seats = seatsFor(desk, troupe, moving, joining, false, alsoTaken, dropped);
      if (seats === undefined) continue;
      return { kept, dropped, turns: seatsTaken(seats, moving) };
    }
    return undefined;
  };

  const drawnAsADrill = (
    desk: Desk,
    troupe: Troupe,
    ranked: readonly Stand[],
    moves: (stand: Stand) => boolean,
    alsoTaken: readonly ScreenRect[],
  ): Fitted | undefined => {
    const { drill } = troupe;
    const free = ranked.every((stand) => moves(stand) || placeKept(desk, stand) === undefined);
    if (drill === undefined || !free) return undefined;
    const path = pathOf(drill).flatMap(
      (key) => ranked.find((stand) => keyOfStand(stand) === key) ?? [],
    );
    const [lead, ...ancestors] = path;
    if (lead === undefined) return undefined;
    const others = ranked.filter((stand) => !path.includes(stand));
    const apart = [...stands.values()]
      .filter((stand) => !stand.returning && !ranked.includes(stand))
      .flatMap(placeOf);
    const picture = drillSeats(desk, [...apart, ...alsoTaken], ancestors.length, others.length);
    if (picture === undefined) return undefined;
    const asCards = [...ancestors.slice(picture.trail.length), ...others];
    const kept = [
      lead,
      ...ancestors.slice(0, picture.trail.length),
      ...asCards.slice(0, picture.cards.length),
    ];
    const landing: Landing = {
      places: [picture.lead, ...picture.trail, ...picture.cards],
      arrives: inTurn(kept.map((stand) => stand.pane.id)),
      look: undefined,
    };
    return {
      kept,
      dropped: asCards.slice(picture.cards.length),
      turns: seatsTaken({ written: new Map(), seeking: kept, landing }, kept.filter(moves)),
    };
  };

  const deskWithRoom = async (
    desk: Desk,
    company: string | undefined,
    fits: (desk: Desk) => boolean,
  ): Promise<Desk> => {
    if (options.makeRoom === undefined || fits(desk)) return desk;
    return options.makeRoom({ company, desk, fits }).catch((refusal: unknown) => {
      desktopRefused(refusal);
      return desk;
    });
  };

  const troupeOf = (company: string | undefined): Troupe => {
    const known = company === undefined ? undefined : troupes.get(company);
    const troupe: Troupe = known ?? {
      company,
      shaped: undefined,
      drill: undefined,
      desk: undefined,
      turns: [],
      waitingSince: undefined,
      regroups: undefined,
    };
    if (company !== undefined) troupes.set(company, troupe);
    return troupe;
  };

  const movingWith = (troupe: Troupe, newcomers: readonly Stand[]): Stand[] =>
    troupe.drill !== undefined ? castOf(troupe, newcomers) : membersOf(troupe, newcomers);

  const membersOf = (troupe: Troupe, newcomers: readonly Stand[]): Stand[] =>
    troupe.company === undefined || troupe.shaped === "by-hand"
      ? []
      : castOf(troupe, newcomers).filter((stand) => !stand.composed);

  const castOf = (troupe: Troupe, except: readonly Stand[]): Stand[] =>
    troupe.company === undefined
      ? []
      : [...stands.values()].filter(
          (stand) =>
            !except.includes(stand) &&
            companyOf(stand) === troupe.company &&
            sentByACreature(stand) &&
            standsStill(stand) &&
            !stand.returning &&
            stand.placer !== "keeper" &&
            seatOf(stand) !== undefined,
        );

  const holdsThemAll = (desk: Desk, troupe: Troupe, arriving: readonly Stand[]): boolean => {
    const newcomers = arriving.filter(standsStill);
    const asksForASeat = newcomers.some((stand) => stand.request.sending.seat !== undefined);
    if (asksForASeat && stageBeside(desk) === undefined) return false;
    if (newcomers.every((stand) => placeKept(desk, stand) !== undefined)) return true;
    if (drillsIn(troupe, newcomers) && drillSeats(desk, [], 1, 0) === undefined) return false;
    return seatsFor(desk, troupe, movingWith(troupe, newcomers), newcomers, true, []) !== undefined;
  };

  const drillsIn = (troupe: Troupe, newcomers: readonly Stand[]): boolean =>
    troupe.company !== undefined &&
    newcomers.some((stand) => {
      const parent = stand.request.sending.leads === true ? parentOf(stand) : undefined;
      return parent !== undefined && companyOf(parent) === troupe.company;
    });

  const seatsFor = (
    desk: Desk,
    troupe: Troupe,
    moving: readonly Stand[],
    joining: readonly Stand[],
    atTheSizeWanted: boolean,
    alsoTaken: readonly ScreenRect[],
    leaving: readonly Stand[] = [],
  ): Seats | undefined => {
    const apart = [...stands.values()].filter(
      (stand) =>
        !stand.returning &&
        !moving.includes(stand) &&
        !joining.includes(stand) &&
        !leaving.includes(stand),
    );
    const written = seatedWhereAsked(desk, joining);
    const seeking = [...moving, ...joining.filter((stand) => !written.has(stand))];
    const drilling = troupe.drill !== undefined;
    const landing = troupePlaces(
      {
        desk,
        arriving: seeking.map((stand) => seekingIn(desk, troupe, stand, moving.includes(stand))),
        standing: [...apart.flatMap(placeOf), ...written.values(), ...alsoTaken],
        shaped: drilling || typeof troupe.shaped !== "object" ? undefined : troupe.shaped.deals,
        atTheSizeWanted,
      },
      moving.length === 0 && !drilling
        ? { asker: "creature", previous: lastLook, random }
        : steadily,
    );
    return landing === undefined ? undefined : { written, seeking, landing };
  };

  const seekingIn = (desk: Desk, troupe: Troupe, stand: Stand, moving: boolean): Seeking => {
    const seeking = seekingOf(stand);
    return {
      ...seeking,
      last: moving ? undefined : placeKept(desk, stand),
      weight: claimOf(troupe, stand),
    };
  };

  const claimOf = (troupe: Troupe, stand: Stand): number => {
    const key = keyOfStand(stand);
    if (troupe.drill === undefined) {
      const leads = typeof troupe.shaped === "object" && troupe.shaped.lead === key;
      return (seekingOf(stand).weight ?? 0) + (leads ? paneWeights.leads : 0);
    }
    const path = pathOf(troupe.drill);
    const rank = path.indexOf(key);
    if (rank !== -1) return paneWeights.leads + path.length - rank;
    return -([...stands.keys()].indexOf(key) + 1) * drillMetrics.orderStep;
  };

  const byClaim = (troupe: Troupe, cast: readonly Stand[]): Stand[] =>
    cast.toSorted((one, other) => claimOf(troupe, other) - claimOf(troupe, one));

  const pathOf = (drill: Drill): string[] => {
    const path: string[] = [];
    let key = drill.children.findLast((child) => stands.has(child.key))?.key;
    while (key !== undefined && !path.includes(key)) {
      path.push(key);
      key = drill.children.find((child) => child.key === path.at(-1))?.parent;
    }
    return path;
  };

  const placeKept = (desk: Desk, stand: Stand): ScreenRect | undefined => {
    const { last, by } = stand.request.sending;
    if (last === undefined || by === "keeper") return last;
    return holdsACard(last) && !overlaps(last, consoleOn(desk)) ? last : undefined;
  };

  const besideTheirParents = (
    desk: Desk,
    troupe: Troupe,
    newcomers: readonly Stand[],
  ): Map<Stand, ScreenRect> => {
    const taken = [...stands.values()]
      .filter((stand) => !newcomers.includes(stand))
      .flatMap(placeOf);
    const seats = new Map<Stand, ScreenRect>();
    for (const stand of newcomers) {
      const parent = troupe.company === undefined ? undefined : parentOf(stand);
      const from = parent === undefined ? undefined : seatOf(parent);
      const { leads, seat } = stand.request.sending;
      if (from === undefined || leads === true || seat !== undefined) continue;
      const beside = besideItsParent(desk, from, stand.request.tenant.kind, [
        ...taken,
        ...seats.values(),
      ]);
      if (beside !== undefined) seats.set(stand, beside);
    }
    return seats;
  };

  const drilledInBy = (troupe: Troupe, newcomers: readonly Stand[]): void => {
    for (const stand of newcomers) {
      const parent = troupe.company === undefined ? undefined : parentOf(stand);
      if (parent === undefined || companyOf(parent) !== troupe.company) continue;
      stand.arisesFrom = keyOfStand(parent);
      if (stand.request.sending.leads === true) drilledDeeper(troupe, stand, parent, newcomers);
    }
  };

  const drilledDeeper = (
    troupe: Troupe,
    child: Stand,
    parent: Stand,
    newcomers: readonly Stand[],
  ): void => {
    const drill = troupe.drill ?? rememberedBeforeTheDrill(troupe, newcomers);
    troupe.drill = drill;
    drill.children = [...drill.children, { key: keyOfStand(child), parent: keyOfStand(parent) }];
  };

  const rememberedBeforeTheDrill = (troupe: Troupe, newcomers: readonly Stand[]): Drill => {
    const cast = castOf(troupe, newcomers);
    return {
      stood: new Map(
        cast.flatMap((stand) => {
          const seat = seatOf(stand);
          return seat === undefined ? [] : [[keyOfStand(stand), seat] as const];
        }),
      ),
      shaped: troupe.shaped,
      composed: new Set(cast.filter((stand) => stand.composed).map(keyOfStand)),
      railed: new Map(),
      children: [],
    };
  };

  const railedByTheDrill = (troupe: Troupe, dropped: readonly Stand[]): void => {
    const { drill } = troupe;
    if (drill === undefined) return;
    for (const stand of dropped) {
      const seat = drill.stood.get(keyOfStand(stand));
      if (seat !== undefined) drill.railed.set(keyOfStand(stand), seat);
    }
  };

  const theDrillTidied = (desk: Desk, troupe: Troupe): void => {
    const { drill } = troupe;
    if (drill === undefined) return;
    drill.children = drill.children.filter((child) => stands.get(child.key)?.returning === false);
    if (drill.children.length === 0) setOutAgain(theDrillEnded(desk, troupe, drill));
  };

  const theDrillEnded = (
    desk: Desk,
    troupe: Troupe,
    drill: Drill,
  ): ReadonlyMap<string, ScreenRect> => {
    troupe.drill = undefined;
    troupe.shaped = drill.shaped;
    troupe.desk = desk;
    const cast = castOf(troupe, []);
    const remembered = cast.filter((stand) => drill.stood.has(keyOfStand(stand)));
    for (const stand of remembered) {
      const seat = drill.stood.get(keyOfStand(stand));
      if (seat !== undefined) headFor(stand, seat, stand.placer);
      stand.composed = drill.composed.has(keyOfStand(stand));
    }
    const joined = cast.filter((stand) => !remembered.includes(stand));
    const fit = fitted(desk, troupe, joined, () => true, 1, [...drill.railed.values()]);
    troupe.turns = fit?.turns ?? [];
    sentBackToTheRail(fit?.dropped ?? joined);
    return cast.length > 0 ? drill.railed : noneComeBack;
  };

  const theDrillShortened = (desk: Desk, troupe: Troupe): void => {
    const ranked = byClaim(troupe, castOf(troupe, []));
    const everyone = (): boolean => true;
    const fit =
      drawnAsADrill(desk, troupe, ranked, everyone, []) ??
      fitted(desk, troupe, ranked, everyone, 1, []);
    troupe.desk = desk;
    troupe.turns = fit?.turns ?? [];
    railedByTheDrill(troupe, fit?.dropped ?? []);
    sentBackToTheRail(fit?.dropped ?? []);
  };

  const drillsEasedBy = (left: readonly Stand[], desk: Desk): Eased[] =>
    [...new Set(left.map(companyOf))].flatMap((company) => {
      const troupe = company === undefined ? undefined : troupes.get(company);
      const drill = troupe?.drill;
      if (troupe === undefined || drill === undefined) return [];
      const leaving = drill.children.filter((child) =>
        left.some((stand) => keyOfStand(stand) === child.key),
      );
      if (leaving.length === 0) return [];
      const retreats = leaving.flatMap((child) => retreatOf(child, left));
      drill.children = drill.children.filter((child) => !leaving.includes(child));
      if (drill.children.length > 0) theDrillShortened(desk, troupe);
      const comingBack =
        drill.children.length > 0 ? noneComeBack : theDrillEnded(desk, troupe, drill);
      return [{ troupe, retreats, comingBack }];
    });

  const retreatOf = (child: DrilledChild, left: readonly Stand[]): Retreat[] => {
    const leaving = stands.get(child.key);
    const parent = stands.get(child.parent);
    if (leaving?.at === undefined || parent?.at === undefined) return [];
    if (!restsOutside(parent) || left.includes(parent)) return [];
    return [{ child: leaving, into: parent.at }];
  };

  const easedAfter = async (left: readonly Stand[]): Promise<void> => {
    const drilled = left.some((stand) =>
      troupes
        .get(companyOf(stand) ?? "")
        ?.drill?.children.some((child) => child.key === keyOfStand(stand)),
    );
    const desk = drilled ? await deskNow() : undefined;
    if (desk === undefined) return;
    const eased = drillsEasedBy(left, desk);
    await Promise.all(eased.map(({ troupe }) => regrouped(troupe)));
    for (const { comingBack } of eased) setOutAgain(comingBack);
  };

  const setOutAgain = (seats: ReadonlyMap<string, ScreenRect>): void => {
    if (seats.size > 0 && !disposed) options.setOutAgain?.(seats);
  };

  const seatsTaken = (seats: Seats, moving: readonly Stand[]): readonly Start[] => {
    const { written, seeking, landing } = seats;
    lastLook = landing.look ?? lastLook;
    seeking.forEach((stand, index) => {
      const place = landing.places[index];
      if (place === undefined || !standsStill(stand)) return;
      headFor(stand, place, moving.includes(stand) ? "console" : stand.placer);
    });
    for (const [stand, place] of written) {
      if (!standsStill(stand)) continue;
      headFor(stand, place, "creature");
      stand.composed = true;
    }
    const turns =
      written.size === 0
        ? landing.arrives
        : inTurn([
            ...[...written.keys()].map((stand) => stand.pane.id),
            ...landing.arrives.map((start) => start.id),
          ]);
    stack = inArrivalOrder(stack, turns.flatMap(keyOf));
    return turns;
  };

  const headFor = (stand: Stand, place: ScreenRect, placer: Placer): void => {
    stand.next = place;
    stand.placer = placer;
    stand.request.tenant.placed(place, "host", placer);
  };

  const takeItsSeat = (stand: Stand): void => {
    stand.at = stand.next ?? stand.at;
    stand.next = undefined;
  };

  const regroupSoon = (troupe: Troupe): Plan[] => {
    const at = now();
    troupe.waitingSince ??= at;
    clearTimeout(troupe.regroups);
    troupe.regroups = setTimeout(
      () => void regrouped(troupe),
      Math.max(0, regroupedBy(troupe.waitingSince, at) - at),
    );
    return [];
  };

  const regrouped = async (troupe: Troupe): Promise<void> => {
    clearTimeout(troupe.regroups);
    troupe.regroups = undefined;
    troupe.waitingSince = undefined;
    const { desk } = troupe;
    const cast = [...stands.values()].filter(
      (stand) =>
        stand.next !== undefined &&
        companyOf(stand) === troupe.company &&
        standsStill(stand) &&
        !stand.returning,
    );
    if (desk === undefined || cast.length === 0) return;
    const moving = cast.filter((stand) => stand.request.shown());
    const entering = cast.filter((stand) => !stand.request.shown());
    const from = moving.flatMap(standingOf);
    const to = moving.flatMap((stand) =>
      stand.next === undefined ? [] : [{ id: stand.pane.id, bounds: stand.next }],
    );
    const stoodBefore = new Map(moving.map((stand) => [keyOfStand(stand), stand.at] as const));
    const parentStood = (stand: Stand): ScreenRect | undefined =>
      stoodBefore.get(stand.arisesFrom ?? "") ?? whereItsParentStands(stand);
    for (const stand of cast) takeItsSeat(stand);
    const pacing = pacingOf(cast);
    const plans = [
      dealPlan(from, to, troupe.turns, options.motion(), pacing),
      ...entrances(desk, entering, troupe.turns, pacing, parentStood),
    ];
    try {
      await Promise.all(plans.map((plan) => staged(plan, isLeaving, appeared)));
      if (cast.length > 1) restack();
    } catch (failure) {
      for (const stand of entering) if (!stand.request.shown()) turnedBack(stand, failure);
    }
  };

  const settle = async (company?: string): Promise<void> => {
    const due = [...troupes.values()].filter(
      (troupe) =>
        troupe.regroups !== undefined && (company === undefined || troupe.company === company),
    );
    await Promise.all(due.map(regrouped));
  };

  const sentBackToTheRail = (unseated: readonly Stand[]): void => {
    const turnedAway = unseated.filter(standsStill);
    for (const stand of turnedAway) {
      comeHome(stand);
      stand.request.tenant.cameHome("no-room");
    }
    if (turnedAway.length > 0) options.noRoom?.(turnedAway.map((stand) => stand.request.tenant));
  };

  const steppedBackToTheRail = (aside: readonly Stand[]): void => {
    const stepping = aside.filter(standsStill);
    for (const stand of stepping) {
      comeHome(stand);
      stand.request.tenant.cameHome("stepped-aside");
    }
    if (stepping.length > 0) options.steppedAside?.(stepping.map((stand) => stand.request.tenant));
  };

  const leaveInTurn = (request: Request): Promise<Stand | undefined> => {
    const { key } = request.tenant;
    const earlier = departing.get(key);
    const mine = Promise.resolve(earlier).then(() => leave(request));
    departing.set(key, mine);
    return mine.finally(() => {
      if (departing.get(key) === mine) departing.delete(key);
    });
  };

  const leave = async (request: Request): Promise<Stand | undefined> => {
    const { tenant } = request;
    if (pending.get(tenant.key) !== request) return undefined;
    const measured = extentOf(tenant.body);
    const warm = runtime.warmWindows() > 0;
    try {
      const pane = await runtime.sendOutside(tenant.body, {
        frame: (mount) => chromeIn(mount, request),
        onClosed: () => closedUnderneath(tenant.key),
      });
      if (pending.get(tenant.key) === request) pending.delete(tenant.key);
      return pane === undefined ? withdrawn(request) : standing(request, pane, warm, measured);
    } catch (refusal) {
      if (pending.get(tenant.key) === request) pending.delete(tenant.key);
      refuse(request, refusal);
      return undefined;
    }
  };

  const standing = (
    request: Request,
    pane: OutsidePane,
    warm: boolean,
    measured: Extent | undefined,
  ): Stand => {
    const stand: Stand = {
      request,
      pane,
      warm,
      measured,
      painted: firstFramePaintedIn(pane.window),
      at: undefined,
      aimedBy: undefined,
      next: undefined,
      arisesFrom: undefined,
      placer: request.sending.by ?? (sentByTheKeeper(request.sending) ? "keeper" : "console"),
      keepers: false,
      composed: false,
      returning: false,
      flights: 0,
    };
    stands.set(request.tenant.key, stand);
    bySurface.set(pane.id, stand);
    request.tenant.left();
    return stand;
  };

  const chromeIn = (mount: HTMLElement, request: Request): OutsideFrame => {
    const { tenant } = request;
    mount.tabIndex = -1;
    const dispose = render(
      () => (
        <SurfaceChrome
          title={tenant.facts().title}
          hueRank={tenant.facts().hueRank}
          state={tenant.facts().state}
          ordinal={tenant.facts().ordinal}
          hint={hintOn(tenant.key)}
          focused={request.focused()}
          shown={request.shown()}
          motion={options.motion()}
          landing={paceOf(request.sending.mood).landing}
          insideHint={options.insideHint()}
          onBringInside={() => tenant.askedInside()}
        >
          {undefined}
        </SurfaceChrome>
      ),
      mount,
    );
    const holder = mount.querySelector<HTMLElement>(chromeBodySelector);
    if (holder !== null) return { holder, dispose };
    dispose();
    throw new Error("the pane's frame outside the window has nowhere to hold it");
  };

  const settleOn = (desk: Desk, landed: readonly Stand[]): readonly Start[] => {
    const others = [...stands.values()].filter((stand) => !landed.includes(stand));
    const written = seatedWhereAsked(desk, landed);
    const seeking = landed.filter((stand) => !written.has(stand));
    const asker = landed.every(sentByACreature) ? "creature" : "keeper";
    const { places, arrives, look } = restingPlaces(
      desk,
      seeking.map(seekingOf),
      [...others.flatMap(placeOf), ...written.values()],
      { asker, previous: lastLook, random },
    );
    lastLook = look ?? lastLook;
    seeking.forEach((stand, index) => {
      const place = places[index];
      if (place !== undefined && standsStill(stand)) putAt(stand, place, stand.placer);
    });
    for (const [stand, place] of written) if (standsStill(stand)) putAt(stand, place, "creature");
    const turns =
      written.size === 0
        ? arrives
        : inTurn([
            ...[...written.keys()].map((stand) => stand.pane.id),
            ...arrives.map((start) => start.id),
          ]);
    stack = inArrivalOrder(stack, turns.flatMap(keyOf));
    return turns;
  };

  const putAt = (stand: Stand, place: ScreenRect, placer: Placer): void => {
    stand.at = place;
    stand.next = undefined;
    stand.placer = placer;
    stand.request.tenant.placed(place, "host", placer);
  };

  const seatedWhereAsked = (desk: Desk, landed: readonly Stand[]): Map<Stand, ScreenRect> => {
    const wishing = landed.filter((stand) => stand.request.sending.seat !== undefined);
    const stage = stageBeside(desk);
    if (wishing.length === 0 || stage === undefined) return new Map();
    const seats = wishing.flatMap((stand) => stand.request.sending.seat ?? []);
    const { deal, kept } = madeSafe({ name: arrangeNotices.composedLook, seats });
    const asking = kept.flatMap((at) => wishing[at] ?? []);
    const way = seatedAsWritten(deal, { desk, arriving: asking.map(wantedAsItStands) }, [stage]);
    return new Map(asking.flatMap((stand) => seatIn(way, stand)));
  };

  const parentOf = (stand: Stand): Stand | undefined => {
    const parent = stands.get(stand.request.sending.from ?? "");
    const stillThere = parent !== undefined && parent !== stand && standsStill(parent);
    return stillThere && !parent.returning ? parent : undefined;
  };

  const planToArise = (desk: Desk, stand: Stand, pacing: Pacing): Plan => {
    const parent = parentOf(stand);
    const from = parent?.at;
    if (parent === undefined || from === undefined) return planToArrive(desk, stand, pacing);
    const apart = [...stands.values()]
      .filter((other) => other !== stand && other !== parent)
      .flatMap(placeOf);
    const beside =
      stand.request.sending.seat === undefined
        ? arisenBeside(desk, from, stand.request.tenant.kind, apart)
        : undefined;
    if (beside !== undefined) putAt(stand, beside, "console");
    else if (stand.request.sending.seat === undefined) return planToArrive(desk, stand, pacing);
    else settleOn(desk, [stand]);
    const [arising] = seatedForReal([stand]);
    return arising === undefined
      ? entrance(desk, [], [], pacing)
      : arisePlan(desk, from, showOf(arising), options.motion(), pacing);
  };

  const planToArrive = (desk: Desk, stand: Stand, pacing: Pacing): Plan =>
    entrance(desk, [stand], settleOn(desk, [stand]), pacing);

  const keyOf = ({ id }: Start): string[] => {
    const stand = bySurface.get(id);
    return stand === undefined ? [] : [stand.request.tenant.key];
  };

  const showOf = (stand: Stand): SurfaceShow => {
    const { tenant, sending } = stand.request;
    const { title, frame } = tenant.facts();
    return {
      id: stand.pane.id,
      bounds: stand.at ?? emptyRect,
      origin: sending.origin,
      focus: sending.focus,
      follows: sending.follows,
      backdrop: options.backdrop(),
      title,
      ...(frame !== undefined && { frame }),
    };
  };

  const appeared = (show: SurfaceShow): void => {
    const stand = bySurface.get(show.id);
    if (stand === undefined) return;
    stand.request.setShown(true);
    if (takesTheKeeperFocus(stand.request.sending)) tookFocus(stand);
    stand.request.settle({
      id: stand.pane.id,
      warm: stand.warm,
      bounds: stand.at ?? show.bounds,
      requestedAt: stand.request.requestedAt,
      shownAt: now(),
      painted: stand.painted,
    });
  };

  const staged = (
    plan: Plan,
    skips: (id: SurfaceId) => boolean,
    shown?: (show: SurfaceShow) => void,
  ): Promise<void> => {
    const flying = aimAt(plan);
    const stale = (id: SurfaceId): boolean => skips(id) || isAimedElsewhere(id, plan);
    const performance = perform(plan, port, { skips: stale, shown });
    performances.add(performance);
    for (const stand of flying) stand.flights += 1;
    return performance.finished.finally(() => {
      performances.delete(performance);
      for (const stand of flying) stand.flights -= 1;
    });
  };

  const aimAt = (plan: Plan): Stand[] => {
    for (const id of subjectsOf(plan)) {
      const stand = bySurface.get(id);
      if (stand !== undefined) stand.aimedBy = plan;
    }
    return plan.cues.flatMap((cue) =>
      cue.kind !== "glide"
        ? []
        : cue.glide.moves.flatMap((move) => {
            const stand = bySurface.get(move.id);
            if (stand === undefined) return [];
            stand.at = move.bounds;
            return [stand];
          }),
    );
  };

  const isAimedElsewhere = (id: SurfaceId, plan: Plan): boolean => {
    const aim = bySurface.get(id)?.aimedBy;
    return aim !== undefined && aim !== plan;
  };

  const isLeaving = (id: SurfaceId): boolean => bySurface.get(id)?.returning !== false;
  const isGone = (id: SurfaceId): boolean => !bySurface.has(id);

  const withdrawn = (request: Request): undefined => {
    request.settle(undefined);
    return undefined;
  };

  const refuse = (request: Request, refusal: unknown): void => {
    request.settle(undefined);
    options.refused(request.tenant, messageOf(refusal));
  };

  const turnedBack = (stand: Stand, failure: unknown): void => {
    if (!standsStill(stand)) return;
    comeHome(stand);
    stand.request.tenant.cameHome("refused");
    refuse(stand.request, failure);
  };

  const withdraw = (key: string): void => {
    const request = pending.get(key);
    if (request === undefined) return;
    pending.delete(key);
    landedNow();
    hold = { ...hold, held: hold.held.filter((held) => held.arrival !== request) };
    runtime.bringInside(request.tenant.body);
    request.settle(undefined);
  };

  const forget = (stand: Stand): void => {
    const { key } = stand.request.tenant;
    stands.delete(key);
    if (bySurface.get(stand.pane.id) === stand) bySurface.delete(stand.pane.id);
    spreadFrom.delete(stand);
    disbandIfLast(stand);
    setHoldingFocus((held) => (held === key ? undefined : held));
    if (stands.size === 0) endHints();
    stand.request.settle(undefined);
    placesChanged("left");
  };

  const disbandIfLast = (stand: Stand): void => {
    const company = companyOf(stand);
    const troupe = company === undefined ? undefined : troupes.get(company);
    if (company === undefined || troupe === undefined) return;
    if ([...stands.values()].some((other) => companyOf(other) === company)) return;
    clearTimeout(troupe.regroups);
    troupes.delete(company);
  };

  const comeHome = (stand: Stand): string => {
    forget(stand);
    runtime.bringInside(stand.pane);
    return stand.request.tenant.key;
  };

  const closedUnderneath = (key: string): void => {
    const stand = stands.get(key);
    if (stand === undefined || leavingWithTheApp) return;
    forget(stand);
    stand.request.tenant.cameHome("closed");
    void easedAfter([stand]);
  };

  const recall = async (keys: readonly string[], mood?: Mood): Promise<readonly string[]> => {
    for (const key of keys) withdraw(key);
    const returning = keys
      .flatMap((key) => stands.get(key) ?? [])
      .filter((stand) => !stand.returning);
    if (returning.length === 0) return [];
    for (const stand of returning) stand.returning = true;
    const heldFocus = returning.some((stand) => stand.request.focused());
    await flownHome(returning, pacingOf([], mood ?? "brisk")).catch(desktopRefused);
    const home = returning.filter(standsStill).map(comeHome);
    if (heldFocus) port.focusConsole().catch(desktopRefused);
    return home;
  };

  const flownHome = async (returning: readonly Stand[], pacing: Pacing): Promise<void> => {
    const desk = await port.desk();
    const eased = drillsEasedBy(returning, desk);
    const retreats = eased.flatMap((drill) => drill.retreats);
    const home = returning.filter((stand) => !retreats.some(({ child }) => child === stand));
    const leaves = inTurn(topFirst(home).map((stand) => stand.pane.id));
    const motion = options.motion();
    const plans = [
      recallPlan(desk, home.flatMap(standingOf), leaves, motion, pacing),
      ...retreats.flatMap(({ child, into }) =>
        standingOf(child).map((leaving) => retreatPlan(desk, into, leaving, motion, pacing)),
      ),
    ];
    await Promise.all([
      ...plans.map((plan) => staged(plan, isGone)),
      ...eased.map(({ troupe }) => regrouped(troupe)),
    ]);
    for (const { comingBack } of eased) setOutAgain(comingBack);
  };

  const topFirst = (leaving: readonly Stand[]): Stand[] => {
    const height = (stand: Stand): number => stack.indexOf(stand.request.tenant.key);
    return leaving.toSorted((one, other) => height(other) - height(one));
  };

  const toggleSpread = async (): Promise<SpreadVerdict> => {
    if (resting().length === 0) return "nothing-outside";
    const desk = await deskNow();
    if (desk === undefined) return "desktop-refused";
    await settle();
    const still = resting();
    if (spreadFrom.size > 0) return gathered(still);
    const spreading = still.filter(
      (stand) => stand.at !== undefined && !fillsADisplay(desk, stand.at),
    );
    if (spreading.length === 0) return "nothing-to-spread";
    for (const stand of spreading) if (stand.at !== undefined) spreadFrom.set(stand, stand.at);
    glidingTo(spreadPlan(desk, spreading.flatMap(standingOf), options.motion()));
    showHints();
    return "spread";
  };

  const gathered = (still: readonly Stand[]): SpreadVerdict => {
    const back = still.flatMap((stand) => {
      const bounds = spreadFrom.get(stand);
      return bounds === undefined ? [] : [{ id: stand.pane.id, bounds }];
    });
    spreadFrom.clear();
    endHints();
    glidingTo(movePlan(still.flatMap(standingOf), back, options.motion()));
    return "gathered";
  };

  const deal = async (): Promise<DealVerdict> => {
    if (resting().length === 0) return "nothing-outside";
    const desk = await deskNow();
    if (desk === undefined) return "desktop-refused";
    await settle();
    const dealing = freeOfTheirDisplay(desk);
    const dealt = nextDeal({ desk, arriving: dealing.flatMap(dealtIn) }, lastLook);
    if (dealt === undefined) return "nothing-to-deal";
    seatedAs(dealt.way, dealing, "keeper", "keeper");
    for (const stand of dealing) {
      stand.keepers = false;
      stand.composed = false;
    }
    return { name: dealt.way.look, turn: dealt.turn, of: dealt.of };
  };

  const compose = async (authored: Authored): Promise<ComposeVerdict> => {
    if (resting().length === 0) return "nothing-outside";
    const desk = await deskNow();
    if (desk === undefined) return "desktop-refused";
    await settle();
    const theKeepers = freeOfTheirDisplay(desk).filter(isTheKeepers);
    const free = freeOfTheirDisplay(desk).filter((stand) => !isTheKeepers(stand));
    const { deal: safe, said } = madeSafe(authored);
    if (free.length === 0) return { refused: "nothing-free", said };
    if (safe.seats.length < free.length) return { refused: "too-few-seats", said };
    const arriving = free.flatMap(dealtIn);
    const way = composed(safe, { desk, arriving, standing: theKeepers.flatMap(placeOf) });
    if (way === undefined) return { refused: "no-room", said };
    seatedAs(way, free, "host", "creature");
    for (const stand of free) stand.composed = true;
    return { name: safe.name, said };
  };

  const arrange = async (asked: Arranging): Promise<Arranged | "desktop-refused"> => {
    await haveLanded(asked.keys);
    const entering = asked.keys
      .flatMap((key) => stands.get(key) ?? [])
      .filter(awaitsItsArrangement);
    const standing = await deskNow();
    if (standing === undefined) {
      sentBackToTheRail(entering);
      return "desktop-refused";
    }
    await settle();
    const named = asked.keys
      .flatMap((key) => stands.get(key) ?? [])
      .filter((stand) => restsOutside(stand) || entering.includes(stand));
    const movable = named.filter(
      (stand) =>
        entering.includes(stand) || (stand.at !== undefined && !fillsADisplay(standing, stand.at)),
    );
    const free = movable.filter((stand) => stand.placer !== "keeper");
    const lead =
      free.find((stand) => keyOfStand(stand) === asked.lead) ??
      free.find((stand) => stand.request.sending.leads === true);
    const inTheirOrder = leadFirst(free, lead);
    const mates = troupeMatesOf(free);
    const apart = resting()
      .filter((stand) => !free.includes(stand) && !mates.includes(stand))
      .flatMap(placeOf);
    const dealing: Dealing = { apart, over: asked.over, led: lead !== undefined };
    const seatingOn = (desk: Desk): Seating =>
      asked.instruction.kind === "written"
        ? writtenOnto(desk, asked.instruction.seats, free, dealing)
        : dealtAsManyAsFit(desk, asked.instruction, inTheirOrder, dealing);
    const holdsThemAll = (candidate: Desk): boolean =>
      asked.instruction.kind === "written"
        ? stageBeside(candidate) !== undefined
        : asItWasAsked(candidate, asked.instruction, inTheirOrder, dealing) !== undefined;
    const desk =
      asked.over === "display" || free.length === 0
        ? standing
        : await deskWithRoom(standing, free.map(companyOf)[0], holdsThemAll);
    const seating = seatingOn(desk);
    const seated = seating.way === undefined ? [] : seating.arriving;
    const dealt = asked.instruction.kind === "dealt" && seating.way !== undefined;
    const leftOut = free.filter(
      (stand) => !seated.includes(stand) && (dealt || entering.includes(stand)),
    );
    const aside = steppedAside(desk, seating.way, mates, apart);
    const letGo = seating.way !== undefined && drilling(seated);
    if (seating.way !== undefined) {
      const pacing = pacingOf(seated, asked.mood ?? "brisk", lead?.pane.id);
      const moving = seated.filter((stand) => !entering.includes(stand));
      seatedAs(wayOf(seating.way, moving), moving, "host", "creature", pacing);
      enteringAs(
        seating.way,
        seated.filter((stand) => entering.includes(stand)),
        desk,
        pacing,
      );
      arrangedAs(asked, seated);
      takenAside(aside, pacing);
    }
    sentBackToTheRail(leftOut);
    steppedBackToTheRail(aside.back);
    return {
      look: seating.way?.look,
      stands: seating.way?.stands,
      seated: seated.map(keyOfStand),
      authored: seating.authored.map(keyOfStand),
      keepers: movable.filter((stand) => stand.placer === "keeper").map(keyOfStand),
      unseated: leftOut.map(keyOfStand),
      aside: aside.cards.map(keyOfStand),
      backBeside: aside.back.map(keyOfStand),
      said: seating.said,
      letGo,
    };
  };

  const drilling = (seated: readonly Stand[]): boolean =>
    seated.some((stand) => troupes.get(companyOf(stand) ?? "")?.drill !== undefined);

  const wayOf = (way: Way, moving: readonly Stand[]): Way => {
    const moves = ({ id }: { readonly id: SurfaceId }): boolean =>
      moving.some((stand) => stand.pane.id === id);
    return { ...way, seats: way.seats.filter(moves), arrives: way.arrives.filter(moves) };
  };

  const troupeMatesOf = (free: readonly Stand[]): Stand[] => {
    const companies = new Set(free.flatMap((stand) => companyOf(stand) ?? []));
    return resting().filter(
      (stand) =>
        !free.includes(stand) &&
        sentByACreature(stand) &&
        stand.placer !== "keeper" &&
        stand.at !== undefined &&
        companies.has(companyOf(stand) ?? ""),
    );
  };

  const steppedAside = (
    desk: Desk,
    way: Way | undefined,
    mates: readonly Stand[],
    apart: readonly ScreenRect[],
  ): Aside => {
    const seats = (way?.seats ?? []).map((seat) => seat.bounds);
    const covers = (stand: Stand): boolean =>
      stand.at !== undefined && seats.some((seat) => overlaps(seat, stand.at as ScreenRect));
    const covered = mates.filter(covers);
    const taken = [...apart, ...seats, ...mates.filter((mate) => !covers(mate)).flatMap(placeOf)];
    for (let count = covered.length; count > 0; count -= 1) {
      const cards = covered.slice(0, count);
      const landing = troupePlaces(
        { desk, arriving: cards.map(asACard), standing: taken },
        steadily,
      );
      if (landing !== undefined) return { cards, landing, back: covered.slice(count) };
    }
    return { cards: [], landing: undefined, back: covered };
  };

  const takenAside = ({ cards, landing }: Aside, pacing: Pacing): void => {
    if (landing === undefined) return;
    const seats = cards.flatMap((stand, at) => {
      const bounds = landing.places[at];
      return bounds === undefined ? [] : [{ stand, bounds }];
    });
    glidingTo(
      dealPlan(
        cards.flatMap(standingOf),
        seats.map(({ stand, bounds }) => ({ id: stand.pane.id, bounds })),
        landing.arrives,
        options.motion(),
        pacing,
      ),
    );
    for (const { stand, bounds } of seats) {
      stand.placer = "console";
      stand.composed = false;
      stand.next = undefined;
      stand.request.tenant.placed(bounds, "host", "console");
    }
  };

  const arrangedAs = (asked: Arranging, seated: readonly Stand[]): void => {
    const { instruction } = asked;
    const shaped: Troupe["shaped"] =
      instruction.kind === "written" ? "by-hand" : { deals: instruction.deals, lead: asked.lead };
    for (const stand of seated) stand.composed = instruction.kind === "written";
    for (const company of new Set(seated.map(companyOf))) {
      const troupe = troupeOf(company);
      troupe.shaped = shaped;
      troupe.drill = undefined;
    }
  };

  const writtenOnto = (
    desk: Desk,
    seats: readonly Written[],
    free: readonly Stand[],
    { apart, over }: Dealing,
  ): Seating => {
    const authored = seats.flatMap(({ key, share }) => {
      const stand = free.find((candidate) => keyOfStand(candidate) === key);
      return stand === undefined ? [] : [{ stand, share }];
    });
    const { deal, kept, said } = madeSafe({
      name: arrangeNotices.composedLook,
      seats: authored.map(({ share }) => share),
    });
    const arriving = kept.flatMap((at) => authored[at]?.stand ?? []);
    const stage = over === "display" ? wholeDisplay(desk) : stageBeside(desk);
    const asWritten =
      arriving.length === 0 || stage === undefined
        ? undefined
        : seatedAsWritten(deal, { desk, arriving: arriving.map(wantedAsItStands) }, [stage]);
    const numbered = (id: SurfaceId): number =>
      authored.findIndex(({ stand }) => stand.pane.id === id) + 1;
    const cleared = asWritten === undefined ? undefined : clearedOf(asWritten, apart, numbered);
    const way = cleared?.way.seats.length === 0 ? undefined : cleared?.way;
    const noRoom = asWritten === undefined && arriving.length > 0;
    return {
      way,
      arriving: arriving.filter((stand) => seatIn(way, stand).length > 0),
      authored: authored.map(({ stand }) => stand),
      said: [...said, ...(cleared?.said ?? []), ...(noRoom ? [arrangeNotices.noRoom] : [])],
    };
  };

  const clearedOf = (
    way: Way,
    apart: readonly ScreenRect[],
    numbered: (id: SurfaceId) => number,
  ): Cleared => {
    const cuts = way.seats.map((seat) => ({ seat, cut: cutBackToClear(seat.bounds, apart) }));
    const seats = cuts.flatMap(({ seat, cut }) =>
      cut === undefined ? [] : [{ id: seat.id, bounds: cut }],
    );
    const said = cuts.flatMap(({ seat, cut }) => {
      if (cut === undefined) return [arrangeNotices.leftOut(numbered(seat.id))];
      return sameRect(cut, seat.bounds) ? [] : [arrangeNotices.cutBack(numbered(seat.id))];
    });
    const arrives = way.arrives.filter((start) => seats.some((seat) => seat.id === start.id));
    return { way: { ...way, seats, arrives }, said };
  };

  const asItWasAsked = (
    desk: Desk,
    instruction: Extract<Instruction, { kind: "dealt" }>,
    arriving: readonly Stand[],
    dealing: Dealing,
  ): Way | undefined =>
    dealtOnto(desk, instruction.deals(arriving.length).slice(0, 1), arriving, {
      ...dealing,
      over: "room",
    });

  const dealtAsManyAsFit = (
    desk: Desk,
    instruction: Extract<Instruction, { kind: "dealt" }>,
    inTheirOrder: readonly Stand[],
    dealing: Dealing,
  ): Seating => {
    for (let count = inTheirOrder.length; count > 0; count -= 1) {
      const arriving = inTheirOrder.slice(0, count);
      const way = dealtOnto(desk, instruction.deals(count), arriving, dealing);
      if (way !== undefined) return { way, arriving, authored: [], said: [] };
    }
    const noRoom = inTheirOrder.length > 0;
    return {
      way: undefined,
      arriving: [],
      authored: [],
      said: noRoom ? [arrangeNotices.noRoom] : [],
    };
  };

  const dealtOnto = (
    desk: Desk,
    groups: readonly (readonly Deal[])[],
    arriving: readonly Stand[],
    { apart, over, led }: Dealing,
  ): Way | undefined => {
    const wanted = arriving.map(wantedAsItStands);
    const waysOn = (
      grounds: readonly Ground[],
      standing: readonly ScreenRect[],
    ): readonly Way[] | undefined =>
      firstFound(groups, (deals) => {
        const ways = deals.flatMap(
          (deal) => seatedAsWritten(deal, { desk, arriving: wanted, standing, led }, grounds) ?? [],
        );
        return ways.length > 0 ? ways : undefined;
      });
    const ways =
      over === "display"
        ? (waysOn([wholeDisplay(desk)], apart) ?? waysOn([wholeDisplay(desk)], []))
        : waysOn(roomsToDealOn(desk, apart), apart);
    return chosenWay(ways ?? [], { asker: "creature", previous: lastLook }, random);
  };

  const freeOfTheirDisplay = (desk: Desk): Stand[] =>
    resting().filter((stand) => stand.at !== undefined && !fillsADisplay(desk, stand.at));

  const isTheKeepers = (stand: Stand): boolean =>
    stand.keepers || holdingFocus() === stand.request.tenant.key;

  const seatedAs = (
    way: Way,
    dealing: readonly Stand[],
    by: SurfaceMover,
    placer: Placer,
    pacing?: Pacing,
  ): void => {
    lastLook = way.look;
    spreadFrom.clear();
    endHints();
    glidingTo(
      dealPlan(dealing.flatMap(standingOf), way.seats, way.arrives, options.motion(), pacing),
    );
    for (const stand of dealing) {
      stand.placer = placer;
      stand.next = undefined;
    }
    for (const seat of way.seats) {
      bySurface.get(seat.id)?.request.tenant.placed(seat.bounds, by, placer);
    }
    placesChanged("moved");
  };

  const dealtIn = (stand: Stand): Wanted[] => {
    const { tenant } = stand.request;
    const weight = weightOf(tenant.facts().state, holdingFocus() === tenant.key);
    return stand.at === undefined ? [] : [{ id: stand.pane.id, size: stand.at, weight }];
  };

  const glidingTo = (plan: Plan): void => {
    staged(plan, isLeaving).catch(desktopRefused);
  };

  const showHints = (): boolean => {
    const hints = hintsFor(resting().flatMap(hintedOf));
    if (hints.size > 0) setHinting({ hints, typed: "" });
    return hints.size > 0;
  };

  const endHints = (): void => {
    setHinting(undefined);
  };

  const toggleHints = (): HintsVerdict => {
    if (hinting() === undefined) return showHints() ? "shown" : "nothing-outside";
    endHints();
    return "hidden";
  };

  const hintOn = (key: string): string | undefined => {
    const shown = hinting();
    return shown === undefined ? undefined : hintLeft(shown.hints.get(key), shown.typed);
  };

  const pickHint = (letters: readonly string[]): string | undefined => {
    const shown = hinting();
    if (shown === undefined) return undefined;
    const step = letters
      .map((letter) => hintTyped(shown.hints, shown.typed, letter))
      .find((reached) => reached.kind !== "missed");
    if (step?.kind === "narrowed") {
      setHinting({ ...shown, typed: step.typed });
      return undefined;
    }
    endHints();
    if (step?.kind !== "picked") return undefined;
    if (spreadFrom.size > 0) gathered(resting());
    return step.key;
  };

  const focus = (key: string): void => {
    const stand = stands.get(key);
    if (stand === undefined || !restsOutside(stand)) return;
    raise(stand);
    unlessTheyLeft([stand], port.focus(stand.pane.id));
  };

  const sendBehind = (key: string): string | undefined => {
    const stand = stands.get(key);
    const others = stacked().filter((other) => other !== stand);
    if (stand === undefined || others.length === 0) return undefined;
    stack = lowered(stack, key);
    restack();
    return others.at(-1)?.request.tenant.key;
  };

  const reshaped = async (key: string, shape: Shape): Promise<Reshaped> => {
    if (!stands.has(key)) return "not-outside";
    const desk = await deskNow();
    if (desk === undefined) return "desktop-refused";
    const stand = stands.get(key);
    const at = stand?.at;
    if (stand === undefined || at === undefined || !restsOutside(stand)) return "not-outside";
    const others = resting().filter((other) => other !== stand);
    const to = shape(desk, at, stand.request.tenant.kind, others.flatMap(placeOf));
    if (to === undefined) return "fills-its-display";
    if (sameRect(at, to)) return "stays";
    const { id } = stand.pane;
    spreadFrom.delete(stand);
    glidingTo(movePlan([{ id, bounds: at }], [{ id, bounds: to }], options.motion()));
    stand.next = undefined;
    stand.keepers = true;
    stand.composed = false;
    stand.placer = "keeper";
    stand.request.tenant.placed(to, "keeper", "keeper");
    placesChanged("moved");
    return "moved";
  };

  const standings = (): ReadonlyMap<string, Placed> =>
    new Map(
      [...stands.values()]
        .filter((stand) => standsStill(stand) && !stand.returning)
        .flatMap((stand) => {
          const seat = seatOf(stand);
          return seat === undefined
            ? []
            : [[keyOfStand(stand), { bounds: seat, by: stand.placer }] as const];
        }),
    );

  const places = (): ReadonlyMap<string, ScreenRect> =>
    new Map(
      resting().flatMap((stand) =>
        stand.at === undefined ? [] : [[stand.request.tenant.key, stand.at] as const],
      ),
    );

  const movedTo = (stand: Stand, bounds: ScreenRect, by: SurfaceMover): void => {
    if (by === "host" && stand.flights > 0) return;
    stand.at = bounds;
    if (by === "keeper") putByHand(stand);
    if (!spreadFrom.has(stand) && !stand.returning) {
      stand.request.tenant.placed(bounds, by, stand.placer);
    }
    if (by === "keeper") placesChanged("moved");
  };

  const putByHand = (stand: Stand): void => {
    spreadFrom.delete(stand);
    stand.aimedBy = theKeepersHand;
    stand.next = undefined;
    stand.keepers = true;
    stand.composed = false;
    stand.placer = "keeper";
    troupes.get(companyOf(stand) ?? "")?.drill?.stood.delete(keyOfStand(stand));
  };

  const heard = (event: SurfaceEvent): void => {
    const stand = bySurface.get(event.id);
    if (stand === undefined) return;
    if (event.kind === "moved") movedTo(stand, event.bounds, event.by);
    else if (event.kind === "focused") tookFocus(stand);
    else if (event.kind === "blurred") lostFocus(stand);
  };

  const tookFocus = (stand: Stand): void => {
    if (stand.returning) return;
    stack = raised(stack, stand.request.tenant.key);
    stand.request.setFocused(true);
    setHoldingFocus(stand.request.tenant.key);
    stand.request.tenant.tookFocus?.();
  };

  const lostFocus = (stand: Stand): void => {
    const { key } = stand.request.tenant;
    stand.request.setFocused(false);
    setHoldingFocus((held) => (held === key ? undefined : held));
    stand.request.tenant.lostFocus?.();
  };

  const stopHearing = port.onEvent(heard);
  const stopListening = listenForKeys(keeperIsTyping);
  const warming = setTimeout(() => runtime.warm(), 0);

  return {
    holdingFocus,
    hinting: () => hinting() !== undefined,
    send,
    recall,
    toggleSpread,
    deal,
    compose,
    arrange,
    settle,
    standings,
    toggleHints,
    pickHint,
    endHints,
    focus,
    sendBehind,
    stepAcross: (key, direction) => reshaped(key, acrossTheGrid(direction)),
    stepSize: (key, step) => reshaped(key, alongTheSizes(step)),
    places,
    desk: deskNow,
    has,
    keyAt: (node) => {
      const pane = runtime.outsidePaneOf(node);
      return pane === undefined ? undefined : bySurface.get(pane.id)?.request.tenant.key;
    },
    gone: (key) => {
      withdraw(key);
      const stand = stands.get(key);
      if (stand === undefined) return;
      comeHome(stand);
      void easedAfter([stand]);
    },
    dispose: () => {
      disposed = true;
      clearTimeout(release);
      clearTimeout(seating);
      clearTimeout(warming);
      for (const troupe of troupes.values()) clearTimeout(troupe.regroups);
      for (const performance of performances) performance.cancel();
      window.removeEventListener("pagehide", leaveWithTheApp);
      stopHearingTheAppLeave?.();
      stopHearing();
      stopListening();
      runtime.dispose();
      for (const stand of [...stands.values()]) forget(stand);
      for (const key of [...pending.keys()]) withdraw(key);
    },
  };
}

interface Request {
  readonly tenant: Tenant;
  readonly sending: Sending;
  readonly origin: SurfaceOrigin;
  readonly requestedAt: number;
  readonly shown: Accessor<boolean>;
  readonly setShown: Setter<boolean>;
  readonly focused: Accessor<boolean>;
  readonly setFocused: Setter<boolean>;
  settle(arrived: Arrived | undefined): void;
}

interface Stand {
  readonly request: Request;
  readonly pane: OutsidePane;
  readonly warm: boolean;
  readonly measured: Extent | undefined;
  readonly painted: Promise<number>;
  at: ScreenRect | undefined;
  next: ScreenRect | undefined;
  arisesFrom: string | undefined;
  aimedBy: Plan | typeof theKeepersHand | undefined;
  placer: Placer;
  keepers: boolean;
  composed: boolean;
  returning: boolean;
  flights: number;
}

interface Troupe {
  readonly company: string | undefined;
  shaped: Shaped | "by-hand" | undefined;
  drill: Drill | undefined;
  desk: Desk | undefined;
  turns: readonly Start[];
  waitingSince: number | undefined;
  regroups: ReturnType<typeof setTimeout> | undefined;
}

interface Shaped {
  readonly deals: DealsFor;
  readonly lead: string | undefined;
}

interface Seats {
  readonly written: ReadonlyMap<Stand, ScreenRect>;
  readonly seeking: readonly Stand[];
  readonly landing: Landing;
}

interface Fitted {
  readonly kept: readonly Stand[];
  readonly dropped: readonly Stand[];
  readonly turns: readonly Start[];
}

interface Drill {
  readonly stood: Map<string, ScreenRect>;
  readonly shaped: Troupe["shaped"];
  readonly composed: ReadonlySet<string>;
  readonly railed: Map<string, ScreenRect>;
  children: readonly DrilledChild[];
}

interface DrilledChild {
  readonly key: string;
  readonly parent: string;
}

interface Retreat {
  readonly child: Stand;
  readonly into: ScreenRect;
}

interface Eased {
  readonly troupe: Troupe;
  readonly retreats: readonly Retreat[];
  readonly comingBack: ReadonlyMap<string, ScreenRect>;
}

interface Dealing {
  readonly apart: readonly ScreenRect[];
  readonly over: Arranging["over"];
  readonly led: boolean;
}

interface Aside {
  readonly cards: readonly Stand[];
  readonly landing: Landing | undefined;
  readonly back: readonly Stand[];
}

interface Cleared {
  readonly way: Way;
  readonly said: readonly string[];
}

interface Company {
  readonly stands: readonly Stand[];
  readonly since: number;
  readonly desk: Promise<Desk>;
}

interface Seating {
  readonly way: Way | undefined;
  readonly arriving: readonly Stand[];
  readonly authored: readonly Stand[];
  readonly said: readonly string[];
}

interface Hinting {
  readonly hints: Hints<string>;
  readonly typed: string;
}

type Shape = (
  desk: Desk,
  at: ScreenRect,
  kind: OutsideKind,
  others: readonly ScreenRect[],
) => ScreenRect | undefined;

function acrossTheGrid(direction: Direction): Shape {
  return (desk, at, _kind, others) =>
    fillsADisplay(desk, at) ? undefined : steppedOnGrid(desk, at, direction, others);
}

function alongTheSizes(step: number): Shape {
  return (desk, at, kind) =>
    fillsADisplay(desk, at) && !standsFull(desk, at)
      ? undefined
      : steppedAlongLadder(desk, at, kind, step);
}

const chromeBodySelector = ".kw-surface-body";

const theKeepersHand = Symbol("the keeper's hand");

const emptyRect: ScreenRect = { x: 0, y: 0, width: 0, height: 0 };

const noneComeBack: ReadonlyMap<string, ScreenRect> = new Map();

const drillMetrics = { orderStep: 0.001 } as const;

function takesTheKeeperFocus(sending: Sending): boolean {
  return sending.origin === "keeper" && sending.focus;
}

function sentByTheKeeper(sending: Sending): boolean {
  return sending.origin === "keeper";
}

function keyOfStand(stand: Stand): string {
  return stand.request.tenant.key;
}

function companyOf(stand: Stand): string | undefined {
  return stand.request.sending.company;
}

function seatOf(stand: Stand): ScreenRect | undefined {
  return stand.next ?? stand.at;
}

function hasARealSeat(stand: Stand): boolean {
  const { at } = stand;
  if (at === undefined || at.width <= 0 || at.height <= 0) return false;
  return !sentByACreature(stand) || stand.placer === "keeper" || holdsACard(at);
}

function asACard(stand: Stand): Seeking {
  return {
    id: stand.pane.id,
    kind: stand.request.tenant.kind,
    measured: undefined,
    last: undefined,
    wanted: "card",
    weight: 0,
  };
}

function leadFirst(free: readonly Stand[], lead: Stand | undefined): readonly Stand[] {
  return lead === undefined ? free : [lead, ...free.filter((stand) => stand !== lead)];
}

function wantedAsItStands(stand: Stand): Wanted {
  return { id: stand.pane.id, size: stand.at ?? stand.measured ?? emptyRect };
}

function seatIn(way: Way | undefined, stand: Stand): Array<readonly [Stand, ScreenRect]> {
  const seat = way?.seats.find((candidate) => candidate.id === stand.pane.id);
  return seat === undefined ? [] : [[stand, seat.bounds]];
}

function shownWithoutFocusByTheKeeper(stand: Stand): boolean {
  const { origin, focus } = stand.request.sending;
  return origin === "keeper" && !focus;
}

function subjectsOf(plan: Plan): SurfaceId[] {
  return plan.cues.flatMap((cue) => {
    if (cue.kind === "glide") return cue.glide.moves.map((move) => move.id);
    return cue.kind === "show" ? [cue.show.id] : [cue.id];
  });
}

function sentByACreature(stand: Stand): boolean {
  return stand.request.sending.origin === "creature";
}

function inArrivalOrder(stack: readonly string[], arrival: readonly string[]): string[] {
  const arriving = arrival.filter((key) => stack.includes(key));
  const places = stack.flatMap((key, at) => (arriving.includes(key) ? [at] : []));
  return stack.map((key, at) => arriving[places.indexOf(at)] ?? key);
}

function hintedOf(stand: Stand): Hinted<string>[] {
  return stand.at === undefined ? [] : [{ key: stand.request.tenant.key, bounds: stand.at }];
}

function seekingOf(stand: Stand): Seeking {
  const { tenant, sending } = stand.request;
  return {
    id: stand.pane.id,
    kind: tenant.kind,
    measured: stand.measured,
    last: sending.last,
    wanted: sending.size,
    weight: sending.weight ?? weightOf(tenant.facts().state, takesTheKeeperFocus(sending)),
  };
}

function standingOf(stand: Stand): Standing[] {
  return stand.at === undefined ? [] : [{ id: stand.pane.id, bounds: stand.at }];
}

function placeOf(stand: Stand): ScreenRect[] {
  const seat = seatOf(stand);
  return seat === undefined ? [] : [seat];
}

function extentOf(body: HTMLElement): Extent | undefined {
  const { width, height } = body.getBoundingClientRect();
  return width > 0 && height > 0 ? { width, height } : undefined;
}

// A promise that fails before anything awaits it is reported as unhandled, though its await
// still receives the failure; this only marks it as one that will be awaited.
function askedAhead<Answer>(request: Promise<Answer>): Promise<Answer> {
  request.catch(() => undefined);
  return request;
}

function messageOf(refusal: unknown): string {
  return refusal instanceof Error ? refusal.message : String(refusal);
}
