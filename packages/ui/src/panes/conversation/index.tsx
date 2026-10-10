import type { SessionProjection } from "@keywork-app/client";
import { Show } from "solid-js";
import { z } from "zod";
import { FirstRun } from "../../chrome/first-run.tsx";
import { arcHueRank, botTitle } from "../../chrome/identity.ts";
import type { LifecycleState } from "../../chrome/pane-frame.tsx";
import { sessionName, telemetry } from "../../chrome/telemetry.ts";
import { Composer } from "../../composer/composer.tsx";
import { contextLevelOf } from "../../instruments/context.ts";
import { ConversationPane } from "../../page/pane.tsx";
import { EmptyState } from "../empty-state.tsx";
import { spillFileSpec } from "../file/index.tsx";
import { definePane, type PaneProps } from "../registry.ts";

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
  adornments: (spec, shell) => {
    const projection = shell.store.projection(spec.sessionId);
    const summary = shell.store.summary(spec.sessionId);
    return {
      telemetry: telemetry(projection),
      context: contextLevelOf(projection.usage),
      bot: botTitle(summary, shell.store.surfaces.state.bots),
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

function ConversationSlot(props: PaneProps<ConversationSpec>) {
  const projection = () => props.shell.store.projection(props.spec.sessionId);
  const queue = (text: string): void => {
    const id = props.spec.sessionId;
    if (id === undefined) void props.shell.sessions.startSession(props.id, text);
    else void props.shell.store.prompt(id, text);
  };
  const steer = (text: string): void => queue(text);
  const interrupt = (): void => {
    const id = props.spec.sessionId;
    if (id !== undefined) void props.shell.store.abort(id);
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
            onAnswerAsk={(callId, verdict) => void props.shell.store.answerAsk(callId, verdict)}
            onOpenSpill={(spill) => props.shell.openPane(spillFileSpec(spill))}
          />
        </Show>
      </div>
      <Composer
        queue={projection().queue}
        busy={projection().turn !== undefined}
        onSteer={steer}
        onQueue={queue}
        onInterrupt={interrupt}
      />
    </>
  );
}

function settledState(projection: SessionProjection): LifecycleState | undefined {
  if (projection.turn !== undefined) return "working";
  if (projection.entries.some((entry) => entry.kind === "tool" && entry.run.phase === "asking")) {
    return "needs-you";
  }
  const last = projection.entries.at(-1);
  return last?.kind === "notice" && last.level === "error" ? "failed" : undefined;
}
