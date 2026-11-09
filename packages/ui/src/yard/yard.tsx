import type { TickScheduler } from "@keywork-app/client";
import {
  chainArrow,
  grouped,
  groupsOf,
  originOf,
  type Placement,
  type PlotCard,
  type YardCard,
  type YardGroup,
  type YardSetting,
  yardIds,
  yardMetrics,
} from "@keywork-app/habitat";
import type { KeeperShowOutcome, SettingSubject } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { clockWord } from "../chrome/clock-word.ts";
import type { Rect } from "../layout/index.ts";
import type { ShellSeams } from "../panes/index.ts";
import { houseOffsetMinutes } from "../panes/stead/habitat.ts";
import { frameTick } from "../shell/frame-tick.ts";
import type { TrailStep } from "./actions.ts";
import type { RailView } from "./control.ts";
import {
  attendedLine,
  budgetLine,
  decisionLine,
  groupLine,
  kindWords,
  openedByYouLine,
  plotHint,
  plotLine,
  setOutLine,
  trailLabel,
  withdrawnMark,
} from "./copy.ts";
import {
  isPlot,
  type RailLayout,
  type RailRows,
  railRowsBeneath,
  type YardEntry,
  yardLayout,
} from "./layout.ts";
import { createGlide } from "./motion.ts";
import { createYardPanels, type YardPanels } from "./panels.ts";
import { createPlotMotion } from "./plot-motion.ts";
import { Rail, type RailCardSpot, type RailEntry, rectStyle, type YardCardView } from "./rail.tsx";
import { SatelliteSlot } from "./satellite.tsx";
import { titleOfSetting } from "./satellites.ts";
import type { YardLineage } from "./trail.ts";
import "./yard.css";

export interface YardProps {
  readonly on: boolean;
  readonly settings: readonly YardSetting[];
  readonly heldBack?: number | undefined;
  readonly foldedAway?: readonly string[] | undefined;
  readonly inside?: string | undefined;
  readonly withdrawn?: ((id: string) => boolean) | undefined;
  readonly card?: YardCard | undefined;
  readonly offsetMinutes?: number | undefined;
  readonly railActive: boolean;
  readonly railAt?: string | undefined;
  readonly view?: RailView | undefined;
  readonly reducedMotion: boolean;
  readonly shell: ShellSeams;
  readonly ownerOf: (setting: YardSetting) => string;
  readonly tick?: TickScheduler | undefined;
  readonly now?: (() => number) | undefined;
  readonly panels?: YardPanels | undefined;
  readonly lineage?: YardLineage | undefined;
  onEnter(setting: YardSetting): void;
  onOpen?: ((from: YardSetting, what: SettingSubject) => void) | undefined;
  onInteract?: ((setting: YardSetting) => void) | undefined;
  onToggleView?: (() => void) | undefined;
  onWalk?: ((from: string, step: TrailStep) => void) | undefined;
  onRestore?: ((plot: PlotCard) => void) | undefined;
  onRailLeft?: ((next: EventTarget | null) => void) | undefined;
  onAnswer(setting: YardSetting, outcome: KeeperShowOutcome): void;
  onReturn(): void;
  children: JSX.Element;
}

export const unmeasuredViewport: Rect = { x: 0, y: 0, width: 1280, height: 800 };

const hubSlot = "hub";
const railSlot = "rail";

