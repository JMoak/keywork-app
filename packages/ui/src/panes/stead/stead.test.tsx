import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { coldStart } from "@keywork-app/habitat";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BotSummary,
  BusEnvelope,
  CreatureSummary,
  DenyReason,
  PermissionRule,
  RoutineView,
  SessionRow,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionController } from "../../companion/floating.ts";
import type { CompanionSwitch } from "../../companion/switch.tsx";
import { appActions } from "../../keys/actions.ts";
import { keymapFromConfig } from "../../keys/index.ts";
import { steadVerbs } from "../../onboarding/controller.ts";
import { stopAskingWhy, whyLine } from "../../page/ask-card-why.ts";
import { type ChoreWaiting, choreAcceptedLine, type NeedsYouItem } from "../../shell/needs-you.ts";
import type { NeedsYouQueue } from "../../shell/needs-you-queue.ts";
import { askItem, decidedItem } from "../../shell/needs-you-testing.ts";
import { createSessionReads } from "../../shell/session-reads.ts";
import { morningTriage } from "../chores/testing.ts";
import { mountPane, overviewShell, settle } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import { checkPaneDefinition } from "../testing.ts";
import { acceptHint, acceptsOnly, overturnHint, overturnsOnly } from "./copy.ts";
import { seatCreatures } from "./habitat.ts";
import { composeStead } from "./habitat-render.ts";
import { answerHint, steadKeys, steadPane } from "./index.tsx";

afterEach(() => {
  cleanup();
  stopAskingWhy("c1");
});

const keymap = keymapFromConfig();
const keys = {
  chord: (action: string) => keymap.describe(action) ?? action,
  leader: () => keymap.leader,
};

