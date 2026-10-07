export type MenuAction =
  | "open-folder"
  | "open-recent"
  | "close-window"
  | "reload"
  | "toggle-devtools"
  | "about"
  | "quit";

export type MenuRole =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "togglefullscreen"
  | "minimize"
  | "zoom"
  | "front"
  | "window"
  | "hide"
  | "hideOthers"
  | "unhide";

export type MenuItemModel =
  | { kind: "separator" }
  | { kind: "role"; role: MenuRole }
  | { kind: "action"; label: string; action: MenuAction; accelerator?: string; payload?: string }
  | { kind: "submenu"; label: string; items: readonly MenuItemModel[]; role?: "window" };

export type Chords = Partial<Record<MenuAction, string>>;

export interface MenuInput {
  platform: NodeJS.Platform;
  dev: boolean;
  recents: readonly string[];
  chords: Chords;
}

export const recentMenuLimit = 10;

export function menuModel(input: MenuInput): readonly MenuItemModel[] {
  const item = (label: string, action: MenuAction, payload?: string): MenuItemModel =>
    withChord({ kind: "action", label, action, ...(payload !== undefined && { payload }) }, input);
  const mac = input.platform === "darwin";
  return [
    ...(mac ? [appMenu(item)] : []),
    submenu("File", [
      item("Open Folder…", "open-folder"),
      recentMenu(input.recents, item),
      { kind: "separator" },
      item("Close Window", "close-window"),
      ...(mac ? [] : [{ kind: "separator" } as const, item("Quit", "quit")]),
    ]),
    submenu("Edit", roles("undo", "redo", "cut", "copy", "paste", "selectAll")),
    submenu("View", [
      ...(input.dev
        ? [item("Reload", "reload"), item("Toggle Developer Tools", "toggle-devtools")]
        : []),
      ...(input.dev ? [{ kind: "separator" } as const] : []),
      ...roles("resetZoom", "zoomIn", "zoomOut"),
      { kind: "separator" },
      { kind: "role", role: "togglefullscreen" },
    ]),
    {
      kind: "submenu",
      label: "Window",
      role: "window",
      items: roles("minimize", "zoom", ...(mac ? (["front"] as const) : [])),
    },
    submenu("Help", [item("About keywork-app", "about")]),
  ];
}

export function isAccelerator(chord: string): boolean {
  return /^([A-Za-z]+\+)*[A-Za-z0-9…]+$/.test(chord) && !/^leader\b/i.test(chord);
}

function withChord(item: MenuItemModel & { kind: "action" }, input: MenuInput): MenuItemModel {
  const chord = input.chords[item.action];
  if (chord === undefined) return item;
  return isAccelerator(chord)
    ? { ...item, accelerator: chord }
    : { ...item, label: `${item.label}\t${chord}` };
}

function recentMenu(
  recents: readonly string[],
  item: (label: string, action: MenuAction, payload?: string) => MenuItemModel,
): MenuItemModel {
  return submenu(
    "Open Recent",
    recents.slice(0, recentMenuLimit).map((path) => item(path, "open-recent", path)),
  );
}

function appMenu(
  item: (label: string, action: MenuAction, payload?: string) => MenuItemModel,
): MenuItemModel {
  return submenu("keywork", [
    item("About keywork-app", "about"),
    { kind: "separator" },
    ...roles("hide", "hideOthers", "unhide"),
    { kind: "separator" },
    item("Quit", "quit"),
  ]);
}

function submenu(label: string, items: readonly MenuItemModel[]): MenuItemModel {
  return { kind: "submenu", label, items };
}

function roles(...names: readonly MenuRole[]): MenuItemModel[] {
  return names.map((role) => ({ kind: "role", role }));
}
