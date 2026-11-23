import type { ConsoleClient, ServerFeed } from "@keywork-app/client";
import { fromOf, originOf, placeOf, stillShown, type YardSetting } from "@keywork-app/habitat";
import type {
  Arrangement,
  ArrangementAnswer,
  BusEnvelope,
  KeeperShowOutcome,
  Mood,
  Setting,
  SettingSize,
  SettingWeight,
} from "@keywork-app/protocol";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from "solid-js";
import type { PaneId } from "../layout/index.ts";
import { settingShownBy, settingSpecOf } from "../panes/setting/index.tsx";
import { dealsToTry } from "../surfaces/feel/arrangements.ts";
import type { SizeName } from "../surfaces/outside/grid.ts";
import type {
  Arranged,
  CameHome,
  Instruction,
  Placed,
  PlacesChange,
  Sending,
} from "../surfaces/outside/panes-outside.tsx";
import { paneWeights } from "../surfaces/outside/resting.ts";
import {
  roomOf,
  seatOnTheLattice,
  shareOnTheStage,
  stageHolding,
} from "../surfaces/outside/stage.ts";
import type { Desk, ScreenRect } from "../surfaces/port.ts";
import { reaches } from "../yard/layout.ts";
import { titleOfSetting } from "../yard/satellites.ts";
import type { OutsidePanes } from "./outside-panes.ts";
import {
  arrangementSaid,
  placementsReport,
  reportMetrics,
  toldWords,
  type Whereabouts,
} from "./placements.ts";
import type { Tiler } from "./tiler.ts";

export type PlacementsClient = Pick<ConsoleClient, "reportPlacements">;

export interface SettingPanesSeams {
  readonly tiler: Tiler;
  readonly outside: OutsidePanes;
  settings(): readonly YardSetting[];
  feeds(): readonly Pick<ServerFeed, "subscribe">[];
  listed(): Promise<readonly Setting[] | undefined>;
  clientOf(setting: YardSetting): PlacementsClient;
  answer(setting: YardSetting, outcome: KeeperShowOutcome): void;
  unfoldsBeside(): boolean;
  crowds(): boolean;
  opensOutside?(): boolean;
  readonly storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  readonly storageKey?: string | undefined;
}

export interface SettingPanes {
  readonly beside: Accessor<readonly YardSetting[]>;
  leavesTheYard(setting: Pick<Setting, "id">): boolean;
  closing(pane: PaneId): void;
  placesChanged(what: PlacesChange): void;
  backOnTheRail(pane: PaneId, why: CameHome): boolean;
  putAway(pane: PaneId): boolean;
  setOutAgain(seats: ReadonlyMap<PaneId, ScreenRect>): void;
  setOutByHand(setting: YardSetting): boolean;
  restore(): Promise<void>;
}

export type Leaving = "asked" | "arranged" | "returned" | "grown" | "crowds" | "opened";

export const replacementGraceMs = 80;

export const sizeNamed: Readonly<Record<SettingSize, SizeName>> = {
  card: "card",
  readable: "reading",
  working: "working",
};

export const weightNamed: Readonly<Record<SettingWeight, number>> = {
  lead: paneWeights.leads,
  support: 0,
  aside: -1,
};

