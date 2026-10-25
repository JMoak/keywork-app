import { emptyProjection, projectAll, type ToolRun } from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BusEnvelope,
  DenyReason,
  PermissionRule,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import grants from "../../../client/src/fixtures/grants.jsonl?raw";
import {
  AskCard,
  type AskPick,
  acceptedLine,
  askChoiceFor,
  blanketWarning,
  cardKeys,
  quietStillAsks,
  rememberableRules,
  ruleText,
} from "./ask-card.tsx";
import { stopAskingWhy } from "./ask-card-why.ts";
import { ConversationPane } from "./pane.tsx";

const askedCallIds = ["g1", "g3", "g4", "g5"];

afterEach(() => {
  cleanup();
  for (const callId of askedCallIds) stopAskingWhy(callId);
});

const grantEnvelopes: BusEnvelope[] = grants
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as BusEnvelope);

function throughAsk(callId: string): BusEnvelope[] {
  const askedAt = grantEnvelopes.findIndex(
    (envelope) => envelope.type === "gate.ask" && envelope.payload.ask.callId === callId,
  );
  return grantEnvelopes.slice(0, askedAt + 1);
}

function askingRun(callId: string): ToolRun {
  const entry = projectAll(emptyProjection, throughAsk(callId)).entries.find(
    (candidate) => candidate.kind === "tool" && candidate.run.callId === callId,
  );
  if (entry?.kind !== "tool") throw new Error(`no ask for ${callId}`);
  return entry.run;
}

interface Answer {
  verdict: AskVerdict;
  scope: AskScope | undefined;
  reason?: DenyReason | undefined;
  note?: string | undefined;
}

function mountCard(run: ToolRun, outcome: AnswerOutcome = "settled", quiet = false) {
  const answers: Answer[] = [];
  const view = render(() => (
    <AskCard
      run={run}
      quiet={quiet}
      onAnswer={async (verdict, scope, reason, note) => {
        answers.push({ verdict, scope, reason, note });
        return outcome;
      }}
    />
  ));
  const card = view.container.querySelector(".kw-ask") as HTMLElement;
  const press = async (key: string, init: KeyboardEventInit = {}) => {
    fireEvent.keyDown(card, { key, ...init });
    await settle();
  };
  return { ...view, card, answers, press };
}

const whyLabels = ["unsafe u", "not now n", "other o"];

async function typeNote(container: HTMLElement, words: string, key: "Enter" | "Escape") {
  const input = container.querySelector(".kw-ask-note-input") as HTMLInputElement;
  fireEvent.input(input, { target: { value: words } });
  fireEvent.keyDown(input, { key });
  await settle();
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

function answerLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ask-answer")].map(
    (button) => button.textContent ?? "",
  );
}

function buttonLabelled(container: HTMLElement, label: string): Element {
  const button = [...container.querySelectorAll(".kw-ask-answer")].find(
    (candidate) => candidate.textContent === label,
  );
  if (button === undefined) throw new Error(`no answer labelled ${label}`);
  return button;
}

const bashRule = (resource: string): PermissionRule => ({
  action: "bash",
  resource,
  effect: "allow",
});

function withRules(run: ToolRun, rules: PermissionRule[]): ToolRun {
  return { ...run, ask: run.ask === undefined ? undefined : { ...run.ask, rules } };
}

function withoutPreview(run: ToolRun, tool: string): ToolRun {
  if (run.ask === undefined) return run;
  const { preview: _, ...ask } = run.ask;
  return { ...run, ask: { ...ask, tool } };
}

function asMcpCall(run: ToolRun, args: Record<string, unknown>): ToolRun {
  const tool = "github__create_issue";
  if (run.ask === undefined) return run;
  const rules = [{ action: tool, resource: "*", effect: "allow" as const }];
  return { ...run, ask: { ...run.ask, tool, arguments: args, rules } };
}

function texts(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((node) => node.textContent ?? "");
}

function askedByTrustedReads(run: ToolRun): ToolRun {
  return { ...run, ask: run.ask === undefined ? undefined : { ...run.ask, rule: "trusted" } };
}

const handedChords = {
  approve: "ctrl+y",
  once: "alt+o",
  session: "alt+s",
  workspace: "alt+w",
  deny: "ctrl+n",
};

