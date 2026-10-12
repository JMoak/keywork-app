import {
  type FileRange,
  type FileReading,
  type FileSlice,
  sliceReachesEnd,
} from "@keywork-app/protocol";
import { createEffect, createSignal, Match, onCleanup, Show, Switch, untrack } from "solid-js";
import { z } from "zod";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import {
  fileUrlOf,
  lineLabel,
  openingRange,
  rangeAfter,
  rangeBefore,
  sliceFacts,
  tailRange,
} from "./range.ts";
import { defaultFilePath, lastAgentFile } from "./recent.ts";
import { mountTextView, type TextMount } from "./text-view.ts";
import "./file.css";

const fileSpec = z.object({
  kind: z.literal("file"),
  path: z.string(),
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
  atEnd: z.boolean().optional(),
});

export type FileSpec = z.output<typeof fileSpec>;

export type TextSlice = Omit<FileSlice, "path">;

export type TextRefusal = Exclude<FileReading, FileSlice>;

export type FileState =
  | { kind: "loading" }
  | { kind: "loaded"; slice: TextSlice }
  | { kind: "refused"; reading: TextRefusal; spec: FileSpec }
  | { kind: "failed"; reason: string };

export const filePane = definePane<FileSpec>({
  kind: "file",
  spec: fileSpec,
  home: "main",
  attire: "work",
  title: (spec) => spec.path,
  emptyState: (keys) => `an empty file · ${keys.chord("browser.summon")} picks another`,
  component: FileSlot,
  summon: {
    action: "file.summon",
    chords: "none",
    help: "open the agent's last file",
    command: { name: "open", description: "open the file the agent touched last" },
    spec: () => ({ kind: "file", path: lastAgentFile() ?? defaultFilePath }),
  },
  localActions: {
    "file.top": {
      chords: "g",
      help: "the top of the file",
      command: { name: "file-top", description: "read from the start of this file" },
    },
    "file.end": {
      chords: "shift+g",
      help: "the end of the file",
      command: { name: "file-end", description: "read the tail of this file" },
    },
    "file.next": {
      chords: "]",
      help: "the next slice",
      command: { name: "file-next", description: "load the slice after this one" },
    },
    "file.previous": {
      chords: "[",
      help: "the previous slice",
      command: { name: "file-previous", description: "load the slice before this one" },
    },
    "file.down": {
      chords: ["j", "down"],
      help: "scroll down",
      command: { name: "file-down", description: "scroll this file down a line" },
    },
    "file.up": {
      chords: ["k", "up"],
      help: "scroll up",
      command: { name: "file-up", description: "scroll this file up a line" },
    },
    "file.editor": {
      chords: "o",
      help: "open in your editor",
      command: { name: "file-editor", description: "open this file in the system editor" },
    },
  },
});

export function describeRefusal(reading: TextRefusal, path: string): string {
  switch (reading) {
    case "missing":
      return `no file at ${path}`;
    case "outside-scope":
      return `${path} is outside the workspace`;
    case "too-large":
      return `${path} is over 20 MiB · the server refuses to read it whole`;
    case "binary":
      return `${path} holds binary bytes · nothing to show as text`;
  }
}

