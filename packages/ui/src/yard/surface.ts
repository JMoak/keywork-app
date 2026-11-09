import type { PlotCard, YardCard, YardSetting } from "@keywork-app/habitat";
import type { KeeperShowOutcome, SettingSubject } from "@keywork-app/protocol";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import type { HostPort } from "../host/port.ts";
import type { PaneSpec, ShellSeams } from "../panes/index.ts";
import { reducedMotionActive, reducedMotionQuery, watchMedia } from "../panes/stead/painter.ts";
import { windowFocus } from "../shell/window-focus.ts";
import type { TrailStep } from "./actions.ts";
import { createAttentionReports } from "./attention.ts";
import { createYardControl, type YardControl } from "./control.ts";
import { chainEndLine, chainRootLine, restoredLine, walkedLine, withdrawnLine } from "./copy.ts";
import { reaches } from "./layout.ts";
import { createYardModel } from "./model.ts";
import { openFrom, subjectOfPane } from "./openings.ts";
import { createYardPanels, type YardPanels } from "./panels.ts";
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
  enter(setting: YardSetting): void;
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
  const open = (from: YardSetting, what: SettingSubject): void => {
    const still = settingOf(from.id) !== undefined && !model.withdrawn(from.id);
    const parent = still ? from.id : from.sessionId;
    void openFrom(model.shellOf(from).client, what, parent).then(options.say);
  };
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
  const waitsBesidePanel = (id: string): boolean => {
    if (panels.settingOf(id) !== undefined) return false;
    for (let above = model.lineage.parentOf(id); above !== undefined; ) {
      if (panels.settingOf(above) !== undefined) return true;
      above = model.lineage.parentOf(above);
    }
    return false;
  };
  const enterInPlace = (setting: YardSetting): void => {
    if (!reaches(setting.shown, "unfold")) model.raiseByHand(setting);
    control.leaveRail();
    panels.focusWhenMounted(setting.id);
    model.attend({
      type: "keeper.attend",
      ts: new Date(now()).toISOString(),
      id: setting.id,
      kind: "enter",
    });
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
    enter: (setting) => {
      const withdrawn = model.withdrawn(setting.id);
      if (!withdrawn && waitsBesidePanel(setting.id)) return enterInPlace(setting);
      if (!withdrawn && !reaches(setting.shown, "unfold")) return model.raiseByHand(setting);
      control.leaveRail();
      takeIntoHub(setting, model.shellOf(setting), options.host);
      if (setting.state !== "pinned" && !withdrawn) answer(setting, "seen");
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
      control.on() &&
      model
        .settings()
        .some((setting) => setting.shown === "lantern" && showsSubject(setting, spec)),
  };
}

export function takeIntoHub(
  setting: YardSetting,
  shell: ShellSeams,
  host: Pick<HostPort, "openExternal">,
): void {
  const satellite = satelliteOf(setting);
  if (satellite.kind === "link") void host.openExternal(satellite.url);
  if (satellite.kind !== "pane") return;
  const spec = satellite.spec;
  if (spec.kind === "conversation" && spec.sessionId !== undefined) {
    shell.sessions.openSession(spec.sessionId);
  } else {
    shell.openPane(spec);
  }
}

function createReducedMotion(): Accessor<boolean> {
  const [reduced, setReduced] = createSignal(reducedMotionActive());
  onCleanup(watchMedia(reducedMotionQuery, () => setReduced(reducedMotionActive())));
  return reduced;
}