describe("the ask card", () => {
  it("shows the rule a remembered answer would record, in keywork's glob form, before the pick", () => {
    const { container } = mountCard(askingRun("g1"));
    expect([...container.querySelectorAll(".kw-ask-rule")].map((rule) => rule.textContent)).toEqual(
      ["mkdir -p *"],
    );
    expect(answerLabels(container)).toEqual([
      "once y",
      "this session s",
      "this workspace w",
      "deny n",
    ]);
  });

  it.each([
    ["y", { verdict: "granted", scope: undefined }],
    ["o", { verdict: "granted", scope: undefined }],
    ["s", { verdict: "granted", scope: "session" }],
    ["w", { verdict: "granted", scope: "workspace" }],
  ] as const)("answers %s with %o", async (key, expected) => {
    const { answers, press } = mountCard(askingRun("g1"));
    await press(key);
    expect(answers).toEqual([expected]);
  });

  it("asks why on n before it denies, and ignores the grant keys while asking", async () => {
    const { container, card, answers, press } = mountCard(askingRun("g1"));
    await press("n");
    expect(answers).toEqual([]);
    expect(card.hasAttribute("data-saying-why")).toBe(true);
    expect(container.querySelector(".kw-ask-reason-prompt")?.textContent).toBe("why?");
    expect(answerLabels(container)).toEqual(whyLabels);
    expect(container.querySelector(".kw-ask-rules")).toBeNull();
    await press("y");
    await press("s");
    expect(answers).toEqual([]);
  });

  it.each([
    ["u", "unsafe"],
    ["n", "not-now"],
  ] as const)("denies with the reason %s picks", async (key, reason) => {
    const { answers, press } = mountCard(askingRun("g1"));
    await press("n");
    await press(key);
    expect(answers).toEqual([{ verdict: "denied", scope: undefined, reason }]);
  });

  it("opens a line for the person's own words on o and sends them with the denial", async () => {
    const { container, answers, press } = mountCard(askingRun("g1"));
    await press("n");
    await press("o");
    expect(answers).toEqual([]);
    expect(container.querySelector(".kw-ask-note-input")).not.toBeNull();
    await typeNote(container, "  wrong branch  ", "Enter");
    expect(answers).toEqual([
      { verdict: "denied", scope: undefined, reason: "other", note: "wrong branch" },
    ]);
  });

  it("sends the denial without words when escape leaves the line", async () => {
    const { container, answers, press } = mountCard(askingRun("g1"));
    await press("n");
    await press("o");
    await typeNote(container, "half a thought", "Escape");
    expect(answers).toEqual([{ verdict: "denied", scope: undefined, reason: "other" }]);
  });

  it("denies by click through the why step as well", async () => {
    const { container, answers } = mountCard(askingRun("g3"));
    fireEvent.click(buttonLabelled(container, "deny n"));
    await settle();
    expect(answerLabels(container)).toEqual(whyLabels);
    fireEvent.click(buttonLabelled(container, "not now n"));
    await settle();
    expect(answers).toEqual([{ verdict: "denied", scope: undefined, reason: "not-now" }]);
  });

  it("leaves modified keys to the global chords", async () => {
    const { answers, press } = mountCard(askingRun("g1"));
    await press("y", { ctrlKey: true });
    await press("n", { ctrlKey: true });
    expect(answers).toEqual([]);
  });

  it("offers only once and deny for a write, and ignores s and w there", async () => {
    const { container, answers, press } = mountCard(askingRun("g4"));
    expect(container.querySelector(".kw-ask-rules")).toBeNull();
    expect(answerLabels(container)).toEqual(["once y", "deny n"]);
    await press("s");
    await press("w");
    expect(answers).toEqual([]);
  });

  it("offers only once and deny when the call has nothing a grant could remember", () => {
    const { container } = mountCard(askingRun("g5"));
    expect(answerLabels(container)).toEqual(["once y", "deny n"]);
  });

  it.each([
    ["write-once", "write and edit are approved once at a time"],
    ["nothing-to-remember", "this call has nothing a grant could remember; approve it once"],
  ] as const)(
    "renders the %s refusal in the server's words and stays pending",
    async (refused, detail) => {
      const { container, answers, press } = mountCard(askingRun("g1"), { refused, detail });
      await press("w");
      expect(container.querySelector(".kw-ask-refusal")?.textContent).toBe(detail);
      expect(answerLabels(container)).toHaveLength(4);
      await press("y");
      expect(answers.map((answer) => answer.scope)).toEqual(["workspace", undefined]);
    },
  );

  it("says why when the answer cannot reach the server and lets the person try again", async () => {
    const tries: Array<AskScope | undefined> = [];
    const failing = render(() => (
      <AskCard
        run={askingRun("g1")}
        onAnswer={async (_verdict, scope) => {
          tries.push(scope);
          throw new Error("the server answered 500");
        }}
      />
    ));
    const failingCard = failing.container.querySelector(".kw-ask") as HTMLElement;
    fireEvent.keyDown(failingCard, { key: "s" });
    await settle();
    fireEvent.keyDown(failingCard, { key: "s" });
    await settle();
    expect(failing.container.querySelector(".kw-ask-refusal")?.textContent).toBe(
      "the server answered 500",
    );
    expect(tries).toEqual(["session", "session"]);
  });

  it("answers by click as well as by key", async () => {
    const { container, answers } = mountCard(askingRun("g3"));
    fireEvent.click(buttonLabelled(container, "this workspace w"));
    await settle();
    expect(answers).toEqual([{ verdict: "granted", scope: "workspace" }]);
  });

  it("takes the keys when nothing else holds them", () => {
    const { card } = mountCard(askingRun("g1"));
    expect(document.activeElement).toBe(card);
  });

  it("never takes the keys from a draft being typed in its pane", () => {
    const run = askingRun("g1");
    const [asking, setAsking] = createSignal(false);
    const { container } = render(() => (
      <div class="kw-frame-body">
        <textarea class="draft" />
        <Show when={asking()}>
          <AskCard run={run} onAnswer={async () => "settled" as const} />
        </Show>
      </div>
    ));
    const draft = container.querySelector(".draft") as HTMLTextAreaElement;
    draft.value = "half a thought";
    draft.focus();

    setAsking(true);
    expect(container.querySelector(".kw-ask")).not.toBeNull();
    expect(document.activeElement).toBe(draft);
  });

  it("takes the keys from its frame's composer once the prompt has been sent", () => {
    const run = askingRun("g1");
    const [asking, setAsking] = createSignal(false);
    const { container } = render(() => (
      <section class="kw-frame">
        <div class="kw-frame-body">
          <Show when={asking()}>
            <AskCard run={run} onAnswer={async () => "settled" as const} />
          </Show>
        </div>
        <textarea class="composer" />
      </section>
    ));
    const composer = container.querySelector(".composer") as HTMLTextAreaElement;
    composer.focus();

    setAsking(true);
    expect(document.activeElement).toBe(container.querySelector(".kw-ask"));
  });

  it("shows the chords it is handed, so the card names keys that work from anywhere", () => {
    const { container } = render(() => (
      <AskCard
        run={askingRun("g1")}
        onAnswer={async () => "settled" as const}
        chords={handedChords}
      />
    ));
    expect(answerLabels(container)).toEqual([
      "once ctrl+y",
      "this session alt+s",
      "this workspace alt+w",
      "deny ctrl+n",
    ]);
    expect(container.querySelector(".kw-ask-rules-label")?.textContent).toBe(
      "alt+s or alt+w would allow",
    );
  });

  it("keeps the handed chords in a quiet session and says the gate still asks", () => {
    const { container } = render(() => (
      <AskCard
        run={askingRun("g1")}
        onAnswer={async () => "settled" as const}
        chords={handedChords}
        quiet
      />
    ));
    expect(answerLabels(container)).toEqual([
      "once ctrl+y",
      "this session alt+s",
      "this workspace alt+w",
      "deny ctrl+n",
    ]);
    expect(container.querySelector(".kw-ask-rules-label")?.textContent).toBe(
      "alt+s or alt+w would allow",
    );
    expect(container.querySelector(".kw-ask-quiet")?.textContent).toBe(
      "quiet · this one still needs you",
    );
  });

  it("says when trust setup already accepted what this answer would record, and grants nothing itself", async () => {
    const answers: Answer[] = [];
    const { container } = render(() => (
      <AskCard
        run={askingRun("g1")}
        accepted="workspace"
        onAnswer={async (verdict, scope) => {
          answers.push({ verdict, scope });
          return "settled" as const;
        }}
      />
    ));
    expect(container.querySelector(".kw-ask-accepted")?.textContent).toBe(
      "accepted in trust setup · w records it for the workspace",
    );
    await settle();
    expect(answers).toEqual([]);
  });

  it("never claims an acceptance on an ask that can only be answered once", () => {
    const { container } = render(() => (
      <AskCard
        run={askingRun("g4")}
        accepted="workspace"
        onAnswer={async () => "settled" as const}
      />
    ));
    expect(container.querySelector(".kw-ask-accepted")).toBeNull();
  });

  it("names the session chord for a tool of a server accepted per session", () => {
    expect(acceptedLine("session", cardKeys)).toBe(
      "accepted in trust setup · s records it for this session",
    );
  });

  it("asks the conversation's acceptance for each asking tool row", () => {
    const projection = projectAll(emptyProjection, throughAsk("g1"));
    const asked: string[] = [];
    const { container } = render(() => (
      <ConversationPane
        projection={projection}
        onAnswerAsk={async () => "settled" as const}
        askAccepted={(ask) => {
          asked.push(ask.callId);
          return "session";
        }}
      />
    ));
    expect(asked).toEqual(["g1"]);
    expect(container.querySelector(".kw-ask-accepted")?.textContent).toBe(
      "accepted in trust setup · s records it for this session",
    );
  });

  it("hands the scope from the card to the conversation's answer route", async () => {
    const answered: Array<[string, AskVerdict, AskScope | undefined]> = [];
    const projection = projectAll(emptyProjection, throughAsk("g3"));
    const { container } = render(() => (
      <ConversationPane
        projection={projection}
        onAnswerAsk={async (callId, verdict, scope) => {
          answered.push([callId, verdict, scope]);
          return "settled" as const;
        }}
      />
    ));
    fireEvent.keyDown(container.querySelector(".kw-ask") as Element, { key: "s" });
    await settle();
    expect(answered).toEqual([["g3", "granted", "session"]]);
  });
});

