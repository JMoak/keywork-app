import { type ChangesState, changesByTurn, countsOf, type TurnGroup } from "@keywork-app/client";
import type { ChangedFileReading, ChangedPath } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { tierOf, type WidthTier } from "../../page/tiers.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type PaneProps } from "../registry.ts";
import { type MergeMount, mergeLayoutFor, mountMergeView } from "./merge-view.ts";
import { createTurnVerbs, TurnVerbRow, type TurnVerbs } from "./turn-verbs.tsx";
import "./diff.css";

const diffSpec = z.object({
  kind: z.literal("diff"),
  sessionId: z.string().optional(),
  path: z.string().optional(),
});

export type DiffSpec = z.output<typeof diffSpec>;

export const noBaselineLine = "no baseline · checkpoints are off and this isn't a git repository";

export const diffPane = definePane<DiffSpec>({
  kind: "diff",
  spec: diffSpec,
  home: "right",
  title: (spec) => (spec.path === undefined ? "changes" : `changes · ${spec.path}`),
  emptyState: (keys) =>
    `nothing changed yet · ${keys.chord("diff.summon")} follows the session's files`,
  component: DiffSlot,
  summon: {
    action: "diff.summon",
    chords: "leader g",
    help: "changes pane",
    command: { name: "changes", description: "files this session changed", aliases: ["diff"] },
    spec: (shell) => ({ kind: "diff", sessionId: shell.currentSession() }),
  },
  localActions: {
    "diff.down": {
      chords: ["j", "down"],
      help: "next file",
      command: { name: "diff-next-file", description: "move to the next changed file" },
    },
    "diff.up": {
      chords: ["k", "up"],
      help: "previous file",
      command: { name: "diff-previous-file", description: "move to the previous changed file" },
    },
    "diff.open": {
      chords: "enter",
      help: "open the file's diff",
      command: { name: "diff-open", description: "show this file before and after" },
    },
    "diff.back": {
      chords: "escape",
      help: "back to the file list",
      command: { name: "diff-back", description: "leave the file for the list of changes" },
    },
    "diff.next": {
      chords: "n",
      help: "next hunk",
      command: { name: "next-hunk", description: "jump to the next changed hunk" },
    },
    "diff.prev": {
      chords: "p",
      help: "previous hunk",
      command: { name: "previous-hunk", description: "jump to the previous changed hunk" },
    },
    "diff.refresh": {
      chords: "r",
      help: "refresh",
      command: { name: "diff-refresh", description: "reread the changed files" },
    },
    "diff.undo": {
      chords: "u",
      help: "undo the last prompt",
      command: {
        name: "undo-turn",
        description: "take back the last prompt, its turn and the files it changed",
      },
    },
    "diff.redo": {
      chords: "shift+u",
      help: "redo what undo took",
      command: { name: "redo-turn", description: "bring back the turn and files the undo took" },
    },
  },
  onRestore: (spec, shell) => {
    if (spec.sessionId !== undefined) void shell.store.openChanges(spec.sessionId);
  },
});

export function availabilityLine(state: ChangesState): string | undefined {
  return state.availability === "no-baseline" ? noBaselineLine : undefined;
}

export function fileNote(reading: Exclude<ChangedFileReading, string>): string | undefined {
  const notes: string[] = [];
  if (reading.note === "binary") notes.push("binary · no text to show");
  if (reading.note === "new") notes.push("new file");
  if (reading.note === "deleted") notes.push("deleted");
  if (reading.note === "unreadable") notes.push("unreadable on both sides");
  if (reading.truncated) notes.push("truncated at 1 MiB per side");
  return notes.length === 0 ? undefined : notes.join(" · ");
}

function DiffSlot(props: PaneProps<DiffSpec>) {
  return (
    <Show
      keyed
      when={props.spec.sessionId}
      fallback={<EmptyState line={diffPane.emptyState(props.shell.keys)} />}
    >
      {(sessionId) => <SessionDiff {...props} sessionId={sessionId} />}
    </Show>
  );
}

function SessionDiff(props: PaneProps<DiffSpec> & { sessionId: string }) {
  const verbs = createTurnVerbs(props.shell, () => props.sessionId);
  return (
    <Show keyed when={props.spec.path} fallback={<FilesLevel {...props} verbs={verbs} />}>
      {(path) => <FileLevel {...props} path={path} verbs={verbs} />}
    </Show>
  );
}

type LevelProps = PaneProps<DiffSpec> & { sessionId: string; verbs: TurnVerbs };

function turnVerb(action: string, verbs: TurnVerbs): void {
  if (action === "diff.undo") void verbs.undo();
  if (action === "diff.redo") void verbs.redo();
}

