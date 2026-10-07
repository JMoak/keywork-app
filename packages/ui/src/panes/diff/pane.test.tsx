import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ChangesState, changesSnapshot, emptyChangesState } from "@keywork-app/client";
import type { ChangedFileReading, ChangesReading } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost } from "../../host/browser.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import {
  availabilityLine,
  type DiffSpec,
  diffPane,
  fileNote,
  noBaselineLine,
  untrustedLine,
} from "./index.tsx";

const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), "packages/client/src/fixtures", name), "utf8");

const recordedChanges = JSON.parse(fixture("changes.json")) as ChangesReading;
const recordedFile = JSON.parse(fixture("changed-file.json")) as ChangedFileReading;

interface Recorded {
  rebound: PaneSpecBase[];
  reads: number;
  fileReads: string[];
  editor: Array<[string, number]>;
}

interface Seams {
  changes?: ChangesState;
  file?: ChangedFileReading;
  openInEditor?: boolean;
}

function shellSeams(recorded: Recorded, seams: Seams = {}): ShellSeams {
  const changes =
    seams.changes ??
    changesSnapshot(emptyChangesState, {
      trusted: true,
      baseline: "session start",
      files: [
        { path: "src/a.ts", added: 3, deleted: 1, turn: 2 },
        { path: "notes.txt", added: 2, deleted: 0, turn: 1 },
        { path: "src/b.ts", added: 0, deleted: 4, turn: 2 },
      ],
    });
  const shell: Partial<ShellSeams> = {
    store: {
      changes: () => changes,
      openChanges: async () => {
        recorded.reads += 1;
      },
      changedFile: async (_id: string, path: string) => {
        recorded.fileReads.push(path);
        return seams.file ?? recordedFile;
      },
    } as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => "s1",
    rebind: (_paneId, spec) => {
      recorded.rebound.push(spec);
    },
    unseen: () => false,
    ...(seams.openInEditor && {
      openInEditor: (path: string, line: number) => {
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

const recording = (): Recorded => ({ rebound: [], reads: 0, fileReads: [], editor: [] });

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

  it("renders the recorded session's changes with their provenance", () => {
    const recorded = recording();
    mount(
      { kind: "diff", sessionId: "s1" },
      recorded,
      shellSeams(recorded, { changes: changesSnapshot(emptyChangesState, recordedChanges) }),
    );
    expect(screen.getByText("turn 1")).toBeTruthy();
    expect(screen.getByText("notes.txt")).toBeTruthy();
  });

  it("says the workspace is untrusted and names the next action", () => {
    const recorded = recording();
    const untrusted = changesSnapshot(emptyChangesState, { trusted: false, files: [] });
    mount(
      { kind: "diff", sessionId: "s1" },
      recorded,
      shellSeams(recorded, { changes: untrusted }),
    );
    expect(screen.getByText(untrustedLine)).toBeTruthy();
    expect(availabilityLine(untrusted)).toBe(untrustedLine);
    expect(availabilityLine(changesSnapshot(emptyChangesState, "no-baseline"))).toBe(
      noBaselineLine,
    );
    expect(document.querySelectorAll(".kw-diff-file-row")).toHaveLength(0);
  });

  it("teaches one key with no session and with nothing changed", () => {
    const recorded = recording();
    mount({ kind: "diff" }, recorded);
    expect(
      screen.getByText("nothing changed yet · ctrl+k diff.summon follows the session's files"),
    ).toBeTruthy();
    cleanup();
    const nothing = changesSnapshot(emptyChangesState, {
      trusted: true,
      baseline: "session start",
      files: [],
    });
    mount({ kind: "diff", sessionId: "s1" }, recorded, shellSeams(recorded, { changes: nothing }));
    expect(screen.getByText(/nothing changed yet/)).toBeTruthy();
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
          trusted: true,
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
        trusted: true,
        path: "x",
        before: "a",
        after: "b",
        note: "deleted",
        truncated: true,
      }),
    ).toBe("deleted · truncated at 1 MiB per side");
    expect(
      fileNote({ trusted: true, path: "x", before: "a", after: "b", truncated: false }),
    ).toBeUndefined();
    expect(
      fileNote({ trusted: false, path: "x", before: null, after: null, truncated: false }),
    ).toBe(untrustedLine);
  });

  it("offers the editor deep link only when the shell provides the seam", async () => {
    const recorded = recording();
    mount({ kind: "diff", sessionId: "s1", path: "notes.txt" }, recorded);
    await settle();
    expect(screen.queryByText("open in editor")).toBeNull();
    cleanup();
    mount(
      { kind: "diff", sessionId: "s1", path: "notes.txt" },
      recorded,
      shellSeams(recorded, { openInEditor: true }),
    );
    await settle();
    fireEvent.click(screen.getByText("open in editor"));
    expect(recorded.editor).toEqual([["notes.txt", 1]]);
  });
});

describe("the changes pane's definition", () => {
  it("titles the list and the file, and summons for the current session", () => {
    const shell = shellSeams(recording());
    expect(diffPane.title({ kind: "diff", sessionId: "s1" }, shell)).toBe("changes");
    expect(diffPane.title({ kind: "diff", sessionId: "s1", path: "a.ts" }, shell)).toBe(
      "changes · a.ts",
    );
    expect(diffPane.summon?.spec(shell)).toEqual({ kind: "diff", sessionId: "s1" });
  });
});
