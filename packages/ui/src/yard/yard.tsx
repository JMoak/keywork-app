import type { TickScheduler } from "@keywork-app/client";
import {
  grouped,
  groupsOf,
  type Placement,
  type YardCard,
  type YardDecision,
  type YardGroup,
  type YardSetting,
  yardIds,
  yardMetrics,
} from "@keywork-app/habitat";
import type { KeeperShowOutcome } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { clockWord } from "../chrome/clock-word.ts";
import { PaneFrame } from "../chrome/pane-frame.tsx";
import type { Rect } from "../layout/index.ts";
import { definitionOf, type PaneSpec, type ShellSeams } from "../panes/index.ts";
import { houseOffsetMinutes } from "../panes/stead/habitat.ts";
import { frameTick } from "../shell/frame-tick.ts";
import {
  budgetLine,
  decisionLine,
  groupLine,
  kindWords,
  setOutLine,
  withdrawnMark,
} from "./copy.ts";
import { type RailLayout, yardLayout } from "./layout.ts";
import { createGlide } from "./motion.ts";
import { Rail, type RailEntry, railEntryId, rectStyle, type YardCardView } from "./rail.tsx";
import { satelliteOf, satellitePaneId, titleOfSetting } from "./satellites.ts";
import "./yard.css";

export interface YardProps {
  readonly on: boolean;
  readonly settings: readonly YardSetting[];
  readonly heldBack?: number | undefined;
  readonly withdrawn?: ((id: string) => boolean) | undefined;
  readonly card?: YardCard | undefined;
  readonly offsetMinutes?: number | undefined;
  readonly railActive: boolean;
  readonly reducedMotion: boolean;
  readonly shell: ShellSeams;
  readonly ownerOf: (setting: YardSetting) => string;
  readonly tick?: TickScheduler | undefined;
  readonly now?: (() => number) | undefined;
  onEnter(setting: YardSetting): void;
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
  const [entered, setEntered] = createSignal<string>();
  const inside = (): string | undefined => (props.railActive ? cursor() : entered());
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
    }),
  );
  const selectable = stillWhile(
    () => props.railActive,
    () => layout().selectable,
  );
  const targets = createMemo(
    () =>
      new Map<string, Rect>([
        [hubSlot, layout().hub],
        ...railTarget(layout().rail),
        ...layout().satellites.map((placement): [string, Rect] => [placement.id, placement.rect]),
      ]),
  );
  const glide = createGlide(targets, {
    reducedMotion: () => props.reducedMotion,
    tick: props.tick ?? frameTick(),
    now: props.now ?? (() => performance.now()),
    from: (id, target) => (id === hubSlot ? target : grownFromHub(layout().hub, target)),
    snapOn: () => `${viewport().width}x${viewport().height}`,
  });
  const rectOf = (id: string): Rect | undefined => glide().get(id) ?? targets().get(id);
  const settingOf = (id: string): YardSetting | undefined =>
    drawn().find((setting) => setting.id === id);
  const isGhost = (id: string): boolean => ghost()?.id === id;
  const satelliteIds = createMemo(() => layout().satellites.map((placement) => placement.id), [], {
    equals: sameIds,
  });
  const shownSatellite = (id: string): ShownSatellite | undefined => {
    const placement = layout().satellites.find((candidate) => candidate.id === id);
    const setting = settingOf(id);
    return placement === undefined || setting === undefined ? undefined : { placement, setting };
  };
  const byLine = (setting: YardSetting): string => {
    const owner = props.ownerOf(setting);
    const group = floods.closedAt(setting.id);
    const line =
      group === undefined
        ? setOutLine(setting, owner)
        : groupLine(owner, group.members.length, setting.creature === null);
    return isGhost(setting.id) ? `${withdrawnMark} · ${line}` : line;
  };
  const entries = createMemo((): readonly RailEntry[] =>
    selectable().map((setting) => ({
      id: setting.id,
      title: titleOfSetting(setting),
      by: byLine(setting),
      why: setting.why,
      shown: setting.shown,
      pinned: setting.state === "pinned",
      withdrawn: isGhost(setting.id),
      grouped: floods.closedAt(setting.id)?.members.length,
    })),
  );
  const whatDecided = (decision: YardDecision): string => {
    const setting = drawn().find((held) => held.id === decision.id);
    return setting === undefined ? kindWords[decision.kind] : titleOfSetting(setting);
  };
  const cardView = createMemo((): YardCardView | undefined => {
    const card = props.card;
    if (card === undefined) return undefined;
    return viewOfCard(card, whatDecided, (ms) =>
      clockWord(ms, props.offsetMinutes ?? houseOffsetMinutes()),
    );
  });
  const current = (): string | undefined => {
    if (props.card !== undefined && cursor() === yardIds.card) return yardIds.card;
    return entries().find((entry) => entry.id === cursor())?.id ?? entries()[0]?.id;
  };
  createEffect(
    on(
      () => props.railActive,
      (active) => {
        if (active) setCursor(current());
        else floods.closeAll();
      },
    ),
  );
  const enterOrOpen = (setting: YardSetting): void => {
    const group = floods.closedAt(setting.id);
    if (group === undefined) props.onEnter(setting);
    else floods.open(group);
  };
  const answerAll = (setting: YardSetting, outcome: KeeperShowOutcome): void => {
    const group = outcome === "dismissed" ? floods.closedAt(setting.id) : undefined;
    for (const member of group?.members ?? [setting]) props.onAnswer(member, outcome);
  };
  const forEntry =
    (act: (setting: YardSetting) => void) =>
    (entry: RailEntry): void => {
      const setting = settingOf(entry.id);
      if (setting !== undefined) act(setting);
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
                cursor={props.railActive && current() === id}
                onFocusWithin={(within) =>
                  setEntered((held) => (within ? id : held === id ? undefined : held))
                }
              />
            )}
          </Show>
        )}
      </For>
      <Show when={layout().rail} keyed>
        {(rail) => (
          <div class="kw-yard-rail-slot" style={rectStyle(rectOf(railSlot))}>
            <Rail
              entries={entries()}
              cards={railSpots(rail, selectable())}
              card={cardView()}
              log={logBelowHead(rail, viewport())}
              head={within(rail, rail.head)}
              fold={rail.fold === undefined ? undefined : within(rail, rail.fold)}
              folded={rail.folded}
              heldBack={props.heldBack ?? 0}
              active={props.railActive}
              cursor={current()}
              onCursor={setCursor}
              onEnter={forEntry(enterOrOpen)}
              onAnswer={(entry, outcome) =>
                forEntry((setting) => answerAll(setting, outcome))(entry)
              }
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

interface SatelliteSlotProps {
  placement: Placement;
  setting: YardSetting;
  rect: Rect | undefined;
  shell: ShellSeams;
  by: string;
  withdrawn: boolean;
  cursor: boolean;
  onFocusWithin(within: boolean): void;
}

function SatelliteSlot(props: SatelliteSlotProps) {
  const satellite = () => satelliteOf(props.setting);
  const paneId = () => satellitePaneId(props.setting);
  const paneSpec = (): PaneSpec | undefined => {
    const shown = satellite();
    return shown.kind === "pane" ? shown.spec : undefined;
  };
  return (
    <div
      id={railEntryId(props.setting.id)}
      class="kw-yard-satellite"
      data-pane-id={paneId()}
      data-setting={props.setting.id}
      data-rung={props.placement.rung}
      data-layer={props.placement.layer}
      data-cursor={props.cursor ? "" : undefined}
      data-withdrawn={props.withdrawn ? "" : undefined}
      style={rectStyle(props.rect)}
      onFocusIn={() => props.onFocusWithin(true)}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          props.onFocusWithin(false);
        }
      }}
    >
      <PaneFrame
        name={titleOfSetting(props.setting)}
        state="idle"
        focused={props.cursor}
        spawnRank={0}
        ribbon={props.by}
      >
        <Switch>
          <Match when={paneSpec()} keyed>
            {(spec) => (
              <Dynamic
                component={definitionOf(spec.kind).component}
                id={paneId()}
                spec={spec}
                focused={false}
                shell={props.shell}
                onAction={() => undefined}
              />
            )}
          </Match>
          <Match when={satellite().kind === "note"}>
            <p class="kw-yard-note">{props.setting.what.ref}</p>
          </Match>
          <Match when={satellite().kind === "link"}>
            <p class="kw-yard-note">
              <a href={props.setting.what.ref} target="_blank" rel="noreferrer">
                {props.setting.what.ref}
              </a>
            </p>
          </Match>
        </Switch>
      </PaneFrame>
    </div>
  );
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

