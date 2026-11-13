import {
  type ChildLineage,
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  projectAll,
  reviewNotice,
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
  PromptOutcome,
  SessionSummary,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import recordedAnswers from "../../../../client/src/fixtures/controls.json";
import delegatedStream from "../../../../client/src/fixtures/delegated.jsonl?raw";
import { parseJsonl } from "../../dev/replay.ts";
import { browserHost } from "../../host/browser.ts";
import type { SaveOutcome } from "../../host/port.ts";
import type { SessionReadings } from "../../shell/controls-store.ts";
import type { ShellSeams } from "../registry.ts";
import {
  childAtWorkNotice,
  compactNotice,
  inferenceWords,
  looseningQuestion,
  nextEffort,
  presetStep,
  sessionGoneNotice,
  unsteppableNotice,
} from "./controls.ts";
import {
  type ConversationSpec,
  childStartingLine,
  conversationPane,
  emptySessionLine,
  loadingSessionLine,
  nothingToRetryNotice,
} from "./index.tsx";

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
  followed: string[];
}

interface Fakes {
  controls?: Partial<SessionControls>;
  readings?: SessionReadings;
  preset?: PresetName;
  presetAnswer?: (name: PresetName, confirmed: boolean) => PresetReading;
  seed?: { text: string };
  models?: string[];
  saved?: SaveOutcome;
  saveFails?: string;
  promptOutcome?: PromptOutcome;
  title?: string;
  trashed?: boolean;
  gone?: boolean;
  live?: LiveSession;
  child?: ChildLineage;
  loading?: boolean;
}

interface LiveSession {
  summary(): SessionSummary | undefined;
  projection(): SessionProjection;
  trashed(): boolean;
}

