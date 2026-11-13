import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { isRendererPage, rendererPageArgument } from "../shared/renderer-page.ts";
import { type GuardedIpc, guardedIpc, type SenderTrust, sentFrom } from "./trusted-ipc.ts";

export type AppIpc = GuardedIpc<IpcMainInvokeEvent>;

export function appPage(): string {
  return process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(builtIndex).href;
}

export function isAppPage(url: string): boolean {
  return isRendererPage(url, appPage());
}

export function appPageArgument(): string {
  return rendererPageArgument(appPage());
}

export const fromAppPage: SenderTrust = sentFrom(isAppPage);

export function trustedIpc(trusts: SenderTrust = fromAppPage): AppIpc {
  return guardedIpc<IpcMainInvokeEvent>(ipcMain, trusts);
}

const builtIndex = join(import.meta.dirname, "../renderer/index.html");
