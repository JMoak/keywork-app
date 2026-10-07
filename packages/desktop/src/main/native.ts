import {
  Menu,
  type MenuItemConstructorOptions,
  type NativeImage,
  Notification,
  nativeImage,
  Tray,
} from "electron";
import type { MenuAction, MenuItemModel } from "./menu.ts";
import type { Notice } from "./notify.ts";
import { type Ink, type TrayModel, trayMarkPng } from "./tray.ts";

export type Act = (action: MenuAction, payload?: string) => void;

export function installApplicationMenu(model: readonly MenuItemModel[], act: Act): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(templateOf(model, act)));
}

export interface TrayMark {
  update(model: TrayModel, act: Act, onClick: () => void): void;
  destroy(): void;
}

export function trayMark(platform: NodeJS.Platform): TrayMark {
  let tray: Tray | undefined;
  let clickHandler: () => void = () => undefined;
  return {
    update: (model, act, onClick) => {
      clickHandler = onClick;
      if (tray === undefined) {
        tray = new Tray(markImage(platform, false));
        tray.on("click", () => clickHandler());
      }
      tray.setImage(markImage(platform, model.badge !== undefined));
      tray.setToolTip(model.tooltip);
      tray.setContextMenu(Menu.buildFromTemplate(templateOf(model.menu, act)));
    },
    destroy: () => {
      tray?.destroy();
      tray = undefined;
    },
  };
}

export function showToast(notice: Notice, onClick: () => void): boolean {
  if (!Notification.isSupported()) return false;
  const toast = new Notification({ title: notice.title, body: notice.body, silent: false });
  toast.on("click", onClick);
  toast.show();
  return true;
}

export function markImage(platform: NodeJS.Platform, filled: boolean): NativeImage {
  const ink: Ink = platform === "darwin" ? "black" : "white";
  const image = nativeImage.createFromBuffer(Buffer.from(trayMarkPng({ size: 16, filled, ink })), {
    scaleFactor: 1,
  });
  image.addRepresentation({
    scaleFactor: 2,
    buffer: Buffer.from(trayMarkPng({ size: 32, filled, ink })),
  });
  if (platform === "darwin") image.setTemplateImage(true);
  return image;
}

function templateOf(items: readonly MenuItemModel[], act: Act): MenuItemConstructorOptions[] {
  return items.map((item) => templateItem(item, act));
}

function templateItem(item: MenuItemModel, act: Act): MenuItemConstructorOptions {
  switch (item.kind) {
    case "separator":
      return { type: "separator" };
    case "role":
      return { role: item.role };
    case "action":
      return {
        label: item.label,
        ...(item.accelerator !== undefined && { accelerator: item.accelerator }),
        click: () => act(item.action, item.payload),
      };
    case "submenu":
      return {
        label: item.label,
        ...(item.role !== undefined && { role: item.role }),
        submenu: templateOf(item.items, act),
      };
  }
}
