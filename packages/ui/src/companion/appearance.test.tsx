import { type HabitatState, type Rows, referenceRows } from "@keywork-app/habitat";
import type { PaletteSource } from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import type { BusEnvelope, CreatureSummary } from "@keywork-app/protocol";
import { cleanup, render } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createHabitatState } from "../panes/stead/habitat.ts";
import { keyworkNight, themeVariables } from "../theme/index.ts";
import { mixOklab } from "../theme/oklab.ts";
import { seedOf } from "./beats.ts";
import { CompanionPage, type PageHost } from "./companion-page.tsx";
import { creatureSnapshot, residents } from "./feed.ts";
import {
  type CompanionConditions,
  type CompanionPort,
  type CompanionSnapshot,
  type HitMask,
  restingConditions,
} from "./port.ts";
import type { Pose, Renderer } from "./renderer.ts";
import { skinnedRenderer } from "./skinned-renderer.ts";

afterEach(cleanup);

describe("the floating creature's appearance", () => {
  it("refreshes pixels and masks immediately in reduced motion, and refuses missing art visibly", () => {
    const first = recordedRenderer(4, referenceRows);
    const second = recordedRenderer(7, referenceRows);
    const requested: Array<string | undefined> = [];
    const page = mount((skin) => {
      requested.push(skin);
      return skin === "missing" ? undefined : skin === "second" ? second.render : first.render;
    });
    page.port.conditions({ ...restingConditions, motion: "reduce", wantsMask: true });
    page.port.snapshot(snapshot("first"));
    expect(page.canvas.width).toBe(4);
    expect(opaque(page.port.masks.at(-1))).toBe(4);
    page.port.snapshot(snapshot("second"));
    expect(page.canvas.width).toBe(7);
    expect(opaque(page.port.masks.at(-1))).toBe(7);
    const painted = first.poses.length + second.poses.length;
    page.port.snapshot(snapshot("missing"));
    expect(page.view.getByRole("status").textContent).toBe("appearance unavailable");
    expect(page.canvas.hidden).toBe(true);
    expect(page.canvas.width).toBe(1);
    expect(opaque(page.port.masks.at(-1))).toBe(0);
    expect(first.poses.length + second.poses.length).toBe(painted);
    page.host.advance(10_000);
    expect(first.poses.length + second.poses.length).toBe(painted);
    page.port.snapshot(snapshot("first"));
    expect(page.view.queryByRole("status")).toBeNull();
    expect(page.canvas.hidden).toBe(false);
    expect(page.canvas.width).toBe(4);
    expect(requested).toEqual([undefined, "first", "second", "missing", "first"]);
    expect(page.port.readyCount()).toBe(1);
  });

  it("uses the selected manifest's frame timings and restarts its animation when its skin changes", () => {
    const quick = recordedRenderer(4, {
      ...referenceRows,
      idle: { frames: 2, ms: [100, 100], loop: true },
    });
    const slow = recordedRenderer(7, {
      ...referenceRows,
      idle: { frames: 3, ms: [400, 400, 400], loop: true },
    });
    const page = mount((skin) => (skin === "slow" ? slow.render : quick.render));
    page.port.snapshot(snapshot("quick"));
    expect(quick.poses.at(-1)).toMatchObject({ clip: "idle", frame: 0 });
    page.host.advance(150);
    expect(quick.poses.at(-1)?.frame).toBe(1);
    page.port.snapshot(snapshot("slow"));
    expect(slow.poses.at(-1)).toMatchObject({ clip: "idle", frame: 0 });
    page.host.advance(300);
    expect(slow.poses.at(-1)?.frame).toBe(0);
    page.host.advance(200);
    expect(slow.poses.at(-1)?.frame).toBe(1);
  });

  it("keeps a renamed resident's motion identity and resets a different resident using the same skin", () => {
    const artist = recordedRenderer(4, {
      ...referenceRows,
      idle: { frames: 2, ms: [100, 100], loop: true },
    });
    const page = mount(() => artist.render);
    const original = snapshot("first");
    page.port.snapshot(original);
    page.host.advance(150);
    expect(artist.poses.at(-1)?.frame).toBe(1);
    const renamed = { ...original, creature: { ...original.creature, name: "Pebble", hueStop: 5 } };
    page.port.snapshot(renamed);
    expect(seedOf(renamed.creature)).toBe(seedOf(original.creature));
    expect(artist.poses.at(-1)?.frame).toBe(1);
    expect(page.view.getByRole("button", { name: "Pebble, idle, 0 active threads" })).toBeTruthy();
    page.port.snapshot(snapshot("first", "ada"));
    expect(artist.poses.at(-1)?.frame).toBe(0);
    expect(seedOf(snapshot("first", "ada").creature)).not.toBe(seedOf(original.creature));
  });

  it("holds changed appearances while tucked and draws only the latest one when shown", () => {
    const first = recordedRenderer(4, referenceRows);
    const second = recordedRenderer(7, referenceRows);
    const page = mount((skin) => (skin === "second" ? second.render : first.render));
    page.port.snapshot(snapshot("first"));
    page.port.conditions({ ...restingConditions, ceiling: "hidden" });
    const paints = first.poses.length + second.poses.length;
    page.port.snapshot(snapshot("second"));
    page.host.advance(10_000);
    expect(first.poses.length + second.poses.length).toBe(paints);
    expect(page.canvas.width).toBe(4);
    page.port.conditions({ ...restingConditions, motion: "reduce" });
    expect(page.canvas.width).toBe(7);
  });

  it("carries refreshed native identity through the world and serialized feed into the real skin renderer", async () => {
    const native = nativeIdentity();
    const page = mount((id) => {
      const loaded = loadSkin(id ?? "kid");
      return loaded.ok ? skinnedRenderer(loaded.skin, nightSource) : undefined;
    });
    try {
      page.port.conditions({ ...restingConditions, motion: "reduce", wantsMask: true });
      await settled();
      const initial = wireSnapshot(native.world());
      expect(initial.creature).toMatchObject({ slug: "pip", name: "Pip", skin: "kid" });
      page.port.snapshot(initial);
      const originalMask = page.port.masks.at(-1)?.bits;
      native.change({ skin: "carter", name: "Pebble", seed: 2 });
      await settled();
      const updated = wireSnapshot(native.world());
      expect(updated.creature).toMatchObject({ slug: "pip", name: "Pebble", skin: "carter" });
      expect(updated.creature.hueStop).not.toBe(initial.creature.hueStop);
      expect(seedOf(updated.creature)).toBe(seedOf(initial.creature));
      page.port.snapshot(updated);
      expect(page.port.masks.at(-1)?.bits).not.toEqual(originalMask);
      expect(
        page.view.getByRole("button", { name: "Pebble, idle, 0 active threads" }),
      ).toBeTruthy();
      native.change({ skin: "not-installed" });
      await settled();
      page.port.snapshot(wireSnapshot(native.world()));
      expect(page.view.getByRole("status").textContent).toBe("appearance unavailable");
    } finally {
      native.dispose();
    }
  });
});