describe("the ask card in a quiet session", () => {
  it("keeps approve a one-time grant and says the gate itself grants what quiet covers", async () => {
    const { container, answers, press } = mountCard(askingRun("g1"), "settled", true);
    expect(answerLabels(container)).toEqual([
      "once y",
      "this session s",
      "this workspace w",
      "deny n",
    ]);
    expect(container.querySelector(".kw-ask-rules-label")?.textContent).toBe("s or w would allow");
    expect(container.querySelector(".kw-ask-quiet")?.textContent).toBe(
      "quiet · this one still needs you",
    );
    expect(container.querySelector(".kw-ask")?.hasAttribute("data-quiet")).toBe(true);
    await press("y");
    expect(answers).toEqual([{ verdict: "granted", scope: undefined }]);
  });

  it.each([
    ["o", { verdict: "granted", scope: undefined }],
    ["s", { verdict: "granted", scope: "session" }],
    ["w", { verdict: "granted", scope: "workspace" }],
  ] as const)("still answers %s with %o", async (key, expected) => {
    const { answers, press } = mountCard(askingRun("g1"), "settled", true);
    await press(key);
    expect(answers).toEqual([expected]);
  });

  it("still asks why before a denial", async () => {
    const { container, answers, press } = mountCard(askingRun("g1"), "settled", true);
    await press("n");
    expect(answerLabels(container)).toEqual(whyLabels);
    expect(container.querySelector(".kw-ask-quiet")).toBeNull();
    await press("u");
    expect(answers).toEqual([{ verdict: "denied", scope: undefined, reason: "unsafe" }]);
  });

  it.each([
    ["a write", askingRun("g4"), "quiet · write and edit still ask"],
    [
      "a call with nothing to remember",
      askingRun("g5"),
      "quiet · this call has nothing a grant could remember",
    ],
    [
      "a blanket rule",
      withRules(askingRun("g1"), [bashRule("python *")]),
      "quiet · a blanket grant still asks",
    ],
    [
      "a delete keywork remembers only as the exact command",
      withRules(askingRun("g1"), [bashRule("mkdir -p *"), bashRule("rm -rf build")]),
      "quiet · a destructive command still asks",
    ],
    [
      "a form the trusted reads ask about",
      askedByTrustedReads(askingRun("g1")),
      "quiet · trusted reads ask before this form on purpose",
    ],
  ])("keeps approve to once for %s and says why", async (_case, run, reason) => {
    const { container, answers, press } = mountCard(run, "settled", true);
    expect(container.querySelector(".kw-ask-quiet")?.textContent).toBe(reason);
    expect(answerLabels(container)[0]).toBe("once y");
    await press("y");
    expect(answers).toEqual([{ verdict: "granted", scope: undefined }]);
  });

  it("never says quiet on a card whose session is listening", () => {
    const { container } = mountCard(askingRun("g4"));
    expect(container.querySelector(".kw-ask-quiet")).toBeNull();
    expect(container.querySelector(".kw-ask")?.hasAttribute("data-quiet")).toBe(false);
  });
});

