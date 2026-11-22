import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ChangesState,
  changesSnapshot,
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  type SessionControls,
  unknownControls,
} from "@keywork-app/client";
import type {
  ChangedFileReading,
  RedoReading,
  ReviewVerdict,
  UndoReading,
  VerdictMark,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../../host/browser.ts";
import { landingFor } from "../file/landing.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { type DiffSpec, diffPane, fileNote } from "./index.tsx";

const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), "packages/client/src/fixtures", name), "utf8");

const recordedFile = JSON.parse(fixture("changed-file.json")) as ChangedFileReading;

interface Recorded {
  rebound: PaneSpecBase[];
  opened: PaneSpecBase[];
  reads: number;
  fileReads: string[];
  editor: Array<[string, number]>;
  verbs: string[];
  verdicts: Array<[string, ReviewVerdict]>;
  prompts: string[];
}

interface Seams {
  changes?: ChangesState | (() => ChangesState);
  file?: ChangedFileReading | (() => ChangedFileReading);
  openInEditor?: boolean;
  controls?: Partial<SessionControls>;
  undo?: UndoReading;
  redo?: RedoReading;
  verdicts?: VerdictMark[];
  unwired?: boolean;
}

function shellSeams(recorded: Recorded, seams: Seams = {}): ShellSeams {
  const changes =
    seams.changes ??
    changesSnapshot(emptyChangesState, {
      baseline: "session start",
      files: [
        { path: "src/a.ts", added: 3, deleted: 1, turn: 2 },
        { path: "notes.txt", added: 2, deleted: 0, turn: 1 },
        { path: "src/b.ts", added: 0, deleted: 4, turn: 2 },
      ],
    });
  const shell: Partial<ShellSeams> = {
    store: {
      changes: () => (typeof changes === "function" ? changes() : changes),
      openChanges: async () => {
        recorded.reads += 1;
      },
      controlsOf: () => ({ ...unknownControls, ...seams.controls }),
      projection: () => emptyProjection,
      tree: () => emptyTreeState,
      openTree: async () => {},
      controls: {
        undo: async (id: string) => {
          recorded.verbs.push(`undo ${id}`);
          return seams.undo ?? { refused: "nothing", detail: "nothing to undo" };
        },
        redo: async (id: string) => {
          recorded.verbs.push(`redo ${id}`);
          return seams.redo ?? { refused: "nothing", detail: "nothing to redo" };
        },
      },
      changedFile: async (_id: string, path: string) => {
        recorded.fileReads.push(path);
        return typeof seams.file === "function" ? seams.file() : (seams.file ?? recordedFile);
      },
      prompt: async (_id: string, text: string) => {
        recorded.prompts.push(text);
        return "started";
      },
    } as unknown as ShellSeams["store"],
    client: {
      hunkVerdicts: async () => ({ verdicts: seams.verdicts ?? [] }),
      recordHunkVerdict: async (id: string, verdict: ReviewVerdict) => {
        recorded.verdicts.push([id, verdict]);
        if (seams.unwired) return "unwired";
        return { index: 0, entryId: `v${recorded.verdicts.length}`, at: "t", ...verdict };
      },
    } as unknown as ShellSeams["client"],
    feed: { subscribeSession: () => () => {} } as unknown as ShellSeams["feed"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => "s1",
    rebind: (_paneId, spec) => {
      recorded.rebound.push(spec);
    },
    openPane: (spec) => {
      recorded.opened.push(spec);
    },
    unseen: () => false,
    ...(seams.openInEditor && {
      openInEditor: async (path: string, line: number) => {
        recorded.editor.push([path, line]);
      },
    }),
  };
  return shell as ShellSeams;
}

function mount(spec: DiffSpec, recorded: Recorded, shell = shellSeams(recorded)) {
  let handle: (action: string) => void = () => {};
  render(() => (
    <diffPane.component
      id="diff-1"
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
  rebound: [],
  opened: [],
  reads: 0,
  fileReads: [],
  editor: [],
  verbs: [],
  verdicts: [],
  prompts: [],
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(cleanup);

describe("the changes pane, level one", () => {
  it("lists changed files by turn, newest first, with their counts", () => {
    const recorded = recording();
    mount({ kind: "diff", sessionId: "s1" }, recorded);
    expect(recorded.reads).toBe(1);
    const stamps = [...document.querySelectorAll(".kw-diff-turn-stamp")].map((n) => n.textContent);
    expect(stamps).toEqual(["turn 2", "turn 1"]);
    const rows = [...document.querySelectorAll(".kw-diff-file-row")].map((row) => [
      row.querySelector(".kw-diff-path")?.textContent,
      row.querySelector(".kw-diff-counts")?.textContent,
    ]);
    expect(rows).toEqual([
      ["src/a.ts", "+3 −1"],
      ["src/b.ts", "+0 −4"],
      ["notes.txt", "+2 −0"],
    ]);
  });

  it("moves with j and k, opens the file on enter or click, and refreshes on r", () => {
    const recorded = recording();
    const act = mount({ kind: "diff", sessionId: "s1" }, recorded);
    act("diff.down");
    act("diff.down");
    act("diff.down");
    act("diff.up");
    act("diff.open");
    expect(recorded.rebound).toEqual([{ kind: "diff", sessionId: "s1", path: "src/b.ts" }]);
    fireEvent.click(screen.getByText("notes.txt"));
    expect(recorded.rebound.at(-1)).toEqual({ kind: "diff", sessionId: "s1", path: "notes.txt" });
    act("diff.refresh");
    expect(recorded.reads).toBe(2);
  });
});

describe("the changes pane, level two", () => {
  it("mounts a read-only merge view over the recorded before and after, unified below broadsheet", async () => {
    const recorded = recording();
    const act = mount({ kind: "diff", sessionId: "s1", path: "notes.txt" }, recorded);
    await settle();
    expect(recorded.fileReads).toEqual(["notes.txt"]);
    const merge = document.querySelector(".kw-diff-merge") as HTMLElement;
    expect(merge.dataset.layout).toBe("unified");
    expect(merge.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(merge.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
    expect(merge.textContent).toContain("one");
    expect(screen.getByText("new file")).toBeTruthy();
    expect(screen.getByText("1 hunk")).toBeTruthy();
    act("diff.next");
    act("diff.prev");
    act("diff.back");
    expect(recorded.rebound).toEqual([{ kind: "diff", sessionId: "s1" }]);
  });

  it("shows truncation and binary notes honestly and mounts nothing for a binary file", async () => {
    const recorded = recording();
    mount(
      { kind: "diff", sessionId: "s1", path: "big.bin" },
      recorded,
      shellSeams(recorded, {
        file: {
          path: "big.bin",
          before: null,
          after: null,
          note: "binary",
          truncated: false,
        },
      }),
    );
    await settle();
    expect(screen.getByText("binary · no text to show")).toBeTruthy();
    expect(document.querySelectorAll(".cm-editor")).toHaveLength(0);
    expect(
      fileNote({
        path: "x",
        before: "a",
        after: "b",
        note: "deleted",
        truncated: true,
      }),
    ).toBe("deleted · truncated at 1 MiB per side");
    expect(fileNote({ path: "x", before: "a", after: "b", truncated: false })).toBeUndefined();
  });

  it("says a path outside the workspace is refused rather than showing an empty diff", async () => {
    const recorded = recording();
    mount(
      { kind: "diff", sessionId: "s1", path: "../secrets.txt" },
      recorded,
      shellSeams(recorded, { file: "outside-scope" }),
    );
    await settle();
    expect(screen.getByText("this path is outside the workspace")).toBeTruthy();
    expect(document.querySelectorAll(".cm-editor")).toHaveLength(0);
  });
});

describe("the changes pane's undo and redo", () => {
  const verbStates = () =>
    [...document.querySelectorAll<HTMLElement>(".kw-diff-verb")].map((verb) => [
      verb.textContent,
      verb.dataset.enabled,
    ]);

  it("undoes through the server, says what came back and rereads the files", async () => {
    const recorded = recording();
    const act = mount(
      { kind: "diff", sessionId: "s1", path: "notes.txt" },
      recorded,
      shellSeams(recorded, {
        controls: { undoable: true, redoable: false },
        undo: {
          prompt: { entryId: "e1", text: "write two lines" },
          filesNote: "files put back",
          undoable: false,
          redoable: true,
        },
        redo: { restored: true, undoable: true, redoable: false },
      }),
    );
    expect(verbStates().map(([, enabled]) => enabled)).toEqual(["yes", "no"]);
    expect(recorded.reads).toBe(1);
    act("diff.undo");
    await settle();
    expect(recorded.verbs).toEqual([]);
    const question = document.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement;
    expect(question.closest("[data-keys-owned]")).not.toBeNull();
    expect(question.textContent).toBe(
      "undo the last turn and put back the files it changed? ctrl+k diff.redo redoes it · y confirms · any other key cancels",
    );
    fireEvent.keyDown(question, { key: "y" });
    await settle();
    expect(
      screen.getByText("undone · the prompt is back in the composer · files put back"),
    ).toBeTruthy();
    expect(recorded.verbs).toEqual(["undo s1"]);
    expect(recorded.reads).toBe(2);
  });

  it("asks the server when it has not yet said, and shows its refusal word for word", async () => {
    const recorded = recording();
    const act = mount({ kind: "diff", sessionId: "s1" }, recorded);
    expect(verbStates().map(([, enabled]) => enabled)).toEqual(["unknown", "unknown"]);
    act("diff.redo");
    await settle();
    expect(recorded.verbs).toEqual(["redo s1"]);
    expect(screen.getByText("nothing to redo")).toBeTruthy();
  });
});

describe("a file diff keeping up with the session", () => {
  const twoHunks: ChangedFileReading = {
    path: "notes.txt",
    before: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n",
    after: "one\n2\nthree\nfour\nfive\nsix\nseven\neight\nnine\n10\n",
    truncated: false,
  };

  it("rereads when the session's changes settle again, stays on its hunk and says the file changed", async () => {
    const recorded = recording();
    const [listing, setListing] = createSignal<ChangesState>(
      changesSnapshot(emptyChangesState, { baseline: "session start", files: [] }),
    );
    const [onDisk, setOnDisk] = createSignal<ChangedFileReading>(twoHunks);
    const act = mount(
      { kind: "diff", sessionId: "s1", path: "notes.txt" },
      recorded,
      shellSeams(recorded, { changes: listing, file: onDisk }),
    );
    await settle();
    act("diff.next");
    expect(screen.getByText("hunk 2 of 2")).toBeTruthy();
    const merge = document.querySelector(".kw-diff-merge") as HTMLElement;
    const before = merge.querySelector(".cm-editor");
    setListing({ ...listing(), stale: true });
    setListing({ ...listing(), stale: false, files: [] });
    await settle();
    expect(recorded.fileReads).toEqual(["notes.txt", "notes.txt"]);
    expect(merge.querySelector(".cm-editor")).toBe(before);
    expect(document.querySelector("output.kw-diff-note")).toBeNull();
    setOnDisk({ ...twoHunks, after: (twoHunks.after ?? "").replace("five", "FIVE") });
    setListing({ ...listing(), files: [] });
    await settle();
    expect(merge.textContent).toContain("FIVE");
    expect(screen.getByText("hunk 2 of 3")).toBeTruthy();
    expect(
      screen.getByText("the file changed since you opened it · this is its diff now"),
    ).toBeTruthy();
  });

  it("rereads when the window comes back from another app", async () => {
    const recorded = recording();
    mount({ kind: "diff", sessionId: "s1", path: "notes.txt" }, recorded);
    await settle();
    window.dispatchEvent(new Event("focus"));
    await settle();
    expect(recorded.fileReads).toEqual(["notes.txt", "notes.txt"]);
  });
});

describe("reading a long diff from the keyboard", () => {
  const long: ChangedFileReading = {
    path: "src/big.ts",
    before: null,
    after: Array.from({ length: 320 }, (_, index) => `line ${index + 1}`).join("\n"),
    note: "new",
    truncated: false,
  };

  it("scrolls by line with j and k, by page with page keys and space, and to either end", async () => {
    const recorded = recording();
    const act = mount(
      { kind: "diff", sessionId: "s1", path: "src/big.ts" },
      recorded,
      shellSeams(recorded, { file: long }),
    );
    await settle();
    const scroller = document.querySelector(".kw-diff-merge .cm-scroller") as HTMLElement;
    act("diff.down");
    const line = scroller.scrollTop;
    expect(line).toBeGreaterThan(0);
    act("diff.page-down");
    expect(scroller.scrollTop).toBeGreaterThan(line);
    act("diff.page-up");
    act("diff.up");
    expect(scroller.scrollTop).toBe(0);
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(4800);
    act("diff.end");
    expect(scroller.scrollTop).toBe(4800);
    height.mockRestore();
    act("diff.top");
    expect(scroller.scrollTop).toBe(0);
    expect(recorded.rebound).toEqual([]);
  });
});

describe("leaving a diff for the file", () => {
  it("lands the file pane and the editor on the hunk under the cursor", async () => {
    const recorded = recording();
    const act = mount(
      { kind: "diff", sessionId: "s1", path: "notes.txt" },
      recorded,
      shellSeams(recorded, {
        openInEditor: true,
        file: {
          path: "notes.txt",
          before: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n",
          after: "one\ntwo\nthree\nfour\nfive\nsix\nSEVEN\n7½\neight\n",
          truncated: false,
        },
      }),
    );
    await settle();
    act("diff.file");
    expect(landingFor("notes.txt")).toEqual({ path: "notes.txt", line: 7, lines: 2 });
    expect(recorded.opened).toEqual([{ kind: "file", path: "notes.txt" }]);
    fireEvent.click(screen.getByText("open in editor"));
    expect(recorded.editor).toEqual([["notes.txt", 7]]);
  });
});