describe("the stead pane", () => {
  it("seats every creature GET /creatures lists, lists them under the canvas, and names the place in the head", async () => {
    const stead = steadHarness({});
    const { container } = mount(stead);
    expect(creatureLabels(container)).toEqual([]);
    await settle();
    expect(creatureLabels(container)).toEqual([
      "reviewer, idle, 0 active threads",
      "scribe, idle, 0 active threads",
    ]);
    expect(rowNames(container)).toEqual(["reviewer", "scribe"]);
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toMatch(
      /^2 creatures · (night|dawn|day|dusk) \d\d:\d\d$/,
    );
    expect(container.querySelector("canvas.kw-stead-canvas")).not.toBeNull();
    expect(container.querySelector(".kw-empty")).toBeNull();
    expect(creatureButton(container, "reviewer").dataset.clip).toBe("idle");
  });

  it("seats no plain bot: a bot the node lists without creature.json stays off the stead", async () => {
    const stead = steadHarness({ bots: [bot("reviewer"), bot("scribe")], creatures: [] });
    const { container } = mount(stead);
    await settle();
    expect(creatureLabels(container)).toEqual([]);
    expect(rowNames(container)).toEqual([]);
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toMatch(/^0 creatures/);
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      `No creature yet · make one with ${keymap.describe("onboarding.start")}`,
    );
  });

  it("mounts the companion switch row on its head once a switch is bound, told how many creatures stand", async () => {
    const considered: number[] = [];
    const toggle: CompanionSwitch = {
      enabled: () => false,
      line: () => "companion off",
      offering: () => false,
      considerOffer: (creatures) => void considered.push(creatures),
      toggle: async () => undefined,
      accept: async () => undefined,
      decline: () => undefined,
    };
    const unbound = mount(steadHarness({}));
    expect(unbound.container.querySelector("[role=switch]")).toBeNull();
    cleanup();
    const stead = steadHarness({});
    const unbind = stead.companion.bindToggle(toggle);
    try {
      const { container } = mount(stead);
      await settle();
      const row = container.querySelector(".kw-ov-head + .kw-companion-switch [role=switch]");
      expect(row?.textContent).toContain("companion off");
      expect(considered.at(-1)).toBe(2);
    } finally {
      unbind();
    }
  });

  it("counts need-you on its head as the queue does: one held chore is one, though it also stands the creature at the porch", async () => {
    const stead = steadHarness({ waiting: [heldChore] });
    const { container } = mount(stead);
    await settle();
    expect(creatureLabels(container)[0]).toBe("reviewer, at the porch, 0 active threads");
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toContain("1 needs you");
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).not.toContain("2 need you");
    expect(steadPane.title({ kind: "stead" }, stead.shell)).toBe("stead · 1 needs you");
  });

  it("offers a held chore's accept in the bubble ahead of a finished crate, by the companion's rule, and y accepts its grants", async () => {
    const posted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        posted.push(`${init?.method} ${String(input)} ${String(init?.body)}`);
        return new Response(JSON.stringify({ routine: morningTriage }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    try {
      const stead = steadHarness({
        summaries: [row("t1", "docs changes", "reviewer")],
        waiting: [heldChore],
      });
      const { container, act } = mount(stead);
      stead.emit([
        envelope(7, "t1", "turn.started", { userText: "go" }),
        envelope(8, "t1", "turn.completed", {
          message: { role: "assistant", parts: [{ type: "text", text: "the docs changed" }] },
        }),
      ]);
      await settle();
      expect(creatureLabels(container)[0]).toBe("reviewer, at the porch, 0 active threads");
      const bubble = container.querySelector(".kw-stead-bubble");
      expect(bubble?.querySelector(".kw-stead-bubble-title")?.textContent).toBe(
        "reviewer · triage",
      );
      expect(bubble?.querySelector(".kw-stead-bubble-line")?.textContent).toBe(
        "asks to accept its grants",
      );
      expect(answers(container)).toEqual(["accept y"]);
      expect(lineText(container)).toBe(acceptHint("y"));
      act("stead.deny");
      expect(lineText(container)).toBe(acceptsOnly("y"));
      expect(posted).toEqual([]);
      act("stead.approve");
      await waitFor(() => expect(lineText(container)).toBe(choreAcceptedLine("triage")));
      expect(posted).toEqual([
        'POST http://127.0.0.1:4770/creatures/reviewer/routines/triage/accept {"digest":"3f9c1a2b"}',
      ]);
      fireEvent.click(bubble?.querySelector(".kw-stead-bubble-open") as Element);
      expect(stead.panes).toEqual(["chores"]);
      expect(stead.opened).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stands the creature at the porch for a decision made in the keeper's name, and x overturns it through the route", async () => {
    const decided = decidedItem("r7", {
      workspace: "C:/work",
      creature: "reviewer",
      sessionId: "t1",
      since: "2026-11-06T09:00:00.000Z",
    });
    const stead = steadHarness({
      summaries: [row("t1", "rename the ledger", "reviewer")],
      waiting: [decided],
    });
    const { container, act } = mount(stead);
    await settle();
    expect(creatureLabels(container)[0]).toBe("reviewer, at the porch, 0 active threads");
    const bubble = container.querySelector(".kw-stead-bubble");
    expect(bubble?.querySelector(".kw-stead-bubble-title")?.textContent).toBe("rename the ledger");
    expect(bubble?.querySelector(".kw-stead-bubble-line")?.textContent).toBe(
      "decided for you · approved bash",
    );
    expect(answers(container)).toEqual(["overturn x"]);
    expect(lineText(container)).toBe(overturnHint("x", "enter"));
    act("stead.approve");
    expect(lineText(container)).toBe(overturnsOnly("x"));
    expect(stead.overturned).toEqual([]);
    act("stead.overturn");
    await waitFor(() =>
      expect(lineText(container)).toBe("overturned · every shell.read ask waits for you again"),
    );
    expect(stead.overturned).toEqual(["reviewer/r7"]);
    expect(stead.dismissed).toEqual([decided.key]);
    fireEvent.click(bubble?.querySelector(".kw-stead-bubble-open") as Element);
    expect(stead.opened).toEqual(["t1"]);
  });

  it("posts the chore board in readable text: the next chore, who runs it and when, read from the wire", async () => {
    const soon = new Date(Date.now() + 2 * 60_000).toISOString();
    const stead = steadHarness({
      routines: (creature) =>
        creature === "reviewer" ? [routineView("docs-changes", "docs changes", soon)] : [],
    });
    const { container } = mount(stead);
    await settle();
    await settle();
    const board = container.querySelector(".kw-stead-board");
    expect(board?.getAttribute("aria-label")).toBe("chore board");
    expect(board?.textContent).toMatch(
      /^chore board · next: docs changes \(reviewer\) at \d\d:\d\d$/,
    );
    expect(board?.getAttribute("data-next-at")).toBe(soon);
    expect(container.querySelector(".kw-stead")?.textContent).toContain("docs changes");
  });

  it("says the board is empty when no chore is scheduled", async () => {
    const { container } = mount(steadHarness({}));
    await settle();
    expect(container.querySelector(".kw-stead-board")?.textContent).toBe(
      "chore board · nothing scheduled",
    );
  });

  it("teaches the one next key when no creature exists, with the stead still drawn", () => {
    const { container } = mount(steadHarness({ bots: [] }));
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      `No creature yet · make one with ${keymap.describe("onboarding.start")}`,
    );
    expect(keymap.describe("onboarding.start")).toBe("ctrl+k 1");
    expect(container.querySelector("canvas.kw-stead-canvas")).not.toBeNull();
    expect(container.querySelectorAll(".kw-stead-creature")).toHaveLength(0);
  });

  it("brings a creature to the porch when its thread asks: the bubble, the vocabulary and the desk keys", async () => {
    const stead = steadHarness({
      summaries: [row("t1", "fix the flaky trash test", "reviewer")],
      projections: { t1: asking("c1", [bashRule("bun test *")]) },
    });
    const { container, act } = mount(stead);
    stead.emit([
      envelope(7, "t1", "gate.ask", {
        ask: {
          tool: "bash",
          callId: "c1",
          arguments: { command: "bun test src/shell/trash.test.ts" },
          rule: "default",
          rules: [bashRule("bun test *")],
        },
      }),
    ]);
    await settle();
    expect(creatureLabels(container)[0]).toBe("reviewer, at the porch, 0 active threads");
    expect(rowStates(container)[0]).toBe("at the porch");
    const bubble = container.querySelector(".kw-stead-bubble");
    expect(bubble?.querySelector(".kw-stead-bubble-title")?.textContent).toBe(
      "fix the flaky trash test",
    );
    expect(bubble?.querySelector(".kw-stead-bubble-line")?.textContent).toMatch(
      /^asks to run .*trash\.test\.ts$/,
    );
    expect(answers(container)).toEqual(["once y", "this session s", "this workspace w", "deny n"]);
    expect(stead.loaded).toEqual(["t1"]);
    expect(lineText(container)).toBe(answerHint(steadKeys(keys), "enter"));
    expect(steadPane.title({ kind: "stead" }, stead.shell)).toBe("stead");
    act("stead.session");
    await settle();
    expect(stead.answered).toEqual([["c1", "granted", "session"]]);
    act("stead.deny");
    await settle();
    expect(answers(container)).toEqual(["unsafe u", "not now n", "other o"]);
    expect(lineText(container)).toBe(whyLine);
    fireEvent.keyDown(container.querySelector(".kw-stead") as Element, { key: "u" });
    await settle();
    expect(stead.answered.at(-1)).toEqual(["c1", "denied", undefined, "unsafe"]);
    fireEvent.click(bubble?.querySelector(".kw-stead-bubble-open") as Element);
    expect(stead.opened).toEqual(["t1"]);
  });

  it("lets the porch go on the next event when the ask is answered on another surface, though the refresh sent before the answer lands after it", async () => {
    const working = row("t1", "first light", "reviewer", { working: true });
    const stead = steadHarness({ summaries: [working] });
    const { container } = mount(stead);
    stead.emit([
      envelope(7, "t1", "gate.ask", {
        ask: {
          tool: "write",
          callId: "c1",
          arguments: { path: "notes/first-light.md" },
          rule: "default",
        },
      }),
    ]);
    stead.setWaiting([
      askItem("c1", { sessionId: "t1", tool: "write", subject: "notes/first-light.md" }),
    ]);
    await settle();
    expect(bubbleLineText(container)).toBe("asks to edit notes/first-light.md");
    expect(headText(container)).toContain("1 needs you");
    expect(steadPane.title({ kind: "stead" }, stead.shell)).toBe("stead · 1 needs you");

    stead.emit([
      envelope(8, "t1", "gate.permission", {
        decision: { tool: "write", callId: "c1", verdict: "granted", gate: "user", asked: true },
      }),
    ]);
    stead.setWaiting([]);
    stead.setSummaries([{ ...working, waiting: { asks: 1, tools: ["write"] } }]);
    await settle();
    expect(container.querySelector(".kw-stead-bubble")).toBeNull();
    expect(headText(container)).not.toContain("need");
    expect(steadPane.title({ kind: "stead" }, stead.shell)).toBe("stead");
    expect(creatureLabels(container)[0]).not.toContain("at the porch");
    expect(stead.answered).toEqual([]);
  });

  it("says so when a key answers with nothing asking on the porch", async () => {
    const stead = steadHarness({});
    const { container, act } = mount(stead);
    await settle();
    act("stead.approve");
    expect(lineText(container)).toBe("nothing is asking on the porch");
    expect(stead.answered).toEqual([]);
  });

  it("opens the thread a creature is on: by its pixels, by enter, by its button, never after a drag", async () => {
    const stead = steadHarness({
      summaries: [row("t1", "rename the tiler verbs", "reviewer", { working: true })],
    });
    const { container, act } = mount(stead);
    await settle();
    const button = creatureButton(container, "reviewer");
    expect(button.getAttribute("aria-label")).toBe("reviewer, working, 1 active thread");
    expect(container.querySelector(".kw-stead-badge")?.textContent).toBe("1");
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toContain("1 working");
    const box = boxOf(button);
    const stage = stageOf(container);
    const body = { clientX: box.left + box.width / 2, clientY: box.top + box.height * 0.8 };
    fireEvent.pointerDown(stage, body);
    fireEvent.click(stage, { ...body, detail: 1 });
    expect(stead.opened).toEqual(["t1"]);
    fireEvent.pointerDown(stage, { clientX: box.left, clientY: box.top + 10 });
    fireEvent.click(stage, { ...body, detail: 1 });
    expect(stead.opened).toEqual(["t1"]);
    fireEvent.click(button);
    expect(stead.opened).toEqual(["t1", "t1"]);
    act("stead.open");
    expect(stead.opened).toEqual(["t1", "t1", "t1"]);
    const corner = { clientX: box.left + 1, clientY: box.top + 1 };
    fireEvent.pointerDown(stage, corner);
    fireEvent.click(stage, { ...corner, detail: 1 });
    expect(stead.opened).toHaveLength(3);
  });

  it("names the missing thread instead of opening nothing", async () => {
    const stead = steadHarness({ bots: [bot("reviewer")] });
    const { container, act } = mount(stead);
    await settle();
    act("stead.open");
    expect(stead.opened).toEqual([]);
    expect(lineText(container)).toBe("reviewer has no thread yet");
  });

  it("opens what a building stands for: the porch opens the desk, the storehouse the sessions", async () => {
    const stead = steadHarness({});
    const { container } = mount(stead);
    await settle();
    const stage = stageOf(container);
    const cssPerArt = boxOf(creatureButton(container, "reviewer")).width / 48;
    const iso = new Date().toISOString();
    const scene = composeStead(
      seatCreatures(coldStart({ at: iso, sessions: [], offsetMinutes: 0 }), stead.creatures),
      Date.now(),
    );
    for (const [kind, pane] of [
      ["porch", "needs-you"],
      ["storehouse", "tree"],
    ] as const) {
      const spot = scene.hotspots.find((each) => each.target.kind === kind);
      expect(spot, kind).toBeDefined();
      if (spot === undefined) continue;
      const point = {
        clientX: (spot.x + 2) * cssPerArt,
        clientY: (spot.y + spot.height - 2) * cssPerArt,
      };
      fireEvent.pointerDown(stage, point);
      fireEvent.click(stage, { ...point, detail: 1 });
      expect(stead.panes.at(-1), kind).toBe(pane);
    }
  });

  it("follows a nearby pointer with its gaze, through the look row", async () => {
    const stead = steadHarness({ bots: [bot("reviewer")] });
    const { container } = mount(stead);
    await settle();
    const box = boxOf(creatureButton(container, "reviewer"));
    fireEvent.pointerMove(stageOf(container), {
      clientX: box.left + box.width * 1.25,
      clientY: box.top + box.height * 0.4,
    });
    await settle();
    expect(creatureButton(container, "reviewer").dataset.clip).toBe("look");
    fireEvent.pointerLeave(stageOf(container));
    await settle();
    expect(creatureButton(container, "reviewer").dataset.clip).toBe("idle");
  });

  it("greets once when the pointer enters its pixels", async () => {
    const stead = steadHarness({ bots: [bot("reviewer")] });
    const { container } = mount(stead);
    await settle();
    const box = boxOf(creatureButton(container, "reviewer"));
    fireEvent.pointerMove(stageOf(container), {
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height * 0.8,
    });
    await wait(260);
    expect(creatureButton(container, "reviewer").dataset.hit).toBe("");
    expect(creatureButton(container, "reviewer").dataset.clip).toBe("greet");
    fireEvent.pointerLeave(stageOf(container));
  });

  it("wears needs-you while an ask waits, working while a session works, and lives in main", () => {
    const view = { id: "p1", spec: { kind: "stead" as const }, focused: false };
    expect(steadPane.lifecycle?.(view, steadHarness({ waiting: [askItem("c1")] }).shell)).toBe(
      "needs-you",
    );
    expect(
      steadPane.lifecycle?.(
        view,
        steadHarness({ summaries: [row("t1", "x", "reviewer", { working: true })] }).shell,
      ),
    ).toBe("working");
    expect(steadPane.lifecycle?.(view, steadHarness({}).shell)).toBe("idle");
    expect(
      steadPane.title({ kind: "stead" }, steadHarness({ waiting: [askItem("c1")] }).shell),
    ).toBe("stead · 1 needs you");
    expect(steadPane.attire).toBe("house");
    expect(steadPane.home).toBe("main");
  });
});