function FileSlot(props: PaneProps<FileSpec>) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const [state, setState] = createSignal<FileState>({ kind: "loading" });
  const [mount, setMount] = createSignal<TextMount>();
  const [editorRefusal, setEditorRefusal] = createSignal<string>();
  let holder: HTMLDivElement | undefined;

  const slice = (): TextSlice | undefined => {
    const current = state();
    return current.kind === "loaded" ? current.slice : undefined;
  };

  let landing: Edge = "top";

  const read = async (
    range: FileRange | "tail",
    landAt: Edge = landingOf(range),
  ): Promise<void> => {
    landing = landAt;
    setState({ kind: "loading" });
    try {
      const wanted = range === "tail" ? await tailOf(props.shell, props.spec) : range;
      const reading =
        wanted === undefined ? "missing" : await readSlice(props.shell, props.spec, wanted);
      setState(
        typeof reading === "string"
          ? { kind: "refused", reading, spec: props.spec }
          : { kind: "loaded", slice: reading },
      );
    } catch (cause) {
      setState({ kind: "failed", reason: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  createEffect(() => {
    void read(openingRange(props.spec));
  });

  createEffect(() => {
    const current = state();
    if (current.kind === "loading") return;
    const loaded =
      current.kind === "loaded" && current.slice.text !== "" ? current.slice : undefined;
    if (loaded === undefined || holder === undefined) {
      untrack(mount)?.destroy();
      setMount(undefined);
      return;
    }
    const numbering = { label: (index: number) => lineLabel(loaded, index) };
    const existing = untrack(mount);
    const shown = existing ?? mountTextView(holder, loaded.text, numbering, props.spec.path);
    if (existing === undefined) setMount(shown);
    else existing.replace(loaded.text, numbering, props.spec.path);
    if (landing === "end") shown.scrollTo("end");
  });
  onCleanup(() => mount()?.destroy());

  const openInEditor = (): void => {
    const line = mount()?.lineAtTop();
    const path = props.spec.path;
    setEditorRefusal(undefined);
    const opening =
      props.shell.openInEditor?.(path, line ?? 1) ??
      props.shell.host.openExternal(fileUrlOf(props.shell.workspace, path, line));
    opening.catch((cause: unknown) => setEditorRefusal(editorRefusalText(cause)));
  };

  props.onAction((action) => {
    const loaded = slice();
    switch (action) {
      case "file.top":
        return loaded?.from === 0 ? mount()?.scrollTo("top") : void read({});
      case "file.end":
        return loaded !== undefined && sliceReachesEnd(loaded)
          ? mount()?.scrollTo("end")
          : void read("tail");
      case "file.next": {
        const next = loaded === undefined ? undefined : rangeAfter(loaded);
        return next === undefined ? undefined : void read(next);
      }
      case "file.previous": {
        const previous = loaded === undefined ? undefined : rangeBefore(loaded);
        return previous === undefined ? undefined : void read(previous, "end");
      }
      case "file.down":
        return mount()?.scrollBy(1);
      case "file.up":
        return mount()?.scrollBy(-1);
      case "file.editor":
        return openInEditor();
    }
  });

  return (
    <section class="kw-file" aria-label="file" tabIndex={-1} ref={root}>
      <Show when={slice()}>
        {(loaded) => (
          <div class="kw-file-head">
            <span class="kw-file-facts">{sliceFacts(loaded())}</span>
            <Show when={!sliceReachesEnd(loaded())}>
              <span class="kw-file-more">
                ] loads more · {props.shell.keys.chord("file.end")} the tail
              </span>
            </Show>
          </div>
        )}
      </Show>
      <Show when={editorRefusal()}>
        {(refusal) => (
          <p class="kw-file-note" data-level="error">
            {refusal()}
          </p>
        )}
      </Show>
      <div class="kw-file-text" ref={holder} hidden={mount() === undefined} />
      <Switch>
        <Match when={state().kind === "loading"}>
          <p class="kw-file-note">reading {props.spec.path} …</p>
        </Match>
        <Match when={refusalOf(state())}>
          {(refused) => (
            <p class="kw-file-note" data-level="error">
              {describeRefusal(refused().reading, refused().spec.path)}
            </p>
          )}
        </Match>
        <Match when={state().kind === "failed"}>
          <p class="kw-file-note" data-level="error">
            {(state() as { reason: string }).reason}
          </p>
        </Match>
        <Match when={slice()?.text === ""}>
          <EmptyState line={filePane.emptyState(props.shell.keys)} />
        </Match>
      </Switch>
    </section>
  );
}

function readSlice(
  shell: ShellSeams,
  spec: FileSpec,
  range: FileRange,
): Promise<TextSlice | TextRefusal> {
  return shell.client.file(spec.path, range);
}

async function tailOf(shell: ShellSeams, spec: FileSpec): Promise<FileRange | undefined> {
  const probe = await readSlice(shell, spec, { from: 0, to: 1 });
  return typeof probe === "string" ? undefined : tailRange(probe.bytes);
}

function refusalOf(state: FileState): Extract<FileState, { kind: "refused" }> | undefined {
  return state.kind === "refused" ? state : undefined;
}

type Edge = "top" | "end";

function landingOf(range: FileRange | "tail"): Edge {
  return range === "tail" ? "end" : "top";
}

export function editorRefusalText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const reason = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  return `couldn't open in your editor · ${reason}`;
}