export function Yard(props: YardProps) {
  let field: HTMLDivElement | undefined;
  const [viewport, setViewport] = createSignal<Rect>(unmeasuredViewport);
  const [cursor, setCursor] = createSignal<string>();
  const panels = props.panels ?? createYardPanels();
  const inside = (): string | undefined => (props.railActive ? cursor() : panels.inside());
  const ghost = withdrawnWhileInside({
    settings: () => props.settings,
    inside,
    withdrawn: (id) => props.withdrawn?.(id) === true,
  });
  const drawn = createMemo((): readonly YardSetting[] => {
    const kept = ghost();
    return kept === undefined ? props.settings : [...props.settings, kept];
  });
  const floods = createFloods(drawn);
  const layout = createMemo(() =>
    yardLayout({
      viewport: viewport(),
      settings: props.on ? floods.gathered() : [],
      railWanted: props.on && props.railActive,
      prefs: { reducedMotion: props.reducedMotion, tier: "interact" },
      inside: props.inside,
    }),
  );
  const trail = createMemo(() =>
    props.view === "trail" ? props.lineage?.trailOrder() : undefined,
  );
  const selectable = stillWhile(
    () => (props.railActive ? (props.view ?? "now") : undefined),
    () =>
      inOrder(
        layout().selectable,
        trail()?.map((row) => row.id),
      ),
  );
  const levelOf = (id: string): number | undefined => trail()?.find((row) => row.id === id)?.level;
  const shownRail = createMemo((): ShownRail | undefined => {
    const rail = layout().rail;
    if (rail === undefined) return undefined;
    if (trail() === undefined) return railNow(rail, selectable());
    const blocked = [layout().hub, ...layout().satellites.map((placement) => placement.rect)];
    return railAlongTheTrail(rail, railRowsBeneath(rail.head, viewport(), blocked), selectable());
  });
  const settingOf = (id: string): YardSetting | undefined =>
    drawn().find((setting) => setting.id === id);
  const titleOf = (id: string): string | undefined => {
    const setting = settingOf(id);
    return setting === undefined ? undefined : titleOfSetting(setting);
  };
  const motion = createPlotMotion({
    satellites: () => layout().satellites,
    cards: createMemo(() => plotCardsOnRail(selectable(), shownRail())),
    reducedMotion: () => props.reducedMotion,
    settingOf,
  });
  const satellites = createMemo((): readonly Placement[] => [
    ...layout().satellites,
    ...motion.folding().map((panel) => panel.placement),
  ]);
  const targets = createMemo(
    () =>
      new Map<string, Rect>([
        [hubSlot, layout().hub],
        ...railTarget(shownRail()),
        ...satellites().map((placement): [string, Rect] => [placement.id, placement.rect]),
      ]),
  );
  const glide = createGlide(targets, {
    reducedMotion: () => props.reducedMotion,
    tick: props.tick ?? frameTick(),
    now: props.now ?? (() => performance.now()),
    from: (id, target) =>
      id === hubSlot ? target : (motion.origin(id) ?? grownFromHub(layout().hub, target)),
    snapOn: () => `${viewport().width}x${viewport().height}`,
  });
  createEffect(() => {
    for (const panel of motion.folding()) {
      if (sameRect(glide().get(panel.placement.id), panel.placement.rect)) {
        motion.rested(panel.placement.id);
      }
    }
  });
  const rectOf = (id: string): Rect | undefined => glide().get(id) ?? targets().get(id);
  const isGhost = (id: string): boolean => ghost()?.id === id;
  const isFolding = (id: string): boolean =>
    motion.folding().some((panel) => panel.placement.id === id);
  const satelliteIds = createMemo(() => satellites().map((placement) => placement.id), [], {
    equals: sameIds,
  });
  const shownSatellite = (id: string): ShownSatellite | undefined => {
    const placement = satellites().find((candidate) => candidate.id === id);
    const setting = settingOf(id);
    return placement === undefined || setting === undefined ? undefined : { placement, setting };
  };
  const setOutBy = (setting: YardSetting): string => {
    if (originOf(setting) === "keeper") {
      const parent = settingOf(props.lineage?.parentOf(setting.id) ?? "");
      return openedByYouLine(parent === undefined ? undefined : titleOfSetting(parent));
    }
    return setOutLine(setting, props.ownerOf(setting));
  };
  const byLine = (setting: YardSetting): string => {
    const group = floods.closedAt(setting.id);
    const line =
      group === undefined
        ? setOutBy(setting)
        : groupLine(props.ownerOf(setting), group.members.length, setting.creature === null);
    return isGhost(setting.id) ? `${withdrawnMark} · ${line}` : line;
  };
  const settingEntry = (setting: YardSetting): RailEntry => ({
    id: setting.id,
    title: titleOfSetting(setting),
    by: byLine(setting),
    why: setting.why,
    shown: setting.shown,
    pinned: setting.state === "pinned",
    withdrawn: isGhost(setting.id),
    grouped: floods.closedAt(setting.id)?.members.length,
    level: levelOf(setting.id),
  });
  const plotEntry = (plot: PlotCard): RailEntry => ({
    id: plot.id,
    title: props.lineage?.chainOf(plot.id) ?? plot.members.map(titleOfSetting).join(" → "),
    by: plotLine(plot.members.length),
    why: plotHint,
    shown: "card",
    pinned: false,
    plot: plot.members.length,
    level: levelOf(plot.id),
  });
  const entries = createMemo((): readonly RailEntry[] =>
    selectable().map((entry) => (isPlot(entry) ? plotEntry(entry) : settingEntry(entry))),
  );
  const crumb = createMemo((): string | undefined => {
    const id = inside();
    const chain = id === undefined ? undefined : props.lineage?.chainOf(id);
    return chain?.includes(chainArrow) ? chain : undefined;
  });
  const cardView = createMemo((): YardCardView | undefined => {
    const card = props.card;
    if (card === undefined) return undefined;
    return viewOfCard(card, titleOf, (ms) =>
      clockWord(ms, props.offsetMinutes ?? houseOffsetMinutes()),
    );
  });
  const current = (): string | undefined => {
    if (props.card !== undefined && cursor() === yardIds.card) return yardIds.card;
    return entries().find((entry) => entry.id === cursor())?.id ?? entries()[0]?.id;
  };
  createEffect(
    on(
      () => [props.railActive, props.railAt] as const,
      ([active, at]) => {
        if (active) setCursor(at ?? current());
        else floods.closeAll();
      },
    ),
  );
  const enterOrOpen = (entry: YardEntry): void => {
    if (isPlot(entry)) {
      props.onRestore?.(entry);
      return;
    }
    const group = floods.closedAt(entry.id);
    if (group === undefined) props.onEnter(entry);
    else floods.open(group);
  };
  const answerAll = (entry: YardEntry, outcome: KeeperShowOutcome): void => {
    for (const member of answeredTogether(entry, outcome)) props.onAnswer(member, outcome);
  };
  const answeredTogether = (
    entry: YardEntry,
    outcome: KeeperShowOutcome,
  ): readonly YardSetting[] => {
    if (isPlot(entry)) return outcome === "dismissed" ? entry.members : [];
    const group = outcome === "dismissed" ? floods.closedAt(entry.id) : undefined;
    return group?.members ?? [entry];
  };
  const forEntry =
    (act: (entry: YardEntry) => void) =>
    (shown: RailEntry): void => {
      const entry = selectable().find((held) => held.id === shown.id);
      if (entry !== undefined) act(entry);
    };

  onMount(() => {
    const measure = (): void => {
      if (field === undefined || field.clientWidth === 0 || field.clientHeight === 0) return;
      setViewport({ x: 0, y: 0, width: field.clientWidth, height: field.clientHeight });
    };
    measure();
    if (field !== undefined && typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(field);
      onCleanup(() => observer.disconnect());
    }
  });

  return (
    <div class="kw-yard" data-mode={props.on ? "yard" : "tiles"} ref={field}>
      <div class="kw-yard-hub" style={rectStyle(rectOf(hubSlot))}>
        {props.children}
      </div>
      <Show when={props.on && hasHead(layout().hub) && crumb()}>
        {(chain) => (
          <nav
            class="kw-yard-crumb"
            aria-label={trailLabel}
            style={rectStyle(headAbove(rectOf(hubSlot)))}
          >
            {chain()}
          </nav>
        )}
      </Show>
      <For each={satelliteIds()}>
        {(id) => (
          <Show when={shownSatellite(id)}>
            {(shown) => (
              <SatelliteSlot
                placement={shown().placement}
                setting={shown().setting}
                rect={rectOf(id)}
                shell={props.shell}
                by={byLine(shown().setting)}
                withdrawn={isGhost(id)}
                folding={isFolding(id)}
                cursor={props.railActive && current() === id}
                panels={panels}
                onOpen={(what) => props.onOpen?.(shown().setting, what)}
                onInteract={() => props.onInteract?.(shown().setting)}
              />
            )}
          </Show>
        )}
      </For>
      <Show when={shownRail()}>
        {(rail) => (
          <div class="kw-yard-rail-slot" style={rectStyle(rectOf(railSlot))}>
            <Rail
              entries={entries()}
              cards={rail().spots.map((spot) => ({ ...spot, rect: within(rail(), spot.rect) }))}
              card={cardView()}
              log={within(rail(), logBelowHead(rail().head, viewport()))}
              head={within(rail(), rail().head)}
              fold={withinOrNone(rail(), rail().fold)}
              folded={rail().folded}
              heldBack={props.heldBack ?? 0}
              foldedAway={props.foldedAway}
              active={props.railActive}
              view={props.view}
              cursor={current()}
              onCursor={setCursor}
              onToggleView={() => props.onToggleView?.()}
              onWalk={(entry, step) => props.onWalk?.(entry.id, step)}
              onLeave={(next) => props.onRailLeft?.(next)}
              onEnter={forEntry(enterOrOpen)}
              onAnswer={(shown, outcome) => forEntry((entry) => answerAll(entry, outcome))(shown)}
              onReturn={() => props.onReturn()}
            />
          </div>
        )}
      </Show>
    </div>
  );
}

