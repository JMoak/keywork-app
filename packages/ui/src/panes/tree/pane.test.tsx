import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ChildLineage,
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  type SessionProjection,
  treeSnapshot,
} from "@keywork-app/client";
import type { SessionEntries, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createStore } from "solid-js/store";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost } from "../../host/browser.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { type TreeSpec, treePane } from "./index.tsx";

const entries = JSON.parse(
  readFileSync(join(process.cwd(), "packages/client/src/fixtures/entries.json"), "utf8"),
) as SessionEntries;

const summaries: SessionSummary[] = [
  {
    id: "s1",
    title: "which way?",
    createdAt: "2026-09-07T12:00:00.000Z",
    lastActivityAt: "2026-09-07T12:00:00.000Z",
    messageCount: 4,
    costNanos: 12_500_000,
  },
  {
    id: "s2",
    title: "later one",
    createdAt: "2026-09-07T13:00:00.000Z",
    lastActivityAt: "2026-09-07T13:00:00.000Z",
    messageCount: 1,
  },
];

interface Recorded {
  opened: string[];
  trashed: string[];
  rebound: PaneSpecBase[];
  forks: string[];
  labels: Array<[string, string | null]>;
  treeReads: number;
}

function shellSeams(
  recorded: Recorded,
  tree = treeSnapshot(emptyTreeState, entries),
  listed: readonly SessionSummary[] = summaries,
  projections: Record<string, SessionProjection> = {},
  trashed: readonly SessionSummary[] = [],
  lineage: readonly ChildLineage[] = [],
): ShellSeams {
  const [state, setState] = createStore({
    summaries: [...listed],
    trash: [...trashed],
    projections,
  });
  const moveTo = (id: string, from: "summaries" | "trash", to: "summaries" | "trash") => {
    const moved = state[from].find((item) => item.id === id);
    setState(from, (items) => items.filter((item) => item.id !== id));
    if (moved !== undefined) setState(to, (items) => [...items, moved]);
    return moved;
  };
  const seams: Partial<ShellSeams> = {
    store: {
      state,
      openTrash: async () => {
        recorded.trashed.push("open");
      },
      remove: async (id: string) => {
        recorded.trashed.push(`remove ${id}`);
        return id === "busy" ? "busy" : (moveTo(id, "summaries", "trash") ?? "missing");
      },
      restore: async (id: string) => {
        recorded.trashed.push(`restore ${id}`);
        return moveTo(id, "trash", "summaries") ?? "missing";
      },
      discard: async (id: string) => {
        recorded.trashed.push(`discard ${id}`);
        const held = state.trash.some((item) => item.id === id);
        setState("trash", (items) => items.filter((item) => item.id !== id));
        return held ? "discarded" : "missing";
      },
      purge: async () => {
        recorded.trashed.push("purge");
        const purged = state.trash.length;
        setState("trash", []);
        return { purged };
      },
      projection: () => emptyProjection,
      summary: (id: string | undefined) => summaries.find((item) => item.id === id),
      children: (parentId: string) => lineage.filter((child) => child.parentId === parentId),
      childOf: (id: string) => lineage.find((child) => child.sessionId === id),
      trashed: (id: string) => state.trash.some((item) => item.id === id),
      surfaces: { state: { bots: [{ name: "researcher", sigil: "◇" }] } },
      refresh: async () => {},
      tree: () => tree,
      openTree: async () => {
        recorded.treeReads += 1;
      },
      fork: async (_id: string, entryId: string) => {
        recorded.forks.push(entryId);
        return { sessionId: "s3" };
      },
      label: async (_id: string, entryId: string, label: string | null) => {
        recorded.labels.push([entryId, label]);
        return { entryId, label };
      },
      changes: () => emptyChangesState,
    } as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: {
      openSession: (id) => {
        recorded.opened.push(id);
      },
      newSession: async () => {},
      startSession: async () => {},
    },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => "s1",
    rebind: (_paneId, spec) => {
      recorded.rebound.push(spec);
    },
    unseen: () => false,
  };
  return seams as ShellSeams;
}

