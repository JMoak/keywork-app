import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../../host/browser.ts";
import { inertShellExtras } from "../../shell/trust.test.ts";
import type { ShellSeams } from "../registry.ts";
import { checkPaneDefinition } from "../testing.ts";
import { desktopOnlyLine, type ScreenSpec, screenPane } from "./index.tsx";
import type { ScreenPort, ScreenViewEvent } from "./port.ts";
import { screenPortOf } from "./port.ts";
import {
  endingLine,
  pathWord,
  startingView,
  statsLine,
  statusLine,
  viewState,
} from "./view-state.ts";

afterEach(cleanup);

const sessionId = "session-0001";

const displays = [
  { id: "1", label: "Primary", width: 2560, height: 1440, scaleFactor: 1, primary: true },
  { id: "2", label: "Side", width: 3840, height: 2160, scaleFactor: 1.5, primary: false },
];

const granted: ScreenViewEvent = {
  kind: "granted",
  sessionId,
  displays,
  current: "1",
  expiresAt: "2026-11-05T10:00:00.000Z",
  path: "direct",
};

const stats: ScreenViewEvent = {
  kind: "stats",
  sessionId,
  stats: {
    at: 2000,
    frames: 90,
    bytes: 2_000_000,
    width: 2560,
    height: 1440,
    codec: "video/VP9",
    qualityLimitation: "none",
    pair: {
      local: { address: "100.101.102.103", port: 47101, type: "host" },
      remote: { address: "100.101.102.104", port: 47102, type: "host" },
      rttMs: 4,
    },
  },
  rates: { bitrateKbps: 6400, framesPerSecond: 30 },
};

