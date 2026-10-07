import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  treeSnapshot,
} from "@keywork-app/client";
import type { SessionEntries, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost } from "../../host/browser.ts";
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
  rebound: PaneSpecBase[];
  forks: string[];
  labels: Array<[string, string | null]>;
  treeReads: number;
}

function shellSeams(
  recorded: Recorded,
  tree = treeSnapshot(emptyTreeState, entries),
  listed: readonly SessionSummary[] = summaries,
): ShellSeams {
  const seams: Partial<ShellSeams> = {
    store: {
      state: { summaries: listed, projections: {} },
      projection: () => emptyProjection,
      summary: (id: string | undefined) => summaries.find((item) => item.id === id),
      refresh: async () => {},
      tree: () => tree,
      openTree: async () => {
        recorded.treeReads += 1;
      },
      fork: async (_id: string, entryId: string) => {
        recorded.forks.push(entryId);
        return { ...(summaries[1] as SessionSummary), id: "s3" };
      },
      label: async (_id: string, entryId: string, label: string | null) => {
        recorded.labels.push([entryId, label]);
        return "labelled" as const;
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

  it("teaches one key when there are no sessions", () => {
    const recorded = recording();
    mount({ kind: "tree" }, recorded, shellSeams(recorded, undefined, []));
    expect(screen.getByText("no sessions yet · ctrl+k pane.split starts one")).toBeTruthy();
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
    expect(recorded.forks).toEqual(["q5"]);
    expect(recorded.opened).toEqual(["s3"]);

    act("tree.label");
    const input = screen.getByLabelText("label") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "the right one" } });
    act("tree.down");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(recorded.labels).toEqual([["q5", "the right one"]]);
    expect(screen.queryByLabelText("label")).toBeNull();

    act("tree.label");
    fireEvent.input(screen.getByLabelText("label"), { target: { value: "  " } });
    fireEvent.keyDown(screen.getByLabelText("label"), { key: "Enter" });
    expect(recorded.labels.at(-1)).toEqual(["q5", null]);
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
