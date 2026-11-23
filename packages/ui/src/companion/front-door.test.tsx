import { emptyProjection } from "@keywork-app/client";
import type { BotSummary, BusEnvelope, CreatureSummary, SessionRow } from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { PaneSpec } from "../panes/index.ts";
import type { NeedsYouItem } from "../shell/needs-you.ts";
import { askItem } from "../shell/needs-you-testing.ts";
import type { SessionStore } from "../shell/session-store.ts";
import type { Desk, ScreenRect } from "../surfaces/port.ts";
import { CompanionPage } from "./companion-page.tsx";
import { followCompanion } from "./console.ts";
import {
  createSteadBeside,
  type SteadBesideSeams,
  steadAtActionId,
  steadSeat,
} from "./stead-beside.ts";
import { type CompanionLoop, companionLoop, loopCompanionAt, quietPageHost } from "./testing.ts";

const now = Date.parse("2026-11-22T12:00:00.000Z");

afterEach(cleanup);

describe("the everyday front door", () => {
  it("choosing a figure in the strip makes that creature the companion and opens its conversation", async () => {
    const door = frontDoor();
    const page = render(() => <CompanionPage port={door.loop.port} host={quietPageHost()} />);
    await settled();
    expect(door.loop.latest()?.creature.slug).toBe("ada");

    fireEvent.click(page.getByRole("button", { name: "Bea, resting" }));
    await settled();

    expect(door.opened).toEqual(["conv-bea"]);
    expect(door.loop.latest()?.creature.slug).toBe("bea");
    expect(door.loop.stored().creature).toBe("bea");
    expect(
      page
        .getByRole("button", { name: "Bea, resting, your companion" })
        .getAttribute("aria-current"),
    ).toBe("true");
    door.dispose();
  });

  it("the stead key reveals the stead at the chosen creature's plot; pressed again it puts it away and the keyboard returns", async () => {
    const door = frontDoor();
    const page = render(() => <CompanionPage port={door.loop.port} host={quietPageHost()} />);
    await settled();
    const cy = page.getByRole("button", { name: "Cy, resting" });
    const steadControl = page.getByRole("button", { name: /^stead/ });
    cy.focus();

    fireEvent.keyDown(cy, { key: " " });
    await settled();

    expect(door.desk.stood).toHaveLength(1);
    const [{ spec, sending }] = door.desk.stood as [(typeof door.desk.stood)[number]];
    expect(spec.kind).toBe("stead");
    expect(sending).toMatchObject({ origin: "keeper", focus: true, by: "keeper" });
    expect(sending.last).toBeDefined();
    expect(overlap(sending.last as ScreenRect, drawnPartOf(loopCompanionAt))).toBe(false);
    expect(door.desk.told).toEqual([["stead-9", steadAtActionId, "cy"]]);
    expect(steadControl.getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(cy, { key: " " });
    await settled();

    expect(door.happened()).toEqual([
      "the companion takes the keyboard back",
      "stead-9 is closed",
      "the stead is put away",
    ]);
    expect(steadControl.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(cy);
    door.dispose();
  });

  it("stands the team in the order the town raised it and shows what each is up to, the one that needs him marked first", async () => {
    const door = frontDoor({
      rows: [
        { ...conversationOf("ada"), working: true },
        conversationOf("bea"),
        { ...conversationOf("cy"), lastActivityAt: hoursAgo(3) },
      ],
    });
    await settled();
    door.emit([gateAsk("conv-bea", "c1")]);
    door.setWaiting([
      askItem("c1", { sessionId: "conv-bea", tool: "write", subject: "notes/plan.md" }),
    ]);
    await settled();

    expect(
      door.loop.latest()?.team?.members.map(({ slug, doing, telling, first, threadId }) => ({
        slug,
        doing,
        telling,
        first,
        threadId,
      })),
    ).toEqual([
      { slug: "cy", doing: "nap", telling: "asleep", first: false, threadId: "conv-cy" },
      { slug: "ada", doing: "work", telling: "working", first: false, threadId: "conv-ada" },
      { slug: "bea", doing: "porch", telling: "needs you", first: true, threadId: "conv-bea" },
    ]);
    door.dispose();
  });
});

interface DoorOptions {
  rows?: readonly SessionRow[];
}

function frontDoor(options: DoorOptions = {}) {
  return createRoot((dispose) => {
    const loop: CompanionLoop = companionLoop();
    const desk = fakeDesk(loop);
    const opened: string[] = [];
    const feedListeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const [rows] = createSignal<readonly SessionRow[]>(
      options.rows ?? team.map((creature) => conversationOf(creature.slug)),
    );
    const [waiting, setWaiting] = createSignal<readonly NeedsYouItem[]>([]);
    const store = {
      state: {
        get summaries() {
          return rows();
        },
      },
      surfaces: { state: { bots: team.map(botOf) } },
      projection: () => emptyProjection,
      open: async () => undefined,
    } as unknown as SessionStore;
    followCompanion({
      host: loop.host,
      store,
      feed: {
        subscribe: (listener) => {
          feedListeners.add(listener);
          return () => feedListeners.delete(listener);
        },
      },
      stead: createSteadBeside(desk.seams),
      currentSession: () => undefined,
      approveKey: () => "y",
      openSession: (session) => void opened.push(session),
      say: () => undefined,
      needsYou: waiting,
      creatures: async () => team,
      now: () => now,
    });
    return {
      loop,
      desk,
      opened,
      setWaiting,
      happened: () => loop.said,
      emit: (batch: readonly BusEnvelope[]) => {
        for (const listener of feedListeners) listener(batch);
      },
      dispose,
    };
  });
}

function fakeDesk(loop: CompanionLoop) {
  const [standing, setStanding] = createSignal<readonly { id: string; spec: PaneSpec }[]>([]);
  const stood: Array<{ spec: PaneSpec; sending: { last?: ScreenRect | undefined } }> = [];
  const told: Array<[string, string, string | undefined]> = [];
  const seams = {
    tiler: {
      version: () => standing().length,
      outside: () =>
        standing().map(({ id, spec }) => ({
          id,
          spec,
          rect: undefined,
          follows: false,
          by: undefined,
          focused: true,
          spawnRank: 0,
        })),
      findPane: () => undefined,
      spec: (id: string) => standing().find((held) => held.id === id)?.spec,
      focus: () => ({ ok: true }),
      close: (id: string) => {
        loop.said.push(`${id} is closed`);
        setStanding((held) => held.filter((pane) => pane.id !== id));
        return { ok: true };
      },
    },
    outside: {
      reachesOutside: true,
      holdingFocus: () => standing()[0]?.id,
      desk: async () => oneDisplay,
      paneAt: () => undefined,
      standOutside: async (spec: PaneSpec, sending: { last?: ScreenRect | undefined }) => {
        stood.push({ spec, sending });
        setStanding((held) => [...held, { id: "stead-9", spec }]);
        return "stead-9";
      },
    },
    deliver: (pane: string, action: string, argument?: string) =>
      void told.push([pane, action, argument]),
    summonInside: () => undefined,
    hearKeys: () => () => undefined,
  } as unknown as SteadBesideSeams;
  return { seams, stood, told };
}

const oneDisplay: Desk = {
  console: { x: 100, y: 100, width: 1200, height: 800 },
  consoleMaximized: false,
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  displays: [
    {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    },
  ],
  cursor: { x: 0, y: 0 },
};

const team: readonly CreatureSummary[] = [
  creatureOf("ada", "Ada", "2026-11-02T09:00:00.000Z"),
  creatureOf("bea", "Bea", "2026-11-03T09:00:00.000Z"),
  creatureOf("cy", "Cy", "2026-11-01T09:00:00.000Z"),
];

function creatureOf(slug: string, name: string, created: string): CreatureSummary {
  return {
    slug,
    name,
    sigil: "◆",
    created,
    skin: "tessera",
    seed: 0,
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: `conv-${slug}`,
    threads: 0,
  };
}

function botOf(creature: CreatureSummary): BotSummary {
  return { name: creature.slug, sigil: creature.sigil, source: "project", sessions: 1 };
}

function conversationOf(slug: string): SessionRow {
  return {
    id: `conv-${slug}`,
    title: `with ${slug}`,
    createdAt: hoursAgo(5),
    lastActivityAt: hoursAgo(0.1),
    messageCount: 3,
    bot: slug,
  };
}

function hoursAgo(hours: number): string {
  return new Date(now - hours * 3_600_000).toISOString();
}

function gateAsk(sessionId: string, callId: string): BusEnvelope {
  return {
    id: 14,
    ts: hoursAgo(0.01),
    sessionId,
    type: "gate.ask",
    payload: {
      ask: { tool: "write", callId, arguments: { path: "notes/plan.md" }, rule: "default" },
    },
  } as BusEnvelope;
}

function drawnPartOf(companion: ScreenRect): ScreenRect {
  const margin = steadSeat.companionMargin;
  return {
    x: companion.x + margin,
    y: companion.y + margin,
    width: companion.width - margin * 2,
    height: companion.height - margin * 2,
  };
}

function overlap(one: ScreenRect, other: ScreenRect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}

const settled = async (): Promise<void> => {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
