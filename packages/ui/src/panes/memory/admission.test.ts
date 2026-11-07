import type { StagedItem } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { inboxNeedsYouAt } from "../../shell/needs-you.ts";
import { stagedWrites, stagingNeedsYou, stagingTitle } from "./admission.ts";
import { inboxView } from "./rows.ts";

function staged(id: string, created: string, source?: string): StagedItem {
  return {
    id,
    kind: "note",
    target: `${id}.md`,
    created,
    content: "x\n",
    ...(source !== undefined && { source }),
  };
}

const proposal: StagedItem = {
  id: "p1",
  kind: "merge-proposal",
  keep: "A",
  retire: "B",
  confidence: 0.9,
  key: "merge:a<->b",
  created: "2026-11-06T08:00:00.000Z",
};

describe("staged admissions", () => {
  it("name their untrusted source on the inbox row", () => {
    expect(inboxView(staged("s1", "2026-11-06T09:00:00.000Z", "web:example.com")).detail).toBe(
      "note from web:example.com",
    );
    expect(inboxView(staged("s2", "2026-11-06T09:00:00.000Z")).detail).toBe("note");
  });

  it("raise no needs-you item below the inbox threshold and exactly one at it", () => {
    const below = Array.from({ length: inboxNeedsYouAt - 1 }, (_, index) =>
      staged(`s${index}`, `2026-11-06T09:0${index}:00.000Z`, "web:example.com"),
    );
    expect(stagingNeedsYou("ws", [...below, proposal])).toEqual([]);
    const crossing = [...below, staged("late", "2026-11-06T08:30:00.000Z", "creature:pip")];
    expect(stagingNeedsYou("ws", crossing)).toEqual([
      {
        kind: "inbox",
        key: "ws#inbox:staging",
        workspace: "ws",
        since: "2026-11-06T08:30:00.000Z",
        itemId: "late",
        title: "3 staged from web:example.com and creature:pip wait for admit or drop",
      },
    ]);
  });

  it("count only staged writes, never the gardener's proposals", () => {
    expect(stagedWrites([proposal, staged("s1", "t")]).map((item) => item.id)).toEqual(["s1"]);
    expect(
      stagingTitle(
        stagedWrites([
          staged("a", "t", "web:a"),
          staged("b", "t", "web:b"),
          staged("c", "t", "web:c"),
        ]),
      ),
    ).toBe("3 staged from 3 sources wait for admit or drop");
  });
});
