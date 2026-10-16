import {
  emptyProjection,
  type PathMark,
  type PathTurn,
  projectAll,
  type TranscriptLedger,
  type TurnLedger,
} from "@keywork-app/client";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { scenarios } from "../dev/scenarios.ts";
import { type LedgerVerbs, ledgerFacts, ledgerKeyOf, markText, ribbonText } from "./ledger.tsx";
import { ConversationPane } from "./pane.tsx";

afterEach(cleanup);

const place: PathTurn = {
  turn: 4,
  promptId: "p4",
  leafId: "r4",
  text: "rename the tiler verbs",
  costUsd: 0.04,
  marks: [],
};

const settledTurn: TurnLedger = {
  head: 0,
  end: 3,
  place,
  files: [
    { path: "src/layout/verbs.ts", added: 6, deleted: 6, turn: 4 },
    { path: "src/layout/verbs.test.ts", added: 3, deleted: 0, turn: 4 },
  ],
  toolMs: 8_500,
  costUsd: 0.04,
};

describe("the ledger line's facts", () => {
  it("reads the turn, its files and lines, its time in tools and its spend", () => {
    expect(ledgerFacts(settledTurn)).toEqual([
      "turn 4",
      "2 files",
      "+9 −6",
      "8.5s in tools",
      "$0.04",
    ]);
  });

  it("omits every fact the projection did not give", () => {
    const replayed: TurnLedger = {
      ...settledTurn,
      files: [],
      toolMs: undefined,
      costUsd: undefined,
    };
    expect(ledgerFacts(replayed)).toEqual(["turn 4"]);
    const unplaced: TurnLedger = { ...replayed, place: undefined, files: undefined, toolMs: 120 };
    expect(ledgerFacts(unplaced)).toEqual(["120ms in tools"]);
    expect(ledgerFacts({ ...unplaced, toolMs: undefined })).toEqual([]);
  });

  it("condenses to a ribbon of the turn, its file count and its spend", () => {
    expect(ribbonText(settledTurn)).toBe("turn 4 · 2 files · $0.04");
    expect(ribbonText({ ...settledTurn, files: [], costUsd: undefined })).toBe("turn 4");
    expect(ribbonText({ ...settledTurn, place: undefined })).toBeUndefined();
    expect(ribbonText(undefined)).toBeUndefined();
  });
});

describe("the path's marks", () => {
  const restore: PathMark = { kind: "restore", entryId: "e9", turn: 3, leaf: true };

  it("offers the redo only while the restore is the leaf and the server can redo", () => {
    expect(markText(restore, true)).toBe("restored to before turn 3 · redo brings the turns back");
    expect(markText(restore, false)).toBe("restored to before turn 3");
    expect(markText({ ...restore, leaf: false }, true)).toBe("restored to before turn 3");
  });

  it("says when a restore was taken back", () => {
    expect(markText({ ...restore, kind: "restore-undone" }, false)).toBe(
      "the restore to before turn 3 was taken back",
    );
    expect(markText({ ...restore, kind: "restore-undone", turn: undefined }, false)).toBe(
      "the restore to before a turn was taken back",
    );
  });
});

describe("the ledger line's keys", () => {
  it("restores on u, forks on f, unfolds on enter or space, and leaves chords alone", () => {
    const key = (init: KeyboardEventInit) => ledgerKeyOf(new KeyboardEvent("keydown", init));
    expect(key({ key: "u" })).toBe("restore");
    expect(key({ key: "f" })).toBe("fork");
    expect(key({ key: "Enter" })).toBe("unfold");
    expect(key({ key: " " })).toBe("unfold");
    expect(key({ key: "f", ctrlKey: true })).toBeUndefined();
    expect(key({ key: "u", altKey: true })).toBeUndefined();
    expect(key({ key: "j" })).toBeUndefined();
  });
});

