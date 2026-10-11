import {
  emptyProjection,
  type SessionControls,
  type SessionProjection,
  unknownControls,
} from "@keywork-app/client";
import type {
  ContextReport,
  CostReport,
  EffortLevel,
  PresetName,
  PresetReading,
  PromptBehavior,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import recordedAnswers from "../../../../client/src/fixtures/controls.json";
import { browserHost } from "../../host/browser.ts";
import type { SessionReadings } from "../../shell/controls-store.ts";
import type { ShellSeams } from "../registry.ts";
import {
  compactNotice,
  inferenceWords,
  looseningQuestion,
  nextEffort,
  presetStep,
  unsteppableNotice,
} from "./controls.ts";
import { type ConversationSpec, conversationPane } from "./index.tsx";

const recordedCost = recordedAnswers.cost.body as CostReport;
const recordedContext = recordedAnswers.context.body as ContextReport;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Sent {
  prompts: Array<[string, string, PromptBehavior]>;
  verbs: string[];
}

interface Fakes {
  controls?: Partial<SessionControls>;
  readings?: SessionReadings;
  preset?: PresetName;
  presetAnswer?: (name: PresetName, confirmed: boolean) => PresetReading;
  seed?: { text: string };
  models?: string[];
}

function shellOver(sent: Sent, fakes: Fakes = {}): ShellSeams {
  const controls = { ...unknownControls, ...fakes.controls };
  const store = {
    state: { summaries: [{ id: "s1" }] },
    projection: (): SessionProjection => emptyProjection,
    summary: () => undefined,
    controlsOf: () => controls,
    prompt: async (id: string, text: string, behavior: PromptBehavior) => {
      sent.prompts.push([id, text, behavior]);
    },
    abort: async () => undefined,
    answerAsk: async () => "settled",
    surfaces: { state: { bots: [], ordinals: {} } },
    controls: {
      state: { preset: fakes.preset },
      readings: () => fakes.readings ?? { context: undefined, cost: undefined },
      watchReadings: async () => undefined,
      seed: () => fakes.seed,
      models: () => fakes.models ?? [],
      setModel: async (id: string, reference: string) => {
        sent.verbs.push(`model ${id} ${reference}`);
        return reference === "mock/gamma"
          ? { refused: "unresolved", detail: "no model matches mock/gamma" }
          : { model: { provider: "mock", model: "beta" }, notice: `model → ${reference}` };
      },
      setThinking: async (_id: string, on: boolean) => {
        sent.verbs.push(`thinking ${on}`);
        return { thinking: on };
      },
      setEffort: async (_id: string, level: EffortLevel | null) => {
        sent.verbs.push(`effort ${level}`);
        return { effort: level };
      },
      compact: async () => ({ compacted: null, notices: [] }),
      rename: async (_id: string, title: string) => {
        sent.verbs.push(`rename ${title}`);
        return { title };
      },
      exportSession: async (_id: string, request?: { out?: string }) =>
        request?.out === undefined
          ? { html: "<!doctype html><title>Lights</title>" }
          : { file: "<cwd>/Lights.html" },
      undo: async () => ({ refused: "nothing", detail: "nothing to undo" }),
      redo: async () => ({ refused: "nothing", detail: "nothing to redo" }),
      setPreset: async (name: PresetName, confirmed = false) => {
        sent.verbs.push(`preset ${name}${confirmed ? " confirmed" : ""}`);
        return fakes.presetAnswer?.(name, confirmed) ?? { from: "standard", to: name };
      },
    },
  };
  const shell: Partial<ShellSeams> = {
    store: store as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    trust: { untrusted: () => false } as ShellSeams["trust"],
    openPane: () => {},
    unseen: () => false,
  };
  return shell as ShellSeams;
}

function mount(
  fakes: Fakes = {},
  spec: ConversationSpec = { kind: "conversation", sessionId: "s1" },
) {
  const sent: Sent = { prompts: [], verbs: [] };
  let handle: (action: string) => void = () => {};
  const shell = shellOver(sent, fakes);
  render(() => (
    <conversationPane.component
      id="conversation-1"
      spec={spec}
      focused={true}
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  const act = async (action: string) => {
    handle(action);
    await settle();
  };
  return { sent, act, shell };
}

function lines(): string[] {
  return [...document.querySelectorAll(".kw-controls-line")].map((line) => line.textContent ?? "");
}

function answer(text: string): void {
  const input = document.querySelector(".kw-controls-input") as HTMLInputElement;
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("the control words", () => {
  it("writes the model and the reasoning words typographically, effort only when chosen", () => {
    expect(inferenceWords(unknownControls)).toBeUndefined();
    expect(
      inferenceWords({ ...unknownControls, model: "mock/beta", thinking: true, effort: "high" }),
    ).toBe("mock/beta · thinking · effort high");
    expect(inferenceWords({ ...unknownControls, model: "mock/alpha" })).toBe("mock/alpha");
  });

  it("cycles effort low to max and then hands it back to the provider", () => {
    const visited: Array<EffortLevel | null> = [];
    let level: EffortLevel | undefined;
    for (let step = 0; step < 7; step += 1) {
      const next = nextEffort(level);
      visited.push(next);
      level = next ?? undefined;
    }
    expect(visited).toEqual(["low", "medium", "high", "xhigh", "max", null, "low"]);
  });

  it("steps the preset one place and refuses to guess an unknown or custom one", () => {
    expect(presetStep("standard", "looser")).toBe("open");
    expect(presetStep("standard", "tighter")).toBe("careful");
    expect(presetStep("open", "looser")).toBeUndefined();
    expect(presetStep("custom", "tighter")).toBeUndefined();
    expect(presetStep(undefined, "looser")).toBeUndefined();
    expect(unsteppableNotice("open", "looser")).toBe("already on open, the loosest");
    expect(unsteppableNotice(undefined, "looser")).toMatch(/has not said which preset/);
  });

  it("asks the loosening question in keywork's words", () => {
    expect(looseningQuestion("standard", "open")).toBe(
      "switching standard → open loosens permissions. continue? y/n",
    );
  });

  it("says when compaction had nothing to fold", () => {
    expect(compactNotice({ compacted: null, notices: [] })).toBe("nothing to fold yet");
    expect(compactNotice({ compacted: null, notices: ["kept 3 turns"] })).toBe("kept 3 turns");
  });
});

describe("the conversation pane's controls", () => {
  it("queues on enter and steers on alt+enter, naming the behavior on the wire", () => {
    const { sent } = mount();
    const input = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    input.value = "later";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    input.value = "now instead";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter", altKey: true });
    expect(sent.prompts).toEqual([
      ["s1", "later", "queue"],
      ["s1", "now instead", "steer"],
    ]);
  });

  it("seeds the composer with an undone prompt", () => {
    mount({ seed: { text: "turn on the lights" } });
    const input = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    expect(input.value).toBe("turn on the lights");
  });

  it("toggles thinking from what the server last said and cycles effort", async () => {
    const { sent, act } = mount({ controls: { thinking: true, effort: "max" } });
    await act("conversation.thinking");
    expect(lines()).toEqual([
      "thinking hidden · progress notes still show where the model writes them",
    ]);
    await act("conversation.effort");
    expect(sent.verbs).toEqual(["thinking false", "effort null"]);
    expect(lines()).toEqual(["effort at the provider default · from your next prompt on"]);
  });

  it("picks a model from what the server reported or takes free text", async () => {
    const { sent, act } = mount({ models: ["mock/alpha", "mock/beta"] });
    await act("conversation.model");
    const choices = [...document.querySelectorAll(".kw-controls-choice")].map((c) => c.textContent);
    expect(choices).toEqual(["mock/alpha", "mock/beta"]);
    const input = document.querySelector(".kw-controls-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.value).toBe("mock/beta");
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    expect(lines()).toEqual(["model → mock/beta"]);
    await act("conversation.model");
    answer("mock/gamma");
    await settle();
    expect(sent.verbs).toEqual(["model s1 mock/beta", "model s1 mock/gamma"]);
    expect(lines()).toEqual(["no model matches mock/gamma"]);
  });

  it("renames inline from the current title", async () => {
    const { sent, act } = mount({ controls: { title: "Lights" } });
    await act("conversation.rename");
    const input = document.querySelector(".kw-controls-input") as HTMLInputElement;
    expect(input.value).toBe("Lights");
    answer("Lights, dimmed");
    await settle();
    expect(sent.verbs).toEqual(["rename Lights, dimmed"]);
    expect(lines()).toEqual(["renamed · Lights, dimmed"]);
  });

  it("confirms a loosening preset in keywork's words and sends confirmed only after y", async () => {
    const { sent, act } = mount({
      preset: "standard",
      presetAnswer: (name, confirmed) =>
        confirmed
          ? { from: "standard", to: name }
          : { refused: "needs-confirmation", detail: "loosening needs confirmed: true" },
    });
    await act("conversation.preset-looser");
    const confirm = screen.getByRole("alertdialog");
    expect(confirm.textContent).toBe(
      "switching standard → open loosens permissions. continue? y/n",
    );
    expect(sent.verbs).toEqual(["preset open"]);
    fireEvent.keyDown(confirm, { key: "y" });
    await settle();
    expect(sent.verbs).toEqual(["preset open", "preset open confirmed"]);
    expect(lines()).toEqual(["permissions preset → open"]);
  });

  it("leaves the preset unchanged when the loosening is declined", async () => {
    const { sent, act } = mount({
      preset: "careful",
      presetAnswer: () => ({
        refused: "needs-confirmation",
        detail: "loosening needs confirmed: true",
      }),
    });
    await act("conversation.preset-looser");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "n" });
    await settle();
    expect(sent.verbs).toEqual(["preset standard"]);
    expect(lines()).toEqual(["left unchanged"]);
  });

  it("tightens without asking and will not step from an unknown preset", async () => {
    const { sent, act } = mount();
    await act("conversation.preset-tighter");
    expect(sent.verbs).toEqual([]);
    expect(lines()[0]).toMatch(/has not said which preset is active/);
    await act("conversation.preset-careful");
    expect(sent.verbs).toEqual(["preset careful"]);
    expect(lines()).toEqual(["permissions preset → careful"]);
  });

  it("copies the exported page to the clipboard and says so, or writes it into the workspace", async () => {
    const copied: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: { writeText: async (text: string) => void copied.push(text) },
    });
    const { act } = mount();
    await act("conversation.export");
    expect(copied).toEqual(["<!doctype html><title>Lights</title>"]);
    expect(lines()[0]).toMatch(/^session page copied to the clipboard · 36 B of html/);
    await act("conversation.export-file");
    expect(lines()).toEqual(["session page written to <cwd>/Lights.html"]);
  });

  it("reads the cost lineage per model and never hides unpriced turns", async () => {
    const { act } = mount({
      readings: { context: recordedContext, cost: recordedCost },
      controls: { model: "mock/beta" },
    });
    await act("conversation.cost");
    expect(lines()).toEqual([
      "tokens 12▸5",
      "cost unknown · no pricing for mock/beta",
      "  mock/alpha · 1 turn · 12▸5 · no pricing",
    ]);
  });

  it("asks for a session before a session verb runs", async () => {
    const { sent, act } = mount({}, { kind: "conversation" });
    await act("conversation.thinking");
    expect(sent.verbs).toEqual([]);
    expect(lines()).toEqual(["no session here yet · send a prompt first"]);
  });
});

describe("the conversation pane's title row", () => {
  it("shows the inference words, the reported context basis and the server's usage", () => {
    const shell = shellOver(
      { prompts: [], verbs: [] },
      {
        controls: { model: "mock/beta", thinking: true, effort: "high" },
        readings: { context: { ...recordedContext, used: 4000 }, cost: recordedCost },
      },
    );
    const adornments = conversationPane.adornments?.(
      { kind: "conversation", sessionId: "s1" },
      shell,
    );
    expect(adornments?.inference).toBe("mock/beta · thinking · effort high");
    expect(adornments?.telemetry).toBe("17 tokens · unpriced");
    expect(adornments?.context).toMatchObject({
      used: 4000,
      basis: "reported",
      declared: false,
      flushAt: 175_424,
    });
  });

  it("keeps the assumed basis until the first reading arrives", () => {
    const shell = shellOver({ prompts: [], verbs: [] });
    const adornments = conversationPane.adornments?.(
      { kind: "conversation", sessionId: "s1" },
      shell,
    );
    expect(adornments?.context).toBeUndefined();
    expect(adornments?.inference).toBeUndefined();
  });

  it("binds its chords without colliding with any global one", () => {
    const chords = Object.values(conversationPane.localActions ?? {}).flatMap((action) =>
      typeof action.chords === "string" ? [action.chords] : [...action.chords],
    );
    expect(chords.filter((chord) => chord !== "none")).toEqual([
      "leader o",
      "leader v",
      "leader e",
      "leader shift+c",
      "leader shift+r",
      "leader shift+e",
      "leader [",
      "leader ]",
    ]);
  });
});
