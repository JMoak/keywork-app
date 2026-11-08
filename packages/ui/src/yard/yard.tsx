import type { TickScheduler } from "@keywork-app/client";
import { type Placement, type YardSetting, yardMetrics } from "@keywork-app/habitat";
import type { KeeperShowOutcome } from "@keywork-app/protocol";
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { PaneFrame } from "../chrome/pane-frame.tsx";
import type { Rect } from "../layout/index.ts";
import { definitionOf, type PaneSpec, type ShellSeams } from "../panes/index.ts";
import { frameTick } from "../shell/frame-tick.ts";
import { setOutLine } from "./copy.ts";
import { type RailLayout, yardLayout } from "./layout.ts";
import { createGlide } from "./motion.ts";
import { Rail, type RailEntry, railEntryId, rectStyle } from "./rail.tsx";
import { satelliteOf, satellitePaneId, titleOfSetting } from "./satellites.ts";
import "./yard.css";

export interface YardProps {
  readonly on: boolean;
  readonly settings: readonly YardSetting[];
  readonly heldBack?: number | undefined;
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
  const layout = createMemo(() =>
    yardLayout({
      viewport: viewport(),
      settings: props.on ? props.settings : [],
      railWanted: props.on && props.railActive,
      prefs: { reducedMotion: props.reducedMotion, tier: "interact" },
    }),
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
    props.settings.find((setting) => setting.id === id);
  const satelliteIds = createMemo(() => layout().satellites.map((placement) => placement.id), [], {
    equals: sameIds,
  });
  const shownSatellite = (id: string): ShownSatellite | undefined => {
    const placement = layout().satellites.find((candidate) => candidate.id === id);
    const setting = settingOf(id);
    return placement === undefined || setting === undefined ? undefined : { placement, setting };
  };
  const byLine = (setting: YardSetting): string => setOutLine(setting, props.ownerOf(setting));
  const entries = createMemo((): readonly RailEntry[] =>
    layout().selectable.map((setting) => ({
      id: setting.id,
      title: titleOfSetting(setting),
      by: byLine(setting),
      why: setting.why,
      shown: setting.shown,
      pinned: setting.state === "pinned",
    })),
  );
  const current = (): string | undefined =>
    entries().find((entry) => entry.id === cursor())?.id ?? entries()[0]?.id;
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
                cursor={props.railActive && current() === id}
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
              cards={rail.cards.map((card) => ({ id: card.id, rect: within(rail, card.rect) }))}
              head={within(rail, rail.head)}
              fold={rail.fold === undefined ? undefined : within(rail, rail.fold)}
              folded={rail.folded}
              heldBack={props.heldBack ?? 0}
              active={props.railActive}
              cursor={current()}
              onCursor={setCursor}
              onEnter={forEntry((setting) => props.onEnter(setting))}
              onAnswer={(entry, outcome) =>
                forEntry((setting) => props.onAnswer(setting, outcome))(entry)
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
  cursor: boolean;
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
      style={rectStyle(props.rect)}
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

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
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
