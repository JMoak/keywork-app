import { describe, expect, it } from "vitest";
import { type ConsoleMoved, type Desk, type SurfaceEvent, surfaceChannels } from "./channels.ts";
import { glideFrameMs } from "./pacer.ts";
import { newsEveryMs } from "./surfaces.ts";
import {
  consoleBounds,
  consoleSeen,
  type FakeConsoleWindow,
  helpedBench,
  laptop,
  paneBounds,
  spawnBounds,
  surfaceBench,
} from "./testing.ts";

const beside = { x: 1500, y: 200, width: 400, height: 300 };

function eventsOf(console: FakeConsoleWindow, kind: SurfaceEvent["kind"]): SurfaceEvent[] {
  return console.events().filter((event) => event.kind === kind);
}

function aTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a window the console opens for a pane", () => {
  it("is registered under its frame name, kept hidden, and announced ready to its console", () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    expect(window.visible).toBe(false);
    expect(window.calls).toEqual([]);
    expect(bench.console.events()).toEqual([{ kind: "ready", id: "kw-surface:1" }]);
    expect(bench.service.holds(window.contentsId)).toBe(true);
    expect(bench.service.holds(bench.console.sender.id)).toBe(false);
  });

  it("belongs to the console that opened it, so two consoles may use the same name", async () => {
    const bench = surfaceBench();
    const other = bench.openConsole();
    const mine = bench.open("kw-surface:1");
    const theirs = bench.open("kw-surface:1", other);
    await bench.show({ id: "kw-surface:1" });
    expect(mine.visible).toBe(true);
    expect(theirs.visible).toBe(false);
    expect(other.events()).toEqual([{ kind: "ready", id: "kw-surface:1" }]);
  });

  it("replaces an older window opened under the same name", () => {
    const bench = surfaceBench();
    const older = bench.open("kw-surface:1");
    const newer = bench.open("kw-surface:1");
    expect(older.destroyed).toBe(true);
    expect(newer.destroyed).toBe(false);
    expect(eventsOf(bench.console, "closed")).toEqual([]);
  });

  it("answers only a console window", async () => {
    const bench = surfaceBench();
    bench.open("kw-surface:1");
    await expect(
      bench.ports.ipc.invoke(surfaceChannels.show, { id: 999 }, { id: "kw-surface:1" }),
    ).rejects.toThrow("only a console window keeps panes outside itself");
    await expect(bench.ports.ipc.invoke(surfaceChannels.desk, { id: 999 })).rejects.toThrow();
  });

  it("refuses to show or focus a pane it does not hold, and shrugs at hiding or closing one", async () => {
    const bench = surfaceBench();
    await expect(bench.show({ id: "kw-surface:9" })).rejects.toThrow(
      'no pane outside the window answers to "kw-surface:9"',
    );
    await expect(bench.ask(surfaceChannels.focus, "kw-surface:9")).rejects.toThrow();
    await expect(bench.ask(surfaceChannels.hide, "kw-surface:9")).resolves.toBeUndefined();
    await expect(bench.ask(surfaceChannels.close, "kw-surface:9")).resolves.toBeUndefined();
  });
});

describe("showing a pane outside", () => {
  it("dresses and places the window before it appears", async () => {
    const bench = surfaceBench();
    bench.console.zoom = 1.25;
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", bounds: beside, backdrop: "paper", title: "notes" });
    expect(window.calls).toEqual(["setBounds:1500,200,400x300", "showInactive"]);
    expect(window.backdrop).toBe("paper");
    expect(window.title).toBe("notes");
    expect(window.zoom).toBe(1.25);
    expect(bench.service.backdrop()).toBe("paper");
  });

  it("never focuses for a creature, whatever the request says about focus", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", origin: "creature", focus: true });
    expect(window.visible).toBe(true);
    expect(window.calls).toContain("showInactive");
    expect(window.calls).not.toContain("show");
    expect(window.calls).not.toContain("focus");
    expect(window.focused).toBe(false);
    expect(eventsOf(bench.console, "focused")).toEqual([]);
  });

  it("focuses for the keeper only when the keeper asked for focus", async () => {
    const bench = surfaceBench();
    const asked = bench.open("kw-surface:1");
    const quiet = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1", origin: "keeper", focus: true });
    await bench.show({ id: "kw-surface:2", origin: "keeper", focus: false });
    expect(asked.calls.slice(-2)).toEqual(["show", "focus"]);
    expect(quiet.calls).toContain("showInactive");
    expect(quiet.calls).not.toContain("focus");
  });

  it("rounds the bounds a zoomed page measured", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({
      id: "kw-surface:1",
      bounds: { x: 1500.4, y: 199.6, width: 400.2, height: 299.5 },
    });
    expect(window.getBounds()).toEqual({ x: 1500, y: 200, width: 400, height: 300 });
  });

  it("hides back to a live hidden window that can be shown again", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(window.visible).toBe(false);
    expect(window.destroyed).toBe(false);
    await bench.show({ id: "kw-surface:1" });
    expect(window.visible).toBe(true);
    expect(eventsOf(bench.console, "closed")).toEqual([]);
  });

  it("focuses a pane or the console when asked, and relays focus coming and going", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.ask(surfaceChannels.focus, "kw-surface:1");
    expect(window.focused).toBe(true);
    window.emit("blur");
    await bench.ask(surfaceChannels.focusConsole);
    expect(bench.console.calls).toEqual(["focus"]);
    expect(bench.console.events().slice(1)).toEqual([
      { kind: "focused", id: "kw-surface:1" },
      { kind: "blurred", id: "kw-surface:1" },
    ]);
  });
});

