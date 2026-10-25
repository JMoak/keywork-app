import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BusEnvelope,
  PermissionRule,
  SessionSummary,
} from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { appActions } from "../../keys/actions.ts";
import { keymapFromConfig } from "../../keys/index.ts";
import { type NeedsYouItem, orderNeedsYou } from "../../shell/needs-you.ts";
import type { NeedsYouQueue } from "../../shell/needs-you-queue.ts";
import { airlockItem, askItem, failedItem, inboxItem } from "../../shell/needs-you-testing.ts";
import type { QuietPosture } from "../../shell/quiet.ts";
import { createSessionReads } from "../../shell/session-reads.ts";
import { keyworkNight, themeNamed } from "../../theme/index.ts";
import { mountPane, overviewShell } from "../overview/rows.test.tsx";
import type { ShellSeams } from "../registry.ts";
import { needsYouPane } from "./index.tsx";

afterEach(cleanup);

describe("the desk", () => {
  it("groups every session by what it wants: needs you, working, back, quiet", () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "rename" }), airlockItem("pricing")],
      summaries: [
        summary("rename", "rename the tiler verbs"),
        summary("page", "explain the page grammar"),
        summary("seam", "why is the seam drag sticky"),
        summary("wardrobe", "wardrobe follow-ups"),
        summary("read", "an idle session already read"),
      ],
      projections: { page: working("edit src/page/page.css") },
      unread: ["seam"],
      quiet: ["wardrobe"],
    });
    const { container } = mount(desk);
    expect(groupNames(container)).toEqual(["needs you", "working", "back", "quiet"]);
    expect(rowLines(container)).toEqual([
      ["█ rename the tiler verbs", "ask: rm -rf dist"],
      ["▓ airlock: 2 candidates, 1 question pricing"],
      ["▌ explain the page grammar", "edit src/page/page.css · running"],
      ["█ why is the seam drag sticky"],
      ["» wardrobe follow-ups"],
    ]);
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toBe(
      "5 sessions · 2 need you · 1 working · $2.05",
    );
  });

  it("carries the arc chip, the bot, the theme it wears, its gauge, cost and age", () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "rename" })],
      summaries: [
        { ...summary("rename", "rename the tiler verbs"), arc: "pricing", bot: "editor" },
      ],
      projections: { rename: asking("c1", []) },
      dressed: { rename: "rose-pine-dawn" },
    });
    const { container } = mount(desk);
    const row = container.querySelector(".kw-desk-row") as HTMLElement;
    expect(row.querySelector(".kw-desk-arc")?.textContent).toBe("pricing");
    expect(row.querySelector(".kw-desk-bot")?.textContent).toBe("◆ editor");
    expect(row.querySelector(".kw-desk-wears")?.textContent).toBe("rose-pine-dawn");
    expect(row.querySelectorAll(".kw-desk-swatch")).toHaveLength(8);
    expect(row.querySelector(".kw-desk-cost")?.textContent).toBe("$0.41");
    expect(row.querySelector(".kw-desk-age")?.textContent).toMatch(/^waiting \d+[mhd]$/);
    expect(row.style.getPropertyValue("--kw-arc-hue")).toBe("var(--kw-ramp-2)");
  });

  it("answers the cursor row's ask in place with the card's own keys and labels", async () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "trash" })],
      summaries: [summary("trash", "fix the flaky trash test")],
      projections: { trash: asking("c1", [bashRule("bun test *")]) },
    });
    const { container, act } = mount(desk);
    expect(desk.opened).toEqual(["trash"]);
    expect(answers(container)).toEqual(["once y", "this session s", "this workspace w", "deny n"]);
    act("needs-you.session");
    await settle();
    expect(desk.answered).toEqual([["c1", "granted", "session"]]);
    act("needs-you.deny");
    await settle();
    expect(desk.answered.at(-1)).toEqual(["c1", "denied", undefined]);
  });

  it("honours the session's quiet posture: y grants for the session, o stays once", async () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "trash" })],
      summaries: [summary("trash", "fix the flaky trash test")],
      projections: { trash: asking("c1", [bashRule("bun test *")]) },
      quiet: ["trash"],
    });
    const { container, act } = mount(desk);
    expect(container.querySelector(".kw-desk-quiet")?.textContent).toBe("»");
    expect(answers(container)).toEqual(["this session y", "once o", "this workspace w", "deny n"]);
    act("needs-you.approve");
    act("needs-you.once");
    await settle();
    expect(desk.answered).toEqual([
      ["c1", "granted", "session"],
      ["c1", "granted", undefined],
    ]);
  });

  it("says why it cannot remember a once-only ask, and when the row holds no ask", async () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "rename", tool: "edit" }), inboxItem("m1")],
      summaries: [summary("rename", "rename the tiler verbs")],
      projections: { rename: asking("c1", [], "edit") },
    });
    const { container, act } = mount(desk);
    expect(answers(container)).toEqual(["once y", "deny n"]);
    act("needs-you.workspace");
    await settle();
    expect(lineText(container)).toBe("this ask can only be answered once · y approves it");
    expect(desk.answered).toEqual([]);
    act("needs-you.down");
    act("needs-you.approve");
    expect(lineText(container)).toBe("no ask on this row · tab goes to the next waiting");
  });

  it("shows a refusal the server gives in its own words", async () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "trash" })],
      summaries: [summary("trash", "fix the flaky trash test")],
      projections: { trash: asking("c1", [bashRule("bun test *")]) },
      refuse: "keywork remembers nothing for this call",
    });
    const { container, act } = mount(desk);
    act("needs-you.workspace");
    await settle();
    expect(lineText(container)).toBe("keywork remembers nothing for this call");
  });

  it("offers the answers only on the asking row under the cursor", () => {
    const desk = deskHarness({
      waiting: [askItem("c1", { sessionId: "a" }), askItem("c2", { sessionId: "b" })],
      summaries: [summary("a", "first"), summary("b", "second")],
      projections: { a: asking("c1", []), b: asking("c2", []) },
    });
    const { container, act } = mount(desk);
    expect(container.querySelectorAll(".kw-desk-answers")).toHaveLength(1);
    act("needs-you.down");
    const cursor = container.querySelector(".kw-desk-row[data-cursor]");
    expect(cursor?.querySelector(".kw-desk-name")?.textContent).toBe("second");
    expect(cursor?.querySelector(".kw-desk-answers")).not.toBeNull();
  });

  it("moves with j and k, tabs to the next waiting row, and jumps or visits with enter", () => {
    const desk = deskHarness({
      waiting: [askItem("c1"), airlockItem("pricing")],
      summaries: [summary("s1", "asking"), summary("page", "explain the page grammar")],
      projections: { page: working("read plan.md") },
    });
    const { container, act } = mount(desk);
    act("needs-you.down");
    act("needs-you.down");
    expect(cursorName(container)).toBe("explain the page grammar");
    act("needs-you.open");
    expect(desk.visited).toEqual(["page"]);
    act("needs-you.waiting");
    expect(cursorName(container)).toBe("asking");
    act("needs-you.waiting");
    act("needs-you.open");
    expect(desk.jumped).toEqual(["C:/work#airlock:pricing"]);
    act("needs-you.up");
    expect(cursorName(container)).toBe("asking");
  });

  it("jumps on a click too, the mouse as a garnish", () => {
    const desk = deskHarness({ waiting: [askItem("c1"), inboxItem("m1")] });
    const { container } = mount(desk);
    const heads = container.querySelectorAll<HTMLButtonElement>(".kw-desk-head");
    fireEvent.click(heads[1] as HTMLButtonElement);
    expect(desk.jumped).toEqual(["C:/work#inbox:m1"]);
    expect(cursorName(container)).toBe("inbox: entities/pricing.md");
  });

  it("dismisses what can be dismissed, never an ask, and marks a back session read", () => {
    const desk = deskHarness({
      waiting: [askItem("c1"), failedItem("s4")],
      summaries: [summary("seam", "why is the seam drag sticky")],
      unread: ["seam"],
    });
    const { container, act } = mount(desk);
    act("needs-you.dismiss");
    expect(lineText(container)).toBe(
      "an ask is answered, never dismissed · y or n answers it here",
    );
    act("needs-you.down");
    act("needs-you.dismiss");
    expect(desk.items().map((item) => item.kind)).toEqual(["ask"]);
    expect(lineText(container)).toBe("dismissed · the transcript keeps the failure");
    act("needs-you.dismiss");
    expect(lineText(container)).toBe("marked read · the sessions tree still lists it");
    expect(groupNames(container)).toEqual(["needs you"]);
  });

  it("marks each workspace when more than one is waiting", () => {
    const desk = deskHarness({
      waiting: [
        askItem("c1"),
        askItem("c2", { workspace: "D:/side/tools", since: "2026-10-15T11:00:00.000Z" }),
      ],
    });
    const { container } = mount(desk);
    const headings = [...container.querySelectorAll(".kw-desk-workspace")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["work", "tools"]);
  });

  it("teaches the one next key when the desk is clear, and titles itself by the count", () => {
    const desk = deskHarness({});
    const { container } = mount(desk);
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "the desk is clear · ctrl+k t lists every session",
    );
    expect(container.querySelector(".kw-ov-line")).toBeNull();
    expect(needsYouPane.title({ kind: "needs-you" }, desk.shell)).toBe("desk");
    const waiting = deskHarness({ waiting: [askItem("c1"), inboxItem("m1")] });
    expect(needsYouPane.title({ kind: "needs-you" }, waiting.shell)).toBe("desk · 2 need you");
  });

  it("wears the needs-you state while anything waits, the house always, and lives in main", () => {
    const view = { id: "p1", spec: { kind: "needs-you" as const }, focused: false };
    expect(needsYouPane.lifecycle?.(view, deskHarness({ waiting: [askItem("c1")] }).shell)).toBe(
      "needs-you",
    );
    expect(needsYouPane.lifecycle?.(view, deskHarness({}).shell)).toBe("idle");
    expect(needsYouPane.attire).toBe("house");
    expect(needsYouPane.home).toBe("main");
  });
});

