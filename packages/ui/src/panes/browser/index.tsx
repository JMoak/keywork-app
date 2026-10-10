import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { z } from "zod";
import { EmptyState } from "../empty-state.tsx";
import { rememberAgentFile } from "../file/recent.ts";
import { definePane, type PaneProps } from "../registry.ts";
import {
  agentPathOf,
  type BrowserRow,
  collapse,
  directoriesToLoad,
  emptyTree,
  expand,
  expireLit,
  forgetListings,
  isExpanded,
  lift,
  loading,
  nextExpiry,
  parentOf,
  rootPath,
  rows,
  type TreeState,
  toggleHidden,
  withFailure,
  withFilter,
  withListing,
} from "./tree.ts";
import "./browser.css";

const browserSpec = z.object({ kind: z.literal("browser") });

export type BrowserSpec = z.output<typeof browserSpec>;

export const browserPane = definePane<BrowserSpec>({
  kind: "browser",
  spec: browserSpec,
  home: "left",
  title: () => "files",
  emptyState: (keys) =>
    `nothing here · . shows dotfiles · ${keys.chord("browser.summon")} summons this tree`,
  component: BrowserSlot,
  summon: {
    action: "browser.summon",
    chords: "leader f",
    help: "files pane",
    command: { name: "files", description: "open the workspace tree", aliases: ["browser"] },
    spec: () => ({ kind: "browser" }),
  },
  localActions: {
    "browser.down": {
      chords: ["j", "down"],
      help: "next entry",
      command: { name: "files-next", description: "move to the next entry" },
    },
    "browser.up": {
      chords: ["k", "up"],
      help: "previous entry",
      command: { name: "files-previous", description: "move to the previous entry" },
    },
    "browser.open": {
      chords: "enter",
      help: "open the file · fold or unfold the folder",
      command: { name: "files-open", description: "open this file, or toggle this folder" },
    },
    "browser.expand": {
      chords: ["l", "right"],
      help: "unfold the folder",
      command: { name: "files-unfold", description: "unfold this folder" },
    },
    "browser.collapse": {
      chords: ["h", "left"],
      help: "fold · up to the parent",
      command: { name: "files-fold", description: "fold this folder or move to its parent" },
    },
    "browser.hidden": {
      chords: ".",
      help: "show or hide dotfiles",
      command: { name: "files-dotfiles", description: "toggle dotfiles in the tree" },
    },
    "browser.filter": {
      chords: "/",
      help: "filter by name",
      command: { name: "files-filter", description: "filter the loaded entries by name" },
    },
    "browser.refresh": {
      chords: "r",
      help: "reread the tree",
      command: { name: "files-refresh", description: "reread every open folder" },
    },
  },
});