describe("gliding", () => {
  it("snaps the size first, then moves only the position, and settles on the place", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    expect(window.calls).toEqual([`setBounds:${spawnBounds.x},${spawnBounds.y},400x300`]);
    bench.ports.clock.advance(200 + glideFrameMs);
    await settled;
    expect(window.calls.slice(1).every((call) => call.startsWith("setPosition:"))).toBe(true);
    expect(window.calls.length).toBeGreaterThan(10);
    expect(window.getBounds()).toEqual(beside);
  });

  it("answers only once every pane in it has come to rest", async () => {
    const bench = surfaceBench();
    bench.open("kw-surface:1");
    let settled = false;
    void bench
      .ask(surfaceChannels.glide, {
        moves: [{ id: "kw-surface:1", bounds: beside }],
        durationMs: 200,
      })
      .then(() => {
        settled = true;
      });
    bench.ports.clock.advance(190);
    await aTurn();
    expect(settled).toBe(false);
    bench.ports.clock.advance(20);
    await aTurn();
    expect(settled).toBe(true);
  });

  it("moves every pane of the request together and skips one it does not hold", async () => {
    const bench = surfaceBench();
    const first = bench.open("kw-surface:1");
    const second = bench.open("kw-surface:2");
    const home = { x: 300, y: 300, width: 500, height: 400 };
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [
        { id: "kw-surface:1", bounds: beside },
        { id: "kw-surface:gone", bounds: beside },
        { id: "kw-surface:2", bounds: home },
      ],
      durationMs: 160,
    });
    bench.ports.clock.advance(200);
    await settled;
    expect(first.getBounds()).toEqual(beside);
    expect(second.getBounds()).toEqual(home);
  });

  it("jumps when given no time", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 0,
    });
    expect(window.getBounds()).toEqual(beside);
    expect(window.calls).toEqual([
      `setBounds:${spawnBounds.x},${spawnBounds.y},400x300`,
      "setPosition:1500,200",
    ]);
  });

  it("hands a pane to its newest glide and lets the older one answer", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    const out = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.ports.clock.advance(40);
    const turnedAt = window.getBounds();
    const home = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: { ...beside, x: 300, y: 300 } }],
      durationMs: 200,
    });
    await out;
    bench.ports.clock.advance(250);
    await home;
    expect(turnedAt.x).toBeGreaterThan(spawnBounds.x);
    expect(window.getBounds()).toEqual({ ...beside, x: 300, y: 300 });
  });

  it("reports where the host moved a pane, a few times on the way and once at rest", async () => {
    const bench = surfaceBench();
    bench.open("kw-surface:1");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.ports.clock.advance(200 + newsEveryMs + glideFrameMs);
    await settled;
    const moves = eventsOf(bench.console, "moved");
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.length).toBeLessThanOrEqual(8);
    expect(moves.every((event) => event.kind === "moved" && event.by === "host")).toBe(true);
    expect(moves.at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: beside,
      by: "host",
    });
  });

  it("stops for a pane that is hidden, shown elsewhere or closed on the way", async () => {
    const bench = surfaceBench();
    const hidden = bench.open("kw-surface:1");
    const shown = bench.open("kw-surface:2");
    const closed = bench.open("kw-surface:3");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: ["kw-surface:1", "kw-surface:2", "kw-surface:3"].map((id) => ({ id, bounds: beside })),
      durationMs: 200,
    });
    bench.ports.clock.advance(40);
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    await bench.show({ id: "kw-surface:2", bounds: paneBounds });
    await bench.ask(surfaceChannels.close, "kw-surface:3");
    const hiddenAt = hidden.getBounds();
    await settled;
    bench.ports.clock.advance(300);
    expect(hidden.getBounds()).toEqual(hiddenAt);
    expect(shown.getBounds()).toEqual(paneBounds);
    expect(closed.destroyed).toBe(true);
  });

  it("lets go of a pane the keeper grabs on the way, and carries the others on", async () => {
    const bench = surfaceBench();
    const grabbed = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: ["kw-surface:1", "kw-surface:2"].map((id) => ({ id, bounds: beside })),
      durationMs: 200,
    });
    bench.ports.clock.advance(40);
    grabbed.keeperDragsTo({ x: 40, y: 60 });
    bench.ports.clock.advance(300);
    await settled;
    expect(grabbed.getBounds()).toMatchObject({ x: 40, y: 60 });
    expect(other.getBounds()).toEqual(beside);
  });
});

describe("a pane the keeper moves", () => {
  it("is reported as the keeper's, coalesced while it moves and at once when let go", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    bench.ports.clock.advance(newsEveryMs);
    const before = eventsOf(bench.console, "moved").length;
    for (let step = 1; step <= 20; step += 1) window.keeperDragsTo({ x: 100 + step, y: 90 });
    expect(eventsOf(bench.console, "moved")).toHaveLength(before);
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").slice(before)).toEqual([
      { kind: "moved", id: "kw-surface:1", bounds: { ...paneBounds, x: 120, y: 90 }, by: "keeper" },
    ]);
    window.keeperDragsTo({ x: 300, y: 310 });
    window.keeperLetsGo();
    expect(eventsOf(bench.console, "moved").at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { ...paneBounds, x: 300, y: 310 },
      by: "keeper",
    });
  });

  it("is the keeper's when the desktop moves it with no grab the host could see", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    bench.ports.clock.advance(newsEveryMs);
    window.desktopMovesTo({ x: 2200, y: 300 });
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").at(-1)).toMatchObject({ by: "keeper" });
  });

  it("is the keeper's when a host placement and a keeper move share one report", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    window.keeperDragsTo({ x: 80, y: 80 });
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved")).toEqual([
      { kind: "moved", id: "kw-surface:1", bounds: { ...paneBounds, x: 80, y: 80 }, by: "keeper" },
    ]);
  });

  it("reports a resize by its edges the same way", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    bench.ports.clock.advance(newsEveryMs);
    const wider = { ...paneBounds, width: 640 };
    window.keeperResizesTo(wider);
    window.keeperLetsGo();
    expect(eventsOf(bench.console, "moved").at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: wider,
      by: "keeper",
    });
  });

  it("reports a placement of the host's as the host's", async () => {
    const bench = surfaceBench();
    bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", bounds: beside });
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved")).toEqual([
      { kind: "moved", id: "kw-surface:1", bounds: beside, by: "host" },
    ]);
  });
});

