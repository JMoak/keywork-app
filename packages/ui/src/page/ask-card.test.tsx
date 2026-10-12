import { emptyProjection, projectAll, type ToolRun } from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BusEnvelope,
  PermissionRule,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import grants from "../../../client/src/fixtures/grants.jsonl?raw";
import { AskCard, blanketWarning, rememberableRules, ruleText } from "./ask-card.tsx";
import { ConversationPane } from "./pane.tsx";

afterEach(cleanup);

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
}

function mountCard(run: ToolRun, outcome: AnswerOutcome = "settled") {
  const answers: Answer[] = [];
  const view = render(() => (
    <AskCard
      run={run}
      onAnswer={async (verdict, scope) => {
        answers.push({ verdict, scope });
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

async function settle(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

function answerLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ask-answer")].map(
    (button) => button.textContent ?? "",
  );
}

const bashRule = (resource: string): PermissionRule => ({
  action: "bash",
  resource,
  effect: "allow",
});

function withRules(run: ToolRun, rules: PermissionRule[]): ToolRun {
  return { ...run, ask: run.ask === undefined ? undefined : { ...run.ask, rules } };
}

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
    ["n", { verdict: "denied", scope: undefined }],
    ["s", { verdict: "granted", scope: "session" }],
    ["w", { verdict: "granted", scope: "workspace" }],
  ] as const)("answers %s with %o", async (key, expected) => {
    const { answers, press } = mountCard(askingRun("g1"));
    await press(key);
    expect(answers).toEqual([expected]);
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
    const workspace = [...container.querySelectorAll(".kw-ask-answer")].find(
      (button) => button.textContent === "this workspace w",
    );
    fireEvent.click(workspace as Element);
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
        chords={{
          once: "ctrl+y",
          session: "alt+s",
          workspace: "alt+w",
          deny: "ctrl+n",
        }}
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