function mount(spec: TreeSpec, recorded: Recorded, shell = shellSeams(recorded)) {
  let handle: (action: string) => void = () => {};
  render(() => (
    <treePane.component
      id="tree-1"
      spec={spec}
      focused={true}
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return (action: string) => handle(action);
}

const recording = (): Recorded => ({
  opened: [],
  trashed: [],
  rebound: [],
  forks: [],
  labels: [],
  treeReads: 0,
});

afterEach(cleanup);

describe("the tree pane, level one", () => {
  it("moves the cursor with j and k, opens on enter, and dives on l", () => {
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded);
    expect(document.querySelector(".kw-tree-session[data-cursor] .kw-tree-name")?.textContent).toBe(
      "later one",
    );
    act("tree.down");
    expect(document.querySelector(".kw-tree-session[data-cursor] .kw-tree-name")?.textContent).toBe(
      "which way?",
    );
    act("tree.down");
    act("tree.open");
    expect(recorded.opened).toEqual(["s1"]);
    act("tree.up");
    act("tree.dive");
    expect(recorded.rebound).toEqual([{ kind: "tree", sessionId: "s2" }]);
  });
});

describe("the tree pane, the trash", () => {
  const confirmLine = () => document.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement;
  const noticeLine = () =>
    [...document.querySelectorAll(".kw-ov-line:not([data-tone])")].at(-1)?.textContent;
  const cursorName = () =>
    document.querySelector(".kw-tree-session[data-cursor] .kw-tree-name")?.textContent;
  const settle = async () => {
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  };

  it("moves a session to the trash with x only after a one-line confirm", async () => {
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded);
    act("tree.remove");
    expect(confirmLine().textContent).toBe(
      'remove "later one"? it goes to the trash, memory notes stay · y confirms · any other key cancels',
    );
    fireEvent.keyDown(confirmLine(), { key: "n" });
    expect(recorded.trashed).toEqual([]);
    expect(confirmLine()).toBeNull();
    act("tree.remove");
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(recorded.trashed).toEqual(["remove s2"]);
    expect(noticeLine()).toBe(
      'removed "later one" · ctrl+k tree.trash shows the trash, memory notes stay',
    );
    expect([...document.querySelectorAll(".kw-tree-name")].map((node) => node.textContent)).toEqual(
      ["which way?"],
    );
  });

  it("restores a trashed session with enter and deletes one for good with d, both confirmed", async () => {
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded);
    act("tree.remove");
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    act("tree.trash");
    act("tree.down");
    expect(cursorName()).toBe("later one");
    expect(
      document.querySelector(".kw-tree-session[data-cursor]")?.hasAttribute("data-trashed"),
    ).toBe(true);
    act("tree.remove");
    expect(confirmLine()).toBeNull();
    act("tree.open");
    expect(confirmLine().textContent).toContain('restore "later one" from the trash');
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(noticeLine()).toBe('restored "later one" · it is back in the session tree');
    expect(document.querySelectorAll(".kw-tree-session[data-trashed]")).toHaveLength(0);

    expect(cursorName()).toBe("which way?");
    act("tree.remove");
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(
      document.querySelector(".kw-tree-session[data-cursor]")?.hasAttribute("data-trashed"),
    ).toBe(true);
    act("tree.discard");
    expect(confirmLine().textContent).toContain('delete "which way?" for good? there is no undo');
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(noticeLine()).toBe('deleted "which way?" for good');
    expect(recorded.trashed).toEqual([
      "remove s2",
      "open",
      "restore s2",
      "remove s1",
      "discard s1",
    ]);
  });

  it("empties the trash with shift+d only after a confirm that counts what goes", async () => {
    const recorded = recording();
    const shell = shellSeams(recorded, undefined, [], {}, summaries);
    const act = mount({ kind: "tree" }, recorded, shell);
    act("tree.purge");
    await settle();
    expect(screen.getByText("trash · 2 sessions · ctrl+k tree.purge empties it")).toBeTruthy();
    expect(confirmLine().textContent).toBe(
      "empty the trash? 2 sessions go for good, there is no undo · y confirms · any other key cancels",
    );
    fireEvent.keyDown(confirmLine(), { key: "n" });
    expect(document.querySelectorAll(".kw-tree-session[data-trashed]")).toHaveLength(2);
    act("tree.purge");
    await settle();
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(recorded.trashed).toEqual(["open", "open", "purge"]);
    expect(noticeLine()).toBe("deleted 2 sessions for good · the trash is empty");
    expect(document.querySelectorAll(".kw-tree-session[data-trashed]")).toHaveLength(0);
    expect(screen.getByText("trash")).toBeTruthy();
    expect(
      screen.getByText("the trash is empty · ctrl+k tree.remove sends a session here"),
    ).toBeTruthy();
  });

  it("says a running turn keeps a session out of the trash, in keywork's words", async () => {
    const busy = { ...(summaries[0] as SessionSummary), id: "busy", title: "busy one" };
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded, shellSeams(recorded, undefined, [busy]));
    act("tree.remove");
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(noticeLine()).toBe("a turn is running · wait for it to finish before removing");
  });
});

