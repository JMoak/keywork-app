import { app, type WebContents } from "electron";
import { z } from "zod";
import { ptyChannels } from "../shared/channels.ts";
import type { AppIpc } from "./app-page.ts";
import { type PtyHost, ptyHost } from "./pty.ts";
import { type NativePtyOptions, nativePtySeams } from "./pty-native.ts";

export function registerPtyHandlers(
  ipc: AppIpc,
  serves: (sender: WebContents, workspace: string) => boolean,
  options: NativePtyOptions,
): PtyHost {
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
  ipc.handle(ptyChannels.open, (event, request: unknown) => {
    const sender = event.sender;
    const opening = openRequest.parse(request);
    if (!serves(sender, opening.workspace)) {
      throw new Error(`a terminal opens only in this window's workspace, not ${opening.workspace}`);
    }
    watch(sender);
    return ptys.open(opening, sender.id, {
      data: (id, bytes) => {
        if (!sender.isDestroyed()) sender.send(ptyChannels.data, id, bytes);
      },
      exit: (exit) => {
        if (!sender.isDestroyed()) sender.send(ptyChannels.exit, exit);
      },
    });
  });
  ipc.on(ptyChannels.write, (event, id: number, data: string) =>
    ptys.write(event.sender.id, id, data),
  );
  ipc.on(ptyChannels.resize, (event, id: number, cols: number, rows: number) =>
    ptys.resize(event.sender.id, id, cols, rows),
  );
  ipc.on(ptyChannels.close, (event, id: number) => ptys.close(event.sender.id, id));
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
