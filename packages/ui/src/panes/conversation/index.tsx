import type { SessionProjection } from "@keywork-app/client";
import {
  type ActivePreset,
  type ControlRefusal,
  isControlRefusal,
  type PresetName,
  type PromptBehavior,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { z } from "zod";
import { FirstRun } from "../../chrome/first-run.tsx";
import { arcHueRank, botTitle } from "../../chrome/identity.ts";
import type { LifecycleState } from "../../chrome/pane-frame.tsx";
import { sessionName, telemetry } from "../../chrome/telemetry.ts";
import { Composer } from "../../composer/composer.tsx";
import { contextLevelOf, contextLevelOfReport } from "../../instruments/context.ts";
import { costReadout } from "../../instruments/cost-report.ts";
import { askChordsOf } from "../../page/ask-card.tsx";
import { ConversationPane } from "../../page/pane.tsx";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import { restoreNotice } from "../tree/trash.ts";
import { type ControlAsk, ControlRow } from "./control-row.tsx";
import {
  compactNotice,
  effortNotice,
  exportedNotice,
  inferenceWords,
  isSettled,
  leftInTrashNotice,
  leftUnchanged,
  looseningQuestion,
  nextEffort,
  type PresetDirection,
  pageNameFor,
  presetNotice,
  presetStep,
  promptRehomedNotice,
  redoneNotice,
  refusalNotice,
  sessionGoneNotice,
  thinkingNotice,
  trashedQuestion,
  undoneNotice,
  unsteppableNotice,
} from "./controls.ts";

const conversationSpec = z.object({
  kind: z.literal("conversation"),
  sessionId: z.string().optional(),
});

export type ConversationSpec = z.output<typeof conversationSpec>;

export const conversationPane = definePane<ConversationSpec>({
  kind: "conversation",
  spec: conversationSpec,
  home: "main",
  title: (spec, shell) =>
    spec.sessionId === undefined
      ? "new session"
      : sessionName(shell.store.summary(spec.sessionId), shell.store.projection(spec.sessionId)),
  emptyState: (keys) =>
    `no session yet · type a prompt and enter starts one, or ${keys.chord("tree.summon")} picks one`,
  component: ConversationSlot,
  summon: {
    action: "pane.split",
    chords: "leader s",
    help: "new session pane",
    command: { name: "split", description: "open a new session pane beside this one" },
    spec: async (shell) => ({ kind: "conversation", sessionId: await shell.store.create() }),
  },
  localActions: {
    "conversation.model": {
      chords: "leader o",
      help: "switch the model",
      command: { name: "model", description: "switch this session's model" },
    },
    "conversation.thinking": {
      chords: "leader v",
      help: "show or hide thinking",
      command: { name: "thinking", description: "show or hide the model's reasoning" },
    },
    "conversation.effort": {
      chords: "leader e",
      help: "next effort level",
      command: {
        name: "effort",
        description: "how much work each reply gets: low to max, then the provider's default",
      },
    },
    "conversation.compact": {
      chords: "leader shift+c",
      help: "compact the context",
      command: { name: "compact", description: "fold the older conversation into a summary" },
    },
    "conversation.rename": {
      chords: "leader shift+r",
      help: "rename the session",
      command: { name: "rename", description: "give this session a title" },
    },
    "conversation.export": {
      chords: "leader shift+e",
      help: "save and copy the session",
      command: {
        name: "export",
        description: "save this session as a self-contained page, and copy it",
      },
    },
    "conversation.export-file": {
      chords: "none",
      help: "export into the workspace",
      command: {
        name: "export-file",
        description: "write this session's page into the workspace folder",
      },
    },
    "conversation.undo": {
      chords: "none",
      help: "undo the last prompt",
      command: { name: "undo", description: "take back the last prompt, its turn and its files" },
    },
    "conversation.redo": {
      chords: "none",
      help: "redo what undo took",
      command: { name: "redo", description: "bring back what the last undo took" },
    },
    "conversation.cost": {
      chords: "none",
      help: "cost per model",
      command: { name: "cost", description: "tokens and spend for each model this session ran" },
    },
    "conversation.preset-tighter": {
      chords: "leader [",
      help: "tighter permissions",
      command: { name: "preset-tighter", description: "move the permission preset toward careful" },
    },
    "conversation.preset-looser": {
      chords: "leader ]",
      help: "looser permissions",
      command: { name: "preset-looser", description: "move the permission preset toward open" },
    },
    "conversation.preset-careful": {
      chords: "none",
      help: "careful preset",
      command: { name: "preset-careful", description: "ask before each core tool" },
    },
    "conversation.preset-standard": {
      chords: "none",
      help: "standard preset",
      command: { name: "preset-standard", description: "follow the configured rules" },
    },
    "conversation.preset-open": {
      chords: "none",
      help: "open preset",
      command: { name: "preset-open", description: "allow the core tools without asking" },
    },
  },
  adornments: (spec, shell) => {
    const projection = shell.store.projection(spec.sessionId);
    const summary = shell.store.summary(spec.sessionId);
    const readings = shell.store.controls.readings(spec.sessionId);
    return {
      telemetry: telemetry(projection, readings.cost),
      context:
        readings.context === undefined
          ? contextLevelOf(projection.usage)
          : contextLevelOfReport(readings.context),
      bot: botTitle(summary, shell.store.surfaces.state.bots),
      inference: inferenceWords(shell.store.controlsOf(spec.sessionId)),
      hueRank: arcHueRank(summary, shell.store.surfaces.state.ordinals),
      modeWord: shell.trust.untrusted()
        ? "untrusted"
        : projection.mode === undefined || projection.mode === "agent"
          ? undefined
          : projection.mode,
    };
  },
  lifecycle: (view, shell) => {
    const projection = shell.store.projection(view.spec.sessionId);
    const settled = settledState(projection);
    if (settled !== undefined) return settled;
    return shell.unseen(view, projection.usage.turns) ? "finished-unseen" : "idle";
  },
  onRestore: (spec, shell) => {
    if (spec.sessionId !== undefined) void shell.store.open(spec.sessionId);
  },
});

interface PendingAsk {
  readonly ask: ControlAsk;
  readonly answer: (reply: string | boolean) => Promise<void>;
}

function ConversationSlot(props: PaneProps<ConversationSpec>) {
  const projection = () => props.shell.store.projection(props.spec.sessionId);
  const [pending, setPending] = createSignal<PendingAsk>();
  const [lines, setLines] = createSignal<readonly string[]>([]);
  const say = (...said: string[]): void => {
    setLines(said);
  };
  const knownName = lastKnownName(props.shell, () => props.spec.sessionId);
  let composerInput: HTMLTextAreaElement | undefined;
  keepKeyboardHome(
    () => composerInput,
    () => props.focused && pending() === undefined,
  );

  createEffect(() => {
    const id = props.spec.sessionId;
    if (id !== undefined) void props.shell.store.controls.watchReadings(id);
  });

  createEffect(() => {
    const id = props.spec.sessionId;
    if (id === undefined || !props.shell.store.gone(id)) return;
    props.shell.rebind(props.id, { kind: "conversation" });
    say(sessionGoneNotice);
  });

  createEffect(() => {
    const id = props.spec.sessionId;
    if (id === undefined || !props.shell.store.trashed(id)) return;
    setPending(restoreOffer(props.shell, id, knownName(), say));
  });

  const send =
    (behavior: PromptBehavior) =>
    async (text: string): Promise<void> => {
      setLines([]);
      const id = props.spec.sessionId;
      if (id === undefined) return props.shell.sessions.startSession(props.id, text);
      const outcome = await props.shell.store.prompt(id, text, behavior);
      if (outcome !== "missing") return;
      await props.shell.sessions.startSession(props.id, text);
      say(promptRehomedNotice);
    };
  const interrupt = (): void => {
    const id = props.spec.sessionId;
    if (id !== undefined) void props.shell.store.abort(id);
  };

  const controls = sessionControlsOf(props.shell, () => props.spec.sessionId, say, setPending);
  props.onAction((action) => controls[action]?.());

  const answerPending = (reply: string | boolean): void => {
    const asked = pending();
    setPending(undefined);
    void asked?.answer(reply);
  };

  return (
    <>
      <div class="kw-page">
        <Show
          when={props.spec.sessionId !== undefined}
          fallback={
            <>
              <EmptyState line={conversationPane.emptyState(props.shell.keys)} />
              <Show when={props.shell.store.state.summaries.length === 0}>
                <FirstRun keys={props.shell.keys} />
              </Show>
            </>
          }
        >
          <ConversationPane
            projection={projection()}
            onAnswerAsk={(callId, verdict, scope) =>
              props.shell.client.answerAsk(callId, verdict, scope)
            }
            askChords={askChordsOf(props.shell.keys)}
          />
        </Show>
      </div>
      <ControlRow
        ask={pending()?.ask}
        lines={lines()}
        onAnswer={answerPending}
        onConfirm={answerPending}
        onDismiss={() => setPending(undefined)}
      />
      <Composer
        queue={projection().queue}
        busy={projection().turn !== undefined}
        seed={props.shell.store.controls.seed(props.spec.sessionId)}
        onSteer={(text) => void send("steer")(text)}
        onQueue={(text) => void send("queue")(text)}
        onInterrupt={interrupt}
        inputRef={(input) => {
          composerInput = input;
        }}
      />
    </>
  );
}

type Say = (...lines: string[]) => void;

function sessionControlsOf(
  shell: ShellSeams,
  sessionId: () => string | undefined,
  say: Say,
  ask: (pending: PendingAsk | undefined) => void,
): Record<string, () => void> {
  const store = shell.store;
  const verbs = store.controls;
  const withSession = (run: (id: string) => Promise<void> | void) => (): void => {
    const id = sessionId();
    if (id === undefined) say("no session here yet · send a prompt first");
    else void run(id);
  };
  const report = <Reading,>(
    reading: Reading,
    settled: (answer: Exclude<Reading, "missing" | ControlRefusal>) => string,
  ): void => {
    if (isSettled(reading)) say(settled(reading));
    else say(refusalNotice(reading as "missing" | ControlRefusal));
  };

  const choosePreset = async (name: PresetName): Promise<void> => {
    const reading = await verbs.setPreset(name);
    if (!isControlRefusal(reading)) return say(presetNotice(reading.from, reading.to));
    if (reading.refused !== "needs-confirmation") return say(reading.detail);
    ask({
      ask: { kind: "confirm", question: looseningQuestion(verbs.state.preset, name) },
      answer: async (agreed) => {
        if (agreed !== true) return say(leftUnchanged);
        const confirmed = await verbs.setPreset(name, true);
        say(
          isControlRefusal(confirmed)
            ? confirmed.detail
            : presetNotice(confirmed.from, confirmed.to),
        );
      },
    });
  };
  const stepPreset = (direction: PresetDirection) => (): void => {
    const active: ActivePreset | undefined = verbs.state.preset;
    const target = presetStep(active, direction);
    if (target === undefined) say(unsteppableNotice(active, direction));
    else void choosePreset(target);
  };

  return {
    "conversation.model": withSession((id) =>
      ask({
        ask: {
          kind: "text",
          label: "model · provider/model",
          initial: "",
          choices: verbs.models(),
        },
        answer: async (reference) => {
          report(await verbs.setModel(id, String(reference)), (switched) => switched.notice);
        },
      }),
    ),
    "conversation.thinking": withSession(async (id) => {
      const on = !store.controlsOf(id).thinking;
      report(await verbs.setThinking(id, on), (answer) =>
        thinkingNotice(answer.thinking, shell.keys.chord("conversation.thinking")),
      );
    }),
    "conversation.effort": withSession(async (id) => {
      const level = nextEffort(store.controlsOf(id).effort);
      report(await verbs.setEffort(id, level), (answer) => effortNotice(answer.effort));
    }),
    "conversation.compact": withSession(async (id) => {
      say("compacting · folding the older conversation into a summary");
      report(await verbs.compact(id), compactNotice);
    }),
    "conversation.rename": withSession((id) =>
      ask({
        ask: { kind: "text", label: "title", initial: currentTitle(shell, id), choices: [] },
        answer: async (title) => {
          report(await verbs.rename(id, String(title)), (renamed) => `renamed · ${renamed.title}`);
        },
      }),
    ),
    "conversation.export": withSession(async (id) => {
      const reading = await verbs.exportSession(id);
      if (!isSettled(reading)) return say(refusalNotice(reading));
      if (!("html" in reading)) return say(`session page written to ${reading.file}`);
      const copied = await copiedToClipboard(reading.html);
      const saved = await shell.host.saveAs(pageNameFor(currentTitle(shell, id)), reading.html);
      say(exportedNotice(reading.html, copied, saved));
    }),
    "conversation.export-file": withSession(async (id) => {
      report(await verbs.exportSession(id, { out: "." }), (exported) =>
        "file" in exported
          ? `session page written to ${exported.file}`
          : "the server sent the page inline",
      );
    }),
    "conversation.undo": withSession(async (id) => {
      report(await verbs.undo(id), undoneNotice);
    }),
    "conversation.redo": withSession(async (id) => {
      report(await verbs.redo(id), () => redoneNotice);
    }),
    "conversation.cost": withSession(async (id) => {
      await verbs.watchReadings(id);
      const cost = verbs.readings(id).cost;
      if (cost === undefined) say("this session is gone");
      else say(...costReadout(cost, store.controlsOf(id).model));
    }),
    "conversation.preset-tighter": stepPreset("tighter"),
    "conversation.preset-looser": stepPreset("looser"),
    "conversation.preset-careful": () => void choosePreset("careful"),
    "conversation.preset-standard": () => void choosePreset("standard"),
    "conversation.preset-open": () => void choosePreset("open"),
  };
}

function currentTitle(shell: ShellSeams, id: string): string {
  const title = shell.store.controlsOf(id).title;
  return title === undefined || title === untitled ? "" : title;
}

async function copiedToClipboard(html: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(html);
    return true;
  } catch {
    return false;
  }
}

