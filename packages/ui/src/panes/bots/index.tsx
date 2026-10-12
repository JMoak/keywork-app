import { type BotScope, type BotSummary, isSurfaceRefusal } from "@keywork-app/protocol";
import { createSignal, For, Show } from "solid-js";
import { z } from "zod";
import { relativeAge } from "../../chrome/telemetry.ts";
import { formatCost } from "../../instruments/format.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import {
  ChoiceLine,
  createCursor,
  DraftLine,
  NoticeLine,
  OverviewRow,
  SubLine,
} from "../overview/rows.tsx";
import { noWorkingSession, summonedFrom, workingSession } from "../overview/working-session.ts";
import { definePane, type PaneProps } from "../registry.ts";

const botsSpec = z.object({
  kind: z.literal("bots"),
  sessionId: z.string().optional(),
});

export type BotsSpec = z.output<typeof botsSpec>;

export const botsPane = definePane<BotsSpec>({
  kind: "bots",
  spec: botsSpec,
  home: "left",
  title: () => "bots",
  emptyState: (keys) => `no bots yet · ${keys.chord("bots.new")} defines one`,
  component: BotsList,
  summon: {
    action: "bots.summon",
    chords: "none",
    help: "bots pane",
    command: { name: "bots", description: "open the bots pane", aliases: ["bot"] },
    spec: (shell) => ({ kind: "bots", ...summonedFrom(shell) }),
  },
  localActions: {
    "bots.down": {
      chords: ["j", "down"],
      help: "next bot",
      command: { name: "bots-next", description: "move to the next bot" },
    },
    "bots.up": {
      chords: ["k", "up"],
      help: "previous bot",
      command: { name: "bots-previous", description: "move to the previous bot" },
    },
    "bots.switch": {
      chords: "enter",
      help: "run the current session as this bot",
      command: { name: "bot-switch", description: "switch the focused session to this bot" },
    },
    "bots.new": {
      chords: "n",
      help: "define a bot",
      command: { name: "bot-new", description: "define a new bot by slug and scope" },
    },
    "bots.release": {
      chords: "u",
      help: "run the current session as no bot",
      command: { name: "bot-release", description: "release the focused session from its bot" },
    },
  },
});

export function botLabel(bot: Pick<BotSummary, "sigil" | "name">): string {
  return `${bot.sigil} ${bot.name}`;
}

export function botAside(bot: BotSummary): string {
  const sessions = `${bot.sessions} ${bot.sessions === 1 ? "session" : "sessions"}`;
  return [
    bot.source,
    sessions,
    bot.costNanos === undefined ? undefined : formatCost(bot.costNanos / 1e9),
    bot.lastUsed === undefined ? undefined : relativeAge(bot.lastUsed),
  ]
    .filter((item): item is string => item !== undefined)
    .join(" · ");
}

const scopeChoices: Readonly<Record<string, string>> = { p: "project", u: "user" };

type Prompt = { kind: "slug" } | { kind: "scope"; slug: string };

function BotsList(props: PaneProps<BotsSpec>) {
  const session = workingSession(props.shell, props.spec.sessionId);
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const surfaces = () => props.shell.store.surfaces;
  const bots = () => surfaces().state.bots;
  const cursor = createCursor(() => bots().length);
  const [prompt, setPrompt] = createSignal<Prompt>();
  const [notice, setNotice] = createSignal<string>();
  const atCursor = (): BotSummary | undefined => bots()[cursor.index()];
  const scopeFor = (): string | undefined => {
    const pending = prompt();
    return pending?.kind === "scope" ? pending.slug : undefined;
  };

  const switchTo = async (name: string | null): Promise<void> => {
    const sessionId = session();
    if (sessionId === undefined) {
      setNotice(noWorkingSession);
      return;
    }
    const outcome = await surfaces().verbs.bindSessionBot(sessionId, name);
    setNotice(
      isSurfaceRefusal(outcome)
        ? outcome.detail
        : name === null
          ? "session runs as no bot"
          : `session runs as ${name}`,
    );
    await props.shell.store.refresh();
    await surfaces().refetch("bots");
  };

  const create = async (slug: string, scope: BotScope): Promise<void> => {
    setPrompt(undefined);
    const created = await surfaces().verbs.createBot({ slug, scope });
    setNotice(isSurfaceRefusal(created) ? created.detail : `${botLabel(created)} defined`);
    await surfaces().refetch("bots");
  };

  props.onAction((action) => {
    if (prompt() !== undefined) {
      setPrompt(undefined);
      return;
    }
    const bot = atCursor();
    switch (action) {
      case "bots.down":
        return cursor.move(1);
      case "bots.up":
        return cursor.move(-1);
      case "bots.switch":
        if (bot !== undefined) void switchTo(bot.name);
        return;
      case "bots.new":
        return setPrompt({ kind: "slug" });
      case "bots.release":
        return void switchTo(null);
    }
  });

  return (
    <section class="kw-ov kw-bots" aria-label="bots" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <button type="button" class="kw-ov-new" onClick={() => setPrompt({ kind: "slug" })}>
          + new bot
        </button>
        <span class="kw-ov-head-detail">enter switches · u releases</span>
      </div>
      <Show
        when={bots().length > 0}
        fallback={<EmptyState line={botsPane.emptyState(props.shell.keys)} />}
      >
        <ol class="kw-ov-list">
          <For each={bots()}>
            {(bot, index) => (
              <>
                <OverviewRow
                  cursor={index() === cursor.index()}
                  mark={bot.sessions > 0 ? "▓" : "░"}
                  aside={botAside(bot)}
                  onClick={() => {
                    cursor.set(index());
                    void switchTo(bot.name);
                  }}
                >
                  {botLabel(bot)}
                </OverviewRow>
                <Show when={bot.description}>{(text) => <SubLine text={text()} />}</Show>
              </>
            )}
          </For>
        </ol>
      </Show>
      <Show when={prompt()?.kind === "slug"}>
        <DraftLine
          label="bot slug"
          onSubmit={(slug) => {
            if (slug !== "") setPrompt({ kind: "scope", slug });
          }}
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={scopeFor()}>
        {(slug) => (
          <ChoiceLine
            question={`scope for ${slug()}`}
            choices={scopeChoices}
            onChoose={(key) => void create(slug(), scopeChoices[key] as BotScope)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={surfaces().state.notices.bots} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}