describe("the stead's keys", () => {
  it("owns leader 0 and the desk's answer letters inside the pane, with palette names nobody else claims", () => {
    const ours = Object.entries(appActions).filter(([id]) => id.startsWith("stead."));
    expect(Object.fromEntries(ours.map(([id, action]) => [id, action.chords]))).toEqual({
      "stead.summon": ["leader 0", "leader home"],
      "stead.down": ["j", "down"],
      "stead.up": ["k", "up"],
      "stead.open": "enter",
      "stead.approve": "y",
      "stead.once": "o",
      "stead.session": "s",
      "stead.workspace": "w",
      "stead.deny": "n",
      "stead.overturn": "x",
    });
    const theirs = new Set(
      Object.entries(appActions)
        .filter(([id]) => !id.startsWith("stead."))
        .flatMap(([, action]) => commandNames(action.command)),
    );
    const claimed = ours.flatMap(([, action]) => commandNames(action.command));
    expect(claimed.filter((name) => theirs.has(name))).toEqual([]);
    expect(commandNames(appActions["stead.summon"]?.command)).toEqual([
      "stead",
      "ranch",
      "habitat",
    ]);
  });
});

type Answered =
  | [string, AskVerdict, AskScope | undefined]
  | [string, AskVerdict, AskScope | undefined, DenyReason];

