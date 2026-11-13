import {
  type ChangesState,
  changesByTurn,
  countsOf,
  type TurnGroup,
  verdictFor,
} from "@keywork-app/client";
import type { ChangedFileReading, ChangedPath, HunkVerdict } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { z } from "zod";
import type { HostPort } from "../../host/port.ts";
import { tierOf, type WidthTier } from "../../page/tiers.ts";
import { ControlRow } from "../conversation/control-row.tsx";
import { EmptyState } from "../empty-state.tsx";
import { landFileAt } from "../file/landing.ts";
import { rereadOnReturn } from "../file/rereading.ts";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type KeyHints, type PaneProps } from "../registry.ts";
import {
  type MergeHunk,
  type MergeMount,
  mergeLayoutFor,
  mountMergeView,
  type ScrollMove,
} from "./merge-view.ts";
import { unifiedPatch } from "./patch.ts";
import {
  changedNotice,
  createReviewTrail,
  fileTallyLine,
  hunkPlace,
  markedNotice,
  noHunkNotice,
  type ReviewTrail,
  referenceOf,
  sessionGoneNotice,
  shownReviewLine,
  talkedNotice,
  talkLabel,
  talkMessage,
  unwiredNotice,
  verdictActions,
} from "./review.ts";
import { createTurnVerbs, TurnVerbRow, type TurnVerbs } from "./turn-verbs.tsx";
import "./diff.css";

const diffSpec = z.object({
  kind: z.literal("diff"),
  sessionId: z.string().optional(),
  path: z.string().optional(),
});

export type DiffSpec = z.output<typeof diffSpec>;

export const noBaselineLine = "no baseline · checkpoints are off and this isn't a git repository";

export const compactBelowPx = 420;

export const diffPane = definePane<DiffSpec>({
  kind: "diff",
  heading: "in changes",
  spec: diffSpec,
  home: "right",
  attire: "work",
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
      help: "next file, or down a line in a diff",
      command: {
        name: "diff-next-file",
        description: "move to the next changed file, or scroll the open diff down a line",
      },
    },
    "diff.up": {
      chords: ["k", "up"],
      help: "previous file, or up a line in a diff",
      command: {
        name: "diff-previous-file",
        description: "move to the previous changed file, or scroll the open diff up a line",
      },
    },
    "diff.page-down": {
      chords: ["pagedown", "space"],
      help: "down a page",
      command: { name: "diff-page-down", description: "scroll the open diff down a page" },
    },
    "diff.page-up": {
      chords: "pageup",
      help: "up a page",
      command: { name: "diff-page-up", description: "scroll the open diff up a page" },
    },
    "diff.top": {
      chords: ["g", "home"],
      help: "the top",
      command: { name: "diff-top", description: "go to the first file, or the top of the diff" },
    },
    "diff.end": {
      chords: ["shift+g", "end"],
      help: "the end",
      command: { name: "diff-end", description: "go to the last file, or the end of the diff" },
    },
    "diff.open": {
      chords: "enter",
      help: "open the file's diff",
      command: { name: "diff-open", description: "show this file before and after" },
    },
    "diff.file": {
      chords: "f",
      help: "show the file itself",
      command: {
        name: "diff-file",
        description: "show the changed file as it reads now, at the hunk under the cursor",
      },
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
    "diff.keep": {
      chords: "y",
      help: "mark this hunk kept",
      command: {
        name: "keep-hunk",
        description: "record a keep mark on the hunk under the cursor; nothing on disk changes",
      },
    },
    "diff.drop": {
      chords: "d",
      help: "mark this hunk dropped (the file keeps it)",
      command: {
        name: "drop-hunk",
        description:
          "record a drop mark on the hunk under the cursor; the file stays as it is and the agent is not told",
      },
    },
    "diff.ask": {
      chords: "a",
      help: "ask about this hunk",
      command: {
        name: "ask-hunk",
        description: "park the hunk under the cursor as a question that waits on you",
      },
    },
    "diff.talk": {
      chords: "t",
      help: "talk to the diff",
      command: {
        name: "talk-to-diff",
        description: "quote the hunk under the cursor into the thread with your words",
      },
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
    "diff.copy": {
      chords: "none",
      help: "copy the diff as a patch",
      command: {
        name: "copy-diff",
        aliases: ["copy-hunk"],
        description: "copy the open file's diff, or the one under the cursor, as a patch",
      },
    },
  },
  onRestore: (spec, shell) => {
    if (spec.sessionId !== undefined) void shell.store.openChanges(spec.sessionId);
  },
});