describe("the desk's keys", () => {
  it("owns leader n, leader shift+n and leader q, with palette names nobody else claims", () => {
    const ours = Object.entries(appActions).filter(([id]) => id.startsWith("needs-you."));
    expect(Object.fromEntries(ours.map(([id, action]) => [id, action.chords]))).toEqual({
      "needs-you.next": "leader n",
      "needs-you.back": "leader shift+n",
      "needs-you.strip": "none",
      "needs-you.summon": "leader q",
      "needs-you.down": ["j", "down"],
      "needs-you.up": ["k", "up"],
      "needs-you.open": "enter",
      "needs-you.waiting": "tab",
      "needs-you.dismiss": "d",
      "needs-you.approve": "y",
      "needs-you.once": "o",
      "needs-you.session": "s",
      "needs-you.workspace": "w",
      "needs-you.deny": "n",
    });
    const theirs = new Set(
      Object.entries(appActions)
        .filter(([id]) => !id.startsWith("needs-you."))
        .flatMap(([, action]) => commandNames(action.command)),
    );
    const claimed = ours.flatMap(([, action]) => commandNames(action.command));
    expect(claimed.filter((name) => theirs.has(name))).toEqual([]);
  });

  it("is summoned as desk and still answers to needs-you and waiting", () => {
    expect(commandNames(appActions["needs-you.summon"]?.command)).toEqual([
      "desk",
      "needs-you",
      "waiting",
    ]);
  });
});

