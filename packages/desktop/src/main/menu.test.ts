import { describe, expect, it } from "vitest";
import { isAccelerator, type MenuItemModel, menuModel, recentMenuLimit } from "./menu.ts";

const base = { dev: false, recents: [], chords: {} } as const;

describe("menuModel", () => {
  it("lays out File, Edit, View, Window, Help on Windows with Quit under File", () => {
    const menu = menuModel({ ...base, platform: "win32" });
    expect(menu.map(labelOf)).toEqual(["File", "Edit", "View", "Window", "Help"]);
    const file = itemsOf(menu[0]);
    expect(file.at(-1)).toEqual({ kind: "action", label: "Quit", action: "quit" });
    expect(itemsOf(menu[1]).map(roleOf)).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ]);
    expect(itemsOf(menu[4])).toEqual([
      { kind: "action", label: "About keywork-app", action: "about" },
    ]);
  });

  it("adds the app menu on macOS and keeps Quit out of File", () => {
    const menu = menuModel({ ...base, platform: "darwin" });
    expect(menu.map(labelOf)).toEqual(["keywork", "File", "Edit", "View", "Window", "Help"]);
    expect(itemsOf(menu[1]).some((item) => actionOf(item) === "quit")).toBe(false);
    expect(itemsOf(menu[0]).map(actionOf)).toContain("quit");
    expect(itemsOf(menu[4]).map(roleOf)).toContain("front");
  });

  it("shows Reload and DevTools only in dev", () => {
    const view = (dev: boolean) =>
      itemsOf(menuModel({ ...base, platform: "linux", dev })[2]).map(actionOf);
    expect(view(true)).toEqual([
      "reload",
      "toggle-devtools",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(view(false)).not.toContain("reload");
    expect(view(false)).not.toContain("toggle-devtools");
  });

  it("lists recents newest first, capped, each carrying its path", () => {
    const recents = Array.from({ length: recentMenuLimit + 3 }, (_, n) => `C:/w${n}`);
    const file = itemsOf(menuModel({ ...base, platform: "win32", recents })[0]);
    const recent = file.find((item) => labelOf(item) === "Open Recent");
    const entries = itemsOf(recent);
    expect(entries).toHaveLength(recentMenuLimit);
    expect(entries[0]).toEqual({
      kind: "action",
      label: "C:/w0",
      action: "open-recent",
      payload: "C:/w0",
    });
  });

  it("attaches an accelerator for a native chord and names a leader chord in the label", () => {
    const file = itemsOf(
      menuModel({
        ...base,
        platform: "win32",
        chords: { "open-folder": "CmdOrCtrl+O", "close-window": "leader q" },
      })[0],
    );
    expect(file[0]).toEqual({
      kind: "action",
      label: "Open Folder…",
      action: "open-folder",
      accelerator: "CmdOrCtrl+O",
    });
    expect(file.find((item) => actionOf(item) === "close-window")).toEqual({
      kind: "action",
      label: "Close Window\tleader q",
      action: "close-window",
    });
  });
});

describe("isAccelerator", () => {
  it("recognises Electron accelerator spellings and nothing with a leader or a space", () => {
    expect(isAccelerator("CmdOrCtrl+Shift+W")).toBe(true);
    expect(isAccelerator("F1")).toBe(true);
    expect(isAccelerator("leader /")).toBe(false);
    expect(isAccelerator("ctrl p")).toBe(false);
  });
});

function labelOf(item: MenuItemModel | undefined): string | undefined {
  return item !== undefined && "label" in item ? item.label : undefined;
}

function actionOf(item: MenuItemModel | undefined): string | undefined {
  return item?.kind === "action" ? item.action : undefined;
}

function roleOf(item: MenuItemModel | undefined): string | undefined {
  return item?.kind === "role" ? item.role : undefined;
}

function itemsOf(item: MenuItemModel | undefined): readonly MenuItemModel[] {
  return item?.kind === "submenu" ? item.items : [];
}