export async function copiedPatchLine(
  host: Pick<HostPort, "writeClipboard">,
  reading: ChangedFileReading | undefined,
): Promise<string> {
  if (reading === undefined || typeof reading === "string") {
    return "nothing to copy · this file has no diff to read";
  }
  if (reading.note === "binary") return "nothing to copy · a binary file has no text diff";
  const patch = unifiedPatch(reading);
  if (patch === "") return "nothing to copy · the file reads the same before and after";
  try {
    await host.writeClipboard(patch);
  } catch {
    return "the clipboard refused it";
  }
  return `copied the diff of ${reading.path} · ${patch.length} chars`;
}

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
  const verbs = createTurnVerbs(props.shell, () => props.sessionId, props.shell.keys);
  const trail = createReviewTrail(props.shell, () => props.sessionId);
  createEffect(() => {
    void props.shell.store.openChanges(props.sessionId);
  });
  return (
    <Show
      keyed
      when={props.spec.path}
      fallback={<FilesLevel {...props} verbs={verbs} trail={trail} />}
    >
      {(path) => <FileLevel {...props} path={path} verbs={verbs} trail={trail} />}
    </Show>
  );
}

type LevelProps = PaneProps<DiffSpec> & { sessionId: string; verbs: TurnVerbs; trail: ReviewTrail };

function turnVerb(action: string, verbs: TurnVerbs): void {
  if (action === "diff.undo") void verbs.undo();
  if (action === "diff.redo") void verbs.redo();
}

function answeringFirst(verbs: TurnVerbs, act: (action: string) => void) {
  return (action: string): void => {
    if (verbs.asking() === undefined) act(action);
    else verbs.answer(false);
  };
}