interface ShownSatellite {
  readonly placement: Placement;
  readonly setting: YardSetting;
}

interface Floods {
  gathered(): readonly YardSetting[];
  closedAt(id: string): YardGroup | undefined;
  open(group: YardGroup): void;
  closeAll(): void;
}

function createFloods(settings: () => readonly YardSetting[]): Floods {
  const [opened, setOpened] = createSignal<readonly string[]>([]);
  const groups = createMemo(() => groupsOf(settings()));
  return {
    gathered: () => grouped(settings(), opened()),
    closedAt: (id) =>
      groups().find((group) => group.head.id === id && !opened().includes(group.key)),
    open: (group) => setOpened((held) => [...held, group.key]),
    closeAll: () => setOpened([]),
  };
}

interface FrozenOrder {
  readonly key: string;
  readonly order: readonly string[];
}

function stillWhile<Entry extends Identified>(
  still: () => string | undefined,
  entries: () => readonly Entry[],
): () => readonly Entry[] {
  const frozen = createMemo<FrozenOrder | undefined>((held) => {
    const key = still();
    if (key === undefined) return undefined;
    if (held?.key === key) return held;
    return { key, order: untrack(() => entries().map((entry) => entry.id)) };
  });
  return createMemo(() => inOrder(entries(), frozen()?.order));
}