describe("a pane that follows the console", () => {
  it("shifts by as far as the console moved, and says the host moved it", async () => {
    const bench = surfaceBench();
    const follower = bench.open("kw-surface:1");
    const settler = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1", follows: true });
    await bench.show({ id: "kw-surface:2", follows: false });
    bench.ports.clock.advance(newsEveryMs);
    const before = eventsOf(bench.console, "moved").length;
    bench.console.movesTo({ x: consoleBounds.x + 60, y: consoleBounds.y - 30 });
    expect(follower.getBounds()).toEqual({ ...paneBounds, x: paneBounds.x + 60, y: 90 });
    expect(settler.getBounds()).toEqual(paneBounds);
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").slice(before)).toEqual([
      {
        kind: "moved",
        id: "kw-surface:1",
        bounds: { ...paneBounds, x: paneBounds.x + 60, y: 90 },
        by: "host",
      },
    ]);
  });

  it("keeps up with every step of a console drag", async () => {
    const bench = surfaceBench();
    const follower = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    for (let step = 1; step <= 30; step += 1) bench.console.movesTo({ x: 200 + step * 4, y: 100 });
    expect(follower.getBounds().x).toBe(paneBounds.x + 120);
  });

  it("stops following once the keeper has moved it", async () => {
    const bench = surfaceBench();
    const follower = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    follower.keeperDragsTo({ x: 900, y: 500 });
    follower.keeperLetsGo();
    bench.console.movesTo({ x: 400, y: 300 });
    expect(follower.getBounds()).toMatchObject({ x: 900, y: 500 });
  });

  it("follows again when it is shown again as a follower", async () => {
    const bench = surfaceBench();
    const follower = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    follower.keeperDragsTo({ x: 900, y: 500 });
    follower.keeperLetsGo();
    await bench.show({ id: "kw-surface:1", follows: true });
    bench.console.movesTo({ x: consoleBounds.x + 10, y: consoleBounds.y });
    expect(follower.getBounds().x).toBe(paneBounds.x + 10);
  });

  it("stays put while hidden, when the console only changes size, or while it is minimised", async () => {
    const bench = surfaceBench();
    const hidden = bench.open("kw-surface:1");
    const follower = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1", follows: true });
    await bench.show({ id: "kw-surface:2", follows: true });
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    bench.console.movesTo({ x: 260, y: 100 });
    expect(hidden.getBounds()).toEqual(paneBounds);
    expect(follower.getBounds().x).toBe(paneBounds.x + 60);
    bench.console.resizesTo({ x: 0, y: 0, width: 1920, height: 1040 });
    expect(follower.getBounds().x).toBe(paneBounds.x + 60);
    bench.console.minimized = true;
    bench.console.movesTo({ x: -32000, y: -32000 });
    expect(follower.getBounds().x).toBe(paneBounds.x + 60);
  });

  it("is left to the desktop where child windows already ride with their parent", async () => {
    const bench = surfaceBench({ childrenRideWithParent: true });
    const follower = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    bench.console.movesTo({ x: 260, y: 100 });
    expect(follower.getBounds()).toEqual(paneBounds);
  });
});

describe("the desk", () => {
  it("is read on request: the console, its work area, the displays and the cursor", async () => {
    const bench = surfaceBench();
    await expect(bench.ask(surfaceChannels.desk)).resolves.toEqual({
      console: consoleSeen,
      consoleMaximized: false,
      workArea: laptop.workArea,
      displays: bench.ports.screen.displays(),
      cursor: { x: 640, y: 480 },
    });
  });

  it("is pushed once per beat while the console is dragged, with where it ended up", async () => {
    const bench = surfaceBench();
    await bench.ask(surfaceChannels.desk);
    for (let step = 1; step <= 40; step += 1) bench.console.movesTo({ x: 200 + step, y: 100 });
    expect(bench.console.desks()).toEqual([]);
    bench.ports.clock.advance(newsEveryMs);
    expect(bench.console.desks()).toHaveLength(1);
    expect(bench.console.desks()[0]).toMatchObject({ console: { ...consoleSeen, x: 240 } });
    bench.ports.clock.advance(10 * newsEveryMs);
    expect(bench.console.desks()).toHaveLength(1);
  });

  it("is pushed to a page that only subscribed, and when a display changes", () => {
    const bench = surfaceBench();
    bench.ports.ipc.emit(surfaceChannels.watchDesk, bench.console.sender);
    bench.ports.screen.set([laptop]);
    bench.ports.clock.advance(newsEveryMs);
    expect(bench.console.desks()).toEqual([expect.objectContaining({ displays: [laptop] })]);
  });

  it("is not pushed again when nothing but the cursor differs", async () => {
    const bench = surfaceBench();
    await bench.ask(surfaceChannels.desk);
    bench.console.movesTo({ x: 300, y: 100 });
    bench.ports.clock.advance(newsEveryMs);
    bench.ports.screen.pointer = { x: 1, y: 1 };
    bench.console.movesTo({ x: 300, y: 100 });
    bench.ports.clock.advance(newsEveryMs);
    expect(bench.console.desks()).toHaveLength(1);
  });

  it("costs no timer while nothing moves", async () => {
    const bench = surfaceBench();
    bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    bench.ports.clock.advance(60_000);
    const quiet = bench.console.sent.length;
    bench.ports.clock.advance(60_000);
    expect(bench.console.sent).toHaveLength(quiet);
  });
});

