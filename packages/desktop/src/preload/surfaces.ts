import type { IpcRenderer } from "electron";
import {
  type ConsoleMoved,
  type Desk,
  type SurfaceEvent,
  type SurfacesPort,
  surfaceChannels,
} from "../main/surfaces/channels.ts";

export type SurfacesIpc = Pick<IpcRenderer, "invoke" | "send" | "on" | "removeListener">;

export function surfacesPort(ipc: SurfacesIpc): SurfacesPort {
  const subscribe =
    <Payload>(channel: string) =>
    (listener: (payload: Payload) => void): (() => void) => {
      const relay = (_event: unknown, payload: Payload): void => listener(payload);
      ipc.on(channel, relay);
      return () => ipc.removeListener(channel, relay);
    };
  const deskChanges = subscribe<Desk>(surfaceChannels.deskChanged);
  answerOnceThePaneIsHome(ipc);
  return {
    desk: () => ipc.invoke(surfaceChannels.desk) as Promise<Desk>,
    onDeskChanged: (listener) => {
      ipc.send(surfaceChannels.watchDesk);
      return deskChanges(listener);
    },
    show: (request) => ipc.invoke(surfaceChannels.show, request) as Promise<void>,
    hide: (id) => ipc.invoke(surfaceChannels.hide, id) as Promise<void>,
    close: (id) => ipc.invoke(surfaceChannels.close, id) as Promise<void>,
    glide: (glide) => ipc.invoke(surfaceChannels.glide, glide) as Promise<void>,
    play: (play) => ipc.invoke(surfaceChannels.play, play) as Promise<void>,
    focus: (id) => ipc.invoke(surfaceChannels.focus, id) as Promise<void>,
    focusConsole: () => ipc.invoke(surfaceChannels.focusConsole) as Promise<void>,
    stack: (bottomToTop) => ipc.invoke(surfaceChannels.stack, bottomToTop) as Promise<void>,
    moveConsole: (move) => ipc.invoke(surfaceChannels.moveConsole, move) as Promise<ConsoleMoved>,
    onLeaving: subscribe<null>(surfaceChannels.leaving),
    onEvent: subscribe<SurfaceEvent>(surfaceChannels.event),
  };
}

// Every listener for one IPC message runs in the same task, and a window that shares this
// renderer process cannot be torn down until that task ends, so the page's own `closed`
// listeners have all run by the time main acts on this answer.
function answerOnceThePaneIsHome(ipc: SurfacesIpc): void {
  ipc.on(surfaceChannels.event, (_event: unknown, event: SurfaceEvent) => {
    if (event.kind === "closed") ipc.send(surfaceChannels.broughtHome, event.id);
  });
}
