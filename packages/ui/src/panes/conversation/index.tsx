import {
  forgottenPromptIds,
  type SessionControls,
  type SessionProjection,
  type ToolRun,
} from "@keywork-app/client";
import {
  type ActivePreset,
  type ControlRefusal,
  isControlRefusal,
  type PresetName,
  type QueuedPrompt,
  type QueueRefusal,
  type SendBehavior,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { z } from "zod";
import { FirstRun } from "../../chrome/first-run.tsx";
import { arcHueRank, botNamed, titleBot } from "../../chrome/identity.ts";
import type { LifecycleState } from "../../chrome/pane-frame.tsx";
import { sessionName } from "../../chrome/session-name.ts";
import { telemetry } from "../../chrome/telemetry.ts";
import { Composer } from "../../composer/composer.tsx";
import {
  broughtBackNotice,
  createQueueEditor,
  type QueueEdits,
  queueHint,
  setAsideNotice,
} from "../../composer/queue-editor.ts";
import { sessionContextLevel } from "../../instruments/context.ts";
import { costReadout } from "../../instruments/cost-report.ts";
import { askChordsOf } from "../../page/ask-card.tsx";
import { ConversationPane } from "../../page/pane.tsx";
import type { DraftSeed } from "../../shell/controls-store.ts";
import { composerHold, promptReturnedNotice } from "../../shell/server-standing.ts";
import { EmptyState } from "../empty-state.tsx";
import { spillOpening } from "../file/spill.ts";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import { restoreNotice } from "../tree/trash.ts";
import {
  effortChoices,
  effortFrom,
  effortUsage,
  type ModelsKnown,
  modelChoices,
  thinkingChoices,
  thinkingFrom,
  thinkingUsage,
} from "./arguments.ts";
import { type ControlAsk, ControlRow } from "./control-row.tsx";
import {
  childAtWorkNotice,
  compactingNotice,
  compactNotice,
  effortNotice,
  exportedNotice,
  inferenceWords,
  isSettled,
  leftInTrashNotice,
  leftUnchanged,
  looseningQuestion,
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
import { copyActions, copyVerbs } from "./copy.ts";
import {
  forgetNotice,
  forgetOptions,
  forgetPickerHint,
  forgottenWhat,
  nothingToForgetNotice,
  replacementOf,
  turnRunningNotice,
} from "./forget.ts";
import { revealWhatWaits } from "./reveal.ts";
import { createTurnLedger, turnRibbon } from "./turn-ledger.ts";
import { walkTranscript } from "./walk.ts";

const conversationSpec = z.object({
  kind: z.literal("conversation"),
  sessionId: z.string().optional(),
});

export type ConversationSpec = z.output<typeof conversationSpec>;

export const conversationPane = definePane<ConversationSpec>({
  kind: "conversation",
  spec: conversationSpec,
  home: "main",
  attire: "work",
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
      command: {
        name: "model",
        aliases: ["models"],
        description: "switch this session's model",
        argument: {
          hint: "[provider/model]",
          choices: (shell) => modelChoices(modelsKnown(shell)),
        },
      },
    },
    "conversation.thinking": {
      chords: "leader v",
      help: "show or hide thinking",
      command: {
        name: "thinking",
        description: "show or hide the model's reasoning",
        argument: {
          hint: "[on|off]",
          choices: (shell) => thinkingChoices(focusedControls(shell).thinking),
        },
      },
    },
    "conversation.effort": {
      chords: "leader e",
      help: "next effort level",
      command: {
        name: "effort",
        description: "how much work each reply gets, low to max or the provider's default",
        argument: {
          hint: "[level]",
          choices: (shell) => effortChoices(focusedControls(shell).effort),
        },
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
      help: "save the session as a page",
      command: {
        name: "export",
        description: "save this session as a self-contained page",
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
    "conversation.restore-turn": {
      chords: "none",
      help: "restore to before a turn",
      command: {
        name: "restore-turn",
        description: "put the session and its files back to before the focused turn, or the latest",
      },
    },
    "conversation.fork-turn": {
      chords: "none",
      help: "fork at a turn",
      command: {
        name: "fork-turn",
        description: "start a new session from the end of the focused turn, or the latest",
      },
    },
    "conversation.cost": {
      chords: "none",
      help: "cost per model",
      command: { name: "cost", description: "tokens and spend for each model this session ran" },
    },
    "conversation.forget": {
      chords: "leader shift+x",
      help: "forget a prompt or tool result",
      command: {
        name: "forget",
        description:
          "take an earlier prompt or tool result out of the model's context: /forget [replacement]",
        argument: { hint: "[replacement]" },
      },
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
    ...copyActions,
  },
  adornments: (spec, shell) => {
    const projection = shell.store.projection(spec.sessionId);
    const summary = shell.store.summary(spec.sessionId);
    const readings = shell.store.controls.readings(spec.sessionId);
    return {
      telemetry: telemetry(projection, readings.cost),
      context: sessionContextLevel(readings.context, projection.usage),
      arc: summary?.arc,
      bot: titleBot(summary, shell.store.surfaces.state.bots),
      inference: inferenceWords(shell.store.controlsOf(spec.sessionId)),
      hueRank: arcHueRank(summary, shell.store.surfaces.state.ordinals),
      quiet: shell.quiet?.has(spec.sessionId),
      ribbon: turnRibbon(shell, spec.sessionId),
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
  let page: HTMLDivElement | undefined;
  keepKeyboardHome(
    () => composerInput,
    () => props.focused && pending() === undefined,
  );
  revealWhatWaits({
    pane: () => props.id,
    root: () => page,
    revealing: () => props.shell.needsYou?.revealing(),
    painted: () => projection().entries.length,
  });

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

  const [returned, setReturned] = createSignal<DraftSeed>();
  const delivering =
    (deliver: (text: string) => Promise<void>) =>
    async (text: string): Promise<void> => {
      setLines([]);
      setReturned(undefined);
      try {
        await deliver(text);
      } catch (cause) {
        setReturned({ text });
        say(promptReturnedNotice(messageOf(cause)));
      }
    };
  const send = (behavior: SendBehavior) =>
    delivering(async (text) => {
      const id = props.spec.sessionId;
      if (id === undefined) return props.shell.sessions.startSession(props.id, text);
      const outcome = await props.shell.store.prompt(id, text, behavior);
      if (outcome !== "missing") return;
      await props.shell.sessions.startSession(props.id, text);
      say(promptRehomedNotice);
    });
  const [setAside, setSetAside] = createSignal<readonly QueuedPrompt[]>([]);
  const sendNow = delivering(async (text) => {
    const id = props.spec.sessionId;
    if (id === undefined) return props.shell.sessions.startSession(props.id, text);
    const aside = await props.shell.store.sendNow(id, text);
    if (aside === "missing") {
      await props.shell.sessions.startSession(props.id, text);
      return say(promptRehomedNotice);
    }
    if (aside.length === 0) return;
    setSetAside((held) => [...held, ...aside]);
    say(setAsideNotice(setAside().length));
  });
  const queueKeys = createQueueEditor(
    queueEditsOf(props.shell, () => props.spec.sessionId, projection, say, {
      held: setAside,
      clear: () => setSetAside([]),
    }),
  );
  const openSpill = (run: ToolRun): void => {
    const id = props.spec.sessionId;
    if (id !== undefined && run.spill !== undefined) {
      props.shell.openPane(spillOpening(id, run, run.spill));
    }
  };
  const interrupt = (): void => {
    const id = props.spec.sessionId;
    if (id !== undefined) void props.shell.store.abort(id);
  };

  const turns = createTurnLedger(props.shell, () => props.spec.sessionId, say, setPending);
  const forgotten = createMemo(() =>
    forgottenPromptIds(props.shell.store.tree(props.spec.sessionId).snapshot),
  );
  const shownProjection = (): SessionProjection | undefined =>
    props.spec.sessionId === undefined ? undefined : projection();
  const controls: Record<string, (argument?: string) => void> = {
    ...sessionControlsOf(props.shell, () => props.spec.sessionId, say, setPending),
    ...turns.actions,
    ...copyVerbs(props.shell.host, shownProjection, say),
  };
  props.onAction((action, argument) => controls[action]?.(argument));

  const answerPending = (reply: string | boolean): void => {
    const asked = pending();
    setPending(undefined);
    void asked?.answer(reply);
  };

  const walkSeams = { page: () => page, composer: () => composerInput };

  return (
    <div class="kw-conversation" ref={(root) => onCleanup(walkTranscript(root, walkSeams))}>
      <div class="kw-page" ref={page}>
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
            onAnswerAsk={(callId, verdict, scope, reason, note) =>
              props.shell.client.answerAsk(callId, verdict, scope, reason, note)
            }
            askChords={askChordsOf(props.shell.keys)}
            quiet={props.shell.quiet?.has(props.spec.sessionId)}
            onOpenSession={props.shell.sessions.openSession}
            botLabel={(name) => botNamed(name, props.shell.store.surfaces.state.bots)}
            askAccepted={props.shell.trustSetup?.acceptedScopeOf}
            ledger={turns.ledger()}
            ledgerVerbs={turns.verbs}
            redoable={props.shell.store.controlsOf(props.spec.sessionId).redoable}
            forgotten={forgotten()}
            onOpenSpill={openSpill}
          />
        </Show>
      </div>
      <ControlRow
        ask={pending()?.ask}
        lines={queueKeys.editing() ? [queueHint] : lines()}
        onAnswer={answerPending}
        onConfirm={answerPending}
        onDismiss={() => setPending(undefined)}
      />
      <Composer
        queue={projection().queue}
        busy={projection().turn !== undefined}
        seed={returned() ?? props.shell.store.controls.seed(props.spec.sessionId)}
        hold={
          composerHold(props.shell.server?.()) ??
          (props.shell.store.childOf(props.spec.sessionId)?.state === "running"
            ? childAtWorkNotice
            : undefined)
        }
        onSteer={(text) => void send("steer")(text)}
        onQueue={(text) => void send("queue")(text)}
        onNow={(text) => void sendNow(text)}
        onInterrupt={interrupt}
        queueKeys={queueKeys}
        commands={props.shell.commands}
        commandScope="conversation"
        inputRef={(input) => {
          composerInput = input;
        }}
      />
    </div>
  );
}

type Say = (...lines: string[]) => void;

interface SetAside {
  held(): readonly QueuedPrompt[];
  clear(): void;
}

function queueEditsOf(
  shell: ShellSeams,
  sessionId: () => string | undefined,
  projection: () => SessionProjection,
  say: Say,
  aside: SetAside,
): QueueEdits {
  const store = shell.store;
  const inSession = (run: (id: string) => Promise<void>): void => {
    const id = sessionId();
    if (id !== undefined) void run(id);
  };
  return {
    queue: () => projection().queue,
    move: (prompt, to) =>
      inSession(async (id) => {
        const moved = await store.moveQueued(id, prompt.id, to);
        if (typeof moved === "string") say(queueRefusalNotice(moved));
      }),
    cancel: (prompt) =>
      inSession(async (id) => {
        const cancelled = await store.cancelQueued(id, prompt.id);
        if (typeof cancelled === "string") say(queueRefusalNotice(cancelled));
      }),
    sendNow: (prompt) =>
      inSession(async (id) => {
        const cancelled = await store.cancelQueued(id, prompt.id);
        if (typeof cancelled === "string") return say(queueRefusalNotice(cancelled));
        await store.prompt(id, prompt.text, "steer");
      }),
    bringBack: () => {
      const held = aside.held();
      const id = sessionId();
      if (held.length === 0 || id === undefined) return false;
      aside.clear();
      void requeue(store, id, held).then(() => say(broughtBackNotice(held.length)));
      return true;
    },
  };
}

async function requeue(
  store: ShellSeams["store"],
  sessionId: string,
  prompts: readonly QueuedPrompt[],
): Promise<void> {
  for (const prompt of prompts) await store.prompt(sessionId, prompt.text, "queue");
}

function queueRefusalNotice(refusal: QueueRefusal): string {
  switch (refusal) {
    case "crosses-steer":
      return "steered prompts run before queued ones · that move would cross one";
    case "out-of-range":
      return "that prompt is already at the end of the queue";
    case "missing":
      return sessionGoneNotice;
    case "unknown-item":
      return "that prompt already left the queue";
  }
}

function sessionControlsOf(
  shell: ShellSeams,
  sessionId: () => string | undefined,
  say: Say,
  ask: (pending: PendingAsk | undefined) => void,
): Record<string, (argument?: string) => void> {
  const store = shell.store;
  const verbs = store.controls;
  const withSession =
    (run: (id: string, argument?: string) => Promise<void> | void) =>
    (argument?: string): void => {
      const id = sessionId();
      if (id === undefined) say("no session here yet · send a prompt first");
      else void run(id, argument);
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

  const switchModel = async (id: string, reference: string): Promise<void> => {
    report(await verbs.setModel(id, reference), (switched) => switched.notice);
  };

  const beginForget = async (id: string, argument?: string): Promise<void> => {
    if (store.projection(id).turn !== undefined) return say(turnRunningNotice);
    const replacement = replacementOf(argument);
    await store.openTree(id, { force: true });
    const snapshot = store.tree(id).snapshot;
    const options = snapshot === undefined ? [] : forgetOptions(snapshot);
    if (snapshot === undefined || options.length === 0) return say(nothingToForgetNotice);
    ask({
      ask: {
        kind: "pick",
        label: replacement === undefined ? "forget" : "rewrite",
        hint: forgetPickerHint(replacement !== undefined),
        options,
      },
      answer: async (chosen) => {
        const entryId = String(chosen);
        report(await verbs.forget(id, entryId, replacement), () =>
          forgetNotice(forgottenWhat(snapshot, entryId), replacement),
        );
      },
    });
  };

  return {
    "conversation.model": withSession((id, reference) => {
      if (reference !== undefined) return switchModel(id, reference);
      ask({
        ask: {
          kind: "text",
          label: "model · provider/model",
          initial: "",
          choices: verbs.models(),
        },
        answer: (chosen) => switchModel(id, String(chosen)),
      });
    }),
    "conversation.thinking": withSession(async (id, argument) => {
      const on = thinkingFrom(argument, store.controlsOf(id).thinking === true);
      if (on === undefined) return say(`thinking takes on or off · ${thinkingUsage}`);
      report(await verbs.setThinking(id, on), (answer) =>
        thinkingNotice(answer.thinking, shell.keys.chord("conversation.thinking")),
      );
    }),
    "conversation.effort": withSession(async (id, argument) => {
      const choice = effortFrom(argument, store.controlsOf(id).effort);
      if (choice.kind === "unknown") return say(`unknown effort ${choice.word} · ${effortUsage}`);
      report(await verbs.setEffort(id, choice.level), (answer) => effortNotice(answer.effort));
    }),
    "conversation.compact": withSession(async (id) => {
      say(compactingNotice);
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
      const saved = await shell.host.saveAs(pageNameFor(currentTitle(shell, id)), reading.html);
      say(exportedNotice(reading.html, saved));
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
    "conversation.forget": withSession((id, argument) => beginForget(id, argument)),
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

function focusedControls(shell: ShellSeams): SessionControls {
  return shell.store.controlsOf(shell.currentSession());
}

function modelsKnown(shell: ShellSeams): ModelsKnown {
  const current = focusedControls(shell).model;
  const sessionId = shell.currentSession();
  const others = shell.store.state.summaries.filter((summary) => summary.id !== sessionId);
  return {
    models: shell.store.controls.models(),
    current,
    elsewhere: (model) => others.filter((summary) => summary.model === model).length,
  };
}

function currentTitle(shell: ShellSeams, id: string): string {
  const title = shell.store.controlsOf(id).title;
  return title === undefined || title === untitled ? "" : title;
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