describe("the end of a pane outside", () => {
  it("keeps the window when the desktop asks to close it: hidden, alive, and reported closed", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    expect(window.desktopAsksToClose()).toBe("kept");
    expect(window.visible).toBe(false);
    expect(window.destroyed).toBe(false);
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
  });

  it("lets that window go once the page says its pane is home, and not before", async () => {
    const bench = surfaceBench();
    const leaving = bench.open("kw-surface:1");
    const staying = bench.open("kw-surface:2");
    leaving.desktopAsksToClose();
    await expect(bench.show({ id: "kw-surface:1" })).rejects.toThrow();
    expect(leaving.destroyed).toBe(false);
    bench.ports.ipc.emit(surfaceChannels.broughtHome, bench.console.sender, "kw-surface:2");
    expect(staying.destroyed).toBe(false);
    bench.ports.ipc.emit(surfaceChannels.broughtHome, bench.console.sender, "kw-surface:1");
    expect(leaving.destroyed).toBe(true);
    expect(bench.service.holds(leaving.contentsId)).toBe(false);
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
  });

  it("lets a window go only for the console that owns it", () => {
    const bench = surfaceBench();
    const other = bench.openConsole();
    const leaving = bench.open("kw-surface:1");
    leaving.desktopAsksToClose();
    bench.ports.ipc.emit(surfaceChannels.broughtHome, other.sender, "kw-surface:1");
    bench.ports.ipc.emit(surfaceChannels.broughtHome, { id: 999 }, "kw-surface:1");
    expect(leaving.destroyed).toBe(false);
  });

  it("destroys the window when the console's page closes it, with nothing to report back", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.ask(surfaceChannels.close, "kw-surface:1");
    expect(window.destroyed).toBe(true);
    expect(eventsOf(bench.console, "closed")).toEqual([]);
    expect(bench.service.holds(window.contentsId)).toBe(false);
    await expect(bench.show({ id: "kw-surface:1" })).rejects.toThrow();
  });

  it("reports a window that was destroyed behind its back", () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    window.destroy();
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
    expect(bench.service.holds(window.contentsId)).toBe(false);
  });

  it("closes every pane of a console whose page reloads or crashes, and serves the new page", () => {
    const bench = surfaceBench();
    const other = bench.openConsole();
    const windows = [bench.open("kw-surface:1"), bench.open("kw-surface:2")];
    const theirs = bench.open("kw-surface:1", other);
    bench.console.reloads();
    expect(windows.map((window) => window.destroyed)).toEqual([true, true]);
    expect(theirs.destroyed).toBe(false);
    expect(eventsOf(bench.console, "closed")).toEqual([]);
    const fresh = bench.open("kw-surface:1");
    expect(fresh.destroyed).toBe(false);
    expect(eventsOf(bench.console, "ready")).toHaveLength(3);
  });

  it("closes every pane when its console closes, and lets them go without a fight", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    bench.console.movesTo({ x: 300, y: 100 });
    const said = bench.console.sent.length;
    bench.console.closes();
    expect(window.destroyed).toBe(true);
    bench.ports.clock.advance(10 * newsEveryMs);
    expect(bench.console.sent).toHaveLength(said);
  });

  it("stops keeping windows open once the app is quitting", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    const gliding = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.service.dispose();
    await gliding;
    expect(window.destroyed).toBe(true);
    expect(bench.ports.ipc.released).toBe(true);
    expect(bench.ports.screen.watchers()).toBe(0);
    expect(bench.open("kw-surface:2").destroyed).toBe(true);
  });
});

describe("a pane the keeper snaps or maximises", () => {
  const snappedLeft = { x: 0, y: 0, width: 960, height: 1040 };

  it("reports a snap as the keeper's, with the bounds the pane ends up with", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    bench.ports.clock.advance(newsEveryMs);
    window.keeperSnapsTo(snappedLeft);
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: snappedLeft,
      by: "keeper",
    });
    bench.console.movesTo({ x: consoleBounds.x + 60, y: consoleBounds.y });
    expect(window.getBounds()).toEqual(snappedLeft);
  });

  it("reports a maximise and the restore after it as the keeper's, each with its real bounds", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    bench.ports.clock.advance(newsEveryMs);
    window.keeperMaximisesOver(laptop.workArea);
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: laptop.workArea,
      by: "keeper",
    });
    window.keeperRestores();
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").at(-1)).toEqual({
      kind: "moved",
      id: "kw-surface:1",
      bounds: paneBounds,
      by: "keeper",
    });
  });

  it("stays where it is maximised when the console moves, even shown again as a follower", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    window.keeperMaximisesOver(laptop.workArea);
    bench.console.movesTo({ x: consoleBounds.x + 60, y: consoleBounds.y });
    expect(window.getBounds()).toEqual(laptop.workArea);
    await bench.show({ id: "kw-surface:1", bounds: laptop.workArea, follows: true });
    bench.console.movesTo({ x: consoleBounds.x + 120, y: consoleBounds.y });
    expect(window.getBounds()).toEqual(laptop.workArea);
  });

  it("is left alone by a glide that carries the other panes", async () => {
    const bench = surfaceBench();
    const maximised = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1" });
    await bench.show({ id: "kw-surface:2" });
    maximised.keeperMaximisesOver(laptop.workArea);
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [
        { id: "kw-surface:1", bounds: beside },
        { id: "kw-surface:2", bounds: beside },
      ],
      durationMs: 160,
    });
    bench.ports.clock.advance(200);
    await settled;
    expect(maximised.getBounds()).toEqual(laptop.workArea);
    expect(maximised.maximized).toBe(true);
    expect(other.getBounds()).toEqual(beside);
  });

  it("is closed rather than kept when it hides, and says so, since no placement moves it", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    window.keeperMaximisesOver(laptop.workArea);
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(window.destroyed).toBe(true);
    expect(window.calls).not.toContain("hide");
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
    await expect(bench.show({ id: "kw-surface:1" })).rejects.toThrow();
  });

  it("is kept for the next pane once the keeper has restored it", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    window.keeperMaximisesOver(laptop.workArea);
    window.keeperRestores();
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(window.destroyed).toBe(false);
    await bench.show({ id: "kw-surface:1", bounds: beside });
    expect(window.getBounds()).toEqual(beside);
    expect(eventsOf(bench.console, "closed")).toEqual([]);
  });
});