function shellOver(sent: Sent, fakes: Fakes = {}): ShellSeams {
  const controls = {
    ...unknownControls,
    ...fakes.controls,
    ...(fakes.title !== undefined && { title: fakes.title }),
  };
  const store = {
    projection: (): SessionProjection => fakes.live?.projection() ?? emptyProjection,
    summary: () => fakes.live?.summary(),
    childOf: () => fakes.child,
    controlsOf: () => controls,
    prompt: async (id: string, text: string, behavior: PromptBehavior) => {
      sent.prompts.push([id, text, behavior]);
      return fakes.promptOutcome ?? "started";
    },
    state: { summaries: [{ id: "s1" }], loading: { s1: fakes.loading === true } },
    open: async (id: string) => {
      sent.followed.push(id);
    },
    gone: () => fakes.gone === true,
    trashed: () => fakes.live?.trashed() ?? fakes.trashed === true,
    restore: async (id: string) => {
      sent.verbs.push(`restore ${id}`);
      return { id, title: "Lights", createdAt: "t", lastActivityAt: "t", messageCount: 2 };
    },
    abort: async () => undefined,
    answerAsk: async () => "settled",
    tree: () => emptyTreeState,
    openTree: async () => undefined,
    changes: () => emptyChangesState,
    openChanges: async () => undefined,
    surfaces: { state: { bots: [{ name: "researcher", sigil: "◇" }], ordinals: {} } },
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
    sessions: {
      openSession: (id: string) => {
        sent.verbs.push(`open ${id}`);
      },
      newSession: async () => {},
      startSession: async (paneId: string, text: string) => {
        sent.verbs.push(`start ${paneId} ${text}`);
      },
    },
    rebind: (paneId: string, spec: { kind: string }) => {
      sent.verbs.push(`rebind ${paneId} ${JSON.stringify(spec)}`);
    },
    host: {
      ...browserHost(),
      saveAs: async (name: string, text: string) => {
        sent.verbs.push(`save ${name} ${text.length}`);
        if (fakes.saveFails !== undefined) throw new Error(fakes.saveFails);
        return fakes.saved ?? { saved: false, refused: "cancelled" };
      },
    },
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
  const sent: Sent = { prompts: [], verbs: [], followed: [] };
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

  it("holds the draft while this pane's session is a child still working for its parent", () => {
    const working: ChildLineage = {
      sessionId: "s1",
      parentId: "p1",
      callId: "d1",
      title: "audit the trust rules",
      bot: undefined,
      state: "running",
      costNanos: undefined,
    };
    const { sent } = mount({ child: working });
    const input = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    input.value = "also check the callers";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sent.prompts).toEqual([]);
    expect(input.value).toBe("also check the callers");
    expect(document.querySelector(".kw-composer-hold")?.textContent).toBe(childAtWorkNotice);
    expect(document.querySelector(".kw-empty")?.textContent).toBe(childStartingLine);
  });

  it("says a session with nothing in it is empty, and an unread one is still being read", () => {
    mount();
    expect(document.querySelector(".kw-empty")?.textContent).toBe(emptySessionLine);
    cleanup();
    mount({ loading: true });
    expect(document.querySelector(".kw-empty")?.textContent).toBe(loadingSessionLine);
  });

  it("opens a delegated child from its transcript row by the session-opening path", () => {
    const delegated = projectAll(emptyProjection, parseJsonl(delegatedStream));
    const { sent } = mount({
      live: { summary: () => undefined, projection: () => delegated, trashed: () => false },
    });
    const row = document.querySelector(".kw-tool[data-child]") as HTMLElement;
    expect(row.textContent).toContain('child "audit the trust rules" · ◇ researcher');
    fireEvent.keyDown(row, { key: "Enter" });
    expect(sent.verbs).toEqual(["open q2"]);
  });

  it("sends a failed prompt again from its ending row or the retry command, and says when none waits", async () => {
    const at = "2026-11-12T12:00:00.000Z";
    const failed = projectAll(emptyProjection, [
      { id: 1, ts: at, sessionId: "s1", type: "turn.started", payload: { userText: "failnow" } },
      {
        id: 2,
        ts: at,
        sessionId: "s1",
        type: "engine.error",
        payload: { error: { name: "Error", message: "upstream 529 overloaded" } },
      },
    ]);
    const { sent, act } = mount({
      live: { summary: () => undefined, projection: () => failed, trashed: () => false },
    });
    fireEvent.keyDown(document.querySelector(".kw-ending") as HTMLElement, { key: "Enter" });
    await act("conversation.retry");
    expect(sent.prompts).toEqual([
      ["s1", "failnow", "steer"],
      ["s1", "failnow", "steer"],
    ]);
    cleanup();
    const quiet = mount();
    await quiet.act("conversation.retry");
    expect(lines()).toEqual([nothingToRetryNotice]);
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

  it("offers a save named for the session and says where the page went", async () => {
    const { act, sent } = mount({
      title: "Lights & beta",
      saved: { saved: true, path: "C:/work/lights-beta.html" },
    });
    await act("conversation.export");
    expect(sent.verbs).toEqual(["save lights-beta.html 36"]);
    expect(lines()).toEqual(["session page saved to C:/work/lights-beta.html · 36 B"]);
    await act("conversation.export-file");
    expect(lines()).toEqual(["session page written to <cwd>/Lights.html"]);
  });

  it("says a cancelled save plainly", async () => {
    const { act, sent } = mount();
    await act("conversation.export");
    expect(sent.verbs).toEqual(["save session.html 36"]);
    expect(lines()).toEqual(["export cancelled · nothing was written"]);
  });

  it("says why a save dialog that fails wrote nothing, instead of failing silently", async () => {
    const { act } = mount({
      saveFails:
        "Error invoking remote method 'host:save-as': Error: Failed to get 'downloads' path",
    });
    await act("conversation.export");
    expect(lines()).toEqual([
      "the save dialog failed · Failed to get 'downloads' path · export-file writes the page into the workspace instead",
    ]);
  });

  it("points at export-file when the host has no save dialog", async () => {
    const { act } = mount({
      saved: {
        saved: false,
        refused: "unavailable",
        detail: "the browser host has no save dialog",
      },
    });
    await act("conversation.export");
    expect(lines()).toEqual([
      "the browser host has no save dialog · export-file writes the page into the workspace instead",
    ]);
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

describe("a session the server no longer knows", () => {
  it("offers to restore a session moved to the trash, in keywork's words", async () => {
    const { sent } = mount({ trashed: true });
    await settle();
    const confirm = document.querySelector(".kw-controls-confirm") as HTMLElement;
    expect(confirm.textContent).toBe(
      'removed "this session" · it is in the trash, memory notes stay · restore it? y/n',
    );
    fireEvent.keyDown(confirm, { key: "y" });
    await settle();
    expect(sent.verbs).toEqual(["restore s1"]);
    expect(lines()).toEqual(['restored "Lights" · it is back in the session tree']);
  });

  it("names the session as its frame did, though the store forgot it on removal", async () => {
    const [summary, setSummary] = createSignal<SessionSummary | undefined>({
      id: "s1",
      title: "(untitled session)",
      createdAt: "t",
      lastActivityAt: "t",
      messageCount: 2,
    });
    const [trashed, setTrashed] = createSignal(false);
    const projection = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-09-07T12:00:00.000Z",
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: "bash cat hello.txt" },
      },
    ]);
    mount({ live: { summary, trashed, projection: () => projection } });
    setSummary(undefined);
    setTrashed(true);
    await settle();
    const confirm = document.querySelector(".kw-controls-confirm") as HTMLElement;
    expect(confirm.textContent).toBe(
      'removed "bash cat hello.txt" · it is in the trash, memory notes stay · restore it? y/n',
    );
    fireEvent.keyDown(confirm, { key: "y" });
    await settle();
    expect(lines()).toEqual(['restored "bash cat hello.txt" · it is back in the session tree']);
  });

  it("leaves a declined session in the trash and says where to restore it", async () => {
    const { sent } = mount({ trashed: true });
    await settle();
    fireEvent.keyDown(document.querySelector(".kw-controls-confirm") as HTMLElement, { key: "n" });
    await settle();
    expect(sent.verbs).toEqual([]);
    expect(lines()).toEqual(["left in the trash · the sessions pane restores it"]);
  });

  it("starts a new session with the prompt instead of dropping it", async () => {
    const { sent } = mount({ promptOutcome: "missing" });
    const input = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    input.value = "are you there";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    await settle();
    expect(sent.prompts).toEqual([["s1", "are you there", "queue"]]);
    expect(sent.verbs).toEqual(["start conversation-1 are you there"]);
    expect(lines()).toEqual([
      "that session was gone from the server · your prompt started a new one",
    ]);
  });
});

describe("a pane whose session is gone", () => {
  it("says so as its one empty line, not beside a second one", async () => {
    const sent: Sent = { prompts: [], verbs: [], followed: [] };
    const [spec, setSpec] = createSignal<ConversationSpec>({
      kind: "conversation",
      sessionId: "s1",
    });
    const shell = {
      ...shellOver(sent, { gone: true }),
      rebind: (_pane: string, next: ConversationSpec) => setSpec(next),
    } as ShellSeams;
    render(() => (
      <conversationPane.component
        id="conversation-1"
        spec={spec()}
        focused={true}
        shell={shell}
        onAction={() => undefined}
      />
    ));
    await settle();
    const empties = [...document.querySelectorAll(".kw-empty")].map((line) => line.textContent);
    expect(empties).toEqual([sessionGoneNotice]);
    expect(lines()).toEqual([]);
  });
});

describe("the session a pane shows", () => {
  it("is followed however the pane came to show it: mounted, rebound or bound after a first prompt", async () => {
    const sent: Sent = { prompts: [], verbs: [], followed: [] };
    const shell = shellOver(sent);
    const [spec, setSpec] = createSignal<ConversationSpec>({ kind: "conversation" });
    render(() => (
      <conversationPane.component
        id="conversation-1"
        spec={spec()}
        focused={true}
        shell={shell}
        onAction={() => undefined}
      />
    ));
    await settle();
    expect(sent.followed).toEqual([]);
    setSpec({ kind: "conversation", sessionId: "s1" });
    setSpec({ kind: "conversation", sessionId: "s2" });
    await settle();
    expect(sent.followed).toEqual(["s1", "s2"]);
  });
});

describe("the conversation pane's keyboard home", () => {
  it("puts the keys in the composer when the pane is focused, so typing is never dropped", () => {
    mount();
    expect(document.activeElement).toBe(document.querySelector(".kw-composer-input"));
  });

  it("hands the keys to an inline ask and back to the composer once it is answered", async () => {
    const { act } = mount();
    await act("conversation.rename");
    expect(document.activeElement).toBe(document.querySelector(".kw-controls-input"));
    answer("Lights");
    await settle();
    expect(document.activeElement).toBe(document.querySelector(".kw-composer-input"));
  });
});

describe("the conversation pane's title row", () => {
  it("shows the inference words, the reported context basis and the server's usage", () => {
    const shell = shellOver(
      { prompts: [], verbs: [], followed: [] },
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
      flushAt: 177_289,
    });
  });

  it("carries the session's arc slug and its bot to the title row", () => {
    const bound: SessionSummary = {
      id: "s1",
      title: "Lights",
      createdAt: "t",
      lastActivityAt: "t",
      messageCount: 2,
      arc: "pricing-v2",
      bot: "reviewer",
    };
    const shell = shellOver(
      { prompts: [], verbs: [], followed: [] },
      { live: { summary: () => bound, projection: () => emptyProjection, trashed: () => false } },
    );
    const adornments = conversationPane.adornments?.(
      { kind: "conversation", sessionId: "s1" },
      shell,
    );
    expect(adornments?.arc).toBe("pricing-v2");
    expect(adornments?.bot).toEqual({ name: "reviewer" });
  });

  it("keeps the assumed basis until the first reading arrives", () => {
    const shell = shellOver({ prompts: [], verbs: [], followed: [] });
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
      "leader end",
      "leader shift+x",
      "leader [",
      "leader ]",
    ]);
  });
});