interface Staging {
  bots?: BotSummary[];
  creatures?: CreatureSummary[];
  summaries?: SessionRow[];
  projections?: Record<string, SessionProjection>;
  waiting?: NeedsYouItem[];
  routines?: (creature: string) => readonly RoutineView[];
}

function steadHarness(staging: Staging) {
  return createRoot(() => {
    const bots = staging.bots ?? [bot("reviewer"), bot("scribe")];
    const creatures = staging.creatures ?? bots.map(creatureOnTheWire);
    const [summaries, setSummaries] = createSignal<SessionRow[]>(staging.summaries ?? []);
    const projections = staging.projections ?? {};
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const opened: string[] = [];
    const loaded: string[] = [];
    const panes: string[] = [];
    const answered: Answered[] = [];
    const overturned: string[] = [];
    const dismissed: string[] = [];
    const [items, setWaiting] = createSignal<readonly NeedsYouItem[]>(staging.waiting ?? []);
    const base = overviewShell({ summaries: summaries() }).shell;
    const store = {
      ...base.store,
      state: {
        ...base.store.state,
        get summaries() {
          return summaries();
        },
        projections,
      },
      summary: (id: string | undefined) => summaries().find((held) => held.id === id),
      surfaces: { state: { bots, ordinals: {} } },
      projection: (id: string | undefined) =>
        (id === undefined ? undefined : projections[id]) ?? emptyProjection,
      open: async (id: string) => void loaded.push(id),
      answerAsk: async (
        callId: string,
        verdict: AskVerdict,
        scope?: AskScope,
        reason?: DenyReason,
      ): Promise<AnswerOutcome> => {
        answered.push(
          reason === undefined ? [callId, verdict, scope] : [callId, verdict, scope, reason],
        );
        return "settled";
      },
    };
    const queue: NeedsYouQueue = {
      items,
      count: () => items().length,
      head: () => items()[0],
      where: () => "",
      dismiss: (item) => {
        dismissed.push(item.key);
        return "dismissed";
      },
      attach: () => () => undefined,
      onArrival: () => () => undefined,
    };
    const client = {
      ...base.client,
      creatures: async () => creatures,
      routines: async (creature: string) => staging.routines?.(creature) ?? [],
      overturnCreatureDecision: async (slug: string, recordId: string) => {
        overturned.push(`${slug}/${recordId}`);
        return { overturned: true, recordId, ruleClass: "shell.read", demoted: [] };
      },
    } as unknown as ShellSeams["client"];
    const companion = createCompanionController();
    const shell: ShellSeams = {
      ...base,
      companion,
      client,
      store: store as unknown as ShellSeams["store"],
      keys,
      sessions: { ...base.sessions, openSession: (id) => void opened.push(id) },
      openPane: (spec) => void panes.push(spec.kind),
      feed: {
        ...base.feed,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      needsYou: {
        queue,
        reads: createSessionReads(),
        revealing: () => undefined,
        jump: () => undefined,
        visit: () => undefined,
        dressed: () => undefined,
      },
    };
    const emit = (envelopes: readonly BusEnvelope[]): void => {
      for (const listener of listeners) listener(envelopes);
    };
    return {
      shell,
      companion,
      creatures,
      opened,
      loaded,
      panes,
      answered,
      overturned,
      dismissed,
      emit,
      setWaiting,
      setSummaries,
    };
  });
}

function mount(stead: ReturnType<typeof steadHarness>) {
  return mountPane(steadPane.component, { kind: "stead" }, stead.shell);
}

function mountUnfocused(stead: ReturnType<typeof steadHarness>) {
  const Stead = steadPane.component;
  return render(() => (
    <Stead
      id="p1"
      spec={{ kind: "stead" }}
      focused={false}
      shell={stead.shell}
      onAction={() => undefined}
    />
  ));
}

const heldChore: ChoreWaiting = {
  kind: "chore",
  key: "C:/work:chore:reviewer/triage/grants",
  workspace: "C:/work",
  since: "2026-11-06T09:00:00.000Z",
  creature: "reviewer",
  routineId: "triage",
  need: "grants",
  reason: "accept the write grant set 3f9c1a2b",
  runId: "run-1",
  digest: "3f9c1a2b",
};

function routineView(id: string, title: string, nextRunAt: string | null): RoutineView {
  return {
    creature: "reviewer",
    id,
    file: `${id}.md`,
    routine: { id, title } as unknown as RoutineView["routine"],
    problem: null,
    grants: null,
    schedule: { enabled: true, disabled: null, nextRunAt, consecutiveErrors: 0, retryAt: null },
    activeRunId: null,
    lastRun: null,
  };
}

function bot(name: string): BotSummary {
  return { name, sigil: "◆", source: "project", sessions: 1, lastUsed: minutesAgo(90) };
}

function creatureOnTheWire(bot: BotSummary): CreatureSummary {
  return {
    slug: bot.name,
    name: bot.name,
    sigil: bot.sigil,
    created: bot.lastUsed ?? minutesAgo(90),
    skin: "kid",
    seed: 0,
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: null,
    threads: 0,
  };
}

function row(
  id: string,
  title: string,
  botName: string,
  extra: Partial<SessionRow> = {},
): SessionRow {
  const at = minutesAgo(3);
  return {
    id,
    title,
    createdAt: at,
    lastActivityAt: at,
    messageCount: 4,
    bot: botName,
    ...extra,
  };
}

function asking(callId: string, rules: PermissionRule[], tool = "bash"): SessionProjection {
  const ask = {
    tool,
    callId,
    arguments: { command: "bun test src/shell/trash.test.ts" },
    rule: "default",
    rules,
  };
  return projectAll(emptyProjection, [
    envelope(1, "s", "turn.started", { userText: "go" }),
    envelope(2, "s", "gate.ask", { ask }),
  ]);
}

function bashRule(resource: string): PermissionRule {
  return { action: "bash", resource, effect: "allow" };
}

function envelope(id: number, sessionId: string, type: string, payload: unknown): BusEnvelope {
  return { id, ts: minutesAgo(0), sessionId, type, payload } as BusEnvelope;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function commandNames(
  command: { name: string; aliases?: readonly string[] } | undefined,
): string[] {
  return command === undefined ? [] : [command.name, ...(command.aliases ?? [])];
}

function creatureLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-stead-creature")].map(
    (button) => button.getAttribute("aria-label") ?? "",
  );
}

