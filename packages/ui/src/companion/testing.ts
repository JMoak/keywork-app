import type { PageHost } from "./companion-page.tsx";
import type {
  CompanionConditions,
  CompanionHost,
  CompanionPort,
  CompanionPreferences,
  CompanionSnapshot,
  ScreenBox,
  SteadAsk,
  SteadRequest,
} from "./port.ts";

export const offPreferences: CompanionPreferences = {
  version: 1,
  enabled: false,
  optInOffered: true,
  mode: "floating",
  hidden: false,
  still: false,
  quiet: false,
  onlyWhileBusy: false,
  size: 100,
  shortcut: null,
  creature: null,
  motion: "system",
  positions: {},
};

export const frontDoorPortUnused: Pick<
  CompanionPort,
  "choose" | "hatch" | "askForStead" | "release" | "onSteadKey"
> = {
  choose: () => undefined,
  hatch: () => undefined,
  askForStead: () => undefined,
  release: () => undefined,
  onSteadKey: () => () => undefined,
};

export const frontDoorHostUnused: Pick<
  CompanionHost,
  | "askForStead"
  | "takeKeyboardBack"
  | "steadPutAway"
  | "onChooseRequested"
  | "onHatchRequested"
  | "onSteadRequested"
> = {
  askForStead: () => undefined,
  takeKeyboardBack: async () => undefined,
  steadPutAway: () => undefined,
  onChooseRequested: () => () => undefined,
  onHatchRequested: () => () => undefined,
  onSteadRequested: () => () => undefined,
};

export function quietPageHost(): PageHost {
  return {
    now: () => 0,
    setTimeout: () => undefined,
    clearTimeout: () => undefined,
    requestAnimationFrame: () => undefined,
    cancelAnimationFrame: () => undefined,
    random: () => 0.5,
    devicePixelRatio: () => 1,
    systemReducesMotion: () => true,
    readToken: (name) => `var(${name})`,
    viewport: () => ({ width: loopCompanionAt.width, height: loopCompanionAt.height }),
    storage: undefined,
  };
}

export interface CompanionLoop {
  readonly port: CompanionPort;
  readonly host: CompanionHost;
  readonly said: string[];
  stored(): CompanionPreferences;
  latest(): CompanionSnapshot | undefined;
  conditions(next: CompanionConditions): void;
}

export const loopCompanionAt: ScreenBox = { x: 1400, y: 820, width: 440, height: 204 };

export function companionLoop(kept: Partial<CompanionPreferences> = {}): CompanionLoop {
  let stored: CompanionPreferences = { ...offPreferences, ...kept };
  let latest: CompanionSnapshot | undefined;
  const said: string[] = [];
  const snapshots = listeners<CompanionSnapshot>();
  const conditions = listeners<CompanionConditions>();
  const steadKeys = listeners<void>();
  const chosen = listeners<string>();
  const hatches = listeners<void>();
  const steads = listeners<SteadRequest>();
  const opens = listeners<string | undefined>();
  const askForStead = (ask: SteadAsk): void => steads.tell({ ...ask, beside: loopCompanionAt });
  return {
    said,
    stored: () => stored,
    latest: () => latest,
    conditions: conditions.tell,
    port: {
      onSnapshot: snapshots.hear,
      onConditions: conditions.hear,
      onSteadKey: steadKeys.hear,
      ready: () => undefined,
      setInteractive: () => undefined,
      sendMask: () => undefined,
      drag: () => undefined,
      dragEnd: () => undefined,
      nudge: () => undefined,
      home: () => undefined,
      openMenu: () => undefined,
      open: opens.tell,
      answer: () => undefined,
      reportWakeups: () => undefined,
      choose: chosen.tell,
      hatch: () => hatches.tell(),
      askForStead,
      release: () => void said.push("the keyboard goes back to the keeper's work"),
    },
    host: {
      publish: (snapshot) => {
        latest = snapshot;
        snapshots.tell(snapshot);
      },
      preferences: async () => stored,
      setPreferences: async (patch) => {
        stored = { ...stored, ...patch };
        return stored;
      },
      presence: async () => ({ mode: "floating", window: "shown", reason: "floating" }),
      show: async () => undefined,
      hide: async () => undefined,
      onPresenceChanged: () => () => undefined,
      onAnswerRequested: () => () => undefined,
      onOpenRequested: opens.hear,
      onSettingsRequested: () => () => undefined,
      onSwitchRequested: () => () => undefined,
      askForStead,
      takeKeyboardBack: async () => void said.push("the companion takes the keyboard back"),
      steadPutAway: (tookTheKeyboard) =>
        void said.push(
          tookTheKeyboard
            ? "the stead is put away"
            : "the stead is put away, the keyboard untouched",
        ),
      onChooseRequested: chosen.hear,
      onHatchRequested: hatches.hear,
      onSteadRequested: steads.hear,
    },
  };
}

function listeners<Payload>() {
  const hearing = new Set<(payload: Payload) => void>();
  return {
    hear: (listener: (payload: Payload) => void): (() => void) => {
      hearing.add(listener);
      return () => hearing.delete(listener);
    },
    tell: (payload: Payload): void => {
      for (const listener of [...hearing]) listener(payload);
    },
  };
}