interface DeskStaging {
  waiting?: NeedsYouItem[];
  summaries?: SessionSummary[];
  projections?: Record<string, SessionProjection>;
  unread?: string[];
  quiet?: string[];
  dressed?: Record<string, string>;
  refuse?: string;
}

function deskHarness(staging: DeskStaging) {
  return createRoot(() => {
    const [items, setItems] = createSignal<readonly NeedsYouItem[]>(
      orderNeedsYou(staging.waiting ?? []),
    );
    const listed = staging.summaries ?? [];
    const reads = createSessionReads();
    reads.sight(listed);
    const summaries = listed.map((held) =>
      staging.unread?.includes(held.id) === true ? { ...held, lastActivityAt: hoursAgo(0) } : held,
    );
    const projections = staging.projections ?? {};
    const jumped: string[] = [];
    const visited: string[] = [];
    const opened: string[] = [];
    const answered: [string, AskVerdict, AskScope | undefined][] = [];
    const quietIds = staging.quiet ?? [];
    const quiet: QuietPosture = { has: (id) => id !== undefined && quietIds.includes(id) };
    const base = overviewShell({ summaries }).shell;
    const queue: NeedsYouQueue = {
      items,
      count: () => items().length,
      head: () => items()[0],
      where: (item) =>
        item.kind === "ask" || item.kind === "failed"
          ? `session ${item.sessionId}`
          : item.kind === "airlock"
            ? item.arc
            : "memory",
      dismiss: (item) => {
        if (item.kind === "ask") return "answer-it";
        setItems((held) => held.filter((kept) => kept.key !== item.key));
        return "dismissed";
      },
      attach: () => () => undefined,
      onArrival: () => () => undefined,
    };
    const store = {
      ...base.store,
      state: { ...base.store.state, summaries, projections },
      summary: (id: string | undefined) => summaries.find((held) => held.id === id),
      surfaces: { state: { bots: [{ name: "editor", sigil: "◆" }], ordinals: { pricing: 1 } } },
      projection: (id: string | undefined) =>
        (id === undefined ? undefined : projections[id]) ?? emptyProjection,
      controls: { readings: () => ({ context: undefined, cost: undefined }) },
      open: async (id: string) => void opened.push(id),
      answerAsk: async (
        callId: string,
        verdict: AskVerdict,
        scope?: AskScope,
      ): Promise<AnswerOutcome> => {
        answered.push([callId, verdict, scope]);
        return staging.refuse === undefined
          ? "settled"
          : { refused: "nothing-to-remember", detail: staging.refuse };
      },
    };
    const keymap = keymapFromConfig();
    const shell: ShellSeams = {
      ...base,
      store: store as unknown as ShellSeams["store"],
      keys: { chord: (action) => keymap.describe(action) ?? action, leader: () => keymap.leader },
      quiet,
      needsYou: {
        queue,
        reads,
        revealing: () => undefined,
        jump: (item) => void jumped.push(item.key),
        visit: (sessionId) => void visited.push(sessionId),
        dressed: (sessionId) => {
          const name = staging.dressed?.[sessionId];
          return name === undefined
            ? undefined
            : { theme: themeNamed(name) ?? keyworkNight, source: "pane" };
        },
      },
    };
    return { shell, items, jumped, visited, opened, answered };
  });
}