function viewOfCard(
  card: YardCard,
  titleOf: (id: string) => string | undefined,
  clock: (ms: number) => string,
): YardCardView {
  return {
    line: budgetLine(card, clock),
    log: [
      ...card.attended.map((held) =>
        attendedLine(titleOf(held.id) ?? kindWords.note, held.size, held.reason),
      ),
      ...card.decisions
        .toReversed()
        .map((decision) =>
          decisionLine(decision, titleOf(decision.id) ?? kindWords[decision.kind], clock),
        ),
    ],
  };
}

interface InsideSeams {
  settings(): readonly YardSetting[];
  inside(): string | undefined;
  withdrawn(id: string): boolean;
}

export function withdrawnWhileInside(seams: InsideSeams): () => YardSetting | undefined {
  const lastSeen = createMemo<YardSetting | undefined>((held) => {
    const id = seams.inside();
    if (id === undefined) return undefined;
    const live = seams.settings().find((setting) => setting.id === id);
    return live ?? (held?.id === id ? held : undefined);
  });
  return createMemo(() => {
    const seen = lastSeen();
    if (seen === undefined || seams.settings().some((setting) => setting.id === seen.id)) {
      return undefined;
    }
    return seams.withdrawn(seen.id) ? seen : undefined;
  });
}

interface Identified {
  readonly id: string;
}

