import { app, ipcMain, type WebContents } from "electron";
import { z } from "zod";
import { ptyChannels } from "../shared/channels.ts";
import { type PtyHost, ptyHost } from "./pty.ts";
import { type NativePtyOptions, nativePtySeams } from "./pty-native.ts";

export function registerPtyHandlers(options: NativePtyOptions): PtyHost {
  const ptys = ptyHost(nativePtySeams(options));
  const watched = new Set<number>();
  const watch = (sender: WebContents): void => {
    if (watched.has(sender.id)) return;
    watched.add(sender.id);
    sender.once("destroyed", () => {
      watched.delete(sender.id);
      ptys.closeOwned(sender.id);
    });
  };
  ipcMain.handle(ptyChannels.open, (event, request: unknown) => {
    const sender = event.sender;
    watch(sender);
    return ptys.open(openRequest.parse(request), sender.id, {
      data: (id, bytes) => {
        if (!sender.isDestroyed()) sender.send(ptyChannels.data, id, bytes);
      },
      exit: (exit) => {
        if (!sender.isDestroyed()) sender.send(ptyChannels.exit, exit);
      },
    });
  });
  ipcMain.on(ptyChannels.write, (_event, id: number, data: string) => ptys.write(id, data));
  ipcMain.on(ptyChannels.resize, (_event, id: number, cols: number, rows: number) =>
    ptys.resize(id, cols, rows),
  );
  ipcMain.on(ptyChannels.close, (_event, id: number) => ptys.close(id));
  app.on("will-quit", () => ptys.closeAll());
  return ptys;
}

const openRequest = z.object({
  workspace: z.string().min(1),
  program: z.enum(["shell", "keywork"]),
  args: z.array(z.string()).default([]),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});