describe("the review trail in the conversation", () => {
  const at = "2026-11-06T10:00:00.000Z";
  const mark = {
    index: 1,
    entryId: "v1",
    at,
    path: "src/a.ts",
    header: "@@ -1,3 +1,4 @@",
    digest: "a1b2c3d4",
    verdict: "keep",
  } as const;
  const quoted = [
    "About src/a.ts @@ -1,3 +1,4 @@ (hunk a1b2c3d4):",
    "",
    "```diff",
    "-two",
    "+2",
    "```",
    "",
    "why 2 and not two?",
  ].join("\n");

  function reviewed(replay: boolean): SessionProjection {
    return projectAll(emptyProjection, [
      {
        id: 1,
        ts: at,
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: "take the delivery", entryId: "q1", replay },
      },
      {
        id: 2,
        ts: at,
        sessionId: "s1",
        type: "extension.notice",
        payload: { ...reviewNotice(mark), replay },
      },
      {
        id: 3,
        ts: at,
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: quoted, entryId: "q2", replay },
      },
    ]);
  }

  it("draws each verdict as a bare notice between the turns, live and replayed", () => {
    for (const replay of [false, true]) {
      mount({
        live: {
          summary: () => undefined,
          projection: () => reviewed(replay),
          trashed: () => false,
        },
      });
      const notices = [...document.querySelectorAll(".kw-notice")].map((n) => n.textContent);
      expect(notices, `replay ${replay}`).toEqual([
        "keep · src/a.ts @@ -1,3 +1,4 @@ · hunk a1b2c3d4",
      ]);
      cleanup();
    }
  });

  it("shows talking to the diff as the keeper's own message carrying the hunk reference", () => {
    mount({
      live: { summary: () => undefined, projection: () => reviewed(false), trashed: () => false },
    });
    const prompts = [...document.querySelectorAll(".kw-user")].map((n) => n.textContent ?? "");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("About src/a.ts @@ -1,3 +1,4 @@ (hunk a1b2c3d4):");
    expect(prompts[1]).toContain("why 2 and not two?");
  });
});