describe("gliding with the helper in use", () => {
  it("snaps the size itself, then hands the helper where each window stands and goes, in pixels", async () => {
    const bench = helpedBench({ pixelsPerPoint: 2 });
    const window = bench.open("kw-surface:1");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    expect(window.calls).toEqual([`setBounds:${spawnBounds.x},${spawnBounds.y},400x300`]);
    expect(bench.pipes.written).toEqual([`glide 1 200 ${window.nativeHandle()}@1120,480>3000,400`]);
    bench.ports.clock.advance(200);
    bench.helperLands();
    await settled;
    expect(window.getBounds()).toEqual(beside);
    expect(window.calls).toHaveLength(1);
  });

  it("answers only once the helper says every pane has come to rest", async () => {
    const bench = helpedBench();
    bench.open("kw-surface:1");
    let settled = false;
    void bench
      .ask(surfaceChannels.glide, {
        moves: [{ id: "kw-surface:1", bounds: beside }],
        durationMs: 200,
      })
      .then(() => {
        settled = true;
      });
    bench.ports.clock.advance(210);
    await aTurn();
    expect(settled).toBe(false);
    bench.helperLands();
    await aTurn();
    expect(settled).toBe(true);
  });

  it("asks the helper to jump when given no time, and leaves a maximised pane out", async () => {
    const bench = helpedBench();
    const maximised = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1" });
    await bench.show({ id: "kw-surface:2" });
    maximised.keeperMaximisesOver(laptop.workArea);
    const settled = bench.ask(surfaceChannels.glide, {
      moves: ["kw-surface:1", "kw-surface:2"].map((id) => ({ id, bounds: beside })),
      durationMs: 0,
    });
    expect(bench.pipes.written.filter((line) => line.startsWith("glide "))).toEqual([
      `glide 1 0 ${other.nativeHandle()}@${paneBounds.x},${paneBounds.y}>${beside.x},${beside.y}`,
    ]);
    bench.helperLands();
    await settled;
    expect(other.getBounds()).toEqual(beside);
    expect(maximised.getBounds()).toEqual(laptop.workArea);
  });

  it("reports the helper's moves as the host's, on the way and at rest", async () => {
    const bench = helpedBench();
    bench.open("kw-surface:1");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.helperCarries(bench.lastGlide(), 0.5);
    bench.ports.clock.advance(newsEveryMs);
    bench.helperLands();
    await settled;
    bench.ports.clock.advance(newsEveryMs);
    const moves = eventsOf(bench.console, "moved");
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.every((event) => event.kind === "moved" && event.by === "host")).toBe(true);
    expect(moves.at(-1)).toEqual({ kind: "moved", id: "kw-surface:1", bounds: beside, by: "host" });
  });

  it("is the host's glide even for a pane the keeper was still holding when it began", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1" });
    window.keeperDragsTo({ x: 900, y: 500 });
    bench.ports.clock.advance(newsEveryMs);
    const before = eventsOf(bench.console, "moved").length;
    void bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.helperCarries(bench.lastGlide(), 0.5);
    bench.ports.clock.advance(newsEveryMs);
    expect(eventsOf(bench.console, "moved").slice(before)).toMatchObject([{ by: "host" }]);
    expect(bench.pipes.written.some((line) => line.startsWith("release "))).toBe(false);
  });

  it("tells the helper to let go of a pane the keeper grabs, and carries the others on", async () => {
    const bench = helpedBench();
    const grabbed = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: ["kw-surface:1", "kw-surface:2"].map((id) => ({ id, bounds: beside })),
      durationMs: 200,
    });
    const glide = bench.lastGlide();
    grabbed.keeperDragsTo({ x: 40, y: 60 });
    expect(bench.pipes.written.slice(1)).toEqual([`release ${grabbed.nativeHandle()}`, "stats"]);
    bench.pipes.says("stats frames=2 missed=0 mean_us=90 worst_us=120");
    other.desktopMovesTo(beside);
    bench.pipes.says(`settled ${glide.id}`);
    await settled;
    bench.ports.clock.advance(newsEveryMs);
    expect(grabbed.getBounds()).toMatchObject({ x: 40, y: 60 });
    expect(other.getBounds()).toEqual(beside);
    expect(eventsOf(bench.console, "moved")).toContainEqual(
      expect.objectContaining({ id: "kw-surface:1", by: "keeper" }),
    );
  });

  it("lets go of a pane that is hidden, shown elsewhere or closed on the way", async () => {
    const bench = helpedBench();
    const hidden = bench.open("kw-surface:1");
    const shown = bench.open("kw-surface:2");
    const closed = bench.open("kw-surface:3");
    const releases = [hidden, shown, closed].map((window) => `release ${window.nativeHandle()}`);
    const settled = bench.ask(surfaceChannels.glide, {
      moves: ["kw-surface:1", "kw-surface:2", "kw-surface:3"].map((id) => ({ id, bounds: beside })),
      durationMs: 200,
    });
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    await bench.show({ id: "kw-surface:2", bounds: paneBounds });
    await bench.ask(surfaceChannels.close, "kw-surface:3");
    await settled;
    expect(bench.pipes.written.filter((line) => line.startsWith("release "))).toEqual(releases);
    expect(shown.getBounds()).toEqual(paneBounds);
    expect(closed.destroyed).toBe(true);
  });

  it("puts a pane back where it was shown when a move the helper had already made lands late", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    void bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    await bench.show({ id: "kw-surface:1", bounds: paneBounds });
    window.desktopMovesTo({ x: 700, y: 230 });
    expect(window.getBounds()).toMatchObject({ x: 700, y: 230 });
    bench.pipes.says("stats frames=3 missed=0 mean_us=90 worst_us=120");
    expect(window.getBounds()).toEqual(paneBounds);
    bench.ports.clock.advance(newsEveryMs);
    const moves = eventsOf(bench.console, "moved");
    expect(moves.every((event) => event.kind === "moved" && event.by === "host")).toBe(true);
    expect(moves.at(-1)).toMatchObject({ bounds: paneBounds });
  });

  it("leaves a pane the keeper took where the keeper put it, whatever lands late", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    void bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    await bench.show({ id: "kw-surface:1", bounds: paneBounds });
    window.keeperDragsTo({ x: 40, y: 60 });
    window.keeperLetsGo();
    bench.pipes.says("stats frames=3 missed=0 mean_us=90 worst_us=120");
    expect(window.getBounds()).toMatchObject({ x: 40, y: 60 });
  });

  it("carries a glide on itself, from where each pane stands, when the helper goes away", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    const settled = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.ports.clock.advance(60);
    bench.helperCarries(bench.lastGlide(), 0.4);
    const stoodAt = window.getBounds();
    bench.pipes.ends();
    bench.ports.clock.advance(200);
    await settled;
    expect(window.getBounds()).toEqual(beside);
    const placed = window.calls.filter((call) => call.startsWith("setPosition:"));
    expect(placed.length).toBeGreaterThan(3);
    expect(Number(placed[0]?.slice("setPosition:".length).split(",")[0])).toBeGreaterThanOrEqual(
      stoodAt.x,
    );
    expect(bench.said).toEqual(["the panes mover is retired for this session: its process ended"]);

    const again = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: paneBounds }],
      durationMs: 160,
    });
    bench.ports.clock.advance(200);
    await again;
    expect(window.getBounds()).toEqual(paneBounds);
    expect(bench.pipes.written.filter((line) => line.startsWith("glide "))).toHaveLength(1);
  });

  it("releases every gliding pane when the app is quitting", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    const release = `release ${window.nativeHandle()}`;
    const gliding = bench.ask(surfaceChannels.glide, {
      moves: [{ id: "kw-surface:1", bounds: beside }],
      durationMs: 200,
    });
    bench.service.dispose();
    await gliding;
    expect(bench.pipes.written.at(-1)).toBe(release);
    expect(window.destroyed).toBe(true);
  });
});

