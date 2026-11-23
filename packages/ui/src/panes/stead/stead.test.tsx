import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BotSummary,
  BusEnvelope,
  CreatureSummary,
  DenyReason,
  PermissionRule,
  SessionRow,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompanionController } from "../../companion/floating.ts";
import { keymapFromConfig } from "../../keys/index.ts";
import { stopAskingWhy, whyLine } from "../../page/ask-card-why.ts";
import { type ChoreWaiting, choreAcceptedLine, type NeedsYouItem } from "../../shell/needs-you.ts";
import type { NeedsYouQueue } from "../../shell/needs-you-queue.ts";
import { decidedItem } from "../../shell/needs-you-testing.ts";
import { createSessionReads } from "../../shell/session-reads.ts";
import { morningTriage } from "../chores/testing.ts";
import { mountPane, overviewShell, settle } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import { acceptHint, acceptsOnly, overturnHint, overturnsOnly } from "./copy.ts";
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
}

function steadHarness(staging: Staging) {
  return createRoot(() => {
    const bots = staging.bots ?? [bot("reviewer"), bot("scribe")];
    const creatures = staging.creatures ?? bots.map(creatureOnTheWire);
    const [summaries] = createSignal<SessionRow[]>(staging.summaries ?? []);
    const projections = staging.projections ?? {};
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const opened: string[] = [];
    const loaded: string[] = [];
    const panes: string[] = [];
    const answered: Answered[] = [];
    const overturned: string[] = [];
    const dismissed: string[] = [];
    const [items] = createSignal<readonly NeedsYouItem[]>(staging.waiting ?? []);
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
      routines: async () => [],
      overturnCreatureDecision: async (slug: string, recordId: string) => {
        overturned.push(`${slug}/${recordId}`);
        return { overturned: true, recordId, ruleClass: "shell.read", demoted: [] };
      },
      creatureHandoffs: async () => [],
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
    return { shell, opened, loaded, panes, answered, overturned, dismissed, emit };
  });
}

function mount(stead: ReturnType<typeof steadHarness>) {
  return mountPane(steadPane.component, { kind: "stead" }, stead.shell);
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

function answers(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-stead-answer")].map(
    (button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

function lineText(container: HTMLElement): string | undefined {
  return container.querySelector(".kw-ov-line")?.textContent ?? undefined;
}