function creatureButton(container: HTMLElement, slug: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `.kw-stead-creature[data-slug="${slug}"]`,
  );
  if (button === null) throw new Error(`no creature button for ${slug}`);
  return button;
}

function stageOf(container: HTMLElement): HTMLElement {
  return container.querySelector(".kw-stead-field") as HTMLElement;
}

function boxOf(element: HTMLElement): { left: number; top: number; width: number; height: number } {
  const px = (value: string): number => Number.parseFloat(value);
  return {
    left: px(element.style.left),
    top: px(element.style.top),
    width: px(element.style.width),
    height: px(element.style.height),
  };
}

function rowNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-stead-row .kw-stead-name")].map(
    (name) => name.textContent ?? "",
  );
}

function rowStates(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-stead-row .kw-stead-state")].map(
    (state) => state.textContent ?? "",
  );
}

function bubbleLineText(container: HTMLElement): string | undefined {
  return (
    container.querySelector(".kw-stead-bubble .kw-stead-bubble-line")?.textContent ?? undefined
  );
}

function headText(container: HTMLElement): string {
  return container.querySelector(".kw-ov-head-lead")?.textContent ?? "";
}

function answers(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-stead-answer")].map(
    (button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

function lineText(container: HTMLElement): string | undefined {
  return container.querySelector(".kw-ov-line")?.textContent ?? undefined;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function seated(): Promise<void> {
  for (let hop = 0; hop < 8; hop += 1) await Promise.resolve();
}

describe("the stead pane's power tiers", () => {
  it("idles on timers alone: ten seconds without a pointer schedule no animation frame and few wakes", () => {
    vi.useFakeTimers();
    const animationFrame = vi.fn((callback: FrameRequestCallback): number =>
      Number(setTimeout(() => callback(Date.now()), 16)),
    );
    vi.stubGlobal("requestAnimationFrame", animationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    try {
      const { container } = mount(steadHarness({}));
      vi.advanceTimersByTime(10_000);
      const field = stageOf(container);
      expect(animationFrame).not.toHaveBeenCalled();
      expect(field.dataset.tier).toBe("ambient");
      expect(field.dataset.frames).toBe("0");
      expect(Number(field.dataset.wakes)).toBeLessThanOrEqual(wakeBudgetPerTenSeconds);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("rests while unfocused and still: ten seconds schedule no animation frame and a wake a second at most", () => {
    vi.useFakeTimers();
    const animationFrame = vi.fn((callback: FrameRequestCallback): number =>
      Number(setTimeout(() => callback(Date.now()), 16)),
    );
    vi.stubGlobal("requestAnimationFrame", animationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    try {
      const { container } = mountUnfocused(steadHarness({}));
      const field = stageOf(container);
      const mounted = Number(field.dataset.wakes);
      vi.advanceTimersByTime(10_000);
      expect(animationFrame).not.toHaveBeenCalled();
      expect(field.dataset.tier).toBe("rest");
      expect(field.dataset.frames).toBe("0");
      expect(Number(field.dataset.wakes) - mounted).toBeLessThanOrEqual(10);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("rests when the window is unfocused though the stead is the focused pane, and wakes to ambient when the window is focused again", async () => {
    vi.useFakeTimers();
    const animationFrame = vi.fn((callback: FrameRequestCallback): number =>
      Number(setTimeout(() => callback(Date.now()), 16)),
    );
    vi.stubGlobal("requestAnimationFrame", animationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    try {
      const { container } = mount(steadHarness({}));
      const field = stageOf(container);
      expect(field.dataset.tier).toBe("ambient");
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
      const blurredAt = Number(field.dataset.wakes);
      vi.advanceTimersByTime(10_000);
      expect(field.dataset.tier).toBe("rest");
      expect(animationFrame).not.toHaveBeenCalled();
      expect(field.dataset.frames).toBe("0");
      expect(Number(field.dataset.wakes) - blurredAt).toBeLessThanOrEqual(10);
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      vi.advanceTimersByTime(200);
      expect(field.dataset.tier).toBe("ambient");
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("lives at rest: three untouched, unfocused minutes still see a creature stretch, sit or wander, at a wake a second at most and no frame", async () => {
    vi.useFakeTimers();
    const animationFrame = vi.fn((callback: FrameRequestCallback): number =>
      Number(setTimeout(() => callback(Date.now()), 16)),
    );
    vi.stubGlobal("requestAnimationFrame", animationFrame);
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    try {
      const { container } = mountUnfocused(steadHarness({}));
      await seated();
      const field = stageOf(container);
      const mounted = Number(field.dataset.wakes);
      const tiers = new Set<string>();
      const seen = new Set<string>();
      for (let second = 0; second < 180; second++) {
        vi.advanceTimersByTime(1000);
        tiers.add(field.dataset.tier ?? "");
        for (const slug of ["reviewer", "scribe"]) {
          const creature = creatureButton(container, slug);
          seen.add(`${slug} ${creature.dataset.clip} ${creature.style.left}`);
        }
      }
      expect(tiers).toEqual(new Set(["rest"]));
      expect(seen.size).toBeGreaterThan(2);
      expect(animationFrame).not.toHaveBeenCalled();
      expect(field.dataset.frames).toBe("0");
      expect(Number(field.dataset.wakes) - mounted).toBeLessThanOrEqual(180 + 6);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("paints at rest only when a beat changes the picture, a clip or a place, never on the wake alone", async () => {
    vi.useFakeTimers();
    const painted = vi.fn();
    const context = {
      imageSmoothingEnabled: true,
      fillStyle: "",
      fillRect: () => undefined,
      clearRect: painted,
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    try {
      const { container } = mountUnfocused(steadHarness({}));
      await seated();
      const field = stageOf(container);
      const mounted = Number(field.dataset.wakes);
      const paintedAtMount = painted.mock.calls.length;
      const pictureNow = (): string =>
        ["reviewer", "scribe"]
          .map((slug) => creatureButton(container, slug))
          .map(
            (creature) => `${creature.dataset.clip}@${creature.style.left},${creature.style.top}`,
          )
          .join(" ");
      let shown = pictureNow();
      let changes = 0;
      for (let second = 0; second < 120; second++) {
        vi.advanceTimersByTime(1000);
        const picture = pictureNow();
        if (picture !== shown) changes += 1;
        shown = picture;
      }
      const wakes = Number(field.dataset.wakes) - mounted;
      const paints = painted.mock.calls.length - paintedAtMount;
      expect(field.dataset.tier).toBe("rest");
      expect(wakes).toBeGreaterThanOrEqual(100);
      expect(paints).toBeLessThanOrEqual(changes + 4);
      expect(paints * 4).toBeLessThan(wakes);
    } finally {
      getContext.mockRestore();
      vi.useRealTimers();
    }
  });

  it("paints nothing when a draw finds the world and every figure unchanged", async () => {
    vi.useFakeTimers();
    const painted = vi.fn();
    const context = {
      imageSmoothingEnabled: true,
      fillStyle: "",
      fillRect: () => undefined,
      clearRect: painted,
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    try {
      const { container } = mountUnfocused(steadHarness({}));
      const field = stageOf(container);
      expect(painted).toHaveBeenCalledTimes(1);
      const wakes = Number(field.dataset.wakes);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      expect(Number(field.dataset.wakes)).toBe(wakes + 1);
      expect(painted).toHaveBeenCalledTimes(1);
    } finally {
      getContext.mockRestore();
      vi.useRealTimers();
    }
  });

  it("forwards its own cursor and open chords to the onboarding card while it shows", () => {
    expect(steadVerbs).toEqual({ "stead.down": "down", "stead.up": "up", "stead.open": "keep" });
  });
});

const wakeBudgetPerTenSeconds = 80;

describe("the stead pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(steadPane);
  });
});