function snapshot(
  skin: string,
  slug = "pip",
  state: CompanionSnapshot["state"] = "idle",
): CompanionSnapshot {
  return {
    creature: { slug, name: slug, skin, hueStop: 1 },
    state,
    stateLabel: state,
    activeThreads: 0,
    finishedUnseen: 0,
    threadId: undefined,
    tool: undefined,
    needsYou: undefined,
  };
}

function recordedRenderer(width: number, rows: Rows) {
  const poses: Pose[] = [];
  const render: Renderer = Object.assign(
    (pose: Pose) => {
      poses.push(pose);
      return { width, height: 1, alpha: new Uint8Array(width).fill(1), paint: () => undefined };
    },
    { rows },
  );
  return { render, poses };
}

function mount(rendererFor: (id: string | undefined) => Renderer | undefined) {
  const port = testPort();
  const host = testHost();
  const view = render(() => <CompanionPage port={port} host={host} rendererFor={rendererFor} />);
  const canvas = view.container.querySelector("canvas");
  if (canvas === null) throw new Error("missing canvas");
  return { port, host, view, canvas };
}

function testPort() {
  let receiveSnapshot: (snapshot: CompanionSnapshot) => void = () => undefined;
  let receiveConditions: (conditions: CompanionConditions) => void = () => undefined;
  let ready = 0;
  const masks: HitMask[] = [];
  const port: CompanionPort = {
    onSnapshot: (listener) => {
      receiveSnapshot = listener;
      return () => undefined;
    },
    onConditions: (listener) => {
      receiveConditions = listener;
      return () => undefined;
    },
    ready: () => {
      ready += 1;
    },
    setInteractive: () => undefined,
    sendMask: (mask) => masks.push(mask),
    drag: () => undefined,
    dragEnd: () => undefined,
    nudge: () => undefined,
    home: () => undefined,
    openMenu: () => undefined,
    open: () => undefined,
    answer: () => undefined,
    reportWakeups: () => undefined,
  };
  return {
    ...port,
    masks,
    readyCount: () => ready,
    snapshot: (next: CompanionSnapshot) => receiveSnapshot(next),
    conditions: (next: CompanionConditions) => receiveConditions(next),
  };
}