function BrowserSlot(props: PaneProps<BrowserSpec>) {
  const [tree, setTree] = createSignal<TreeState>(emptyTree);
  const [cursor, setCursor] = createSignal<string>();
  const [now, setNow] = createSignal(Date.now());
  const [filtering, setFiltering] = createSignal(false);
  let filterInput: HTMLInputElement | undefined;

  const visible = createMemo((): BrowserRow[] => rows(tree(), now()));
  const at = (): number => visible().findIndex((row) => row.path === cursor());
  const current = (): BrowserRow | undefined => visible()[at()];
  const rootState = () => tree().directories[rootPath];

  const load = async (path: string): Promise<void> => {
    setTree((state) => loading(state, path));
    try {
      const reading = await props.shell.client.tree(path);
      setTree((state) =>
        typeof reading === "string"
          ? withFailure(state, path, describeTreeRefusal(reading, path))
          : withListing(state, reading),
      );
    } catch (cause) {
      setTree((state) => withFailure(state, path, failureText(cause)));
    }
  };

  createEffect(() => {
    for (const path of directoriesToLoad(tree())) void load(path);
  });

  createEffect(() => {
    const expiry = nextExpiry(tree());
    if (expiry === undefined) return;
    const timer = setTimeout(
      () => {
        setNow(Date.now());
        setTree((state) => expireLit(state, Date.now()));
      },
      Math.max(0, expiry - Date.now()),
    );
    onCleanup(() => clearTimeout(timer));
  });

  onCleanup(
    props.shell.feed.subscribe((envelopes) => {
      for (const envelope of envelopes) {
        const path = agentPathOf(envelope, props.shell.workspace);
        if (path === undefined) continue;
        rememberAgentFile(path);
        setNow(Date.now());
        setTree((state) => lift(state, path, Date.now()));
      }
    }),
  );

  const moveCursor = (delta: number): void => {
    const list = visible();
    if (list.length === 0) return;
    const next = Math.min(Math.max(at() + delta, 0), list.length - 1);
    setCursor(list[next]?.path);
  };
  const openRow = (row: BrowserRow): void => {
    if (row.kind === "file") props.shell.openPane({ kind: "file", path: row.path });
    else setTree((state) => (isExpanded(state, row.path) ? collapse : expand)(state, row.path));
  };
  const unfold = (row: BrowserRow | undefined): void => {
    if (row?.kind === "dir") setTree((state) => expand(state, row.path));
  };
  const foldOrClimb = (row: BrowserRow | undefined): void => {
    if (row === undefined) return;
    if (row.kind === "dir" && row.expanded) {
      setTree((state) => collapse(state, row.path));
      return;
    }
    const parent = parentOf(row.path);
    if (parent !== rootPath) setCursor(parent);
  };
  const startFiltering = (): void => {
    setFiltering(true);
    queueMicrotask(() => filterInput?.focus());
  };
  const stopFiltering = (clear: boolean): void => {
    if (clear) setTree((state) => withFilter(state, ""));
    setFiltering(false);
    filterInput?.blur();
  };

  props.onAction((action) => {
    switch (action) {
      case "browser.down":
        return moveCursor(1);
      case "browser.up":
        return moveCursor(-1);
      case "browser.open": {
        const row = current();
        return row === undefined ? undefined : openRow(row);
      }
      case "browser.expand":
        return unfold(current());
      case "browser.collapse":
        return foldOrClimb(current());
      case "browser.hidden":
        return setTree(toggleHidden);
      case "browser.filter":
        return startFiltering();
      case "browser.refresh":
        return setTree(forgetListings);
    }
  });

  return (
    <section class="kw-browser" aria-label="files">
      <div class="kw-browser-head">
        <span class="kw-browser-root">{props.shell.workspace}</span>
        <Show when={filtering() || tree().filter !== ""}>
          <input
            ref={filterInput}
            class="kw-browser-filter"
            aria-label="filter files"
            placeholder="filter"
            value={tree().filter}
            onInput={(event) => setTree((state) => withFilter(state, event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Escape") stopFiltering(true);
              else if (event.key === "Enter") stopFiltering(false);
            }}
          />
        </Show>
      </div>
      <Show when={rootState()?.kind === "failed"}>
        <p class="kw-browser-failure">
          {rootState()?.kind === "failed" ? (rootState() as { reason: string }).reason : ""}
        </p>
      </Show>
      <Show
        when={visible().length > 0}
        fallback={
          <Show when={rootState()?.kind === "loaded"}>
            <EmptyState line={browserPane.emptyState(props.shell.keys)} />
          </Show>
        }
      >
        <ol class="kw-browser-list">
          <For each={visible()}>
            {(row) => (
              <li
                class="kw-browser-row"
                data-kind={row.kind}
                data-ignored={row.ignored ? "" : undefined}
                data-hidden={row.hidden ? "" : undefined}
                data-lit={row.lit ? "" : undefined}
                data-cursor={props.focused && row.path === cursor() ? "" : undefined}
                data-load={row.load}
                style={{ "--kw-depth": row.depth }}
              >
                <button
                  type="button"
                  class="kw-browser-entry"
                  onClick={() => {
                    setCursor(row.path);
                    openRow(row);
                  }}
                >
                  <span class="kw-browser-mark" aria-hidden="true">
                    {markOf(row)}
                  </span>
                  <span class="kw-browser-name">{row.name}</span>
                  <Show when={row.ignored}>
                    <span class="kw-browser-fact">ignored</span>
                  </Show>
                  <Show when={row.load === "failed"}>
                    <span class="kw-browser-fact">unreadable</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
}

export function markOf(row: Pick<BrowserRow, "kind" | "expanded" | "load">): string {
  if (row.kind === "file") return "·";
  if (row.load === "loading") return "░";
  return row.expanded ? "▾" : "▸";
}

export function describeTreeRefusal(reading: "outside-scope" | "missing", path: string): string {
  return reading === "missing"
    ? `no directory at ${path === rootPath ? "the root" : path}`
    : `${path} is outside the workspace`;
}

function failureText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