export function createSettingPanes(seams: SettingPanesSeams): SettingPanes {
  const { tiler, outside } = seams;
  const remembered = railRememberedBy(seams);
  const putAwayByTheKeeper = new Set(remembered.putAway);
  const foundNoRoom = new Set(remembered.noRoom);
  const steppedBack = new Set<string>();
  const [arrangedOut, setArrangedOut] = createSignal<ReadonlySet<string>>(new Set());
  const [keptBeside, setKeptBeside] = createSignal<ReadonlySet<string>>(
    new Set([...putAwayByTheKeeper, ...foundNoRoom]),
  );
  const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set());
  const opening = new Map<string, Promise<PaneId | undefined>>();
  const departing = new Map<string, ReturnType<typeof setTimeout>>();
  const moods = new Map<string, Mood>();
  const railedFrom = new Map<PaneId, string>();
  const clients = new Map<string, PlacementsClient>();
  const sent = new Map<string, string>();
  let due: ReturnType<typeof setTimeout> | undefined;

  const paneOf = (id: string | null | undefined): PaneId | undefined => {
    tiler.version();
    return id == null ? undefined : tiler.findPane((spec) => settingShownBy(spec)?.id === id);
  };
  const standsOutside = (id: string | null | undefined): boolean => {
    const pane = paneOf(id);
    return pane !== undefined && tiler.isOutside(pane);
  };
  const settingOf = (id: string | undefined): YardSetting | undefined =>
    seams.settings().find((setting) => setting.id === id);

  const reasonToLeave = (setting: YardSetting): Leaving | undefined => {
    if (!outside.reachesOutside) return undefined;
    if (arrangedOut().has(setting.id)) return "arranged";
    const keepers = originOf(setting) === "keeper";
    if (!keepers && setting.where === "outside") return "asked";
    if (keepers && standsOutside(fromOf(setting))) return "grown";
    const unfolds = seams.unfoldsBeside() && reaches(setting.shown, "unfold");
    if (unfolds && seams.opensOutside?.() === true) return "crowds";
    return unfolds && untrack(seams.crowds) ? "crowds" : undefined;
  };

  const leaving = createMemo<ReadonlyMap<string, Leaving>>(
    (held) => {
      const stay = keptBeside();
      return new Map(
        seams.settings().flatMap((setting) => {
          const why = stay.has(setting.id)
            ? undefined
            : (held.get(setting.id) ?? reasonToLeave(setting));
          return why === undefined ? [] : [[setting.id, why] as const];
        }),
      );
    },
    new Map(),
    { equals: sameEntries },
  );

  const drawnElsewhere = (setting: Pick<Setting, "id">): boolean =>
    leaving().has(setting.id) || dismissed().has(setting.id) || paneOf(setting.id) !== undefined;

  const beside = createMemo<readonly YardSetting[]>(
    () => seams.settings().filter((setting) => !drawnElsewhere(setting)),
    [],
    { equals: sameItems },
  );

  const sendingOf = (setting: YardSetting, why: Leaving, last?: ScreenRect): Sending => {
    const byHand = why === "opened" || setting.unfolded?.byHand === true;
    const keepers = originOf(setting) === "keeper" || byHand;
    const parent = paneOf(fromOf(setting));
    const { seat, size, weight } = setting;
    return {
      origin: keepers ? "keeper" : "creature",
      focus: keepers,
      follows: true,
      last,
      company: setting.sessionId,
      seat: why === "asked" && seat !== undefined ? shareOnTheStage(seat) : undefined,
      size: size === undefined ? undefined : sizeNamed[size],
      weight: weight === undefined ? undefined : weightNamed[weight],
      from: parent !== undefined && tiler.isOutside(parent) ? parent : undefined,
      leads: weight === "lead",
      mood: setting.mood,
      arranging: why === "arranged",
      place: placeOf(setting),
    };
  };

  const opened = async (
    setting: YardSetting,
    why: Leaving,
    last?: ScreenRect,
  ): Promise<PaneId | undefined> => {
    if (setting.mood !== undefined) moods.set(setting.id, setting.mood);
    const sending = sendingOf(setting, why, last);
    const pane = await outside.standOutside(settingSpecOf(setting), sending);
    opening.delete(setting.id);
    if (pane !== undefined) standsOutsideAgain(setting.id);
    else setKeptBeside((held) => new Set([...held, setting.id]));
    return pane;
  };

  const standsOutsideAgain = (id: string): void => {
    setKeptBeside((held) => without(held, id));
    noLongerOnTheRail(id);
  };

  const noLongerOnTheRail = (id: string): void => {
    steppedBack.delete(id);
    const putAway = putAwayByTheKeeper.delete(id);
    const railed = foundNoRoom.delete(id);
    if (putAway || railed) rememberTheRail();
  };

  const rememberTheRail = (): void => {
    if (seams.storageKey === undefined) return;
    const kept: KeptOnTheRail = { putAway: [...putAwayByTheKeeper], noRoom: [...foundNoRoom] };
    seams.storage?.setItem(seams.storageKey, JSON.stringify(kept));
  };

  const creaturesOwn = (pane: PaneId): string | undefined => {
    const shown = settingShownBy(tiler.spec(pane));
    const setting = settingOf(shown?.id);
    return setting !== undefined && originOf(setting) === "keeper" ? undefined : shown?.id;
  };

  const backBesideTheConversation = (pane: PaneId, id: string): void => {
    railedFrom.set(pane, id);
    setKeptBeside((held) => new Set([...held, id]));
    setArrangedOut((held) => without(held, id));
    tiler.close(pane);
  };

  const backOnTheRail = (pane: PaneId, why: CameHome): boolean => {
    const id = creaturesOwn(pane);
    if (id === undefined) return false;
    if (why === "stepped-aside") steppedBack.add(id);
    if (why === "no-room") foundNoRoom.add(id);
    if (why === "no-room") rememberTheRail();
    backBesideTheConversation(pane, id);
    return true;
  };

  const putAway = (pane: PaneId): boolean => {
    const id = tiler.isOutside(pane) ? creaturesOwn(pane) : undefined;
    if (id === undefined) return false;
    putAwayByTheKeeper.add(id);
    foundNoRoom.delete(id);
    rememberTheRail();
    backBesideTheConversation(pane, id);
    return true;
  };

  const standOutside = (
    setting: YardSetting,
    why: Leaving,
    last?: ScreenRect,
  ): Promise<PaneId | undefined> => {
    const standing = paneOf(setting.id);
    if (standing !== undefined) return Promise.resolve(standing);
    const underway = opening.get(setting.id) ?? opened(setting, why, last);
    opening.set(setting.id, underway);
    return underway;
  };

  const setOutByHand = (setting: YardSetting): boolean => {
    if (!outside.reachesOutside) return false;
    void standOutside(setting, "opened");
    return true;
  };

  const setOutAgain = (seats: ReadonlyMap<PaneId, ScreenRect>): void => {
    for (const [pane, seat] of seats) {
      const setting = settingOf(railedFrom.get(pane));
      const waits = setting !== undefined && keptBeside().has(setting.id);
      if (waits && !putAwayByTheKeeper.has(setting.id))
        void standOutside(setting, "returned", seat);
    }
  };

  createEffect(() => {
    const claimed = leaving();
    for (const setting of seams.settings()) {
      const why = claimed.get(setting.id);
      if (why === undefined || dismissed().has(setting.id)) continue;
      if (paneOf(setting.id) === undefined) queueMicrotask(() => void standOutside(setting, why));
    }
  });

  const departed = async (id: string): Promise<void> => {
    departing.delete(id);
    const pane = paneOf(id);
    if (pane === undefined) return;
    if (tiler.isOutside(pane)) await outside.leave(pane, moods.get(id), true);
    moods.delete(id);
    tiler.close(pane);
  };

  const departs = (id: string): void => {
    setDismissed((held) => without(held, id));
    setArrangedOut((held) => without(held, id));
    noLongerOnTheRail(id);
    if (paneOf(id) === undefined || departing.has(id)) return;
    departing.set(
      id,
      setTimeout(() => void departed(id), replacementGraceMs),
    );
  };

  const replaced = (setting: Setting): void => {
    const earlier = setting.replaces ?? undefined;
    const pane = paneOf(earlier);
    const leavingSoon = earlier === undefined ? undefined : departing.get(earlier);
    if (earlier === undefined || pane === undefined || leavingSoon === undefined) return;
    clearTimeout(leavingSoon);
    departing.delete(earlier);
    tiler.bind(pane, settingSpecOf(setting));
  };

  const changed = (setting: Setting): void => {
    const pane = paneOf(setting.id);
    if (pane !== undefined) tiler.bind(pane, settingSpecOf(setting));
  };

  const instructionOf = (
    arrangement: Arrangement,
    keyOf: (id: string | undefined) => PaneId | undefined,
  ): Instruction => {
    const { seats, shape, relation, lead, side } = arrangement;
    if (seats === undefined) {
      const shaping = { shape, relation, led: lead !== undefined || side !== undefined, side };
      return { kind: "dealt", deals: (count) => dealsToTry(shaping, count) };
    }
    return {
      kind: "written",
      seats: seats.flatMap(({ id, seat }) => {
        const key = keyOf(id);
        return key === undefined ? [] : [{ key, share: shareOnTheStage(seat) }];
      }),
    };
  };

  const saidOf = (
    arrangement: Arrangement,
    result: Arranged | "desktop-refused",
    desk: Desk | undefined,
    titles: ReadonlyMap<PaneId, string>,
    inside: readonly string[],
  ): string => {
    if (result === "desktop-refused" || desk === undefined) return toldWords.desktopRefused;
    const standings = outside.standings();
    const stage = stageHolding(desk, sessionStandings(arrangement.sessionId, standings));
    const titleOf = (pane: PaneId): string => titles.get(pane) ?? "";
    return arrangementSaid({
      shape: arrangement.shape,
      side: arrangement.side,
      look: result.look,
      room: roomOf(desk, stage),
      seated: result.seated.map((pane) => {
        const bounds = standings.get(pane)?.bounds;
        return {
          title: titleOf(pane),
          seat: bounds === undefined ? undefined : seatOnTheLattice(stage.room, bounds),
        };
      }),
      authored: result.authored.map(titleOf),
      corrected: result.said,
      keepers: result.keepers.map(titleOf),
      inside,
      rail: result.unseated.map(titleOf),
      aside: result.aside.map(titleOf),
      backBeside: result.backBeside.map(titleOf),
      letGo: result.letGo,
    });
  };

  const stepBackTheRest = async (arrangement: Arrangement): Promise<void> => {
    if (arrangement.rest !== "beside") return;
    const standings = outside.standings();
    const stepping = seams.settings().flatMap((setting) => {
      const named = arrangement.panes.includes(setting.id);
      const pane =
        setting.sessionId === arrangement.sessionId && !named ? paneOf(setting.id) : undefined;
      if (pane === undefined || !tiler.isOutside(pane) || creaturesOwn(pane) === undefined)
        return [];
      return standings.get(pane)?.by === "keeper" ? [] : [{ pane, id: setting.id }];
    });
    await Promise.all(
      stepping.map(async ({ pane, id }) => {
        await outside.leave(pane, arrangement.mood ?? moods.get(id));
        steppedBack.add(id);
        backBesideTheConversation(pane, id);
      }),
    );
  };

  const arrange = async (arrangement: Arrangement): Promise<void> => {
    await Promise.resolve();
    if (!outside.reachesOutside) return;
    await stepBackTheRest(arrangement);
    const named = arrangement.panes.flatMap((id) => settingOf(id) ?? []);
    const stillBeside = named.filter((setting) => paneOf(setting.id) === undefined);
    setArrangedOut((held) => new Set([...held, ...stillBeside.map((setting) => setting.id)]));
    for (const setting of stillBeside) void standOutside(setting, "arranged");
    const standing = named.flatMap((setting) => {
      const pane = paneOf(setting.id);
      return pane === undefined ? [] : [{ setting, pane }];
    });
    const out = standing.filter(({ pane }) => tiler.isOutside(pane));
    const inside = standing.filter(({ pane }) => !tiler.isOutside(pane));
    const keyOf = (id: string | undefined): PaneId | undefined =>
      out.find(({ setting }) => setting.id === id)?.pane;
    const titles = titlesOfThePanesOut(arrangement.sessionId);
    const result = await outside.arrange({
      keys: out.map(({ pane }) => pane),
      instruction: instructionOf(arrangement, keyOf),
      lead: keyOf(arrangement.lead),
      over: arrangement.over,
      mood: arrangement.mood,
    });
    const desk = await outside.desk();
    const said = saidOf(
      arrangement,
      result,
      desk,
      titles,
      inside.map(({ setting }) => titleOfSetting(setting)),
    );
    await report(arrangement.sessionId, desk, { id: arrangement.id, said });
  };

  const heard = (batch: readonly BusEnvelope[]): void => {
    for (const envelope of batch) {
      if (envelope.type === "show.proposed") replaced(envelope.payload.setting);
      else if (envelope.type === "show.changed") changed(envelope.payload.setting);
      else if (envelope.type === "show.settled") {
        const { id, outcome, mood } = envelope.payload;
        if (mood !== undefined) moods.set(id, mood);
        if (outcome !== "pinned") departs(id);
      } else if (envelope.type === "show.arranged" && envelope.payload.replay !== true) {
        void arrange(envelope.payload.arrangement);
      } else if (envelope.type === "turn.completed" || envelope.type === "turn.interrupted") {
        void outside.settle(envelope.sessionId);
      }
    }
  };

  createEffect(() => {
    for (const feed of seams.feeds()) onCleanup(feed.subscribe(heard));
  });

  const titlesOfThePanesOut = (sessionId: string): ReadonlyMap<PaneId, string> =>
    new Map(
      seams
        .settings()
        .filter((setting) => setting.sessionId === sessionId)
        .flatMap((setting) => {
          const pane = paneOf(setting.id);
          return pane === undefined ? [] : [[pane, titleOfSetting(setting)] as const];
        }),
    );

  const sessionStandings = (sessionId: string, standings: ReadonlyMap<PaneId, Placed>) =>
    seams
      .settings()
      .filter((setting) => setting.sessionId === sessionId)
      .flatMap((setting) => standings.get(paneOf(setting.id) ?? "")?.bounds ?? []);

  const whereaboutsOf = (
    setting: YardSetting,
    standings: ReadonlyMap<PaneId, Placed>,
  ): Whereabouts => {
    const { id } = setting;
    const pane = paneOf(id);
    if (pane === undefined) {
      const keepers = originOf(setting) === "keeper" || putAwayByTheKeeper.has(id);
      const note = foundNoRoom.has(id)
        ? toldWords.noRoomOutside
        : steppedBack.has(id)
          ? toldWords.steppedBack
          : undefined;
      const where = leaving().has(id) ? "outside" : "beside";
      return { id, where, by: keepers ? "keeper" : "console", note };
    }
    if (!tiler.isOutside(pane)) return { id, where: "inside", by: "keeper" };
    const placed = standings.get(pane);
    return { id, where: "outside", by: placed?.by ?? "console", bounds: placed?.bounds };
  };

  const clientFor = (sessionId: string): PlacementsClient | undefined => {
    const setting = seams.settings().find((candidate) => candidate.sessionId === sessionId);
    if (setting !== undefined) clients.set(sessionId, seams.clientOf(setting));
    return clients.get(sessionId);
  };

  const report = async (
    sessionId: string,
    desk: Desk | undefined,
    answer?: ArrangementAnswer,
  ): Promise<void> => {
    const client = clientFor(sessionId);
    if (desk === undefined || client === undefined) return;
    const standings = outside.standings();
    const every = seams
      .settings()
      .filter((setting) => setting.sessionId === sessionId)
      .map((setting) => whereaboutsOf(setting, standings));
    const settings = every.filter(hasItsPlace);
    const picture = JSON.stringify(placementsReport(desk, settings));
    const onlyOnTheirWay = settings.length === 0 && every.length > 0;
    const toldAlready = sent.get(sessionId) === picture || onlyOnTheirWay;
    if (answer === undefined && toldAlready) return;
    if (every.length === 0) forget(sessionId);
    else sent.set(sessionId, picture);
    await Promise.resolve()
      .then(() => client.reportPlacements(sessionId, placementsReport(desk, settings, answer)))
      .catch(() => undefined);
  };

  const forget = (sessionId: string): void => {
    sent.delete(sessionId);
    clients.delete(sessionId);
  };

  const reportEverySession = async (): Promise<void> => {
    const sessions = new Set([
      ...seams.settings().map((setting) => setting.sessionId),
      ...sent.keys(),
    ]);
    if (sessions.size === 0 || !outside.reachesOutside) return;
    const desk = await outside.desk();
    for (const sessionId of sessions) void report(sessionId, desk);
  };

  const reportSoon = (): void => {
    clearTimeout(due);
    due = setTimeout(() => void reportEverySession(), reportMetrics.quietMs);
  };

  const reportNow = (): void => {
    clearTimeout(due);
    void reportEverySession();
  };

  const whereEachStands = createMemo(() =>
    seams
      .settings()
      .map((setting) => `${setting.id} ${whereaboutsOf(setting, noStandings).where}`)
      .join("\n"),
  );
  const whichAreOut = createMemo(() => seams.settings().map(idOf).join(" "));
  createEffect(on(whichAreOut, reportNow, { defer: true }));
  createEffect(on(whereEachStands, reportSoon, { defer: true }));

  const closing = (pane: PaneId): void => {
    const shown = settingShownBy(tiler.spec(pane));
    if (shown === undefined) return;
    const setting = settingOf(shown.id);
    setDismissed((held) => new Set([...held, shown.id]));
    if (setting !== undefined) seams.answer(setting, "dismissed");
  };

  const closeWhatSettledWhileAway = async (): Promise<void> => {
    const holdsNone = tiler.panes().every((pane) => settingShownBy(tiler.spec(pane)) === undefined);
    const listed = holdsNone ? undefined : await seams.listed();
    if (listed === undefined) return;
    const out = new Set(listed.filter(stillShown).map((setting) => setting.id));
    const settled = tiler.panes().flatMap((pane) => {
      const shown = settingShownBy(tiler.spec(pane));
      const gone = shown !== undefined && !out.has(shown.id) && settingOf(shown.id) === undefined;
      return gone ? [shown.id] : [];
    });
    await Promise.all(settled.map(departed));
  };

  const restore = async (): Promise<void> => {
    outside.restore((spec) => settingShownBy(spec) === undefined);
    await closeWhatSettledWhileAway();
    outside.restore((spec) => settingShownBy(spec) !== undefined);
  };

  onCleanup(() => {
    clearTimeout(due);
    for (const leavingSoon of departing.values()) clearTimeout(leavingSoon);
  });

  return {
    beside,
    leavesTheYard: (setting) => leaving().has(setting.id) || paneOf(setting.id) !== undefined,
    closing,
    placesChanged: (what) => (what === "seated" ? reportNow() : reportSoon()),
    backOnTheRail,
    putAway,
    setOutAgain,
    setOutByHand,
    restore,
  };
}

