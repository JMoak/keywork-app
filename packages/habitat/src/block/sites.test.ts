import { describe, expect, it } from "vitest";
import { emptyThread, type HabitatState, type Thread } from "../world/types.ts";
import { type ConversationPlace, directoriesIn, floorsFor, projectSitesOf } from "./sites.ts";
import { noon, sketchTown, slugOf } from "./testing.ts";

describe("project buildings from the directories a creature has worked in", () => {
  it("grows floors on a doubling scale: one for one or two conversations, one more per doubling, at most twenty", () => {
    expect([1, 2, 3, 4, 7, 8, 15, 16, 31, 32].map(floorsFor)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    expect(floorsFor(2 ** 20 - 1)).toBe(19);
    expect(floorsFor(2 ** 20)).toBe(20);
    expect(floorsFor(2 ** 30)).toBe(20);
  });

  it("gives each creature its directories, oldest first, with every conversation counted, old ones too", () => {
    const ada = slugOf(0);
    const state = withThreads(sketchTown(2), [
      thread("a1", ada),
      thread("a2", ada),
      thread("a3", ada),
      thread("a4", ada, true),
      thread("b1", slugOf(1)),
      thread("loose", undefined),
    ]);
    const places: Record<string, ConversationPlace> = {
      a1: place("/work/lamps", "2025-01-02T00:00:00.000Z"),
      a2: place("/work/bells", "2024-03-01T00:00:00.000Z"),
      a3: place("/work/lamps", "2026-11-20T00:00:00.000Z"),
      a4: place("/work/lamps", "2026-11-22T11:00:00.000Z"),
      b1: place("/work/bells", "2026-01-01T00:00:00.000Z"),
      loose: place("/work/nowhere", "2026-01-01T00:00:00.000Z"),
    };
    const sites = projectSitesOf(state, places, { "/work/lamps": 120 });
    expect(sites[ada]).toEqual([
      {
        id: "/work/bells",
        floors: 1,
        lit: false,
        conversations: 1,
        trackedFiles: undefined,
        since: Date.parse("2024-03-01T00:00:00.000Z"),
        latest: Date.parse("2024-03-01T00:00:00.000Z"),
      },
      {
        id: "/work/lamps",
        floors: 1,
        lit: true,
        conversations: 3,
        trackedFiles: 120,
        since: Date.parse("2025-01-02T00:00:00.000Z"),
        latest: Date.parse("2026-11-22T11:00:00.000Z"),
      },
    ]);
    expect(sites[slugOf(1)]?.map((site) => site.id)).toEqual(["/work/bells"]);
    expect(directoriesIn(places)).toEqual(["/work/bells", "/work/lamps", "/work/nowhere"]);
  });

  it("leaves out a conversation whose directory is not known yet and a creature with none", () => {
    const state = withThreads(sketchTown(2), [thread("a1", slugOf(0)), thread("a2", slugOf(0))]);
    const sites = projectSitesOf(state, { a2: place("/work/lamps", "2026-01-01T00:00:00.000Z") });
    expect(sites[slugOf(0)]?.map((site) => site.conversations)).toEqual([1]);
    expect(Object.keys(sites)).toEqual([slugOf(0)]);
  });
});

function withThreads(state: HabitatState, threads: readonly Thread[]): HabitatState {
  return { ...state, threads: Object.fromEntries(threads.map((each) => [each.id, each])) };
}

function thread(id: string, creature: string | undefined, running = false): Thread {
  const at = new Date(noon).toISOString();
  return {
    ...emptyThread(id, at),
    creature,
    turn: running
      ? { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined }
      : undefined,
  };
}

function place(directory: string, startedAt: string): ConversationPlace {
  return { directory, startedAt };
}