function FilesLevel(props: LevelProps) {
  const [cursor, setCursor] = createSignal(0);
  const changes = () => props.shell.store.changes(props.sessionId);
  const groups = createMemo((): TurnGroup[] => changesByTurn(changes().files));
  const files = createMemo((): ChangedPath[] => groups().flatMap((group) => [...group.files]));
  const lastFile = (): number => Math.max(files().length - 1, 0);
  const open = (file: ChangedPath | undefined): void => {
    if (file === undefined) return;
    props.shell.rebind(props.id, { kind: "diff", sessionId: props.sessionId, path: file.path });
  };
  const showFile = (file: ChangedPath | undefined): void => {
    if (file !== undefined) props.shell.openPane({ kind: "file", path: file.path });
  };

  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused && props.verbs.asking() === undefined,
  );

  const [copied, setCopied] = createSignal<string>();
  const copyAtCursor = async (): Promise<void> => {
    const file = files()[cursor()];
    if (file === undefined) {
      setCopied("nothing to copy · no changed file here");
      return;
    }
    const reading = await props.shell.store.changedFile(props.sessionId, file.path);
    setCopied(await copiedPatchLine(props.shell.host, reading));
  };

  props.onAction(
    answeringFirst(props.verbs, (action) => {
      switch (action) {
        case "diff.down":
          setCursor((at) => Math.min(at + 1, lastFile()));
          break;
        case "diff.up":
          setCursor((at) => Math.max(at - 1, 0));
          break;
        case "diff.top":
          setCursor(0);
          break;
        case "diff.end":
          setCursor(lastFile());
          break;
        case "diff.open":
          open(files()[cursor()]);
          break;
        case "diff.file":
          showFile(files()[cursor()]);
          break;
        case "diff.refresh":
          void props.shell.store.openChanges(props.sessionId, { force: true });
          void props.trail.reload();
          break;
        case "diff.copy":
          void copyAtCursor();
          break;
        default:
          turnVerb(action, props.verbs);
      }
    }),
  );

  return (
    <section class="kw-diff" aria-label="changed files" tabIndex={-1} ref={root}>
      <TurnVerbRow verbs={props.verbs} keys={props.shell.keys} />
      <Show when={copied()}>{(line) => <p class="kw-diff-note">{line()}</p>}</Show>
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
                        <span class="kw-diff-counts">
                          {countsOf(file)}
                          <Show when={fileTallyLine(props.trail.marks(), file.path)}>
                            {(tally) => <span class="kw-diff-review-tally"> · {tally()}</span>}
                          </Show>
                        </span>
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

const scrollMoves: Readonly<Record<string, ScrollMove>> = {
  "diff.down": "line-down",
  "diff.up": "line-up",
  "diff.page-down": "page-down",
  "diff.page-up": "page-up",
  "diff.top": "top",
  "diff.end": "end",
};

function FileLevel(props: LevelProps & { path: string }) {
  const [reading, setReading] = createSignal<ChangedFileReading | undefined>(undefined, {
    equals: sameReading,
  });
  const [tier, setTier] = createSignal<WidthTier>("column");
  const [compact, setCompact] = createSignal(false);
  const [hunks, setHunks] = createSignal<readonly MergeHunk[]>([]);
  const [at, setAt] = createSignal(0);
  const [talking, setTalking] = createSignal(false);
  const [said, setSaid] = createSignal<string>();
  let host: HTMLDivElement | undefined;
  let root: HTMLElement | undefined;
  let mounted: MergeMount | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused && props.verbs.asking() === undefined && !talking(),
  );
  const back = (): void =>
    props.shell.rebind(props.id, { kind: "diff", sessionId: props.sessionId });
  const sides = () => {
    const file = reading();
    if (file === undefined || typeof file === "string") return undefined;
    if (file.before === null && file.after === null) return undefined;
    return { before: file.before ?? "", after: file.after ?? "", path: props.path };
  };
  const refusal = (): string | undefined => {
    const file = reading();
    if (file === "missing") return "this session is gone";
    if (file === "no-baseline") return noBaselineLine;
    if (file === "outside-scope") return "this path is outside the workspace";
    return undefined;
  };
  const facts = (): string | undefined => {
    const file = reading();
    return typeof file === "object" ? fileNote(file) : undefined;
  };
  const reread = (): void => {
    void props.shell.store.changedFile(props.sessionId, props.path).then((fresh) => {
      const shown = untrack(reading);
      setReading(fresh);
      if (shown !== undefined && !sameReading(shown, fresh)) setSaid(changedNotice);
    });
  };

  const settledListing = createMemo(() => {
    const changes = props.shell.store.changes(props.sessionId);
    return changes.stale ? undefined : changes.files;
  });
  createEffect(
    on(
      settledListing,
      (files) => {
        if (files !== undefined) reread();
      },
      { defer: true },
    ),
  );
  rereadOnReturn(() => props.focused, reread);
  reread();

  onMount(() => {
    const measure = (): void => {
      if (host !== undefined && host.clientWidth > 0) setTier(tierOf(host.clientWidth));
      if (root !== undefined && root.clientHeight > 0) {
        setCompact(root.clientHeight < compactBelowPx);
      }
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    for (const element of [host, root]) if (element !== undefined) observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const pair = sides();
    const layout = mergeLayoutFor(tier(), pair);
    const kept =
      mounted === undefined ? undefined : { offset: mounted.scrollOffset(), hunk: untrack(at) };
    mounted?.destroy();
    mounted = undefined;
    if (host === undefined || pair === undefined) {
      setHunks([]);
      setAt(0);
      return;
    }
    host.replaceChildren();
    mounted = mountMergeView(host, pair, layout);
    const shown = mounted.hunks();
    setHunks(shown);
    setAt(Math.min(kept?.hunk ?? 0, Math.max(shown.length - 1, 0)));
    if (kept !== undefined) mounted.scrollToOffset(kept.offset);
  });
  onCleanup(() => mounted?.destroy());

  const current = (): MergeHunk | undefined => hunks()[at()];
  const reference = () => {
    const hunk = current();
    return hunk === undefined ? undefined : referenceOf(props.path, hunk);
  };
  const go = (index: number): void => {
    const bounded = Math.max(0, Math.min(index, hunks().length - 1));
    setAt(bounded);
    mounted?.goToHunk(bounded);
  };
  const stepOn = (): void => {
    if (at() < hunks().length - 1) go(at() + 1);
  };
  const scroll = (move: ScrollMove): void => {
    if (mounted === undefined) return;
    mounted.scroll(move);
    const inView = mounted.hunksInView();
    const first = inView[0];
    if (first !== undefined && !inView.includes(at())) setAt(first);
  };
  const showFile = (): void => {
    const hunk = current();
    if (hunk !== undefined) {
      landFileAt({ path: props.path, line: hunk.line, lines: hunk.added.length });
    }
    props.shell.openPane({ kind: "file", path: props.path });
  };
  const judge = async (verdict: HunkVerdict): Promise<void> => {
    const hunk = reference();
    if (hunk === undefined) {
      setSaid(noHunkNotice);
      return;
    }
    const recorded = await props.shell.client.recordHunkVerdict(props.sessionId, {
      ...hunk,
      verdict,
    });
    if (typeof recorded === "string") {
      setSaid(recorded === "missing" ? sessionGoneNotice : unwiredNotice);
      return;
    }
    props.trail.fold(recorded);
    setSaid(markedNotice(recorded, props.shell.keys.chord("diff.talk")));
    stepOn();
  };
  const talk = async (words: string): Promise<void> => {
    setTalking(false);
    const hunk = current();
    const ref = reference();
    if (hunk === undefined || ref === undefined) {
      setSaid(noHunkNotice);
      return;
    }
    const outcome = await props.shell.store.prompt(
      props.sessionId,
      talkMessage(props.path, hunk, words),
      "steer",
    );
    setSaid(outcome === "missing" ? sessionGoneNotice : talkedNotice(ref));
  };

  const [copied, setCopied] = createSignal<string>();

  props.onAction(
    answeringFirst(props.verbs, (action) => {
      const verdict = verdictActions[action];
      if (verdict !== undefined) {
        void judge(verdict);
        return;
      }
      const move = scrollMoves[action];
      if (move !== undefined) {
        scroll(move);
        return;
      }
      switch (action) {
        case "diff.back":
          back();
          break;
        case "diff.file":
          showFile();
          break;
        case "diff.next":
          go(at() + 1);
          break;
        case "diff.prev":
          go(at() - 1);
          break;
        case "diff.talk":
          setTalking(hunks().length > 0);
          if (hunks().length === 0) setSaid(noHunkNotice);
          break;
        case "diff.refresh":
          reread();
          void props.trail.reload();
          break;
        case "diff.copy":
          void copiedPatchLine(props.shell.host, reading()).then(setCopied);
          break;
        default:
          turnVerb(action, props.verbs);
      }
    }),
  );

  return (
    <section
      class="kw-diff"
      aria-label="file diff"
      tabIndex={-1}
      ref={root}
      data-compact={compact() ? "" : undefined}
    >
      <TurnVerbRow verbs={props.verbs} keys={props.shell.keys} />
      <Show when={copied()}>{(line) => <p class="kw-diff-note">{line()}</p>}</Show>
      <div class="kw-diff-head">
        <button type="button" class="kw-diff-back" onClick={back}>
          ‹ changes
        </button>
        <span class="kw-diff-head-path">{props.path}</span>
        <Show when={facts()}>{(line) => <span class="kw-diff-head-facts">{line()}</span>}</Show>
        <span class="kw-diff-head-hunks">{hunkWord(hunks().length)}</span>
        <span class="kw-diff-head-links">
          <button type="button" class="kw-diff-show" onClick={showFile}>
            the file
          </button>
          <Show when={props.shell.openInEditor}>
            {(openInEditor) => (
              <button
                type="button"
                class="kw-diff-editor"
                onClick={() =>
                  void openInEditor()(props.path, current()?.line ?? 1).catch(() => undefined)
                }
              >
                open in editor
              </button>
            )}
          </Show>
        </span>
      </div>
      <Show when={refusal()}>{(line) => <p class="kw-diff-note">{line()}</p>}</Show>
      <Show when={hunks().length > 0}>
        <ReviewRow
          place={hunkPlace(at() + 1, hunks().length)}
          verdict={verdictFor(
            props.trail.marks(),
            reference() ?? { path: "", header: "", digest: "" },
          )}
          reviewed={shownReviewLine(props.trail.marks(), props.path, hunks())}
          keys={props.shell.keys}
        />
      </Show>
      <Show when={talking()}>
        <ControlRow
          ask={{ kind: "text", label: talkLabel, initial: "", choices: [] }}
          lines={[]}
          onAnswer={(words) => void talk(words)}
          onConfirm={() => setTalking(false)}
          onDismiss={() => setTalking(false)}
        />
      </Show>
      <Show when={said()}>{(line) => <output class="kw-diff-note">{line()}</output>}</Show>
      <div class="kw-diff-merge" data-layout={mergeLayoutFor(tier(), sides())} ref={host} />
    </section>
  );
}

function ReviewRow(props: {
  place: string;
  verdict: HunkVerdict | undefined;
  reviewed: string;
  keys: KeyHints;
}) {
  return (
    <div class="kw-diff-review">
      <span class="kw-diff-review-place">{props.place}</span>
      <span class="kw-diff-review-verdict" data-verdict={props.verdict}>
        {props.verdict ?? "unreviewed"}
      </span>
      <span class="kw-diff-review-keys">
        <span class="kw-diff-review-marks">
          mark <span class="kw-diff-review-key">{props.keys.chord("diff.keep")} keep</span>
          <span class="kw-diff-review-key">{props.keys.chord("diff.drop")} drop</span>
          <span class="kw-diff-review-key">{props.keys.chord("diff.ask")} ask</span>
        </span>
        <span class="kw-diff-review-key">{props.keys.chord("diff.talk")} talk</span>
      </span>
      <span class="kw-diff-review-reviewed">{props.reviewed}</span>
    </div>
  );
}

function sameReading(
  left: ChangedFileReading | undefined,
  right: ChangedFileReading | undefined,
): boolean {
  if (typeof left !== "object" || typeof right !== "object") return left === right;
  return (
    left.path === right.path &&
    left.before === right.before &&
    left.after === right.after &&
    left.note === right.note &&
    left.truncated === right.truncated
  );
}

function hunkWord(count: number): string {
  return count === 1 ? "1 hunk" : `${count} hunks`;
}