describe("the tree pane, level two", () => {
  it("starts at the leaf, folds on enter and h, unfolds on l, and surfaces to the parent", () => {
    const recorded = recording();
    const act = mount({ kind: "tree", sessionId: "s1" }, recorded);
    const cursorText = () =>
      document.querySelector(".kw-tree-entry[data-cursor] .kw-tree-text")?.textContent;
    expect(cursorText()).toBe("assistant: Right, then.");
    act("tree.up");
    act("tree.up");
    act("tree.up");
    expect(cursorText()).toBe("assistant: Left it is.");
    act("tree.open");
    expect(document.querySelectorAll(".kw-tree-entry")).toHaveLength(4);
    expect(document.querySelector(".kw-tree-entry[data-cursor] .kw-tree-fold")?.textContent).toBe(
      "▸",
    );
    act("tree.dive");
    expect(document.querySelectorAll(".kw-tree-entry")).toHaveLength(5);
    act("tree.surface");
    expect(document.querySelectorAll(".kw-tree-entry")).toHaveLength(4);
    act("tree.surface");
    expect(cursorText()).toBe("user: which way?");
  });

  it("forks at the cursor and opens the new session; labels through the inline input", async () => {
    const recorded = recording();
    const act = mount({ kind: "tree", sessionId: "s1" }, recorded);
    act("tree.fork");
    await Promise.resolve();
    await Promise.resolve();
    expect(recorded.forks).toEqual(["q8"]);
    expect(recorded.opened).toEqual(["s3"]);

    act("tree.label");
    const input = screen.getByLabelText("label") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "the right one" } });
    act("tree.down");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(recorded.labels).toEqual([["q8", "the right one"]]);
    expect(screen.queryByLabelText("label")).toBeNull();

    act("tree.label");
    fireEvent.input(screen.getByLabelText("label"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByLabelText("label"), { key: "Enter" });
    expect(recorded.labels.at(-1)).toEqual(["q8", null]);
  });
});

describe("the tree pane, children", () => {
  const child = (sessionId: string, extra: Partial<ChildLineage> = {}): ChildLineage => ({
    sessionId,
    parentId: "s1",
    callId: `call-${sessionId}`,
    title: sessionId,
    bot: undefined,
    state: "running",
    costNanos: undefined,
    ...extra,
  });
  const family = [
    child("k1", { title: "audit the trust rules", bot: "researcher" }),
    child("k2", { title: "count the callers", state: "completed", bot: "drafter" }),
  ];
  const withFamily = (recorded: Recorded, listed = summaries) =>
    shellSeams(recorded, undefined, listed, {}, [], family);
  const cursorName = () =>
    document.querySelector(".kw-tree-session[data-cursor] .kw-tree-name")?.textContent;

  it("folds with h and unfolds with l as the entry tree does, h on a child going up first", () => {
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded, withFamily(recorded));
    act("tree.down");
    act("tree.down");
    act("tree.surface");
    expect(cursorName()).toBe("which way?");
    act("tree.surface");
    expect(document.querySelectorAll(".kw-tree-session[data-child]")).toHaveLength(0);
    expect(document.querySelector(".kw-tree-folded")?.textContent).toBe("▸ 2 children");
    act("tree.dive");
    expect(document.querySelectorAll(".kw-tree-session[data-child]")).toHaveLength(2);
    expect(recorded.rebound).toEqual([]);
    act("tree.dive");
    expect(recorded.rebound).toEqual([{ kind: "tree", sessionId: "s1" }]);
  });
});

describe("the tree pane's definition", () => {
  it("revives a saved sessions pane as a tree pane", () => {
    expect(treePane.spec.parse({ kind: "sessions" })).toEqual({ kind: "tree" });
  });
});