const untitled = "(untitled session)";

function settledState(projection: SessionProjection): LifecycleState | undefined {
  if (projection.turn !== undefined) return "working";
  if (projection.entries.some((entry) => entry.kind === "tool" && entry.run.phase === "asking")) {
    return "needs-you";
  }
  const last = projection.entries.at(-1);
  return last?.kind === "notice" && last.level === "error" ? "failed" : undefined;
}

function restoreOffer(
  shell: ShellSeams,
  sessionId: string,
  name: string | undefined,
  say: Say,
): PendingAsk {
  return {
    ask: { kind: "confirm", question: trashedQuestion(name ?? "this session") },
    answer: async (agreed) => {
      if (agreed !== true) return say(leftInTrashNotice);
      say(restoreNotice(await shell.store.restore(sessionId), name));
    },
  };
}

interface KnownName {
  readonly sessionId: string;
  readonly name: string;
}

function lastKnownName(
  shell: ShellSeams,
  sessionId: () => string | undefined,
): () => string | undefined {
  const known = createMemo<KnownName | undefined>((previous) => {
    const id = sessionId();
    const summary = shell.store.summary(id);
    if (summary !== undefined) {
      return { sessionId: summary.id, name: sessionName(summary, shell.store.projection(id)) };
    }
    return previous?.sessionId === id ? previous : undefined;
  });
  return () => known()?.name;
}
