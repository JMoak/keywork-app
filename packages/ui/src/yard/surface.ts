import type { PlotCard, YardCard, YardSetting } from "@keywork-app/habitat";
import type {
  BusEnvelope,
  KeeperShowOutcome,
  Setting,
  SettingSubject,
} from "@keywork-app/protocol";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import type { HostPort } from "../host/port.ts";
import type { PaneSpec, ShellSeams } from "../panes/index.ts";
import { reducedMotionActive, reducedMotionQuery, watchMedia } from "../panes/stead/painter.ts";
import { windowFocus } from "../shell/window-focus.ts";
import { type TrailStep, yardRailActionId } from "./actions.ts";
import { createAttentionReports } from "./attention.ts";
import { createYardControl, type YardControl } from "./control.ts";
import {
  arrivedLine,
  chainEndLine,
  chainRootLine,
  openedAsCardLine,
  openedBesideLine,
  restoredLine,
  setOutLine,
  walkedLine,
  withdrawnLine,
} from "./copy.ts";
import type { PanelWay } from "./entering.ts";
import { reaches } from "./layout.ts";
import { createYardModel } from "./model.ts";
import { openFrom, subjectOfPane } from "./openings.ts";
import { createYardPanels, type DrawnAs, type YardPanels } from "./panels.ts";
import { createYardRuleBook, type RuleStorage } from "./rules.ts";
import { satelliteOf, showsSubject, titleOfSetting } from "./satellites.ts";
import { createKeeperSignals } from "./signals.ts";
import { stepAlong, type YardLineage } from "./trail.ts";

export interface YardSurfaceOptions {
  readonly firstFrame: "yard" | "tiles";
  readonly shell: ShellSeams;
  readonly home?: Accessor<ShellSeams | undefined> | undefined;
  readonly host: Pick<HostPort, "openExternal" | "surroundings">;
  readonly focusedThread: Accessor<string | undefined>;
  readonly storage?: RuleStorage | undefined;
  readonly chord: (action: string) => string;
  readonly say: (line: string) => void;
  readonly returnHome: () => void;
  readonly now?: (() => number) | undefined;
}

export interface YardSurface {
  readonly control: YardControl;
  readonly panels: YardPanels;
  readonly lineage: YardLineage;
  readonly reducedMotion: Accessor<boolean>;
  settings(): readonly YardSetting[];
  heldBack(): number;
  foldedAway(): readonly string[];
  inside(): string | undefined;
  card(): YardCard;
  withdrawn(id: string): boolean;
  ownerOf(setting: YardSetting): string;
  enter(setting: YardSetting, way: PanelWay): void;
  answer(setting: YardSetting, outcome: KeeperShowOutcome): void;
  open(from: YardSetting, what: SettingSubject): void;
  restore(plot: PlotCard): void;
  openFromPanel(spec: PaneSpec): boolean;
  interacted(setting: YardSetting): void;
  walk(step: TrailStep): void;
  walkFrom(id: string, step: TrailStep): void;
  lanternOn(spec: PaneSpec): boolean;
}