describe("the colour of a pane's frame", () => {
  const framed = { id: "kw-surface:1", frame: "#FF8800" };

  it("is set on the window through the helper when a pane is shown with one", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    await bench.show(framed);
    expect(bench.pipes.written).toEqual([`border ${window.nativeHandle()} ff8800`]);
    expect(window.visible).toBe(true);
  });

  it("is given back when the pane is hidden, and never asked for a pane that had none", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    bench.open("kw-surface:2");
    await bench.show(framed);
    await bench.show({ id: "kw-surface:2" });
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    await bench.ask(surfaceChannels.hide, "kw-surface:2");
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(bench.pipes.written).toEqual([
      `border ${window.nativeHandle()} ff8800`,
      `border ${window.nativeHandle()} clear`,
    ]);
    expect(window.destroyed).toBe(false);
    expect(window.visible).toBe(false);
  });

  it("is given back when the pane is shown again without one, or the desktop asks to close it", async () => {
    const bench = helpedBench();
    const reshown = bench.open("kw-surface:1");
    const closing = bench.open("kw-surface:2");
    await bench.show(framed);
    await bench.show({ id: "kw-surface:1", frame: "not a colour" });
    await bench.show({ ...framed, id: "kw-surface:2" });
    closing.desktopAsksToClose();
    expect(bench.pipes.written).toEqual([
      `border ${reshown.nativeHandle()} ff8800`,
      `border ${reshown.nativeHandle()} clear`,
      `border ${closing.nativeHandle()} ff8800`,
      `border ${closing.nativeHandle()} clear`,
    ]);
  });

  it("is ignored without a helper", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    await bench.show(framed);
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(window.destroyed).toBe(false);
    expect(window.calls).toEqual([
      `setBounds:${paneBounds.x},${paneBounds.y},${paneBounds.width}x${paneBounds.height}`,
      "showInactive",
      "hide",
    ]);
  });

  it("closes a window whose colour nobody is left to give back, rather than keep it for the next pane", async () => {
    const bench = helpedBench();
    const window = bench.open("kw-surface:1");
    await bench.show(framed);
    bench.pipes.ends();
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    expect(window.destroyed).toBe(true);
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
  });
});

