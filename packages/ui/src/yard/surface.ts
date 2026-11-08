import type { YardSetting } from "@keywork-app/habitat";
import type { KeeperShowOutcome } from "@keywork-app/protocol";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import type { HostPort } from "../host/port.ts";
import type { PaneSpec, ShellSeams } from "../panes/index.ts";
import { reducedMotionActive, reducedMotionQuery, watchMedia } from "../panes/stead/painter.ts";
import { windowFocus } from "../shell/window-focus.ts";
import { createYardControl, type YardControl } from "./control.ts";
import { reaches } from "./layout.ts";
import { createYardModel } from "./model.ts";
import { satelliteOf, showsSubject } from "./satellites.ts";

export interface YardSurfaceOptions {
  readonly firstFrame: "yard" | "tiles";
  readonly shell: ShellSeams;
  readonly host: Pick<HostPort, "openExternal">;
  readonly focusedThread: Accessor<string | undefined>;
  readonly chord: (action: string) => string;
  readonly say: (line: string) => void;
  readonly returnHome: () => void;
  readonly now?: (() => number) | undefined;
}

export interface YardSurface {
  readonly control: YardControl;
  readonly reducedMotion: Accessor<boolean>;
  settings(): readonly YardSetting[];
  heldBack(): number;
  ownerOf(setting: YardSetting): string;
  enter(setting: YardSetting): void;
  answer(setting: YardSetting, outcome: KeeperShowOutcome): void;
  lanternOn(spec: PaneSpec): boolean;
}

export function createYardSurface(options: YardSurfaceOptions): YardSurface {
  const control = createYardControl(options);
  const reducedMotion = createReducedMotion();
  const model = createYardModel({
    shell: options.shell,
    focusedThread: options.focusedThread,
    windowFocused: windowFocus(),
    reducedMotion,
    now: options.now ?? Date.now,
  });
  const answer = (setting: YardSetting, outcome: KeeperShowOutcome): void => {
    void model.answer(setting, outcome).then((line) => {
      if (line !== undefined) options.say(line);
    });
  };

  return {
    control,
    reducedMotion,
    settings: model.settings,
    heldBack: model.heldBack,
    ownerOf: model.ownerOf,
    enter: (setting) => {
      if (!reaches(setting.shown, "unfold")) return model.raiseByHand(setting);
      control.leaveRail();
      takeIntoHub(setting, options.shell, options.host);
      if (setting.state !== "pinned") answer(setting, "seen");
    },
    answer,
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