export function createYardSurface(options: YardSurfaceOptions): YardSurface {
  const now = options.now ?? Date.now;
  const control = createYardControl(options);
  const panels = createYardPanels();
  const reducedMotion = createReducedMotion();
  const windowFocused = windowFocus();
  const signals = createKeeperSignals({
    focusedThread: options.focusedThread,
    railFocused: control.railActive,
    drafts: options.shell.drafts,
    streaming: (sessionId) => options.shell.store.projection(sessionId).streaming !== undefined,
    surroundings: options.host.surroundings,
    now,
  });
  const model = createYardModel({
    shell: options.shell,
    home: options.home ?? (() => undefined),
    focusedThread: options.focusedThread,
    windowFocused,
    reducedMotion,
    signals,
    rules: createYardRuleBook(options.storage),
    now,
  });
  const attention = createAttentionReports({
    panel: panels.inside,
    now,
    attend: model.attend,
  });
  const answer = (setting: YardSetting, outcome: KeeperShowOutcome): void => {
    if (model.withdrawn(setting.id)) {
      options.say(withdrawnLine);
      return;
    }
    void model.answer(setting, outcome).then((line) => {
      if (line !== undefined) options.say(line);
    });
  };
  const settingOf = (id: string | undefined): YardSetting | undefined =>
    model.settings().find((setting) => setting.id === id);
  const railChord = (): string => options.chord(yardRailActionId);
  const landed = (opened: Setting, from: YardSetting, as: DrawnAs): void => {
    const title = titleOfSetting(opened);
    if (as === "card") {
      options.say(openedAsCardLine(title, railChord()));
      return;
    }
    panels.focusWhenMounted(opened.id);
    options.say(openedBesideLine(title, titleOfSetting(from)));
  };
  const open = (from: YardSetting, what: SettingSubject): void => {
    const still = settingOf(from.id) !== undefined && !model.withdrawn(from.id);
    const parent = still ? from.id : from.sessionId;
    void openFrom(model.shellOf(from).client, what, parent).then((opening) => {
      if ("unopened" in opening) options.say(opening.unopened);
      else panels.whenDrawn(opening.opened.id, (as) => landed(opening.opened, from, as));
    });
  };
  const announceWhatArrivesInTiles = (batch: readonly BusEnvelope[]): void => {
    if (control.on()) return;
    const arrived = proposedByTheModel(batch).flatMap((id) => {
      const setting = settingOf(id);
      return setting === undefined ? [] : [setOutLine(setting, model.ownerOf(setting))];
    });
    if (arrived.length > 0) options.say(arrivedLine(arrived, railChord()));
  };
  onCleanup(options.shell.feed.subscribe(announceWhatArrivesInTiles));
  const go = (id: string): void => {
    const setting = settingOf(id);
    if (setting === undefined) {
      control.leaveRail();
      options.returnHome();
      return;
    }
    if (control.railActive() || !panels.focus(id)) control.focusRail(id);
    options.say(walkedLine(model.lineage.chainOf(id), titleOfSetting(setting)));
  };
  const unfoldBeside = (setting: YardSetting): void => {
    if (!reaches(setting.shown, "unfold")) model.raiseByHand(setting);
    panels.focusWhenMounted(setting.id);
    model.attend({
      type: "keeper.attend",
      ts: new Date(now()).toISOString(),
      id: setting.id,
      kind: "enter",
    });
  };
  const openAsTile = (setting: YardSetting): void => {
    const shell = model.shellOf(setting);
    const before = shell.focusedPane();
    const opened = takeIntoHub(setting, shell, options.host);
    options.returnHome();
    const reached = opened === "pane" ? shell.focusedPane() !== before : opened !== undefined;
    if (reached && setting.state !== "pinned" && !model.withdrawn(setting.id)) {
      answer(setting, "seen");
    }
  };
  const cameFrom = new Map<string, string>();
  const walkFrom = (at: string | undefined, step: TrailStep): void => {
    const next =
      at === undefined ? undefined : stepAlong(model.lineage, at, step, (id) => cameFrom.get(id));
    if (next === undefined) {
      options.say(step === "rootward" ? chainRootLine : chainEndLine);
      return;
    }
    if (step === "rootward" && at !== undefined) cameFrom.set(next, at);
    go(next);
  };

  return {
    control,
    panels,
    lineage: model.lineage,
    reducedMotion,
    settings: model.settings,
    heldBack: model.heldBack,
    foldedAway: model.foldedAway,
    inside: model.inside,
    card: model.card,
    withdrawn: model.withdrawn,
    ownerOf: model.ownerOf,
    enter: (setting, way) => {
      if (way === "focus" && panels.focus(setting.id)) return;
      if (way === "tile") openAsTile(setting);
      else unfoldBeside(setting);
    },
    answer,
    open,
    restore: (plot) => {
      model.restorePlot(plot);
      options.say(restoredLine(model.lineage.chainOf(plot.id)));
    },
    openFromPanel: (spec) => {
      const from = panels.settingOf(panels.inside());
      const what = subjectOfPane(spec);
      if (from === undefined || what === undefined) return false;
      open(from, what);
      return true;
    },
    interacted: (setting) => attention.interacted(setting.id),
    walk: (step) => walkFrom(panels.inside() ?? options.focusedThread(), step),
    walkFrom,
    lanternOn: (spec) =>
      model
        .settings()
        .some((setting) => setting.shown === "lantern" && showsSubject(setting, spec)),
  };
}

export function proposedByTheModel(batch: readonly BusEnvelope[]): string[] {
  return batch.flatMap((envelope) =>
    envelope.type === "show.proposed" &&
    envelope.payload.replay !== true &&
    envelope.payload.setting.origin !== "keeper"
      ? [envelope.payload.setting.id]
      : [],
  );
}

export type TakenInto = "pane" | "session" | "elsewhere";

export function takeIntoHub(
  setting: YardSetting,
  shell: ShellSeams,
  host: Pick<HostPort, "openExternal">,
): TakenInto | undefined {
  const satellite = satelliteOf(setting);
  if (satellite.kind === "link") {
    void host.openExternal(satellite.url);
    return "elsewhere";
  }
  if (satellite.kind !== "pane") return undefined;
  const spec = satellite.spec;
  if (spec.kind === "conversation" && spec.sessionId !== undefined) {
    shell.sessions.openSession(spec.sessionId);
    return "session";
  }
  shell.openPane(spec);
  return "pane";
}

function createReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = createSignal(reducedMotionActive());
  onCleanup(watchMedia(reducedMotionQuery, () => setReduced(reducedMotionActive())));
  return reduced;
}
