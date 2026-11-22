import { describe, expect, it } from "vitest";
import {
  askNotice,
  askReason,
  compareNeedsYou,
  dismissible,
  dismissNotice,
  type NeedsYouItem,
  orderNeedsYou,
  risingEdge,
  urgency,
} from "./needs-you.ts";
import { airlockItem, askItem, failedItem, inboxItem } from "./needs-you-testing.ts";

describe("the needs-you ordering rule", () => {
  it("puts asks first, then airlock deliveries, memory inbox items, and failed turns", () => {
    expect(Object.entries(urgency).sort(([, a], [, b]) => a - b)).toEqual([
      ["ask", 0],
      ["airlock", 1],
      ["inbox", 2],
      ["failed", 3],
      ["review", 4],
      ["chore", 5],
      ["decided", 6],
    ]);
    const ordered = orderNeedsYou([
      failedItem("s4", { since: "2026-10-15T00:00:00.000Z" }),
      inboxItem("m1", { since: "2026-10-15T00:00:01.000Z" }),
      askItem("c1", { since: "2026-10-15T12:00:00.000Z" }),
      airlockItem("pricing", { since: "2026-10-15T00:00:02.000Z" }),
    ]);
    expect(ordered.map((item) => item.kind)).toEqual(["ask", "airlock", "inbox", "failed"]);
  });

  it("answers the longest waiting first within a kind, so nothing starves", () => {
    const ordered = orderNeedsYou([
      askItem("young", { since: "2026-10-15T10:05:00.000Z" }),
      askItem("old", { since: "2026-10-15T10:00:00.000Z" }),
      askItem("middle", { since: "2026-10-15T10:02:00.000Z" }),
    ]);
    expect(ordered.map((item) => item.key)).toEqual([
      "C:/work#ask:old",
      "C:/work#ask:middle",
      "C:/work#ask:young",
    ]);
  });

  it("breaks a tie by workspace, then by key, and never depends on arrival order", () => {
    const a = askItem("c2", { workspace: "C:/beta" });
    const b = askItem("c1", { workspace: "C:/alpha" });
    const c = askItem("c0", { workspace: "C:/alpha" });
    expect(orderNeedsYou([a, b, c])).toEqual(orderNeedsYou([c, a, b]));
    expect(orderNeedsYou([a, b, c]).map((item) => item.key)).toEqual([
      "C:/alpha#ask:c0",
      "C:/alpha#ask:c1",
      "C:/beta#ask:c2",
    ]);
    expect(compareNeedsYou(a, a)).toBe(0);
  });

  it("treats a missing timestamp as the oldest rather than throwing the order", () => {
    const ordered = orderNeedsYou([askItem("dated"), askItem("undated", { since: "" })]);
    expect(ordered.map((item) => item.key)).toEqual(["C:/work#ask:undated", "C:/work#ask:dated"]);
  });
});

describe("the needs-you words", () => {
  it("lets everything but an ask be dismissed, and says why an ask cannot be", () => {
    const items: NeedsYouItem[] = [
      askItem("c1"),
      airlockItem("pricing"),
      inboxItem("m1"),
      failedItem("s4"),
    ];
    expect(items.map(dismissible)).toEqual([false, true, true, true]);
    expect(dismissNotice(askItem("c1"))).toBe(
      "an ask is answered, never dismissed · enter goes to its card",
    );
    expect(dismissNotice(failedItem("s4"))).toBe("dismissed · the transcript keeps the failure");
    expect(dismissNotice(inboxItem("m1"))).toBe("dismissed · the memory pane still holds it");
  });

  it("builds the ask toast the tray has always sent", () => {
    expect(askNotice(askItem("c1"), "refactor-permissions")).toEqual({
      title: "refactor-permissions",
      body: askReason,
      trigger: { kind: "ask", workspace: "C:/work", sessionId: "s1", callId: "c1" },
    });
    expect(askReason).toBe("needs you · ask");
  });
});

describe("the memory inbox rising edge", () => {
  it("fires once when the count crosses the threshold and stays quiet above it", () => {
    const crossed = risingEdge();
    expect(crossed(0)).toBe(false);
    expect(crossed(2)).toBe(false);
    expect(crossed(3)).toBe(true);
    expect(crossed(4)).toBe(false);
    expect(crossed(5)).toBe(false);
  });

  it("re-arms once the count drops below the threshold", () => {
    const crossed = risingEdge();
    expect(crossed(3)).toBe(true);
    expect(crossed(2)).toBe(false);
    expect(crossed(3)).toBe(true);
  });
});
