import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { sealStep } from "./copy.ts";
import { isWorkshopRefusal, servesSnapshots, workshopChangeOf } from "./port.ts";
import {
  closedWindow,
  costOf,
  displayLine,
  folderUrlOf,
  limitsOf,
  neighbourOf,
  newestThread,
  paneText,
  pickWorkshop,
  roomsOf,
  threadRows,
  threadStateOf,
  type WorkshopFacts,
  type WorkshopKeys,
} from "./rooms.ts";
import { atMinutesBeforeNoon, bareWorkshop, noon, sealedWorkshop, threadRow } from "./testing.ts";

const keys: WorkshopKeys = {
  start: "s",
  stop: "shift+s",
  display: "d",
  files: "f",
  terminal: "t",
  next: "]",
  previous: "[",
};

const wrenThreads = [
  threadRow("t1", "docs index", "wren", {
    lastActivityAt: atMinutesBeforeNoon(25),
    costNanos: 120_000_000,
  }),
  threadRow("t2", "fix the flaky trash test", "wren", {
    lastActivityAt: atMinutesBeforeNoon(2),
    working: true,
    live: true,
    costNanos: 300_000_000,
  }),
];

const bareFacts: WorkshopFacts = {
  workshop: bareWorkshop,
  health: "up",
  watching: closedWindow,
  threads: wrenThreads,
  snapshotsServed: false,
  keys,
  now: noon,
  offsetMinutes: 0,
};

const sealedFacts: WorkshopFacts = {
  workshop: sealedWorkshop,
  health: "up",
  watching: { phase: "watching", frame: { png: "AAAA", at: atMinutesBeforeNoon(0) } },
  threads: [],
  snapshotsServed: false,
  keys,
  now: noon,
  offsetMinutes: 0,
};

describe("the workshop as text", () => {
  it("renders the bare host workshop, limitations and all, as its golden", async () => {
    await expect(paneText(bareFacts)).toMatchFileSnapshot("./goldens/bare-host.txt");
  });

  it("renders a sealed workshop being watched as its golden", async () => {
    await expect(paneText(sealedFacts)).toMatchFileSnapshot("./goldens/sealed-watching.txt");
  });

  it("names the step that seals a bare host and never adds it to a microVM", () => {
    expect(limitsOf(bareFacts).at(-1)).toBe(sealStep);
    expect(limitsOf(sealedFacts)).toEqual(sealedWorkshop.limitations);
  });

  it("shows the snapshots room only when the node serves one", () => {
    const names = (facts: WorkshopFacts) => roomsOf(facts).map((room) => room.name);
    expect(names(bareFacts)).toEqual([
      "display",
      "terminal",
      "files",
      "egress",
      "brokers",
      "disk and memory",
    ]);
    expect(names({ ...bareFacts, snapshotsServed: true })).toContain("snapshots");
    expect(servesSnapshots(new Set(["listWorkshops", "snapshotWorkshop"]))).toBe(true);
    expect(servesSnapshots(new Set(["listWorkshops", "readMemorySnapshot"]))).toBe(false);
  });
});

describe("the display line", () => {
  it("says what the window shows in every phase", () => {
    expect(displayLine(bareFacts)).toBe("no display · a bare host workshop has none");
    expect(displayLine({ ...sealedFacts, watching: closedWindow })).toBe(
      "d opens the window · view only",
    );
    expect(
      displayLine({
        ...sealedFacts,
        watching: closedWindow,
        workshop: { ...sealedWorkshop, state: "stopped" },
      }),
    ).toBe("display dark while the workshop is stopped · s starts it");
    expect(displayLine({ ...sealedFacts, watching: { phase: "opening" } })).toBe(
      "opening the window",
    );
    expect(displayLine(sealedFacts)).toBe(
      "watching · view only · 1 fps · frame at 12:00 · d closes it · taking over waits for the screen viewer",
    );
    expect(displayLine({ ...sealedFacts, watching: { phase: "ended", detail: undefined } })).toBe(
      "the display went away",
    );
    expect(
      displayLine({ ...sealedFacts, watching: { phase: "refused", error: "no Xvfb inside" } }),
    ).toBe("no display · no Xvfb inside");
  });
});

describe("the creature's threads", () => {
  it("orders them needs-you, working, live, idle, newest first within a state", () => {
    const rows = threadRows(
      [
        ...wrenThreads,
        threadRow("t3", "nightly", "wren", {
          lastActivityAt: atMinutesBeforeNoon(50),
          waiting: { asks: 1, tools: ["bash"] },
        }),
        threadRow("t4", "tidy", "wren", { lastActivityAt: atMinutesBeforeNoon(1), live: true }),
      ],
      noon,
      0,
    );
    expect(rows.map((row) => `${row.id} ${row.state} ${row.time}`)).toEqual([
      "t3 needs you 11:10 (50m ago)",
      "t2 working 11:58",
      "t4 live 11:59",
      "t1 idle 11:35 (25m ago)",
    ]);
    expect(newestThread(wrenThreads)?.id).toBe("t2");
    expect(newestThread([])).toBeUndefined();
    expect(threadStateOf(threadRow("t", "x", "wren"))).toBe("idle");
  });

  it("sums the cost of the priced threads and admits when none is priced", () => {
    expect(costOf(wrenThreads)).toBe(420_000_000);
    expect(costOf([threadRow("t", "x", "wren")])).toBeUndefined();
  });
});

describe("choosing a workshop", () => {
  const both = [bareWorkshop, sealedWorkshop];

  it("takes the named creature's, else the first on the node", () => {
    expect(pickWorkshop(both, "tam")).toBe(sealedWorkshop);
    expect(pickWorkshop(both, undefined)).toBe(bareWorkshop);
    expect(pickWorkshop(both, "moss")).toBeUndefined();
  });

  it("walks the node's workshops in a ring", () => {
    expect(neighbourOf(both, bareWorkshop, 1)).toBe(sealedWorkshop);
    expect(neighbourOf(both, sealedWorkshop, 1)).toBe(bareWorkshop);
    expect(neighbourOf(both, bareWorkshop, -1)).toBe(sealedWorkshop);
    expect(neighbourOf([bareWorkshop], bareWorkshop, 1)).toBeUndefined();
  });
});

describe("the wire", () => {
  it("turns a host working directory into a file URL the OS can open", () => {
    expect(folderUrlOf(bareWorkshop.workdir)).toBe(
      "file:///C:/Users/keeper/.keywork/state/workshops/wren-0a1b2c/home",
    );
    expect(folderUrlOf("/home/keeper/.keywork/state/workshops/a b/home")).toBe(
      "file:///home/keeper/.keywork/state/workshops/a%20b/home",
    );
  });

  it("reads workshop.changed from the bus and nothing else", () => {
    const changed = {
      id: 9,
      ts: "t",
      sessionId: "",
      type: "workshop.changed",
      payload: { change: "started", workshop: sealedWorkshop },
    } as unknown as BusEnvelope;
    expect(workshopChangeOf(changed)).toEqual({ change: "started", workshop: sealedWorkshop });
    expect(workshopChangeOf({ ...changed, payload: { change: "started" } })).toBeUndefined();
    expect(workshopChangeOf({ type: "session.state", payload: {} })).toBeUndefined();
  });

  it("knows a refusal by its two fields", () => {
    expect(isWorkshopRefusal({ refused: "missing", error: "no workshop has id x" })).toBe(true);
    expect(isWorkshopRefusal(bareWorkshop)).toBe(false);
    expect(isWorkshopRefusal(undefined)).toBe(false);
  });
});
