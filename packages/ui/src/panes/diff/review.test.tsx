import { hunkDigest } from "@keywork-app/client";
import type { ReviewVerdict, VerdictMark } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellSeams } from "../registry.ts";
import { type DiffSpec, diffPane } from "./index.tsx";
import type { MergeHunk } from "./merge-view.ts";

interface Recorded {
  verdicts: Array<[string, ReviewVerdict]>;
  prompts: Array<[string, string, string]>;
  reads: number;
}

interface Seams {
  verdicts?: VerdictMark[];
  unwired?: boolean;
}

const delivered = {
  path: "notes.txt",
  before: "one\ntwo\nthree\n",
  after: "one\n2\nthree\nfour\n",
  truncated: false,
};

const firstHunk: MergeHunk = { header: "@@ -2,1 +2,1 @@", removed: ["two"], added: ["2"], line: 2 };

function shellOver(recorded: Recorded, seams: Seams = {}): ShellSeams {
  const shell: Partial<ShellSeams> = {
    store: {
      changes: () => ({
        availability: "ready",
        baseline: "session start",
        files: [],
        stale: false,
      }),
      openChanges: async () => {},
      controlsOf: () => ({ undoable: false, redoable: false }),
      projection: () => ({ standing: 0 }),
      tree: () => ({}),
      openTree: async () => {},
      controls: {},
      changedFile: async () => delivered,
      prompt: async (id: string, text: string, behavior: string) => {
        recorded.prompts.push([id, text, behavior]);
        return "started";
      },
    } as unknown as ShellSeams["store"],
    client: {
      hunkVerdicts: async () => {
        recorded.reads += 1;
        return { verdicts: seams.verdicts ?? [] };
      },
      recordHunkVerdict: async (id: string, verdict: ReviewVerdict) => {
        recorded.verdicts.push([id, verdict]);
        if (seams.unwired) return "unwired";
        return { index: 0, entryId: `v${recorded.verdicts.length}`, at: "t", ...verdict };
      },
    } as unknown as ShellSeams["client"],
    feed: { subscribeSession: () => () => {} } as unknown as ShellSeams["feed"],
    keys: { chord: (action) => chords[action] ?? action, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    workspace: "C:/work",
    currentSession: () => "s1",
    rebind: () => {},
    unseen: () => false,
  };
  return shell as ShellSeams;
}

function mount(recorded: Recorded, seams: Seams = {}, spec: DiffSpec = fileSpec) {
  let handle: (action: string) => void = () => {};
  render(() => (
    <diffPane.component
      id="diff-1"
      spec={spec}
      focused={true}
      shell={shellOver(recorded, seams)}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return async (action: string) => {
    handle(action);
    await settle();
  };
}

const fileSpec: DiffSpec = { kind: "diff", sessionId: "s1", path: "notes.txt" };

const chords: Readonly<Record<string, string>> = {
  "diff.keep": "y",
  "diff.drop": "d",
  "diff.ask": "a",
  "diff.talk": "t",
};

const recording = (): Recorded => ({ verdicts: [], prompts: [], reads: 0 });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const row = (selector: string): string => document.querySelector(selector)?.textContent ?? "";

afterEach(cleanup);

describe("reviewing a delivery hunk by hunk", () => {
  it("records keep, drop and ask on the hunk under the cursor with a stable reference and moves on", async () => {
    const recorded = recording();
    const act = await mountSettled(recorded);
    await act("diff.keep");
    const digest = hunkDigest(firstHunk.removed, firstHunk.added);
    expect(recorded.verdicts).toEqual([
      ["s1", { path: "notes.txt", header: "@@ -2,1 +2,1 @@", digest, verdict: "keep" }],
    ]);
    expect(screen.getByText(`keep · notes.txt @@ -2,1 +2,1 @@ · hunk ${digest}`)).toBeTruthy();
    expect(row(".kw-diff-review-place")).toBe("hunk 2 of 2");
    expect(row(".kw-diff-review-reviewed")).toBe("1 of 2 reviewed");
    await act("diff.ask");
    expect(recorded.verdicts.at(-1)?.[1]).toMatchObject({
      header: "@@ -4,0 +4,1 @@",
      verdict: "ask",
    });
    expect(row(".kw-diff-review-verdict")).toBe("ask");
    expect(row(".kw-diff-review-reviewed")).toBe("2 of 2 reviewed · 1 ask");
    await act("diff.drop");
    expect(row(".kw-diff-review-verdict")).toBe("drop");
    expect(row(".kw-diff-review-reviewed")).toBe("2 of 2 reviewed");
  });

  it("says a drop is a mark only and how to have the change taken out", async () => {
    const recorded = recording();
    const act = await mountSettled(recorded);
    await act("diff.drop");
    const digest = hunkDigest(firstHunk.removed, firstHunk.added);
    expect(
      screen.getByText(
        `drop · notes.txt @@ -2,1 +2,1 @@ · hunk ${digest} · a mark only, the file still has it · t asks the agent to take it out`,
      ),
    ).toBeTruthy();
    expect(diffPane.localActions?.["diff.drop"]?.help).toBe(
      "mark this hunk dropped (the file keeps it)",
    );
  });

  it("says plainly when the server records no verdicts and writes nothing", async () => {
    const recorded = recording();
    const act = await mountSettled(recorded, { unwired: true });
    await act("diff.drop");
    expect(
      screen.getByText("this server records no verdicts yet · nothing was written"),
    ).toBeTruthy();
    expect(row(".kw-diff-review-verdict")).toBe("unreviewed");
  });

  it("quotes the hunk into the thread as the keeper's words with its reference", async () => {
    const recorded = recording();
    const act = await mountSettled(recorded);
    await act("diff.talk");
    const input = document.querySelector(".kw-controls-input") as HTMLInputElement;
    expect(input.placeholder).toBe("say something about this hunk · enter sends it to the thread");
    input.value = "why 2 and not two?";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    const digest = hunkDigest(firstHunk.removed, firstHunk.added);
    expect(recorded.prompts).toEqual([
      [
        "s1",
        [
          `About notes.txt @@ -2,1 +2,1 @@ (hunk ${digest}):`,
          "",
          "```diff",
          "-two",
          "+2",
          "```",
          "",
          "why 2 and not two?",
        ].join("\n"),
        "steer",
      ],
    ]);
    expect(
      screen.getByText(`said to the thread · notes.txt @@ -2,1 +2,1 @@ · hunk ${digest}`),
    ).toBeTruthy();
    expect(document.querySelector(".kw-controls-input")).toBeNull();
  });

  it("closes the composer on escape without sending", async () => {
    const recorded = recording();
    const act = await mountSettled(recorded);
    await act("diff.talk");
    const input = document.querySelector(".kw-controls-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    await settle();
    expect(document.querySelector(".kw-controls-input")).toBeNull();
    expect(recorded.prompts).toEqual([]);
  });
});

async function mountSettled(recorded: Recorded, seams: Seams = {}) {
  const act = mount(recorded, seams);
  await settle();
  await settle();
  return act;
}