describe("askChoiceFor", () => {
  const picks: readonly AskPick[] = ["approve", "once", "session", "workspace", "deny"];
  const scopes = (run: ToolRun) =>
    picks.map((pick) => {
      const choice = askChoiceFor(pick, run);
      return choice === undefined ? "refused" : `${choice.verdict}:${choice.scope ?? "once"}`;
    });

  it("reads approve as once and offers the remembering scopes when the ask carries rules", () => {
    expect(scopes(askingRun("g1"))).toEqual([
      "granted:once",
      "granted:once",
      "granted:session",
      "granted:workspace",
      "denied:once",
    ]);
  });

  it("offers nothing beyond once for what the server approves once", () => {
    expect(scopes(askingRun("g4"))).toEqual([
      "granted:once",
      "granted:once",
      "refused",
      "refused",
      "denied:once",
    ]);
  });

  it("words why a quiet session still asks about a rememberable call", () => {
    expect(quietStillAsks(askingRun("g1"))).toBe("quiet · this one still needs you");
  });
});

describe("the consequence on the card", () => {
  const partsOf = (container: HTMLElement): string[] =>
    [...(container.querySelector(".kw-ask")?.children ?? [])].map((child) =>
      [...child.classList].join(" "),
    );

  it("shows a write as keywork's own preview in the merge view, between the head and the keys", () => {
    const { container } = mountCard(askingRun("g4"));
    expect(partsOf(container)).toEqual(["kw-ask-why", "kw-ask-consequence", "kw-ask-actions"]);
    expect(container.querySelector(".kw-ask-consequence-head")?.textContent).toBe(
      "write notes.txt · new file · 2 lines",
    );
    const diff = container.querySelector(".kw-ask-diff");
    expect(diff?.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(diff?.querySelector(".cm-content")?.textContent).toContain("two");
    expect(container.querySelector(".kw-ask-args")).toBeNull();
  });

  it("keeps the keys of a card that shows a diff", async () => {
    const { answers, press } = mountCard(askingRun("g4"));
    await press("y");
    expect(answers).toEqual([{ verdict: "granted", scope: undefined }]);
  });

  it("says in one dim line that keywork sent no preview, and keeps the arguments", () => {
    const { container } = mountCard(withoutPreview(askingRun("g4"), "edit"));
    expect(container.querySelector(".kw-ask-args")?.textContent).toContain("notes.txt");
    expect(container.querySelector(".kw-ask-unpreviewed")?.textContent).toBe(
      "no preview from keywork · too large, binary, a memory note, or an edit that would not apply",
    );
    expect(container.querySelector(".kw-ask-diff")).toBeNull();
  });

  it("typesets a bash command with its program, operator and path marked", () => {
    const { container } = mountCard(askingRun("g5"));
    const marked = [...container.querySelectorAll(".kw-ask-command [data-role]")]
      .filter((part) => part.getAttribute("data-role") !== "space")
      .map((part) => `${part.getAttribute("data-role")}:${part.textContent}`);
    expect(marked).toEqual(["program:echo", "word:built", "operator:>", "path:build/stamp.txt"]);
    expect(container.querySelector(".kw-ask-args")).toBeNull();
  });

  it("says in plain words what each remembering key would cover, from the ask's own rules", () => {
    const { container } = mountCard(
      withRules(askingRun("g1"), [bashRule("mkdir -p *"), bashRule("git push *")]),
    );
    expect(texts(container, ".kw-ask-covers")).toEqual([
      "s no ask for any mkdir -p command or any git push command but git push --force until this session ends",
      "w the same in every session of this workspace, until revoked",
    ]);
  });

  it("keeps the remembering keys beside their reach once the session is quiet", () => {
    const { container } = mountCard(askingRun("g1"), "settled", true);
    expect(texts(container, ".kw-ask-covers-key")).toEqual(["s", "w"]);
  });

  it("covers nothing on a bash ask keywork would remember nothing from", () => {
    const { container } = mountCard(askingRun("g5"));
    expect(container.querySelector(".kw-ask-covers")).toBeNull();
  });

  it("reads an mcp call as server and tool with its arguments as a table", () => {
    const { container } = mountCard(
      asMcpCall(askingRun("g1"), {
        repo: "JMoak/keywork",
        body: "seen from keywork-app\nPOST /redo answered 404",
      }),
    );
    expect(container.querySelector(".kw-ask-consequence-head")?.textContent).toBe(
      "github · create_issue",
    );
    expect(texts(container, ".kw-ask-call-args dt")).toEqual(["repo", "body"]);
    expect(texts(container, ".kw-ask-call-args dd")).toEqual([
      "JMoak/keywork",
      "seen from keywork-app … 1 more line",
    ]);
    expect(container.querySelector(".kw-ask-covers")).toBeNull();
    expect(texts(container, ".kw-ask-rule")).toEqual(["github__create_issue"]);
  });

  it("keeps the rules, the accepted line and the keys after the consequence", () => {
    const { container } = render(() => (
      <AskCard
        run={askingRun("g1")}
        accepted="workspace"
        onAnswer={async () => "settled" as const}
      />
    ));
    expect(partsOf(container)).toEqual([
      "kw-ask-why",
      "kw-ask-consequence",
      "kw-ask-rules",
      "kw-ask-covers",
      "kw-ask-covers",
      "kw-ask-accepted",
      "kw-ask-actions",
    ]);
  });

  it("keeps the quiet line after the consequence", () => {
    const { container } = mountCard(askingRun("g4"), "settled", true);
    expect(partsOf(container)).toEqual([
      "kw-ask-why",
      "kw-ask-consequence",
      "kw-ask-quiet",
      "kw-ask-actions",
    ]);
  });
});

describe("the rules beside the keys", () => {
  it("names a near-blanket rule honestly", () => {
    expect(blanketWarning(bashRule("python *"))).toEqual(["this would allow every python command"]);
    expect(blanketWarning(bashRule("bash -c *"))).toEqual(["this would allow every bash command"]);
    expect(blanketWarning(bashRule("node -e *"))).toEqual(["this would allow every node command"]);
    expect(blanketWarning(bashRule("git push *"))).toEqual([]);
    expect(blanketWarning(bashRule("npm run *"))).toEqual([]);
    expect(blanketWarning(bashRule("mkdir -p *"))).toEqual([]);
  });

  it("renders the blanket line on the card beside the rule", () => {
    const { container } = mountCard(withRules(askingRun("g1"), [bashRule("python *")]));
    expect(container.querySelector(".kw-ask-rule")?.textContent).toBe("python *");
    expect(container.querySelector(".kw-ask-blanket")?.textContent).toBe(
      "this would allow every python command",
    );
  });

  it("writes bash rules as their glob and mcp rules by tool name", () => {
    expect(ruleText(bashRule("git push *"))).toBe("git push *");
    expect(ruleText({ action: "github__create_issue", resource: "*", effect: "allow" })).toBe(
      "github__create_issue",
    );
  });

  it("remembers nothing for write and edit even if rules arrive", () => {
    expect(rememberableRules(withRules(askingRun("g4"), [bashRule("x *")]))).toEqual([]);
  });
});