describe("stacking panes", () => {
  async function threeShown() {
    const bench = surfaceBench();
    const windows = [1, 2, 3].map((n) => bench.open(`kw-surface:${n}`));
    for (const n of [1, 2, 3]) await bench.show({ id: `kw-surface:${n}` });
    bench.ports.clock.advance(newsEveryMs);
    for (const window of windows) window.calls.length = 0;
    return { bench, windows };
  }

  it("puts the first above the console and each of the rest above the one before it", async () => {
    const { bench, windows } = await threeShown();
    const [first, second, third] = windows;
    await bench.ask(surfaceChannels.stack, ["kw-surface:3", "kw-surface:1", "kw-surface:2"]);
    expect(third?.calls).toEqual([`moveAbove:${bench.console.sourceId()}`]);
    expect(first?.calls).toEqual([`moveAbove:${third?.sourceId()}`]);
    expect(second?.calls).toEqual([`moveAbove:${first?.sourceId()}`]);
  });

  it("never shows, focuses, activates or moves a window", async () => {
    const { bench, windows } = await threeShown();
    const before = windows.map((window) => window.getBounds());
    const said = bench.console.sent.length;
    await bench.ask(surfaceChannels.stack, ["kw-surface:1", "kw-surface:2", "kw-surface:3"]);
    bench.ports.clock.advance(newsEveryMs);
    for (const window of windows) {
      expect(window.calls.every((call) => call.startsWith("moveAbove:"))).toBe(true);
      expect(window.focused).toBe(false);
    }
    expect(windows.map((window) => window.getBounds())).toEqual(before);
    expect(bench.console.calls).toEqual([]);
    expect(bench.console.sent).toHaveLength(said);
  });

  it("passes over a pane that is hidden, unknown or already named", async () => {
    const { bench, windows } = await threeShown();
    const [first, second, third] = windows;
    await bench.ask(surfaceChannels.hide, "kw-surface:2");
    await bench.ask(surfaceChannels.stack, [
      "kw-surface:1",
      "kw-surface:2",
      "kw-surface:gone",
      "kw-surface:3",
      "kw-surface:1",
    ]);
    expect(first?.calls).toEqual([`moveAbove:${bench.console.sourceId()}`]);
    expect(second?.calls).toEqual(["hide"]);
    expect(third?.calls).toEqual([`moveAbove:${first?.sourceId()}`]);
    await expect(bench.ask(surfaceChannels.stack, [])).resolves.toBeUndefined();
  });

  it("restacks only the panes of the console that asked", async () => {
    const { bench, windows } = await threeShown();
    const other = bench.openConsole();
    const theirs = bench.open("kw-surface:1", other);
    await bench.ports.ipc.invoke(surfaceChannels.show, other.sender, {
      id: "kw-surface:1",
      bounds: paneBounds,
      origin: "creature",
      focus: false,
      follows: false,
      backdrop: "backdrop-token",
      title: "notes",
    });
    theirs.calls.length = 0;
    await bench.ask(surfaceChannels.stack, ["kw-surface:1"], other);
    expect(theirs.calls).toEqual([`moveAbove:${other.sourceId()}`]);
    expect(windows.flatMap((window) => window.calls)).toEqual([]);
  });
});

describe("a window that is gone", () => {
  const everywhere = ["kw-surface:1", "kw-surface:2"].map((id) => ({ id, bounds: beside }));

  it("is never touched by the glide it was in, nor by the news about it, once it is destroyed", async () => {
    const bench = surfaceBench();
    const gone = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1", follows: true });
    const settled = bench.ask(surfaceChannels.glide, { moves: everywhere, durationMs: 200 });
    bench.ports.clock.advance(40);
    gone.destroy();
    bench.console.movesTo({ x: consoleBounds.x + 30, y: consoleBounds.y });
    expect(() => bench.ports.clock.advance(400)).not.toThrow();
    await settled;
    expect(other.getBounds()).toEqual(beside);
    expect(eventsOf(bench.console, "closed")).toEqual([{ kind: "closed", id: "kw-surface:1" }]);
  });

  it("is passed over by a glide, a stacking or a hiding that still names it, and refused a showing", async () => {
    const bench = surfaceBench();
    const gone = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    await bench.show({ id: "kw-surface:1" });
    await bench.show({ id: "kw-surface:2" });
    gone.destroy();
    await bench.ask(surfaceChannels.glide, { moves: everywhere, durationMs: 0 });
    await bench.ask(surfaceChannels.stack, ["kw-surface:1", "kw-surface:2"]);
    await bench.ask(surfaceChannels.hide, "kw-surface:1");
    await bench.ask(surfaceChannels.close, "kw-surface:1");
    await expect(bench.show({ id: "kw-surface:1" })).rejects.toThrow("no pane outside the window");
    await expect(bench.ask(surfaceChannels.focus, "kw-surface:1")).rejects.toThrow(
      "no pane outside the window",
    );
    expect(other.getBounds()).toEqual(beside);
    expect(other.calls.at(-1)).toBe(`moveAbove:${bench.console.sourceId()}`);
  });

  it("is never touched by what the helper says afterwards: a glide settled, a pane let go, a window refused", async () => {
    const bench = helpedBench();
    const gone = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    const handle = gone.nativeHandle();
    const settled = bench.ask(surfaceChannels.glide, { moves: everywhere, durationMs: 200 });
    const glide = bench.lastGlide();
    await bench.show({ id: "kw-surface:1", bounds: paneBounds });
    gone.destroy();
    expect(() => {
      bench.pipes.says(`refused ${handle} no-such-window`);
      bench.pipes.says("stats frames=3 missed=0 mean_us=90 worst_us=120");
      other.desktopMovesTo(beside);
      bench.pipes.says(`settled ${glide.id}`);
      bench.ports.clock.advance(60_000);
    }).not.toThrow();
    await settled;
    expect(other.getBounds()).toEqual(beside);
    expect(bench.said).toEqual([]);
  });

  it("is never touched when the helper goes away with a glide half done", async () => {
    const bench = helpedBench();
    const gone = bench.open("kw-surface:1");
    const other = bench.open("kw-surface:2");
    const settled = bench.ask(surfaceChannels.glide, { moves: everywhere, durationMs: 200 });
    gone.destroy();
    bench.pipes.ends();
    expect(() => bench.ports.clock.advance(400)).not.toThrow();
    await settled;
    expect(other.getBounds()).toEqual(beside);
  });

  it("is never touched when its console closes with a glide running and news still to tell", async () => {
    for (const bench of [surfaceBench(), helpedBench()]) {
      const window = bench.open("kw-surface:1");
      await bench.show({ id: "kw-surface:1", follows: true });
      const settled = bench.ask(surfaceChannels.glide, {
        moves: [{ id: "kw-surface:1", bounds: beside }],
        durationMs: 200,
      });
      bench.ports.clock.advance(40);
      bench.console.movesTo({ x: consoleBounds.x + 30, y: consoleBounds.y });
      bench.console.closes();
      expect(() => bench.ports.clock.advance(60_000)).not.toThrow();
      await settled;
      expect(window.destroyed).toBe(true);
    }
  });

  it("is left alone by anything that arrives after the app is done with panes outside", async () => {
    for (const bench of [surfaceBench(), helpedBench()]) {
      const window = bench.open("kw-surface:1");
      await bench.show({ id: "kw-surface:1", follows: true });
      void bench.ask(surfaceChannels.glide, {
        moves: [{ id: "kw-surface:1", bounds: beside }],
        durationMs: 200,
      });
      bench.service.dispose();
      expect(() => {
        bench.console.movesTo({ x: consoleBounds.x + 30, y: consoleBounds.y });
        bench.ports.screen.set([laptop]);
        window.emit("move");
        window.emit("focus");
        bench.ports.ipc.emit(surfaceChannels.broughtHome, bench.console.sender, "kw-surface:1");
        bench.ports.clock.advance(60_000);
      }).not.toThrow();
    }
  });
});

