import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  projectAll,
  type SessionProjection,
  treeSnapshot,
} from "@keywork-app/client";
import type { SessionEntries, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createStore } from "solid-js/store";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost } from "../../host/browser.ts";
import type { AttireTarget } from "../../theme/attire.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { costOf, sessionsNewestFirst, type TreeSpec, treePane } from "./index.tsx";

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
): ShellSeams {
  const [state, setState] = createStore({
    summaries: [...listed],
    trash: [] as SessionSummary[],
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
      projection: () => emptyProjection,
      summary: (id: string | undefined) => summaries.find((item) => item.id === id),
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
  it("lists sessions newest first with the liveness mark, cost when known, and age", () => {
    const recorded = recording();
    mount({ kind: "tree" }, recorded);
    const names = [...document.querySelectorAll(".kw-tree-name")].map((node) => node.textContent);
    expect(names).toEqual(["later one", "which way?"]);
    const costs = [...document.querySelectorAll(".kw-tree-cost")].map((node) => node.textContent);
    expect(costs).toEqual(["", "$0.0125"]);
    expect(document.querySelectorAll(".kw-tree-age")).toHaveLength(2);
    expect(document.querySelector(".kw-tree-mark")?.textContent).toBe("░");
    expect(costOf(summaries[0] as SessionSummary)).toBe("$0.0125");
    expect(sessionsNewestFirst(summaries).map((item) => item.id)).toEqual(["s2", "s1"]);
  });

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

  it("opens a session by click and dives by the row's tree button", () => {
    const recorded = recording();
    mount({ kind: "tree" }, recorded);
    fireEvent.click(screen.getByText("which way?"));
    expect(recorded.opened).toEqual(["s1"]);
    fireEvent.click(screen.getByLabelText("tree of which way?"));
    expect(recorded.rebound).toEqual([{ kind: "tree", sessionId: "s1" }]);
  });

  it("names the theme a session's pane would wear from its arc", () => {
    const recorded = recording();
    const inArc = summaries.map((item) => (item.id === "s1" ? { ...item, arc: "pricing" } : item));
    const shell = {
      ...shellSeams(recorded, undefined, inArc),
      attire: { worn: (target: AttireTarget) => (target.kind === "arc" ? "whiplash" : undefined) },
    } as ShellSeams;
    mount({ kind: "tree" }, recorded, shell);
    const wears = [...document.querySelectorAll(".kw-tree-session")].map(
      (row) => row.querySelector(".kw-tree-wears")?.textContent ?? "",
    );
    expect(wears).toEqual(["", "· wears whiplash"]);
    expect(document.querySelectorAll(".kw-tree-name")).toHaveLength(2);
  });

  it("teaches one key when there are no sessions", () => {
    const recorded = recording();
    mount({ kind: "tree" }, recorded, shellSeams(recorded, undefined, []));
    expect(screen.getByText("no sessions yet · ctrl+k pane.split starts one")).toBeTruthy();
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

  it("keeps the trash collapsed until shift+x and says when it is empty", async () => {
    const recorded = recording();
    const act = mount({ kind: "tree" }, recorded);
    expect(screen.getByText("trash · ctrl+k tree.trash shows it")).toBeTruthy();
    expect(document.querySelectorAll(".kw-tree-session[data-trashed]")).toHaveLength(0);
    act("tree.trash");
    expect(recorded.trashed).toEqual(["open"]);
    expect(
      screen.getByText("the trash is empty · ctrl+k tree.remove sends a session here"),
    ).toBeTruthy();
    act("tree.trash");
    expect(screen.getByText("trash · ctrl+k tree.trash shows it")).toBeTruthy();
  });

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

  it("names an untitled session in every trash line as its row does", async () => {
    const recorded = recording();
    const untitled: SessionSummary = {
      ...(summaries[1] as SessionSummary),
      title: "(untitled session)",
    };
    const prompted = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-09-07T13:00:00.000Z",
        sessionId: "s2",
        type: "turn.started",
        payload: { userText: "bash cat hello.txt" },
      },
    ]);
    const shell = shellSeams(recorded, undefined, [untitled], { s2: prompted });
    const act = mount({ kind: "tree" }, recorded, shell);
    expect(cursorName()).toBe("bash cat hello.txt");
    act("tree.remove");
    expect(confirmLine().textContent).toContain('remove "bash cat hello.txt"?');
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(noticeLine()).toBe(
      'removed "bash cat hello.txt" · ctrl+k tree.trash shows the trash, memory notes stay',
    );
    act("tree.trash");
    expect(cursorName()).toBe("bash cat hello.txt");
    act("tree.open");
    expect(confirmLine().textContent).toContain('restore "bash cat hello.txt" from the trash');
    fireEvent.keyDown(confirmLine(), { key: "y" });
    await settle();
    expect(noticeLine()).toBe('restored "bash cat hello.txt" · it is back in the session tree');
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
  it("renders the folded tree with the active path lit, the label inline, and the leaf marked", () => {
    const recorded = recording();
    mount({ kind: "tree", sessionId: "s1" }, recorded);
    expect(recorded.treeReads).toBe(1);
    const rows = [...document.querySelectorAll(".kw-tree-entry")];
    expect(rows.map((row) => row.querySelector(".kw-tree-text")?.textContent)).toEqual([
      "user: which way?",
      "assistant: Left it is.",
      "label went left",
      "user: no, the other way",
      "assistant: Right, then.",
    ]);
    expect(rows.map((row) => row.hasAttribute("data-active"))).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
    expect(rows[1]?.querySelector(".kw-tree-label")?.textContent).toBe("went left");
    expect(rows[4]?.hasAttribute("data-leaf")).toBe(true);
    expect(rows[4]?.querySelector(".kw-tree-leaf-mark")?.textContent).toBe("leaf");
    expect(rows[0]?.querySelector(".kw-tree-fold")?.textContent).toBe("▾");
  });

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
    expect(recorded.forks).toEqual(["q4"]);
    expect(recorded.opened).toEqual(["s3"]);

    act("tree.label");
    const input = screen.getByLabelText("label") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "the right one" } });
    act("tree.down");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(recorded.labels).toEqual([["q4", "the right one"]]);
    expect(screen.queryByLabelText("label")).toBeNull();

    act("tree.label");
    fireEvent.input(screen.getByLabelText("label"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByLabelText("label"), { key: "Enter" });
    expect(recorded.labels.at(-1)).toEqual(["q4", null]);
  });

  it("goes back to the sessions on escape and refreshes on r", () => {
    const recorded = recording();
    const act = mount({ kind: "tree", sessionId: "s1" }, recorded);
    act("tree.refresh");
    expect(recorded.treeReads).toBe(2);
    act("tree.back");
    expect(recorded.rebound).toEqual([{ kind: "tree" }]);
    fireEvent.click(screen.getByText("‹ sessions"));
    expect(recorded.rebound).toHaveLength(2);
  });

  it("says it is reading while the snapshot is missing", () => {
    const recorded = recording();
    mount({ kind: "tree", sessionId: "s1" }, recorded, shellSeams(recorded, emptyTreeState));
    expect(screen.getByText("reading the tree…")).toBeTruthy();
  });
});

describe("the tree pane's definition", () => {
  it("titles level one as the sessions list and level two by the session's name", () => {
    const shell = shellSeams(recording());
    expect(treePane.title({ kind: "tree" }, shell)).toBe("sessions");
    expect(treePane.title({ kind: "tree", sessionId: "s1" }, shell)).toBe("tree · which way?");
  });

  it("revives a saved sessions pane as a tree pane", () => {
    expect(treePane.spec.parse({ kind: "sessions" })).toEqual({ kind: "tree" });
  });
});
