import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionPage, type PageHost } from "./companion-page.tsx";
import type { CompanionConditions, CompanionPort, CompanionSnapshot } from "./port.ts";
import { restingConditions } from "./port.ts";
import { placeholderRenderer, type Renderer } from "./renderer.ts";

interface FakePort extends CompanionPort {
  calls: Array<[string, unknown]>;
  emitSnapshot(snapshot: CompanionSnapshot): void;
  emitConditions(conditions: CompanionConditions): void;
}

function fakePort(): FakePort {
  const calls: Array<[string, unknown]> = [];
  let onSnapshot: ((snapshot: CompanionSnapshot) => void) | undefined;
  let onConditions: ((conditions: CompanionConditions) => void) | undefined;
  const record =
    (name: string) =>
    (payload?: unknown): void => {
      calls.push([name, payload]);
    };
  return {
    calls,
    emitSnapshot: (snapshot) => onSnapshot?.(snapshot),
    emitConditions: (conditions) => onConditions?.(conditions),
    onSnapshot: (listener) => {
      onSnapshot = listener;
      return () => undefined;
    },
    onConditions: (listener) => {
      onConditions = listener;
      return () => undefined;
    },
    ready: record("ready"),
    setInteractive: record("setInteractive"),
    sendMask: record("sendMask"),
    drag: record("drag"),
    dragEnd: record("dragEnd"),
    nudge: record("nudge"),
    home: record("home"),
    openMenu: record("openMenu"),
    open: record("open"),
    answer: record("answer"),
    reportWakeups: record("reportWakeups"),
  };
}

interface FakeHost extends PageHost {
  advance(ms: number): void;
  wakeups: number;
}

function fakeHost(): FakeHost {
  let now = 0;
  interface Timer {
    due: number;
    fn: () => void;
  }
  const timers = new Set<Timer>();
  const host: FakeHost = {
    wakeups: 0,
    now: () => now,
    setTimeout: (fn, ms) => {
      const timer = {
        due: now + ms,
        fn: () => {
          host.wakeups += 1;
          fn();
        },
      };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (handle) => timers.delete(handle as Timer),
    requestAnimationFrame: (fn) => {
      const timer = {
        due: now + 16,
        fn: () => {
          host.wakeups += 1;
          fn(now);
        },
      };
      timers.add(timer);
      return timer;
    },
    cancelAnimationFrame: (handle) => timers.delete(handle as Timer),
    random: () => 0.5,
    devicePixelRatio: () => 1,
    systemReducesMotion: () => false,
    readToken: (name) => `var(${name})`,
    viewport: () => ({ width: 144, height: 180 }),
    storage: undefined,
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = [...timers]
          .filter((timer) => timer.due <= end)
          .sort((a, b) => a.due - b.due)[0];
        if (next === undefined) break;
        timers.delete(next);
        now = next.due;
        next.fn();
      }
      now = end;
    },
  };
  return host;
}

const idle: CompanionSnapshot = {
  creature: { name: "pip", hueStop: 1 },
  state: "idle",
  stateLabel: "idle",
  activeThreads: 0,
  finishedUnseen: 0,
  threadId: undefined,
  tool: undefined,
  needsYou: undefined,
};

const porch: CompanionSnapshot = {
  ...idle,
  state: "porch",
  stateLabel: "at the porch",
  activeThreads: 2,
  threadId: "t1",
  needsYou: {
    title: "rename the ledger",
    line: "asks to run a command",
    callId: "c1",
    answers: ["approve", "deny"],
  },
};

function mount() {
  const port = fakePort();
  const host = fakeHost();
  const view = render(() => <CompanionPage port={port} host={host} />);
  return { port, host, view, calls: (name: string) => port.calls.filter(([n]) => n === name) };
}

afterEach(cleanup);