describe("the console moved to make room for panes", () => {
  const hub = { x: 0, y: 0, width: 504, height: laptop.workArea.height };
  const asked = (bounds: typeof hub, durationMs: number, maximized = false) => ({
    bounds,
    maximized,
    durationMs,
  });

  it("glides the outline the keeper sees to where it was asked, and answers with where it stood and stands", async () => {
    const bench = surfaceBench();
    const moving = bench.ask(surfaceChannels.moveConsole, asked(hub, 200));
    bench.ports.clock.advance(100);
    const midway = (await bench.ask(surfaceChannels.desk)) as Desk;
    expect(midway.console.x).toBeGreaterThan(hub.x);
    expect(midway.console.x).toBeLessThan(consoleSeen.x);
    expect(bench.console.desks()).toEqual([]);
    bench.ports.clock.advance(200);
    await expect(moving).resolves.toEqual({
      from: { bounds: consoleSeen, maximized: false },
      to: { bounds: hub, maximized: false },
    });
    expect(bench.console.desks().at(-1)).toMatchObject({ console: hub });
  });

  it("leaves the panes that follow the console where they stand, and carries them again afterwards", async () => {
    const bench = surfaceBench();
    const follower = bench.open("kw-surface:1");
    await bench.show({ id: "kw-surface:1", follows: true });
    await bench.ask(surfaceChannels.moveConsole, asked({ ...consoleSeen, x: 0, y: 0 }, 0));
    expect(follower.getBounds()).toEqual(paneBounds);
    bench.console.movesTo({ x: 60, y: 31 });
    expect(follower.getBounds()).toEqual({ ...paneBounds, x: paneBounds.x + 60 });
  });

  it("restores a maximised console to move it, and maximises it again on the way back", async () => {
    const bench = surfaceBench();
    bench.console.maximized = true;
    const out = (await bench.ask(surfaceChannels.moveConsole, asked(hub, 0))) as ConsoleMoved;
    expect(out.from).toEqual({ bounds: consoleSeen, maximized: true });
    expect(bench.console.maximized).toBe(false);
    await bench.ask(surfaceChannels.moveConsole, asked(out.from.bounds, 0, out.from.maximized));
    expect(bench.console.maximized).toBe(true);
  });

  it("stops where the keeper takes hold of it, and says where that is", async () => {
    const bench = surfaceBench();
    const moving = bench.ask(surfaceChannels.moveConsole, asked(hub, 200));
    bench.ports.clock.advance(40);
    bench.console.keeperGrabs();
    const moved = (await moving) as ConsoleMoved;
    expect(moved.to.bounds.x).toBeGreaterThan(hub.x);
    bench.ports.clock.advance(400);
    expect(((await bench.ask(surfaceChannels.desk)) as Desk).console).toEqual(moved.to.bounds);
  });

  it("tells the console the app is leaving before its panes are closed with it", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    bench.service.dispose();
    expect(bench.console.sent.map(([channel]) => channel)).toContain(surfaceChannels.leaving);
    expect(window.destroyed).toBe(true);
  });
});

describe("a pane asked to show with nowhere to stand", () => {
  it("is refused and stays hidden, so an empty rectangle never becomes a window at the smallest size it can take", async () => {
    const bench = surfaceBench();
    const window = bench.open("kw-surface:1");
    const nowhere = { x: 0, y: 0, width: 0, height: 0 };
    await expect(bench.show({ id: "kw-surface:1", bounds: nowhere })).rejects.toThrow(
      "needs a place to stand",
    );
    expect(window.visible).toBe(false);
    expect(window.calls).toEqual([]);
  });
});
