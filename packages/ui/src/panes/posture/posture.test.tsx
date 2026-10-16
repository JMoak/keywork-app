import { type ServerFeed, ServerRefusal } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  bunWorkspace,
  type FactsHarness,
  factsHarness,
  memoryStorage,
} from "../../posture/facts.test.ts";
import { postureStorageKey } from "../../posture/record.ts";
import { createTrustSetup, type TrustSetup } from "../../posture/trust-setup.ts";
import { inertFeed, inertTrust } from "../../shell/trust.test.ts";
import { mountPane, overviewShell, rowTexts, settle } from "../overview/rows.test.tsx";
import type { ShellSeams } from "../registry.ts";
import { posturePane } from "./index.tsx";

afterEach(cleanup);

interface Harness {
  readonly facts: FactsHarness;
  readonly setup: TrustSetup;
  readonly shell: ShellSeams;
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  emit(envelope: BusEnvelope): void;
}

function postureShell(
  facts = factsHarness(bunWorkspace),
  storage = memoryStorage(),
  overrides: Partial<ShellSeams> = {},
): Harness {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  const feed: ServerFeed = {
    ...inertFeed(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const setup = createRoot(() =>
    createTrustSetup({
      client: facts.client,
      storage,
      storageKey: postureStorageKey("C:/work"),
    }),
  );
  const base = overviewShell().shell;
  return {
    facts,
    setup,
    storage,
    shell: { ...base, feed, trustSetup: setup, ...overrides },
    emit: (envelope) => {
      for (const listener of listeners) listener([envelope]);
    },
  };
}

function mount(harness: Harness, sessionId?: string) {
  const spec =
    sessionId === undefined
      ? { kind: "posture" as const }
      : { kind: "posture" as const, sessionId };
  return mountPane(posturePane.component, spec, harness.shell);
}

async function press(act: (action: string) => void, ...actions: string[]): Promise<void> {
  for (const action of actions) {
    act(action);
    await settle();
  }
}

const declinedMcp = {
  refused: "declined",
  detail:
    "an answered ask never records mcp filesystem__*; grants hold bash commands and MCP tools as an answer would remember them",
} as const;

function permissionsChanged(): BusEnvelope {
  return {
    id: 8,
    ts: "2026-10-15T09:00:01.000Z",
    sessionId: "",
    type: "surface.changed",
    payload: { kind: "permissions" },
  };
}

function texts(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? "");
}

function noticeOf(container: HTMLElement): string {
  return texts(container, ".kw-ov-line").at(-1) ?? "";
}

function grantDecision(scope: "once" | "workspace"): BusEnvelope {
  return {
    id: 7,
    ts: "2026-10-15T09:00:00.000Z",
    sessionId: "s1",
    type: "gate.permission",
    payload: { decision: { tool: "bash", callId: "c1", verdict: "granted", gate: "user", scope } },
  };
}

describe("the trust setup pane", () => {
  it("lays out what is automatic, what it proposes with each reason, and what still asks", async () => {
    const { container } = mount(postureShell());
    await settle();
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toBe(
      "the whole posture · keywork 0.2.0",
    );
    expect(container.querySelector(".kw-ov-head-detail")?.textContent).toBe(
      "y accepts · n declines · a accepts the rest",
    );
    expect(container.querySelector(".kw-setup-reads")?.textContent).toBe(
      "trusted reads · 1 command without an ask · fixed in keywork",
    );
    expect(rowTexts(container)).toEqual([
      "bun install * every session",
      "bun run * every session",
      "mcp filesystem__* per session",
    ]);
    expect(texts(container, ".kw-ov-sub")).toEqual([
      "bun.lock · installs what it pins",
      "package.json scripts test, lint · runs any of them",
      "mcp server filesystem · connected · 11 tools",
    ]);
    expect(texts(container, "[aria-label='still asks'] li")).toEqual([
      "write and edit · approved once at a time, never remembered",
      "rm, rmdir, rd, del, erase, Remove-Item, git branch -D · a grant covers only the exact command",
      "git push --force, git reset --hard, git clean, git checkout -- · never remembered by a grant",
      "any other command or mcp tool · asks until a rule covers it",
    ]);
  });

  it("accepts with y, records the rule in keywork at once, and moves to the next rule", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness);
    await settle();
    await press(act, "posture.down", "posture.accept");
    expect(harness.facts.grants).toEqual(["workspace bash bun run *"]);
    expect(rowTexts(container)[1]).toBe("█ bun run * accepted");
    expect(noticeOf(container)).toBe("accepted bun run * · keywork holds it for every session");
    expect(container.querySelector(".kw-ov-row[data-cursor] .kw-ov-name")?.textContent).toBe(
      "mcp filesystem__*",
    );
  });

  it("records an mcp server for the session the setup was opened from", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness, "s1");
    await settle();
    await press(act, "posture.down", "posture.down", "posture.accept");
    expect(harness.facts.grants).toEqual(["s1 mcp filesystem__*"]);
    expect(noticeOf(container)).toBe(
      "accepted mcp filesystem__* · keywork holds it for this session",
    );
  });

  it("keeps an mcp server waiting for its first ask when no session is focused", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness);
    await settle();
    await press(act, "posture.down", "posture.down", "posture.accept");
    expect(harness.facts.grants).toEqual([]);
    expect(noticeOf(container)).toBe(
      "accepted mcp filesystem__* · no session is focused, so each session records it when its first ask is answered with ctrl+k ask.session",
    );
  });

  it("shows keywork's decline on the row in its own words and leaves the rule undecided", async () => {
    const harness = postureShell();
    harness.facts.refuseGrants(declinedMcp);
    const { container, act } = mount(harness, "s1");
    await settle();
    await press(act, "posture.down", "posture.down", "posture.accept");
    expect(texts(container, ".kw-ov-sub[data-tone='error']")).toEqual([declinedMcp.detail]);
    expect(rowTexts(container)[2]).toBe("mcp filesystem__* per session");
    expect(noticeOf(container)).toBe("not recorded · mcp filesystem__* stays undecided");
  });

  it("never claims to take back a rule keywork already holds", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness);
    await settle();
    await press(act, "posture.accept", "posture.up", "posture.decline");
    expect(rowTexts(container)[0]).toBe("█ bun install * accepted");
    expect(noticeOf(container)).toBe(
      "keywork already holds bun install * · ctrl+k permissions.summon revokes it",
    );
  });

  it("declines with n, keeps the posture as it was, and settles once the last rule is decided", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness);
    await settle();
    await press(act, "posture.decline");
    expect(noticeOf(container)).toBe("declined bun install * · it asks as before");
    expect(container.querySelector(".kw-ov-row[data-muted] .kw-ov-name")?.textContent).toBe(
      "bun install *",
    );
    await press(act, "posture.decline", "posture.decline");
    expect(noticeOf(container)).toBe(
      "settled · 0 accepted · 3 declined · the posture stays as it was",
    );
    expect(harness.facts.grants).toEqual([]);
  });

  it("accepts the rest with a and says which accepted rule still waits for its first ask", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness);
    await settle();
    await press(act, "posture.decline", "posture.accept-rest");
    expect(noticeOf(container)).toBe(
      "settled · 2 accepted · 1 declined · 1 waits for its first ask",
    );
  });

  it("accepts the rest into keywork whole when a session is focused", async () => {
    const harness = postureShell();
    const { container, act } = mount(harness, "s1");
    await settle();
    await press(act, "posture.accept-rest");
    expect(harness.facts.grants).toEqual([
      "workspace bash bun install *",
      "workspace bash bun run *",
      "s1 mcp filesystem__*",
    ]);
    expect(noticeOf(container)).toBe(
      "settled · 3 accepted · 0 declined · keywork holds every accepted rule",
    );
  });

  it("names the rules keywork would not record when accepting the rest", async () => {
    const harness = postureShell();
    harness.facts.refuseGrants(declinedMcp);
    const { container, act } = mount(harness, "s1");
    await settle();
    await press(act, "posture.accept-rest");
    expect(noticeOf(container)).toBe("3 rules not recorded · their rows say why");
  });

  it("reopens on a changed workspace scoped to the difference alone", async () => {
    const storage = memoryStorage();
    const facts = factsHarness(bunWorkspace);
    const first = postureShell(facts, storage);
    await first.setup.begin();
    await first.setup.acceptRest();
    facts.change({
      mcp: [
        ...(bunWorkspace.mcp ?? []),
        { name: "playwright", state: "connected", enabled: true, toolCount: 12 },
      ],
    });
    const { container } = mount(postureShell(facts, storage));
    await settle();
    expect(container.querySelector(".kw-ov-head-lead")?.textContent).toBe(
      "new since the last setup · new mcp server: playwright",
    );
    expect(rowTexts(container)).toEqual(["mcp playwright__* per session"]);
  });

  it("lists the workspace's grants and names any fact it could not read", async () => {
    const facts = factsHarness({ ...bunWorkspace, workspaceGrants: ["git add *"] });
    facts.fail("bots", new ServerRefusal(503, "the server answered 503"));
    const { container } = mount(postureShell(facts));
    await settle();
    expect(texts(container, "[aria-label='granted'] li")).toEqual(["git add * · every session"]);
    expect(texts(container, ".kw-ov-line[data-tone='error']")).toEqual([
      "could not read the bots · the server answered 503",
    ]);
  });

  it("rereads when a grant is recorded, and not for an answer given once", async () => {
    const harness = postureShell();
    mount(harness);
    await settle();
    const reads = () => harness.facts.calls.filter((call) => call === "permissions").length;
    harness.emit(grantDecision("once"));
    await settle();
    expect(reads()).toBe(1);
    harness.emit(grantDecision("workspace"));
    await settle();
    expect(reads()).toBe(2);
  });

  it("rereads when keywork says the permissions changed", async () => {
    const harness = postureShell();
    mount(harness);
    await settle();
    harness.emit(permissionsChanged());
    await settle();
    expect(harness.facts.calls.filter((call) => call === "permissions")).toHaveLength(2);
  });

  it("says nothing is proposed rather than inventing a rule", async () => {
    const { container, act } = mount(postureShell(factsHarness({ root: ["README.md"] })));
    await settle();
    expect(container.querySelector(".kw-setup-quiet")?.textContent).toBe(
      "nothing to propose · no manifest or mcp server here names a command",
    );
    act("posture.accept-rest");
    expect(noticeOf(container)).toBe("nothing is proposed here");
  });

  it("teaches trust first in an untrusted workspace", async () => {
    const harness = postureShell(factsHarness(bunWorkspace), memoryStorage(), {
      trust: inertTrust({ kind: "undecided", root: "C:/work" }),
    });
    const { container } = mount(harness);
    await settle();
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "no posture until the workspace is trusted · ctrl+k trust.workspace trusts it",
    );
    expect(harness.facts.calls).toEqual([]);
  });
});