function mount(desk: ReturnType<typeof deskHarness>) {
  return mountPane(needsYouPane.component, { kind: "needs-you" }, desk.shell);
}

function summary(id: string, title: string): SessionSummary {
  const at = hoursAgo(1);
  return { id, title, createdAt: at, lastActivityAt: at, messageCount: 4, costNanos: 410_000_000 };
}

function working(step: string): SessionProjection {
  const [verb = "read", subject = ""] = step.split(" ");
  const call = { type: "tool-call", callId: "t1", name: verb, arguments: { path: subject } };
  return projectAll(emptyProjection, [
    envelope(1, "turn.started", { userText: "go" }),
    envelope(2, "tool.started", { call }),
  ]);
}

function asking(callId: string, rules: PermissionRule[], tool = "bash"): SessionProjection {
  const ask = { tool, callId, arguments: { command: "rm -rf dist" }, rule: "default", rules };
  return projectAll(emptyProjection, [
    envelope(1, "turn.started", { userText: "go" }),
    envelope(2, "gate.ask", { ask }),
  ]);
}

function bashRule(resource: string): PermissionRule {
  return { action: "bash", resource, effect: "allow" };
}

function envelope(id: number, type: string, payload: unknown): BusEnvelope {
  return { id, ts: hoursAgo(0), sessionId: "s", type, payload } as BusEnvelope;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function groupNames(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll(".kw-desk-group-name")].map((name) => name.textContent);
}

function rowLines(container: HTMLElement): string[][] {
  return [...container.querySelectorAll(".kw-desk-row")].map((row) => {
    const head = [".kw-desk-stamp", ".kw-desk-quiet", ".kw-desk-name", ".kw-desk-where"]
      .map((part) => row.querySelector(part)?.textContent?.trim() ?? "")
      .filter((part) => part !== "")
      .join(" ");
    const tail = row.querySelector(".kw-desk-line")?.textContent;
    return tail === undefined || tail === null ? [head] : [head, tail];
  });
}

function answers(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-desk-answer")].map(
    (answer) => answer.textContent ?? "",
  );
}

function cursorName(container: HTMLElement): string {
  return container.querySelector(".kw-desk-row[data-cursor] .kw-desk-name")?.textContent ?? "";
}

function lineText(container: HTMLElement): string {
  return container.querySelector(".kw-ov-line")?.textContent ?? "";
}

function commandNames(
  command: { name: string; aliases?: readonly string[] } | undefined,
): string[] {
  return command === undefined ? [] : [command.name, ...(command.aliases ?? [])];
}