function fakePort() {
  const listeners = new Set<(event: ScreenViewEvent) => void>();
  const port: ScreenPort & { emit(event: ScreenViewEvent): void } = {
    view: vi.fn(async () => ({ ok: true as const, sessionId })),
    attach: vi.fn(),
    onEvent: vi.fn((_id, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    stop: vi.fn(async () => {}),
    cycleDisplay: vi.fn(async () => {}),
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
  return port;
}

function shellWith(screen: ScreenPort | undefined): ShellSeams {
  return {
    store: {} as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: screen === undefined ? browserHost() : { ...browserHost(), screen },
    workspace: "C:/work",
    currentSession: () => undefined,
    focusedPane: () => undefined,
    rebind: () => {},
    unseen: () => false,
    ...inertShellExtras(),
  } as ShellSeams;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(spec: ScreenSpec, shell: ShellSeams) {
  let act: (action: string) => void = () => {};
  const view = render(() => (
    <screenPane.component
      id="p1"
      spec={spec}
      focused={true}
      shell={shell}
      onAction={(handler) => {
        act = handler;
      }}
    />
  ));
  return { ...view, act: (action: string) => act(action) };
}

describe("the screen pane", () => {
  it("asks to view the peer, attaches its video and walks through asking, live and ended", async () => {
    const port = fakePort();
    const { container, unmount } = mount(
      { kind: "screen", peer: "nSpark", label: "spark-ad4d" },
      shellWith(port),
    );
    await settle();
    expect(port.view).toHaveBeenCalledWith({ peer: "nSpark" });
    const video = container.querySelector("video");
    expect(port.attach).toHaveBeenCalledWith(sessionId, video);
    port.emit({ kind: "asking", sessionId });
    expect(container.textContent).toContain(
      "waiting for spark-ad4d to allow viewing · ignored after 30 s",
    );
    port.emit(granted);
    port.emit({ kind: "connection", sessionId, state: "connected" });
    port.emit(stats);
    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("live");
    expect(container.querySelector(".kw-screen-path")?.textContent).toBe("direct");
    expect(container.textContent).toContain("view only · Primary (1 of 2)");
    expect(container.textContent).toContain(
      "2560×1440 · 30 fps · 6.4 Mbps · VP9 · rtt 4 ms · host/host",
    );
    port.emit({ kind: "ended", sessionId, reason: "kill-switch" });
    expect(container.textContent).toContain("ended · stopped by the kill switch on that machine");
    unmount();
    expect(port.stop).not.toHaveBeenCalled();
  });

  it("starts the requested session in an ended pane a summon rebinds, view or control", async () => {
    const port = fakePort();
    const [spec, rebind] = createSignal<ScreenSpec>({ kind: "screen", peer: "moak-main" });
    const { container } = render(() => (
      <screenPane.component
        id="p1"
        spec={spec()}
        focused={true}
        shell={shellWith(port)}
        onAction={() => {}}
      />
    ));
    await settle();
    port.emit({ kind: "ended", sessionId, reason: "kill-switch" });
    expect(container.textContent).toContain("ended · stopped by the kill switch on that machine");

    rebind({ kind: "screen", peer: "moak-main", control: true });
    await settle();
    expect(port.view).toHaveBeenLastCalledWith({ peer: "moak-main", control: true });
    expect(container.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("starting");
    port.emit({ kind: "asking", sessionId });
    expect(container.textContent).not.toContain("ended");

    port.emit({ kind: "ended", sessionId, reason: "kill-switch" });
    rebind({ kind: "screen", peer: "moak-main", control: true });
    await settle();
    expect(port.view).toHaveBeenCalledTimes(3);
    expect(port.stop).not.toHaveBeenCalled();
  });

  it("keeps a live session when a summon rebinds the request it already shows", async () => {
    const port = fakePort();
    const [spec, rebind] = createSignal<ScreenSpec>({ kind: "screen", peer: "moak-main" });
    render(() => (
      <screenPane.component
        id="p1"
        spec={spec()}
        focused={true}
        shell={shellWith(port)}
        onAction={() => {}}
      />
    ));
    await settle();
    port.emit(granted);
    rebind({ kind: "screen", peer: "moak-main" });
    await settle();
    expect(port.view).toHaveBeenCalledTimes(1);

    rebind({ kind: "screen", peer: "moak-main", control: true });
    await settle();
    expect(port.stop).toHaveBeenCalledWith(sessionId);
    expect(port.view).toHaveBeenLastCalledWith({ peer: "moak-main", control: true });
  });

  it("stops and cycles displays from its keys, and stops when closed while live", async () => {
    const port = fakePort();
    const { act, unmount } = mount({ kind: "screen", peer: "nSpark" }, shellWith(port));
    await settle();
    port.emit(granted);
    act("screen.display");
    expect(port.cycleDisplay).toHaveBeenCalledWith(sessionId);
    act("screen.stop");
    expect(port.stop).toHaveBeenCalledWith(sessionId);
    unmount();
    expect(port.stop).toHaveBeenCalledTimes(2);
  });

  it("says why when the peer cannot be reached", async () => {
    const port = fakePort();
    port.view = vi.fn(async () => ({ ok: false as const, problem: "no signaling route to nGone" }));
    const { container } = mount({ kind: "screen", peer: "nGone" }, shellWith(port));
    await settle();
    expect(container.textContent).toContain("could not reach nGone · no signaling route to nGone");
  });

  it("teaches where it works when the host has no screen port", () => {
    const { container } = mount({ kind: "screen", peer: "nSpark" }, shellWith(undefined));
    expect(container.textContent).toBe(desktopOnlyLine);
    expect(screenPortOf(browserHost())).toBeUndefined();
  });

  it("is summoned with a machine and titled by its label", () => {
    const shell = shellWith(undefined);
    expect(screenPane.summon?.spec(shell, "nSpark")).toEqual({ kind: "screen", peer: "nSpark" });
    expect(screenPane.title({ kind: "screen", peer: "nSpark", label: "spark-ad4d" }, shell)).toBe(
      "screen · spark-ad4d",
    );
    expect(screenPane.spec.safeParse({ kind: "screen", peer: "" }).success).toBe(false);
  });
});

describe("the screen view state", () => {
  it("ignores everything after the session ends", () => {
    const ended = viewState(startingView, {
      kind: "ended",
      sessionId,
      reason: "denied",
      detail: "timed-out",
    });
    expect(viewState(ended, granted)).toBe(ended);
    expect(statusLine(ended, "spark")).toBe("ended · nobody answered within 30 s");
  });

  it("names every path class and every ending in words", () => {
    expect(pathWord("derp")).toBe("relayed through DERP · low-bandwidth preset");
    expect(pathWord("peer-relay")).toBe("peer relay");
    expect(pathWord("local")).toBe("this machine");
    expect(pathWord(undefined)).toBe("path unknown");
    expect(endingLine({ reason: "denied", detail: "needs-permission" })).toBe(
      "that machine has not allowed screen recording yet",
    );
    expect(endingLine({ reason: "idle" })).toBe("the viewer went quiet for five minutes");
    expect(endingLine({ reason: "something-new" })).toBe("something-new");
  });

  it("shows stats only while live and names a quality limit", () => {
    const connecting = viewState(viewState(startingView, granted), stats);
    expect(statsLine(connecting)).toBe("");
    const live = viewState(connecting, { kind: "connection", sessionId, state: "connected" });
    const limited = viewState(live, {
      ...stats,
      stats: {
        ...(stats.kind === "stats" ? stats.stats : { at: 0, frames: 0, bytes: 0 }),
        qualityLimitation: "bandwidth",
      },
    } as ScreenViewEvent);
    expect(statsLine(limited)).toContain("limited by bandwidth");
  });
});

describe("the screen pane's path class", () => {
  const relayedStats: ScreenViewEvent = {
    ...stats,
    stats: {
      ...(stats.kind === "stats" ? stats.stats : { at: 0, frames: 0, bytes: 0 }),
      pair: {
        local: { address: "100.101.102.103", port: 47101, type: "host" },
        remote: { address: "100.101.102.105", port: 3478, type: "relay" },
      },
    },
  } as ScreenViewEvent;

  it("reads a connected session's class off its selected pair, live, in the header", async () => {
    const port = fakePort();
    const { container } = mount(
      { kind: "screen", peer: "nMain", label: "moak-main" },
      shellWith(port),
    );
    await settle();
    port.emit({ ...granted, path: "unknown" } as ScreenViewEvent);
    port.emit({ kind: "connection", sessionId, state: "connected" });
    expect(container.querySelector(".kw-screen-path")?.textContent).toBe("path unknown");
    port.emit(stats);
    expect(container.querySelector(".kw-screen-path")?.getAttribute("data-path")).toBe("direct");
    expect(container.querySelector(".kw-screen-path")?.textContent).toBe("direct");
    port.emit(relayedStats);
    expect(container.querySelector(".kw-screen-path")?.textContent).toBe(
      "relayed · low-bandwidth preset",
    );
  });

  it("keeps the last known class while a stats report carries no pair", () => {
    const live = viewState(viewState(startingView, granted), stats);
    const unpaired = { ...stats, stats: { at: 3000, frames: 1, bytes: 1 } } as ScreenViewEvent;
    expect(viewState(live, unpaired).path).toBe("direct");
  });
});

describe("the screen pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(screenPane);
  });
});
