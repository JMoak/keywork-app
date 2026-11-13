import { describe, expect, it } from "vitest";
import { quitGate, windowRegistry } from "./windows.ts";

describe("windowRegistry", () => {
  it("binds windows to workspaces and reports the last window of each", () => {
    const registry = windowRegistry();
    registry.add(1);
    registry.bind(1, "C:/a");
    registry.add(2, "C:/a");
    registry.add(3, "C:/b");
    expect(registry.windowsOf("C:/a")).toEqual([1, 2]);
    expect(registry.unbind(1)).toEqual({ workspace: "C:/a", lastWindow: false });
    expect(registry.workspaceOf(1)).toBeUndefined();
    expect(registry.remove(2)).toEqual({ workspace: "C:/a", lastWindow: true });
    expect(registry.remove(3)).toEqual({ workspace: "C:/b", lastWindow: true });
    expect(registry.remove(1)).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it("places an open request on the window already showing it, else a front door, else a new window", () => {
    const registry = windowRegistry();
    expect(registry.placeFor("C:/a")).toEqual({ kind: "new" });
    registry.add(1);
    expect(registry.placeFor("C:/a")).toEqual({ kind: "reuse", windowId: 1 });
    registry.bind(1, "C:/a");
    expect(registry.placeFor("C:/a")).toEqual({ kind: "focus", windowId: 1 });
    expect(registry.placeFor("C:/b")).toEqual({ kind: "new" });
    registry.add(2);
    registry.add(3);
    registry.focused(2);
    expect(registry.placeFor("C:/b")).toEqual({ kind: "reuse", windowId: 2 });
  });

  it("orders the list by activity and counts what needs you per workspace, not per window", () => {
    const registry = windowRegistry();
    registry.add(1, "C:/a");
    registry.add(2, "C:/b");
    registry.add(3, "C:/a");
    registry.setNeedsYou(1, 2);
    registry.setNeedsYou(3, 2);
    registry.setNeedsYou(2, 1);
    expect(registry.list()).toEqual([
      { workspace: "C:/a", windows: 2, needsYou: 2 },
      { workspace: "C:/b", windows: 1, needsYou: 1 },
    ]);
    expect(registry.needsYou()).toBe(3);
    registry.focused(2);
    expect(registry.mostRecentlyActive()).toBe(2);
    expect(registry.list()[0]?.workspace).toBe("C:/b");
    registry.remove(2);
    expect(registry.needsYou()).toBe(2);
    expect(registry.mostRecentlyActive()).toBe(3);
  });

  it("ignores a count from a window with no workspace and clamps negatives", () => {
    const registry = windowRegistry();
    registry.add(1);
    registry.setNeedsYou(1, 4);
    expect(registry.needsYou()).toBe(0);
    registry.bind(1, "C:/a");
    registry.setNeedsYou(1, -3);
    expect(registry.needsYou()).toBe(0);
  });

  it("announces every change once", () => {
    const registry = windowRegistry();
    let changes = 0;
    const stop = registry.onChange(() => {
      changes += 1;
    });
    registry.add(1);
    registry.bind(1, "C:/a");
    registry.setNeedsYou(1, 1);
    registry.unbind(1);
    registry.unbind(1);
    stop();
    registry.remove(1);
    expect(changes).toBe(4);
  });
});

describe("quitGate", () => {
  it("holds the first quit until everything has stopped, then lets the retry through", async () => {
    let stops = 0;
    let release: () => void = () => undefined;
    const gate = quitGate({
      mayQuit: async () => true,
      stopEverything: () =>
        new Promise<void>((resolve) => {
          stops += 1;
          release = resolve;
        }),
    });
    const events: string[] = [];
    const event = { preventDefault: () => events.push("prevented") };
    gate(event, () => events.push("quit"));
    gate(event, () => events.push("quit"));
    await settle();
    expect(events).toEqual(["prevented", "prevented"]);
    expect(stops).toBe(1);
    release();
    await settle();
    expect(events).toEqual(["prevented", "prevented", "quit"]);
    gate(event, () => events.push("quit"));
    expect(events).toEqual(["prevented", "prevented", "quit"]);
  });

  it("still quits when stopping fails", async () => {
    const gate = quitGate({
      mayQuit: async () => true,
      stopEverything: () => Promise.reject(new Error("stuck")),
    });
    let quit = false;
    gate({ preventDefault: () => undefined }, () => {
      quit = true;
    });
    await settle();
    expect(quit).toBe(true);
  });

  it("stops nothing and stays open when the quit is cancelled, then asks again next time", async () => {
    const answers = [false, true];
    let asked = 0;
    let stops = 0;
    const gate = quitGate({
      mayQuit: async () => answers[asked++] ?? true,
      stopEverything: async () => {
        stops += 1;
      },
    });
    const quits: string[] = [];
    const event = { preventDefault: () => undefined };
    gate(event, () => quits.push("quit"));
    await settle();
    expect({ asked, stops, quits }).toEqual({ asked: 1, stops: 0, quits: [] });
    gate(event, () => quits.push("quit"));
    await settle();
    expect({ asked, stops, quits }).toEqual({ asked: 2, stops: 1, quits: ["quit"] });
  });

  it("asks once while a question is open, however many quits arrive", async () => {
    let asked = 0;
    let answer: (stop: boolean) => void = () => undefined;
    const gate = quitGate({
      mayQuit: () => {
        asked += 1;
        return new Promise<boolean>((resolve) => {
          answer = resolve;
        });
      },
      stopEverything: async () => undefined,
    });
    const quits: string[] = [];
    const event = { preventDefault: () => undefined };
    gate(event, () => quits.push("menu"));
    gate(event, () => quits.push("tray"));
    answer(true);
    await settle();
    expect(asked).toBe(1);
    expect(quits).toEqual(["menu"]);
  });

  it("quits rather than trapping the app when it cannot tell whether work is running", async () => {
    let stops = 0;
    const gate = quitGate({
      mayQuit: () => Promise.reject(new Error("dialog failed")),
      stopEverything: async () => {
        stops += 1;
      },
    });
    let quit = false;
    gate({ preventDefault: () => undefined }, () => {
      quit = true;
    });
    await settle();
    expect({ stops, quit }).toEqual({ stops: 1, quit: true });
  });
});

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
