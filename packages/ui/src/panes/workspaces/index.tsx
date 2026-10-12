import { isSurfaceRefusal, type WorkspaceChoice } from "@keywork-app/protocol";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { z } from "zod";
import { describeFailure } from "../../host/port.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import {
  ConfirmLine,
  createCursor,
  DraftLine,
  NoticeLine,
  OverviewRow,
} from "../overview/rows.tsx";
import { definePane, type PaneProps } from "../registry.ts";

const workspacesSpec = z.object({ kind: z.literal("workspaces") });

export type WorkspacesSpec = z.output<typeof workspacesSpec>;

export const workspacesPane = definePane<WorkspacesSpec>({
  kind: "workspaces",
  spec: workspacesSpec,
  home: "left",
  attire: "house",
  title: () => "workspaces",
  emptyState: (keys) =>
    `only the root so far · ${keys.chord("workspaces.new")} declares a named workspace`,
  component: WorkspacesList,
  summon: {
    action: "workspaces.summon",
    chords: "none",
    help: "workspaces pane",
    command: { name: "workspaces", description: "open the workspaces pane" },
    spec: () => ({ kind: "workspaces" }),
  },
  localActions: {
    "workspaces.down": {
      chords: ["j", "down"],
      help: "next row",
      command: { name: "workspaces-next", description: "move to the next workspace or dir" },
    },
    "workspaces.up": {
      chords: ["k", "up"],
      help: "previous row",
      command: {
        name: "workspaces-previous",
        description: "move to the previous workspace or dir",
      },
    },
    "workspaces.use": {
      chords: "enter",
      help: "open this workspace (the server reopens)",
      command: { name: "workspace-use", description: "reopen keywork on this workspace" },
    },
    "workspaces.new": {
      chords: "n",
      help: "declare a named workspace",
      command: { name: "workspace-new", description: "declare a named workspace over this root" },
    },
    "workspaces.focus": {
      chords: "f",
      help: "add a focus dir",
      command: { name: "workspace-focus", description: "add a focus dir to this workspace" },
    },
    "workspaces.unfocus": {
      chords: "shift+f",
      help: "remove a focus dir",
      command: { name: "workspace-unfocus", description: "remove a focus dir from this workspace" },
    },
  },
});

export type WorkspaceRow =
  | { kind: "workspace"; choice: WorkspaceChoice }
  | { kind: "dir"; choice: WorkspaceChoice; dir: string };

export function workspaceRows(choices: readonly WorkspaceChoice[]): WorkspaceRow[] {
  return choices.flatMap((choice): WorkspaceRow[] => [
    { kind: "workspace", choice },
    ...choice.focusDirs.map((dir): WorkspaceRow => ({ kind: "dir", choice, dir })),
  ]);
}

export function workspaceAside(choice: WorkspaceChoice): string {
  const sessions = `${choice.sessions} ${choice.sessions === 1 ? "session" : "sessions"}`;
  if (!choice.declared) return "undeclared";
  return `${choice.notes} ${choice.notes === 1 ? "note" : "notes"} · ${sessions}`;
}

export function workspaceMark(choice: WorkspaceChoice): string {
  if (choice.current) return "█";
  return choice.declared ? "░" : " ";
}

export function slugOf(choice: WorkspaceChoice): string | null {
  return choice.slug ?? null;
}

type Prompt =
  | { kind: "use"; choice: WorkspaceChoice }
  | { kind: "name" }
  | { kind: "focus"; choice: WorkspaceChoice }
  | { kind: "unfocus"; choice: WorkspaceChoice; dir: string | undefined };

