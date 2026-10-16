import type { SessionSummary } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createSessionReads } from "./session-reads.ts";

describe("what the person has read", () => {
  it("counts everything the window first sees as read, since it cannot know otherwise", () => {
    const reads = createRoot(() => createSessionReads());
    reads.sight([session("a", "10:00"), session("b", "11:00")]);
    expect(reads.unread(session("a", "10:00"))).toBe(false);
    expect(reads.unread(session("c", "12:00"))).toBe(false);
  });

  it("calls newer activity unread until the person looks, and keeps a first sighting", () => {
    const reads = createRoot(() => createSessionReads());
    reads.sight([session("a", "10:00")]);
    reads.sight([session("a", "11:00"), session("b", "11:30")]);
    expect(reads.unread(session("a", "11:00"))).toBe(true);
    expect(reads.unread(session("b", "11:30"))).toBe(false);
    reads.read(session("a", "11:00"));
    expect(reads.unread(session("a", "11:00"))).toBe(false);
    expect(reads.unread(session("a", "12:15"))).toBe(true);
  });
});

function session(id: string, time: string): SessionSummary {
  const at = `2026-10-15T${time}:00.000Z`;
  return { id, title: id, createdAt: at, lastActivityAt: at, messageCount: 1 };
}