describe("the companion page", () => {
  it("paints the idle frame at once, says it is ready once, and names the creature for assistive tech", () => {
    const { port, host, view, calls } = mount();
    expect(calls("ready")).toHaveLength(1);
    port.emitSnapshot(porch);
    host.advance(100);
    expect(view.getByRole("button", { name: "pip, at the porch, 2 active threads" })).toBeTruthy();
    expect(view.getByText("2")).toBeTruthy();
    expect(calls("ready")).toHaveLength(1);
  });

  it("shows the needs-you bubble with its answer keys; an answer never opens the thread, the title does", () => {
    const { port, view, calls } = mount();
    port.emitSnapshot(porch);
    expect(view.getByText("rename the ledger")).toBeTruthy();
    expect(view.getByText("asks to run a command")).toBeTruthy();
    fireEvent.click(view.getByText("deny"));
    expect(calls("answer")).toEqual([["answer", { callId: "c1", pick: "deny" }]]);
    expect(calls("open")).toEqual([]);
    fireEvent.click(view.getByText("rename the ledger"));
    expect(calls("open")).toEqual([["open", "t1"]]);
    port.emitConditions({ ...restingConditions, quiet: true });
    expect(view.queryByText("rename the ledger")).toBeNull();
  });

  it("offers overturn for a decision made in the keeper's name and sends it through the port", () => {
    const { port, view, calls } = mount();
    port.emitSnapshot({
      ...idle,
      state: "porch",
      stateLabel: "at the porch",
      threadId: "t1",
      decided: {
        recordId: "r7",
        sessionId: "t1",
        title: "rename the ledger",
        tool: "bash",
        ruleClass: "shell.read",
      },
    });
    expect(view.getByText("decided for you · approved bash")).toBeTruthy();
    fireEvent.click(view.getByText("overturn"));
    expect(calls("answer")).toEqual([
      ["answer", { callId: "decided:r7", pick: "deny", overturn: { recordId: "r7" } }],
    ]);
    expect(calls("open")).toEqual([]);
  });

  it("schedules zero wakeups when hidden or still, and stays under the ambient budget otherwise", () => {
    const { port, host } = mount();
    port.emitSnapshot(idle);
    host.advance(60_000);
    const ambient = host.wakeups;
    expect(ambient).toBeGreaterThan(0);
    expect(ambient).toBeLessThanOrEqual(16 * 60);
    port.emitConditions({ ...restingConditions, ceiling: "hidden" });
    const before = host.wakeups;
    host.advance(60_000);
    expect(host.wakeups).toBe(before);
    port.emitConditions({ ...restingConditions, still: true });
    const stillBefore = host.wakeups;
    host.advance(60_000);
    expect(host.wakeups).toBe(stillBefore);
  });

  it("pauses completely while tucked, holding snapshots, and resumes on untuck with the latest one", () => {
    const port = fakePort();
    const host = fakeHost();
    let paints = 0;
    const counted: Renderer = Object.assign(
      (...args: Parameters<Renderer>) => {
        paints += 1;
        return placeholderRenderer(...args);
      },
      { rows: placeholderRenderer.rows },
    );
    const view = render(() => <CompanionPage port={port} host={host} renderer={counted} />);
    port.emitSnapshot(idle);
    host.advance(5_000);
    port.emitConditions({ ...restingConditions, ceiling: "hidden" });
    const tucked = { paints, wakeups: host.wakeups, reports: port.calls.length };
    port.emitSnapshot({ ...idle, state: "working", stateLabel: "working", tool: "bash" });
    port.emitSnapshot(porch);
    host.advance(10 * 60_000);
    expect({ paints, wakeups: host.wakeups, reports: port.calls.length }).toEqual(tucked);
    expect(view.getByRole("button", { name: "pip, idle, 0 active threads" })).toBeTruthy();
    port.emitConditions(restingConditions);
    expect(paints).toBeGreaterThan(tucked.paints);
    expect(view.getByRole("button", { name: "pip, at the porch, 2 active threads" })).toBeTruthy();
  });

  it("nudges with arrows, goes home on Escape, opens on Enter, and asks main for the menu on right click", () => {
    const { view, calls } = mount();
    const stage = view.container.querySelector(".kw-companion");
    if (!(stage instanceof HTMLElement)) throw new Error("no stage");
    fireEvent.keyDown(stage, { key: "ArrowLeft" });
    fireEvent.keyDown(stage, { key: "ArrowDown" });
    fireEvent.keyDown(stage, { key: "Escape" });
    fireEvent.click(view.getByRole("button", { name: "companion" }), { detail: 0 });
    fireEvent.contextMenu(stage, { clientX: 12, clientY: 34 });
    expect(calls("nudge")).toEqual([
      ["nudge", { dx: -1, dy: 0 }],
      ["nudge", { dx: 0, dy: 1 }],
    ]);
    expect(calls("home")).toHaveLength(1);
    expect(calls("open")).toEqual([["open", undefined]]);
    expect(calls("openMenu")).toEqual([["openMenu", { x: 12, y: 34 }]]);
  });

  it("drags after a threshold with coalesced deltas and never turns a release into a click", () => {
    const { host, view, calls } = mount();
    const stage = view.container.querySelector(".kw-companion");
    if (!(stage instanceof HTMLElement)) throw new Error("no stage");
    fireEvent.pointerDown(stage, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 52, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 30, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 20, clientY: 55, pointerId: 1 });
    host.advance(20);
    expect(calls("drag")).toEqual([["drag", { dx: -30, dy: 5 }]]);
    expect(stage.dataset.tier).toBe("interact");
    fireEvent.pointerUp(stage, { button: 0, pointerId: 1 });
    expect(calls("dragEnd")).toHaveLength(1);
    expect(calls("open")).toEqual([]);
    fireEvent.pointerDown(stage, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(stage, { button: 0, pointerId: 1 });
    expect(calls("open")).toEqual([["open", undefined]]);
  });

  it("paints with system colors and an opaque plate when the keeper asks for them", () => {
    const { port, view } = mount();
    port.emitConditions({
      ...restingConditions,
      forcedColors: true,
      reducedTransparency: true,
      scale: 150,
    });
    const stage = view.container.querySelector(".kw-companion");
    if (!(stage instanceof HTMLElement)) throw new Error("no stage");
    expect(stage.dataset.forcedColors).toBe("");
    expect(stage.dataset.plate).toBe("");
    expect(stage.style.getPropertyValue("--kw-companion-scale")).toBe("1.5");
  });
});