function WorkspacesList(props: PaneProps<WorkspacesSpec>) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const surfaces = () => props.shell.store.surfaces;
  const rows = createMemo(() => workspaceRows(surfaces().state.workspaces));
  const cursor = createCursor(() => rows().length);
  const [prompt, setPrompt] = createSignal<Prompt>();
  const [notice, setNotice] = createSignal<string>();
  const atCursor = (): WorkspaceRow | undefined => rows()[cursor.index()];
  const promptOf = <K extends Prompt["kind"]>(
    kind: K,
  ): Extract<Prompt, { kind: K }> | undefined => {
    const pending = prompt();
    return pending?.kind === kind ? (pending as Extract<Prompt, { kind: K }>) : undefined;
  };

  const reload = async (): Promise<void> => {
    await surfaces().refetch("workspaces");
  };

  const use = async (choice: WorkspaceChoice): Promise<void> => {
    setPrompt(undefined);
    const outcome = await surfaces().verbs.useWorkspace(slugOf(choice));
    if (isSurfaceRefusal(outcome)) {
      setNotice(outcome.detail);
      return;
    }
    if (!outcome.reopens) {
      setNotice(`${choice.name} is remembered for the next launch`);
      return;
    }
    setNotice(`reopening keywork on ${choice.name}…`);
    const reopened = await props.shell.host.restartServer(props.shell.workspace);
    if (!reopened.ok) {
      setNotice(describeFailure(reopened.failure));
      return;
    }
    setNotice(`keywork reopened on ${choice.name}`);
    await props.shell.store.refresh();
    await surfaces().load();
  };

  const create = async (slug: string): Promise<void> => {
    setPrompt(undefined);
    if (slug === "") return;
    const outcome = await surfaces().verbs.createWorkspace(slug);
    setNotice(isSurfaceRefusal(outcome) ? outcome.detail : `${slug} declared`);
    await reload();
  };

  const focus = async (choice: WorkspaceChoice, dir: string): Promise<void> => {
    setPrompt(undefined);
    if (dir === "") return;
    const outcome = await surfaces().verbs.focusWorkspaceDir(slugOf(choice), dir);
    setNotice(isSurfaceRefusal(outcome) ? outcome.detail : `${outcome.dir} focused`);
    await reload();
  };

  const unfocus = async (choice: WorkspaceChoice, dir: string): Promise<void> => {
    setPrompt(undefined);
    if (dir === "") return;
    const outcome = await surfaces().verbs.unfocusWorkspaceDir(slugOf(choice), dir);
    setNotice(isSurfaceRefusal(outcome) ? outcome.detail : `${outcome.dir} unfocused`);
    await reload();
  };

  props.onAction((action) => {
    if (prompt() !== undefined) {
      setPrompt(undefined);
      return;
    }
    const row = atCursor();
    switch (action) {
      case "workspaces.down":
        return cursor.move(1);
      case "workspaces.up":
        return cursor.move(-1);
      case "workspaces.use":
        if (row !== undefined && !row.choice.current)
          setPrompt({ kind: "use", choice: row.choice });
        return;
      case "workspaces.new":
        return setPrompt({ kind: "name" });
      case "workspaces.focus":
        if (row !== undefined) setPrompt({ kind: "focus", choice: row.choice });
        return;
      case "workspaces.unfocus":
        if (row === undefined) return;
        if (row.kind === "dir") void unfocus(row.choice, row.dir);
        else setPrompt({ kind: "unfocus", choice: row.choice, dir: undefined });
        return;
    }
  });

  return (
    <section class="kw-ov kw-workspaces" aria-label="workspaces" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <button type="button" class="kw-ov-new" onClick={() => setPrompt({ kind: "name" })}>
          + new workspace
        </button>
        <span class="kw-ov-head-detail">enter opens · f focuses a dir</span>
      </div>
      <Show
        when={rows().length > 0}
        fallback={<EmptyState line={workspacesPane.emptyState(props.shell.keys)} />}
      >
        <ol class="kw-ov-list">
          <For each={rows()}>
            {(row, index) => (
              <Switch>
                <Match when={row.kind === "workspace" ? row : undefined}>
                  {(item) => (
                    <OverviewRow
                      cursor={index() === cursor.index()}
                      muted={!item().choice.declared}
                      mark={workspaceMark(item().choice)}
                      density={item().choice.current ? "full" : "medium"}
                      aside={workspaceAside(item().choice)}
                      onClick={() => cursor.set(index())}
                    >
                      {item().choice.name}
                      <Show when={item().choice.current}> · open</Show>
                    </OverviewRow>
                  )}
                </Match>
                <Match when={row.kind === "dir" ? row : undefined}>
                  {(item) => (
                    <OverviewRow
                      cursor={index() === cursor.index()}
                      indent
                      mark="·"
                      density="light"
                      aside="focus"
                      onClick={() => cursor.set(index())}
                    >
                      {item().dir}
                    </OverviewRow>
                  )}
                </Match>
              </Switch>
            )}
          </For>
        </ol>
      </Show>
      <Show when={promptOf("use")}>
        {(ask) => (
          <ConfirmLine
            question={`open ${ask().choice.name}? keywork serve restarts on it`}
            onConfirm={() => void use(ask().choice)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <Show when={promptOf("name")}>
        <DraftLine
          label="workspace slug"
          onSubmit={(slug) => void create(slug)}
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={promptOf("focus")}>
        {(ask) => (
          <DraftLine
            label={`focus dir in ${ask().choice.name}`}
            placeholder="a dir under the root"
            onSubmit={(dir) => void focus(ask().choice, dir)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <Show when={promptOf("unfocus")}>
        {(ask) => (
          <DraftLine
            label={`unfocus dir in ${ask().choice.name}`}
            initial={ask().dir}
            onSubmit={(dir) => void unfocus(ask().choice, dir)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={surfaces().state.notices.workspaces} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}
