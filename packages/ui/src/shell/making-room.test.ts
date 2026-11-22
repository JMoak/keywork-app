import type { MotionPrefs } from "@keywork-app/habitat";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hubOutline } from "../surfaces/outside/hub.ts";
import type { ConsoleMove, Desk, ScreenRect, SurfacesPort } from "../surfaces/port.ts";
import { fakeDesktop } from "../surfaces/runtime/testing.ts";
import { createRoomMaker, roomNotices } from "./making-room.ts";

const display: ScreenRect = { x: 0, y: 0, width: 1920, height: 1080 };
const windowed: ScreenRect = { x: 560, y: 140, width: 761, height: 800 };
const gliding: MotionPrefs = { reducedMotion: false, tier: "interact" };
const calm: MotionPrefs = { reducedMotion: true, tier: "interact" };

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

interface Starting {
  readonly kept?: Map<string, string>;
  readonly outside?: number;
  readonly maximized?: boolean;
  readonly motion?: MotionPrefs;
}

function bench(starting: Starting = {}) {
  const kept = starting.kept ?? new Map<string, string>();
  const moves: ConsoleMove[] = [];
  const said: string[] = [];
  const watchers: Array<(desk: Desk) => void> = [];
  let stands = { bounds: windowed, maximized: starting.maximized === true };
  const deskNow = (): Desk => ({
    console: stands.maximized ? display : stands.bounds,
    consoleMaximized: stands.maximized,
    workArea: display,
    displays: [{ bounds: display, workArea: display, scaleFactor: 1 }],
    cursor: { x: 1, y: 1 },
  });
  const port: SurfacesPort = {
    ...fakeDesktop().port,
    desk: async () => deskNow(),
    onDeskChanged: (watcher) => {
      watchers.push(watcher);
      return () => undefined;
    },
    moveConsole: async (move) => {
      moves.push(move);
      const from = stands;
      stands = { bounds: move.bounds, maximized: move.maximized };
      return { from, to: stands };
    },
  };
  const [outside, setOutside] = createSignal(starting.outside ?? 0);
  const room = createRoot((dispose) => {
    cleanups.push(dispose);
    return createRoomMaker({
      port,
      storage: { getItem: (key) => kept.get(key) ?? null, setItem: (key, to) => kept.set(key, to) },
      storageKey: "room",
      motion: () => starting.motion ?? gliding,
      panesOutside: outside,
      say: (line) => said.push(line),
    });
  });
  const keeperMovesTo = (bounds: ScreenRect): void => {
    stands = { bounds, maximized: false };
    for (const watcher of watchers) watcher(deskNow());
  };
  const asked = (company = "thread-1") =>
    room.makeRoom({ company, desk: deskNow(), fits: () => false });
  return { room, kept, moves, said, deskNow, setOutside, keeperMovesTo, asked };
}

describe("the console making room for panes outside", () => {
  it("glides to the side as their hub, and answers with the desk it then stands on", async () => {
    const made = bench();
    await made.room.restored();
    made.setOutside(1);
    const hub = hubOutline(made.deskNow());
    const desk = await made.asked();
    expect(made.moves).toHaveLength(1);
    expect(made.moves[0]).toMatchObject({ bounds: hub, maximized: false });
    expect(made.moves[0]?.durationMs).toBeGreaterThan(0);
    expect(desk.console).toEqual(hub);
    expect(made.room.standsAsHub()).toBe(true);
    expect(made.room.thread()).toBe("thread-1");
  });

  it("moves once for a spell, follows the thread asked for last, and places itself at once when motion is reduced", async () => {
    const made = bench({ motion: calm });
    await made.room.restored();
    made.setOutside(1);
    await made.asked();
    await made.asked("thread-2");
    expect(made.moves.map((move) => move.durationMs)).toEqual([0]);
    expect(made.room.thread()).toBe("thread-2");
  });

  it("returns where it was, maximised if it was, when the last pane outside comes in", async () => {
    const made = bench({ maximized: true });
    await made.room.restored();
    made.setOutside(9);
    await made.asked();
    made.setOutside(0);
    await vi.waitFor(() => expect(made.room.standsAsHub()).toBe(false));
    expect(made.moves.at(-1)).toMatchObject({ bounds: windowed, maximized: true });
  });

  it("stays where the keeper puts it for the rest of the spell, and is not moved back", async () => {
    const made = bench();
    await made.room.restored();
    made.setOutside(3);
    await made.asked();
    const his: ScreenRect = { x: 200, y: 60, width: 640, height: 900 };
    made.keeperMovesTo(his);
    await made.asked();
    made.setOutside(0);
    await vi.waitFor(() => expect(made.room.standsAsHub()).toBe(false));
    expect(made.moves).toHaveLength(1);
    expect(made.deskNow().console).toEqual(his);
  });

  it("stays as it is while the keeper has it turned off, and returns at once when he turns it off as the hub", async () => {
    const made = bench();
    await made.room.restored();
    made.setOutside(2);
    await made.asked();
    made.room.toggle();
    await vi.waitFor(() => expect(made.room.standsAsHub()).toBe(false));
    expect(made.said).toEqual([roomNotices.staysPut]);
    expect(made.deskNow().console).toEqual(windowed);
    expect((await made.asked()).console).toEqual(windowed);
    expect(made.moves).toHaveLength(2);
    made.room.toggle();
    expect(made.said.at(-1)).toBe(roomNotices.makesRoom);
  });

  it("is the hub still after a restart with panes outside, and goes home when none came back", async () => {
    const first = bench();
    await first.room.restored();
    first.setOutside(9);
    await first.asked();
    const again = bench({ kept: first.kept, outside: 9 });
    expect(again.room.standsAsHub()).toBe(true);
    expect(again.room.thread()).toBe("thread-1");
    const none = bench({ kept: first.kept, outside: 0 });
    await none.room.restored();
    expect(none.moves).toEqual([expect.objectContaining({ bounds: windowed, maximized: false })]);
    expect(none.room.standsAsHub()).toBe(false);
  });
});
