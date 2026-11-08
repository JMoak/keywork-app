import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Surroundings, SurroundingsPort } from "../host/port.ts";
import { createDraftLedger } from "../shell/drafts.ts";
import {
  createKeeperSignals,
  type KeeperPage,
  type KeeperSignalSeams,
  unseenSurroundings,
} from "./signals.ts";

describe("the signals the console reads for the yard", () => {
  it("knows a non-empty draft only in the focused thread", () => {
    const drafts = createDraftLedger();
    const { signals, focus, dispose } = signalsOver({ drafts });
    expect(signals().draftOpen).toBe(false);
    drafts.mark("pane-1", "elsewhere");
    expect(signals().draftOpen).toBe(false);
    drafts.mark("pane-2", "focused");
    expect(signals().draftOpen).toBe(true);
    focus(undefined);
    expect(signals().draftOpen).toBe(false);
    focus("focused");
    drafts.mark("pane-2", undefined);
    expect(signals().draftOpen).toBe(false);
    dispose();
  });

  it("knows a reply is arriving only in the focused thread", () => {
    const { signals, focus, dispose } = signalsOver({
      streaming: (sessionId) => sessionId === "talking",
    });
    expect(signals().streaming).toBe(false);
    focus("talking");
    expect(signals().streaming).toBe(true);
    dispose();
  });

  it("stamps the keeper's return when the console is shown again after hidden", () => {
    const page = fakePage();
    let clock = 1000;
    const { signals, dispose } = signalsOver({ page: page.page, now: () => clock });
    expect(signals().returnedAt).toBeUndefined();
    page.hide(true);
    clock = 5000;
    expect(signals().visible).toBe(false);
    page.hide(false);
    expect(signals()).toMatchObject({ visible: true, returnedAt: 5000 });
    dispose();
  });

  it("takes the console's own fullscreen from the page or the window, and the rest from the host", async () => {
    const page = fakePage();
    const port = fakeSurroundings({ ...unseenSurroundings, displayShared: true });
    const { signals, dispose } = signalsOver({ page: page.page, surroundings: port });
    await Promise.resolve();
    expect(signals()).toMatchObject({ fullscreen: false, displayShared: true });
    page.fullscreen(true);
    expect(signals().fullscreen).toBe(true);
    page.fullscreen(false);
    port.say({ fullscreen: true, fullscreenElsewhere: true, displayShared: false });
    expect(signals()).toMatchObject({
      fullscreen: true,
      fullscreenElsewhere: true,
      displayShared: false,
    });
    dispose();
  });

  it("passes false for what no platform reports yet, and the rail's focus as it stands", () => {
    const [rail, setRail] = createSignal(false);
    const { signals, dispose } = signalsOver({ railFocused: rail });
    expect(signals()).toMatchObject({
      doNotDisturb: false,
      quietHours: false,
      fullscreenElsewhere: false,
      displayShared: false,
      railFocused: false,
    });
    setRail(true);
    expect(signals().railFocused).toBe(true);
    dispose();
  });
});

function signalsOver(overrides: Partial<KeeperSignalSeams>) {
  return createRoot((dispose) => {
    const [focused, focus] = createSignal<string | undefined>("focused");
    const signals = createKeeperSignals({
      focusedThread: focused,
      railFocused: () => false,
      drafts: undefined,
      streaming: () => false,
      surroundings: undefined,
      page: fakePage().page,
      now: () => 0,
      ...overrides,
    });
    return { signals, focus: (thread: string | undefined) => focus(thread), dispose };
  });
}

function fakePage() {
  let hidden = false;
  let fullscreen = false;
  const watchers = new Set<() => void>();
  const changed = (): void => {
    for (const watcher of watchers) watcher();
  };
  const page: KeeperPage = {
    hidden: () => hidden,
    fullscreen: () => fullscreen,
    watch: (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
  return {
    page,
    hide: (next: boolean): void => {
      hidden = next;
      changed();
    },
    fullscreen: (next: boolean): void => {
      fullscreen = next;
      changed();
    },
  };
}

function fakeSurroundings(
  first: Surroundings,
): SurroundingsPort & { say(next: Surroundings): void } {
  const listeners = new Set<(surroundings: Surroundings) => void>();
  return {
    read: async () => first,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    say: (next) => {
      for (const listener of listeners) listener(next);
    },
  };
}
