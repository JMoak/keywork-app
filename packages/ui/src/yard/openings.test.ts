import { describe, expect, it, vi } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import { linkOpened, openFrom, panelShell, subjectOfPane } from "./openings.ts";
import { aSetting } from "./testing.ts";

describe("what an opening from inside a panel sets out", () => {
  it("names a file by its path and a conversation as its thread", () => {
    expect(subjectOfPane({ kind: "file", path: "src/sum.test.ts" })).toEqual({
      kind: "file",
      ref: "src/sum.test.ts",
    });
    expect(subjectOfPane({ kind: "conversation", sessionId: "s2" })).toEqual({
      kind: "thread",
      ref: "s2",
    });
  });

  it("leaves to the tiles what no setting can name", () => {
    expect(subjectOfPane({ kind: "tree" })).toBeUndefined();
    expect(subjectOfPane({ kind: "conversation" })).toBeUndefined();
    expect(
      subjectOfPane({ kind: "file", path: "out.txt", spill: { sessionId: "s1", spillId: "p1" } }),
    ).toBeUndefined();
  });
});

describe("the shell a panel sees", () => {
  it("sets out what the panel opens, and still tiles what it cannot", () => {
    const { shell, tiled } = hubShell();
    const opened: unknown[] = [];
    const inside = panelShell(shell, {
      paneId: "yard:diff",
      open: (what) => opened.push(what),
      rebind: () => undefined,
    });
    inside.openPane({ kind: "file", path: "src/sum.ts" });
    inside.sessions.openSession("s2");
    inside.openPane({ kind: "tree" });
    expect(opened).toEqual([
      { kind: "file", ref: "src/sum.ts" },
      { kind: "thread", ref: "s2" },
    ]);
    expect(tiled).toEqual([{ kind: "tree" }]);
  });

  it("keeps a pane's own navigation inside its panel, and hands any other rebind to the tiles", () => {
    const { shell, rebound } = hubShell();
    const navigated: unknown[] = [];
    const inside = panelShell(shell, {
      paneId: "yard:diff",
      open: () => undefined,
      rebind: (spec) => navigated.push(spec),
    });
    inside.rebind("yard:diff", { kind: "diff", sessionId: "s1", path: "src/sum.ts" });
    inside.rebind("tile-1", { kind: "tree" });
    expect(navigated).toEqual([{ kind: "diff", sessionId: "s1", path: "src/sum.ts" }]);
    expect(rebound).toEqual([["tile-1", { kind: "tree" }]]);
  });

  it("reads everything else live from the shell underneath, getters included", () => {
    let workspace = "C:/one";
    const shell = Object.defineProperty({} as ShellSeams, "workspace", { get: () => workspace });
    const inside = panelShell(shell, {
      paneId: "yard:x",
      open: () => undefined,
      rebind: () => undefined,
    });
    workspace = "C:/two";
    expect(inside.workspace).toBe("C:/two");
  });
});

describe("a link followed inside a panel", () => {
  it("sets out a web link the keeper clicks, and leaves anything else alone", () => {
    expect(linkOpened(clickOn('<a href="https://example.com/spec">the spec</a>'))).toEqual({
      kind: "url",
      ref: "https://example.com/spec",
    });
    expect(linkOpened(clickOn('<a href="#top">top</a>'))).toBeUndefined();
    expect(linkOpened(clickOn("<span>plain</span>"))).toBeUndefined();
    expect(
      linkOpened(clickOn('<a href="https://example.com">x</a>', { button: 1 })),
    ).toBeUndefined();
  });
});

describe("posting an opening", () => {
  it("posts it as an unfolded keeper opening from the panel and hands back what the server set out", async () => {
    const opened = aSetting({ id: "set-2" });
    const openSetting = vi.fn(async () => opened);
    expect(await openFrom({ openSetting }, { kind: "file", ref: "src/sum.ts" }, "set-1")).toEqual({
      opened,
    });
    expect(openSetting).toHaveBeenCalledWith({
      what: { kind: "file", ref: "src/sum.ts" },
      from: "set-1",
      rung: "unfold",
    });
  });

  it("says the server's refusal or failure in its own words", async () => {
    const refusing = {
      openSetting: async () => ({ refused: "missing" as const, detail: "set-1 is not out" }),
    };
    expect(await openFrom(refusing, { kind: "url", ref: "https://x.dev" }, "set-1")).toEqual({
      unopened: "not opened · set-1 is not out",
    });
    const failing = {
      openSetting: async () => {
        throw new Error("the server is gone");
      },
    };
    expect(await openFrom(failing, { kind: "url", ref: "https://x.dev" }, "set-1")).toEqual({
      unopened: "not opened · the server is gone",
    });
  });
});

function hubShell() {
  const tiled: unknown[] = [];
  const rebound: unknown[] = [];
  const shell = {
    openPane: (spec: unknown) => tiled.push(spec),
    rebind: (paneId: string, spec: unknown) => rebound.push([paneId, spec]),
    sessions: {
      openSession: (id: string) => tiled.push({ kind: "conversation", sessionId: id }),
      newSession: async () => undefined,
      startSession: async () => undefined,
    },
  } as unknown as ShellSeams;
  return { shell, tiled, rebound };
}

function clickOn(html: string, init: MouseEventInit = {}): MouseEvent {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const target = holder.firstElementChild as HTMLElement;
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}