export function inOrder<Entry extends Identified>(
  entries: readonly Entry[],
  order: readonly string[] | undefined,
): readonly Entry[] {
  if (order === undefined) return entries;
  const rank = new Map(order.map((id, index) => [id, index]));
  const known = entries.filter((entry) => rank.has(entry.id));
  const fresh = entries.filter((entry) => !rank.has(entry.id));
  return [...known.toSorted((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)), ...fresh];
}

interface ShownRail {
  readonly region: Rect;
  readonly head: Rect;
  readonly spots: readonly RailCardSpot[];
  readonly fold: Rect | undefined;
  readonly folded: number;
}

function railNow(rail: RailLayout, ordered: readonly YardEntry[]): ShownRail {
  const onRail = new Set(rail.cards.map((card) => card.id));
  const rects = rail.cards.map((card) => card.rect).toSorted((a, b) => a.y - b.y);
  const spots = ordered
    .filter((setting) => onRail.has(setting.id))
    .flatMap((setting, index) => {
      const rect = rects[index];
      return rect === undefined ? [] : [{ id: setting.id, rect }];
    });
  return { region: rail.region, head: rail.head, spots, fold: rail.fold, folded: rail.folded };
}

function railAlongTheTrail(
  rail: RailLayout,
  rows: RailRows,
  ordered: readonly YardEntry[],
): ShownRail {
  const spots = ordered.flatMap((setting, index) => {
    const rect = rows.rows[index];
    return rect === undefined ? [] : [{ id: setting.id, rect }];
  });
  const folded = ordered.length - spots.length;
  return {
    region: rows.region,
    head: rail.head,
    spots,
    fold: folded > 0 ? rows.fold : undefined,
    folded,
  };
}

function plotCardsOnRail(
  entries: readonly YardEntry[],
  rail: ShownRail | undefined,
): ReadonlyMap<string, Rect> {
  const spots = new Map((rail?.spots ?? []).map((spot) => [spot.id, spot.rect]));
  return new Map(
    entries.flatMap((entry) => {
      if (!isPlot(entry)) return [];
      const rect = spots.get(entry.id);
      return rect === undefined ? [] : entry.members.map((member) => [member.id, rect] as const);
    }),
  );
}

function sameRect(a: Rect | undefined, b: Rect): boolean {
  return (
    a !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function logBelowHead(head: Rect, viewport: Rect): Rect {
  const { gap, margin } = yardMetrics;
  const top = head.y + head.height + gap;
  const bottom = viewport.y + viewport.height - margin;
  return { ...head, y: top, height: Math.max(0, bottom - top) };
}

function railTarget(rail: ShownRail | undefined): Array<[string, Rect]> {
  return rail === undefined ? [] : [[railSlot, rail.region]];
}

function within(rail: Pick<ShownRail, "region">, rect: Rect): Rect {
  return { ...rect, x: rect.x - rail.region.x, y: rect.y - rail.region.y };
}

function withinOrNone(rail: Pick<ShownRail, "region">, rect: Rect | undefined): Rect | undefined {
  return rect === undefined ? undefined : within(rail, rect);
}

function hasHead(hub: Rect): boolean {
  return hub.y >= yardMetrics.margin;
}

function headAbove(hub: Rect | undefined): Rect | undefined {
  if (hub === undefined) return undefined;
  const height = yardMetrics.margin;
  return { x: hub.x, y: Math.max(0, hub.y - height), width: hub.width, height };
}

function grownFromHub(hub: Rect, target: Rect): Rect {
  const fromRight = target.x >= hub.x + hub.width;
  const edge = fromRight ? hub.x + hub.width + yardMetrics.gap : target.x + target.width;
  return { ...target, x: edge, width: 0 };
}