function FilesLevel(props: LevelProps) {
  const [cursor, setCursor] = createSignal(0);
  const changes = () => props.shell.store.changes(props.sessionId);
  const groups = createMemo((): TurnGroup[] => changesByTurn(changes().files));
  const files = createMemo((): ChangedPath[] => groups().flatMap((group) => [...group.files]));
  const open = (file: ChangedPath | undefined): void => {
    if (file === undefined) return;
    props.shell.rebind(props.id, { kind: "diff", sessionId: props.sessionId, path: file.path });
  };

  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );

  createEffect(() => {
    void props.shell.store.openChanges(props.sessionId);
  });

  props.onAction((action) => {
    switch (action) {
      case "diff.down":
        setCursor((at) => Math.min(at + 1, Math.max(files().length - 1, 0)));
        break;
      case "diff.up":
        setCursor((at) => Math.max(at - 1, 0));
        break;
      case "diff.open":
        open(files()[cursor()]);
        break;
      case "diff.refresh":
        void props.shell.store.openChanges(props.sessionId, { force: true });
        break;
      default:
        turnVerb(action, props.verbs);
    }
  });

  return (
    <section class="kw-diff" aria-label="changed files" tabIndex={-1} ref={root}>
      <TurnVerbRow verbs={props.verbs} keys={props.shell.keys} />
      <Show when={availabilityLine(changes())}>
        {(line) => <p class="kw-diff-unavailable">{line()}</p>}
      </Show>
      <Show when={changes().availability === "ready" && files().length === 0}>
        <EmptyState line={diffPane.emptyState(props.shell.keys)} />
      </Show>
      <ol class="kw-diff-turns" data-stale={changes().stale ? "" : undefined}>
        <For each={groups()}>
          {(group) => (
            <li class="kw-diff-turn">
              <span class="kw-diff-turn-stamp">
                {group.turn === undefined ? "before this session" : `turn ${group.turn}`}
              </span>
              <ol class="kw-diff-files">
                <For each={group.files}>
                  {(file) => (
                    <li
                      class="kw-diff-file"
                      data-cursor={props.focused && files()[cursor()] === file ? "" : undefined}
                    >
                      <button
                        type="button"
                        class="kw-diff-file-row"
                        onClick={() => {
                          setCursor(files().indexOf(file));
                          open(file);
                        }}
                      >
                        <span class="kw-diff-path">{file.path}</span>
                        <span class="kw-diff-counts">{countsOf(file)}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}

function FileLevel(props: LevelProps & { path: string }) {
  const [reading, setReading] = createSignal<ChangedFileReading>();
  const [tier, setTier] = createSignal<WidthTier>("column");
  const [hunks, setHunks] = createSignal(0);
  let host: HTMLDivElement | undefined;
  let root: HTMLElement | undefined;
  let mounted: MergeMount | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const back = (): void =>
    props.shell.rebind(props.id, { kind: "diff", sessionId: props.sessionId });
  const sides = () => {
    const file = reading();
    if (file === undefined || typeof file === "string") return undefined;
    if (file.before === null && file.after === null) return undefined;
    return { before: file.before ?? "", after: file.after ?? "", path: props.path };
  };
  const problem = (): string | undefined => {
    const file = reading();
    if (file === "missing") return "this session is gone";
    if (file === "no-baseline") return noBaselineLine;
    if (file === "outside-scope") return "this path is outside the workspace";
    return file === undefined ? undefined : fileNote(file);
  };

  createEffect(() => {
    void props.shell.store.changedFile(props.sessionId, props.path).then(setReading);
  });

  onMount(() => {
    if (host === undefined) return;
    const measure = (): void => {
      if (host !== undefined && host.clientWidth > 0) setTier(tierOf(host.clientWidth));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const pair = sides();
    const layout = mergeLayoutFor(tier());
    mounted?.destroy();
    mounted = undefined;
    if (host === undefined || pair === undefined) return;
    host.replaceChildren();
    mounted = mountMergeView(host, pair, layout);
    setHunks(mounted.hunkCount());
  });
  onCleanup(() => mounted?.destroy());

  props.onAction((action) => {
    switch (action) {
      case "diff.back":
        back();
        break;
      case "diff.next":
        mounted?.nextHunk();
        break;
      case "diff.prev":
        mounted?.previousHunk();
        break;
      case "diff.refresh":
        void props.shell.store.changedFile(props.sessionId, props.path).then(setReading);
        break;
      default:
        turnVerb(action, props.verbs);
    }
  });

  return (
    <section class="kw-diff" aria-label="file diff" tabIndex={-1} ref={root}>
      <TurnVerbRow verbs={props.verbs} keys={props.shell.keys} />
      <div class="kw-diff-head">
        <button type="button" class="kw-diff-back" onClick={back}>
          ‹ changes
        </button>
        <span class="kw-diff-head-path">{props.path}</span>
        <span class="kw-diff-head-hunks">{hunkWord(hunks())}</span>
        <Show when={props.shell.openInEditor}>
          {(openInEditor) => (
            <button
              type="button"
              class="kw-diff-editor"
              onClick={() => void openInEditor()(props.path, 1).catch(() => undefined)}
            >
              open in editor
            </button>
          )}
        </Show>
      </div>
      <Show when={problem()}>{(line) => <p class="kw-diff-note">{line()}</p>}</Show>
      <div class="kw-diff-merge" data-layout={mergeLayoutFor(tier())} ref={host} />
    </section>
  );
}

function hunkWord(count: number): string {
  return count === 1 ? "1 hunk" : `${count} hunks`;
}