function stillWhile(
  still: () => boolean,
  settings: () => readonly YardSetting[],
): () => readonly YardSetting[] {
  const frozen = createMemo<readonly string[] | undefined>((held) =>
    still() ? (held ?? untrack(() => settings().map((setting) => setting.id))) : undefined,
  );
  return createMemo(() => inOrder(settings(), frozen()));
}

function viewOfCard(
  card: YardCard,
  whatDecided: (decision: YardDecision) => string,
  clock: (ms: number) => string,
): YardCardView {
  return {
    line: budgetLine(card, clock),
    decisions: card.decisions
      .toReversed()
      .map((decision) => decisionLine(decision, whatDecided(decision), clock)),
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

export function inOrder(
  settings: readonly YardSetting[],
  order: readonly string[] | undefined,
): readonly YardSetting[] {
  if (order === undefined) return settings;
  const rank = new Map(order.map((id, index) => [id, index]));
  const known = settings.filter((setting) => rank.has(setting.id));
  const fresh = settings.filter((setting) => !rank.has(setting.id));
  return [...known.toSorted((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)), ...fresh];
}

function railSpots(
  rail: RailLayout,
  ordered: readonly YardSetting[],
): Array<{ id: string; rect: Rect }> {
  const onRail = new Set(rail.cards.map((card) => card.id));
  const rects = rail.cards.map((card) => within(rail, card.rect)).toSorted((a, b) => a.y - b.y);
  return ordered
    .filter((setting) => onRail.has(setting.id))
    .flatMap((setting, index) => {
      const rect = rects[index];
      return rect === undefined ? [] : [{ id: setting.id, rect }];
    });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function logBelowHead(rail: RailLayout, viewport: Rect): Rect {
  const { gap, margin } = yardMetrics;
  const top = rail.head.y + rail.head.height + gap;
  const bottom = viewport.y + viewport.height - margin;
  return within(rail, { ...rail.head, y: top, height: Math.max(0, bottom - top) });
}

function railTarget(rail: RailLayout | undefined): Array<[string, Rect]> {
  return rail === undefined ? [] : [[railSlot, rail.region]];
}

function within(rail: RailLayout, rect: Rect): Rect {
  return { ...rect, x: rect.x - rail.region.x, y: rect.y - rail.region.y };
}

function grownFromHub(hub: Rect, target: Rect): Rect {
  const fromRight = target.x >= hub.x + hub.width;
  const edge = fromRight ? hub.x + hub.width + yardMetrics.gap : target.x + target.width;
  return { ...target, x: edge, width: 0 };
}
