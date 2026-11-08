import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";
import type { Surroundings, SurroundingsPort } from "../host/port.ts";
import type { DraftLedger } from "../shell/drafts.ts";

export interface KeeperSignals {
  readonly visible: boolean;
  readonly draftOpen: boolean;
  readonly streaming: boolean;
  readonly railFocused: boolean;
  readonly returnedAt: number | undefined;
  readonly fullscreen: boolean;
  readonly fullscreenElsewhere: boolean;
  readonly displayShared: boolean;
  readonly doNotDisturb: boolean;
  readonly quietHours: boolean;
}

export interface KeeperSignalSeams {
  readonly focusedThread: Accessor<string | undefined>;
  readonly railFocused: Accessor<boolean>;
  readonly drafts: Pick<DraftLedger, "open"> | undefined;
  streaming(sessionId: string): boolean;
  readonly surroundings: SurroundingsPort | undefined;
  readonly page?: KeeperPage | undefined;
  now(): number;
}

export interface KeeperPage {
  hidden(): boolean;
  fullscreen(): boolean;
  watch(changed: () => void): () => void;
}

export const unseenSurroundings: Surroundings = {
  fullscreen: false,
  fullscreenElsewhere: false,
  displayShared: false,
};

export function createKeeperSignals(seams: KeeperSignalSeams): Accessor<KeeperSignals> {
  const page = seams.page ?? browserPage();
  const [visible, setVisible] = createSignal(!page.hidden());
  const [pageFullscreen, setPageFullscreen] = createSignal(page.fullscreen());
  onCleanup(
    page.watch(() => {
      setVisible(!page.hidden());
      setPageFullscreen(page.fullscreen());
    }),
  );
  const surroundings = followSurroundings(seams.surroundings);
  const returnedAt = returnsFromAway(() => !visible(), seams.now);
  const streaming = (): boolean => {
    const thread = seams.focusedThread();
    return thread !== undefined && seams.streaming(thread);
  };

  return () => ({
    visible: visible(),
    draftOpen: seams.drafts?.open(seams.focusedThread()) ?? false,
    streaming: streaming(),
    railFocused: seams.railFocused(),
    returnedAt: returnedAt(),
    fullscreen: pageFullscreen() || surroundings().fullscreen,
    fullscreenElsewhere: surroundings().fullscreenElsewhere,
    displayShared: surroundings().displayShared,
    doNotDisturb: false,
    quietHours: false,
  });
}

export function followSurroundings(port: SurroundingsPort | undefined): Accessor<Surroundings> {
  const [held, setHeld] = createSignal(unseenSurroundings);
  if (port === undefined) return held;
  let heard = false;
  onCleanup(
    port.onChange((next) => {
      heard = true;
      setHeld(next);
    }),
  );
  void port.read().then(
    (read) => {
      if (!heard) setHeld(read);
    },
    () => undefined,
  );
  return held;
}

function returnsFromAway(away: Accessor<boolean>, now: () => number): Accessor<number | undefined> {
  const [returnedAt, setReturnedAt] = createSignal<number>();
  createEffect(
    on(away, (isAway, wasAway) => {
      if (wasAway === true && !isAway) setReturnedAt(now());
    }),
  );
  return returnedAt;
}

function browserPage(): KeeperPage {
  if (typeof document === "undefined") {
    return { hidden: () => false, fullscreen: () => false, watch: () => () => undefined };
  }
  const events = ["visibilitychange", "fullscreenchange"] as const;
  return {
    hidden: () => document.visibilityState === "hidden",
    fullscreen: () => document.fullscreenElement != null,
    watch: (changed) => {
      for (const event of events) document.addEventListener(event, changed);
      return () => {
        for (const event of events) document.removeEventListener(event, changed);
      };
    },
  };
}