const noStandings: ReadonlyMap<PaneId, Placed> = new Map();

function idOf(setting: Pick<Setting, "id">): string {
  return setting.id;
}

interface KeptOnTheRail {
  readonly putAway: readonly string[];
  readonly noRoom: readonly string[];
}

function railRememberedBy({ storage, storageKey }: SettingPanesSeams): KeptOnTheRail {
  try {
    const kept: unknown = JSON.parse(storage?.getItem(storageKey ?? "") ?? "null");
    if (Array.isArray(kept)) return { putAway: idsIn(kept), noRoom: [] };
    const { putAway, noRoom } = (kept ?? {}) as Partial<Record<keyof KeptOnTheRail, unknown>>;
    return { putAway: idsIn(putAway), noRoom: idsIn(noRoom) };
  } catch {
    return { putAway: [], noRoom: [] };
  }
}

function idsIn(held: unknown): string[] {
  return Array.isArray(held) ? held.filter((id): id is string => typeof id === "string") : [];
}

function hasItsPlace({ where, bounds }: Whereabouts): boolean {
  return where !== "outside" || bounds !== undefined;
}

function without(held: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return held.has(id) ? new Set([...held].filter((kept) => kept !== id)) : held;
}

function sameEntries(
  one: ReadonlyMap<string, Leaving>,
  other: ReadonlyMap<string, Leaving>,
): boolean {
  return one.size === other.size && [...one].every(([id, why]) => other.get(id) === why);
}

function sameItems<Item>(one: readonly Item[], other: readonly Item[]): boolean {
  return one.length === other.length && one.every((item, at) => item === other[at]);
}