function testHost() {
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { due: number; run(): void }>();
  const schedule = (run: () => void, delay: number): number => {
    timerId += 1;
    timers.set(timerId, { due: now + delay, run });
    return timerId;
  };
  const cancel = (id: unknown): void => {
    if (typeof id === "number") timers.delete(id);
  };
  const host: PageHost = {
    now: () => now,
    setTimeout: schedule,
    clearTimeout: cancel,
    requestAnimationFrame: (run) => schedule(() => run(now), 16),
    cancelAnimationFrame: cancel,
    random: () => 0.5,
    devicePixelRatio: () => 1,
    systemReducesMotion: () => false,
    readToken: (name) => `var(${name})`,
    viewport: () => ({ width: 144, height: 180 }),
    storage: undefined,
  };
  return {
    ...host,
    advance: (duration: number) => {
      const until = now + duration;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= until)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (next === undefined) break;
        timers.delete(next[0]);
        now = next[1].due;
        next[1].run();
      }
      now = until;
    },
  };
}

function nativeIdentity() {
  return createRoot((dispose) => {
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    let creature: CreatureSummary = {
      slug: "pip",
      name: "Pip",
      sigil: "P",
      skin: "kid",
      seed: 1,
      created: "2026-11-17T00:00:00.000Z",
      workshop: "host",
      conversation: null,
      threads: 0,
      models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    };
    const world = createHabitatState({
      rows: () => [],
      bots: () => [],
      currentSession: () => undefined,
      now: () => Date.parse(creature.created),
      offsetMinutes: 0,
      creatures: async () => [creature],
      feed: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    });
    return {
      world,
      dispose,
      change: (identity: Partial<Pick<CreatureSummary, "skin" | "name" | "seed">>) => {
        creature = { ...creature, ...identity };
        const event: BusEnvelope = {
          id: 1,
          ts: creature.created,
          sessionId: "",
          type: "creature.changed",
          payload: { slug: creature.slug, change: "updated" },
        };
        for (const listener of listeners) listener([event]);
      },
    };
  });
}

function wireSnapshot(world: HabitatState): CompanionSnapshot {
  const resident = residents(world)[0];
  if (resident === undefined) throw new Error("missing native resident");
  return JSON.parse(JSON.stringify(creatureSnapshot(world, resident, 0))) as CompanionSnapshot;
}

function nightSource(): PaletteSource {
  const variables = themeVariables(keyworkNight);
  return { read: (name) => variables[name] ?? "", mix: mixOklab, appearance: "dark" };
}

function opaque(mask: HitMask | undefined): number {
  return mask?.bits.reduce((sum, bit) => sum + bit, 0) ?? 0;
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
