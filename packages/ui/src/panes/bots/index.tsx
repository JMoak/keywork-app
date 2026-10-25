import {
  type BotScope,
  type BotSummary,
  isSurfaceRefusal,
  surfaceSlug,
} from "@keywork-app/protocol";
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
  attire: "house",
  title: () => "bots",
  emptyState: (keys) => `no bots yet · ${keys.chord("bots.new")} defines one`,
  component: BotsList,
  summon: {
    action: "bots.summon",
    chords: "none",
    help: "bots pane",
    command: { name: "bots", description: "open the bots pane" },
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
      command: { name: "bots-switch", description: "switch the focused session to this bot" },
    },
    "bots.new": {
      chords: "n",
      help: "define a bot: purpose, slug, scope",
      command: {
        name: "bots-new",
        description: "define a bot: what it is for, its slug, and where it lives",
        argument: { hint: "[slug]" },
      },
    },
    "bots.release": {
      chords: "u",
      help: "run the current session as no bot",
      command: { name: "bots-release", description: "release the focused session from its bot" },
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

const scopeChoices: Readonly<Record<string, string>> = { p: "project", g: "global" };

const scopeOfChoice: Readonly<Record<string, BotScope>> = { p: "project", g: "user" };

export const unnamedBotLine = "a bot needs a slug · lowercase letters, digits, hyphens";

type Prompt =
  | { kind: "purpose"; seed: string | undefined }
  | { kind: "slug"; purpose: string | undefined; seed: string | undefined }
  | { kind: "scope"; purpose: string | undefined; slug: string };

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
  const asking = <Kind extends Prompt["kind"]>(kind: Kind) => {
    const pending = prompt();
    return pending?.kind === kind ? (pending as Extract<Prompt, { kind: Kind }>) : undefined;
  };
  const define = (seed?: string): void => {
    setPrompt({ kind: "purpose", seed });
  };
  const slugProblem = (slug: string): string | undefined => {
    if (!surfaceSlug.test(slug)) return unnamedBotLine;
    return bots().some((bot) => bot.name === slug)
      ? `a bot named ${slug} already exists`
      : undefined;
  };
  const named = (purpose: string | undefined, slug: string): void => {
    const problem = slugProblem(slug);
    if (problem === undefined) {
      setPrompt({ kind: "scope", purpose, slug });
      return;
    }
    setNotice(problem);
    setPrompt({ kind: "slug", purpose, seed: slug });
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

  const create = async (
    slug: string,
    scope: BotScope,
    purpose: string | undefined,
  ): Promise<void> => {
    setPrompt(undefined);
    const draft = { slug, scope, ...(purpose !== undefined && { purpose }) };
    const created = await surfaces().verbs.createBot(draft);
    setNotice(isSurfaceRefusal(created) ? created.detail : `${botLabel(created)} defined`);
    await surfaces().refetch("bots");
  };

  props.onAction((action, argument) => {
    if (action === "bots.new") return define(argument);
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
      case "bots.release":
        return void switchTo(null);
    }
  });

  return (
    <section class="kw-ov kw-bots" aria-label="bots" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <button type="button" class="kw-ov-new" onClick={() => define()}>
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
      <Show when={asking("purpose")} keyed>
        {(asked) => (
          <DraftLine
            label="bot purpose"
            placeholder="what is this bot for? optional · enter skips"
            onSubmit={(purpose) =>
              setPrompt({
                kind: "slug",
                purpose: purpose === "" ? undefined : purpose,
                seed: asked.seed,
              })
            }
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <Show when={asking("slug")} keyed>
        {(asked) => (
          <DraftLine
            label="bot slug"
            initial={asked.seed}
            placeholder="slug · lowercase letters, digits, hyphens"
            onSubmit={(slug) => named(asked.purpose, slug)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <Show when={asking("scope")} keyed>
        {(asked) => (
          <ChoiceLine
            question={`scope for ${asked.slug}`}
            choices={scopeChoices}
            onChoose={(key) =>
              void create(asked.slug, scopeOfChoice[key] ?? "project", asked.purpose)
            }
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={surfaces().state.notices.bots} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}