describe("a creature's report on its own turn", () => {
  const at = "2026-11-06T10:00:00.000Z";
  const sentence = "I listed the five largest files under docs and wrote them to notes/largest.md.";
  const reply = `${sentence} The list is sorted by size.`;
  const crateDeliveredLine = "delivered · the crate is on the porch";

  function reported(replay: boolean): SessionProjection {
    return projectAll(emptyProjection, [
      {
        id: 1,
        ts: at,
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: "list the five largest files under docs", entryId: "q1", replay },
      },
      {
        id: 2,
        ts: at,
        sessionId: "s1",
        type: "turn.delta",
        payload: { delta: { type: "text", text: reply }, replay },
      },
      {
        id: 3,
        ts: at,
        sessionId: "s1",
        type: "turn.completed",
        payload: {
          message: { role: "assistant", parts: [{ type: "text", text: reply }] },
          usage: { inputTokens: 1, outputTokens: 1 },
          replay,
        },
      },
      {
        id: 4,
        ts: at,
        sessionId: "s1",
        type: "extension.notice",
        payload: {
          extension: "creature",
          level: "info",
          message: sentence,
          detail: { origin: { kind: "creature", creature: "cob", thread: "s1" }, entryId: "e9" },
          replay,
        },
      },
    ]);
  }

  it("draws the turn's first sentence once and its report line as the delivery notice, live and replayed", () => {
    for (const replay of [false, true]) {
      mount({
        live: {
          summary: () => undefined,
          projection: () => reported(replay),
          trashed: () => false,
        },
      });
      const notices = [...document.querySelectorAll(".kw-notice")].map((n) => n.textContent);
      expect(notices, `replay ${replay}`).toEqual([crateDeliveredLine]);
      const drawn = document.querySelector(".kw-transcript")?.textContent ?? "";
      expect(drawn.split(sentence).length - 1, `replay ${replay}`).toBe(1);
      cleanup();
    }
  });

  it("still draws a thread's report line as its own sentence, since only the conversation's label is the crate", () => {
    const threadReport = projectAll(emptyProjection, [
      {
        id: 1,
        ts: at,
        sessionId: "s1",
        type: "extension.notice",
        payload: {
          extension: "creature",
          level: "info",
          message: sentence,
          detail: {
            origin: { kind: "creature", creature: "cob", thread: "thread-2" },
            entryId: "e9",
          },
        },
      },
    ]);
    mount({
      live: { summary: () => undefined, projection: () => threadReport, trashed: () => false },
    });
    const notices = [...document.querySelectorAll(".kw-notice")].map((n) => n.textContent);
    expect(notices).toEqual([sentence]);
  });
});
