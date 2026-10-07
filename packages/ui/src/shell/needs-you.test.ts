import { describe, expect, it } from "vitest";
import type { HostNotice } from "../host/port.ts";
import { inboxNeedsYouAt, inboxNotice, notifyOnInbox, risingEdge } from "./needs-you.ts";

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

  it("matches keywork's default inbox threshold of three", () => {
    expect(inboxNeedsYouAt).toBe(3);
    expect(risingEdge()(3)).toBe(true);
  });
});

describe("notifyOnInbox", () => {
  it("sends one memory-inbox notice per crossing and none while staying at or above", () => {
    const sent: HostNotice[] = [];
    let listener: ((count: number) => void) | undefined;
    const stop = notifyOnInbox(
      {
        onInbox: (next) => {
          listener = next;
          return () => undefined;
        },
      },
      { notify: async (notice) => void sent.push(notice) },
      "C:/w",
    );
    listener?.(1);
    listener?.(3);
    listener?.(4);
    listener?.(5);
    listener?.(1);
    listener?.(6);
    expect(sent).toEqual([inboxNotice("C:/w", 3), inboxNotice("C:/w", 6)]);
    expect(sent[0]?.trigger).toEqual({ kind: "memory-inbox", workspace: "C:/w", pending: 3 });
    stop();
  });
});