describe("the transcript with its ledger", () => {
  const twoTurns = projectAll(emptyProjection, [
    ...(scenarios.find((scenario) => scenario.name === "tool")?.envelopes ?? []),
    ...(scenarios.find((scenario) => scenario.name === "plain")?.envelopes ?? []).map(
      (envelope) => ({ ...envelope, id: envelope.id + 100 }),
    ),
  ]);
  const firstEnd = twoTurns.entries.findLastIndex((entry) => entry.kind === "user") - 1;
  const ledger: TranscriptLedger = {
    opening: [{ kind: "restore", entryId: "e0", turn: 1, leaf: false }],
    turns: [
      { ...settledTurn, head: 0, end: firstEnd, place: { ...place, turn: 1 } },
      {
        head: firstEnd + 1,
        end: twoTurns.entries.length - 1,
        place: {
          ...place,
          turn: 2,
          marks: [{ kind: "restore", entryId: "e5", turn: 2, leaf: true }],
        },
        files: [],
        toolMs: undefined,
        costUsd: undefined,
      },
    ],
  };

  function verbsRecording(heard: string[]): LedgerVerbs {
    return {
      restore: (turn) => heard.push(`restore ${turn.place?.turn}`),
      fork: (turn) => heard.push(`fork ${turn.place?.turn}`),
      choose: (turn) => heard.push(`choose ${turn.place?.turn}`),
    };
  }

  it("closes each settled turn with its ledger line and shows the path's marks where they fall", () => {
    const { container } = render(() => (
      <ConversationPane projection={twoTurns} ledger={ledger} redoable />
    ));
    const rows = [...container.querySelectorAll(".kw-transcript > li")];
    const reading = rows.map((row) =>
      row.querySelector(".kw-ledger")
        ? `ledger ${row.querySelector(".kw-ledger-facts")?.textContent}`
        : row.querySelector("[data-mark]")
          ? `mark ${row.querySelector("[data-mark]")?.textContent}`
          : (row.querySelector(".kw-body")?.firstElementChild?.className ?? ""),
    );
    expect(reading[0]).toBe("mark restored to before turn 1");
    expect(reading.indexOf("ledger turn 1 · 2 files · +9 −6 · 8.5s in tools · $0.04")).toBe(
      firstEnd + 2,
    );
    expect(reading.slice(-2)).toEqual([
      "ledger turn 2",
      "mark restored to before turn 2 · redo brings the turns back",
    ]);
  });

  it("draws no ledger when none is given, so a bare transcript paints as it did", () => {
    const { container } = render(() => <ConversationPane projection={twoTurns} />);
    expect(container.querySelector(".kw-ledger")).toBeNull();
    expect(container.querySelectorAll(".kw-transcript > li")).toHaveLength(twoTurns.entries.length);
  });

  it("hands its keys to the verbs, remembers the line that held focus and unfolds the files", () => {
    const heard: string[] = [];
    const { container } = render(() => (
      <ConversationPane projection={twoTurns} ledger={ledger} ledgerVerbs={verbsRecording(heard)} />
    ));
    const first = container.querySelector(".kw-ledger[data-turn='1']") as HTMLElement;
    expect(first.querySelector(".kw-ledger-hint")?.textContent).toBe(
      " ·· ↵ files · u restores to before · f forks here",
    );
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: "u" });
    fireEvent.keyDown(first, { key: "f" });
    expect(heard).toEqual(["choose 1", "restore 1", "fork 1"]);
    expect(container.querySelector(".kw-ledger-files")).toBeNull();
    fireEvent.keyDown(first, { key: "Enter" });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(
      [...container.querySelectorAll(".kw-ledger-file")].map((file) => file.textContent),
    ).toEqual(["src/layout/verbs.ts +6 −6", "src/layout/verbs.test.ts +3 −0"]);
    const second = container.querySelector(".kw-ledger[data-turn='2']") as HTMLElement;
    expect(second.getAttribute("aria-expanded")).toBeNull();
    expect(second.querySelector(".kw-ledger-hint")?.textContent).toBe(
      " ·· u restores to before · f forks here",
    );
  });

  it("keeps an unplaced turn's line quiet: facts only, no verbs, nothing to press", () => {
    const heard: string[] = [];
    const unplaced: TranscriptLedger = {
      opening: [],
      turns: [
        { ...settledTurn, end: firstEnd, place: undefined, files: undefined, costUsd: undefined },
      ],
    };
    const { container } = render(() => (
      <ConversationPane
        projection={twoTurns}
        ledger={unplaced}
        ledgerVerbs={verbsRecording(heard)}
      />
    ));
    const line = container.querySelector(".kw-ledger") as HTMLElement;
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe("8.5s in tools");
  });
});
