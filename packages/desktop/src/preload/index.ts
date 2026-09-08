import { contextBridge, ipcRenderer } from "electron";
import { hostChannels } from "../shared/channels.ts";

const host = {
  about: () => ipcRenderer.invoke(hostChannels.about),
  pickFolder: () => ipcRenderer.invoke(hostChannels.pickFolder),
  recentWorkspaces: () => ipcRenderer.invoke(hostChannels.recentWorkspaces),
  openWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.openWorkspace, path),
  closeWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.closeWorkspace, path),
  openExternal: (url: string) => ipcRenderer.invoke(hostChannels.openExternal, url),
  notify: (notice: { title: string; body: string }) =>
    ipcRenderer.invoke(hostChannels.notify, notice),
  onServerLost: (listener: (loss: unknown) => void) => {
    const relay = (_event: unknown, loss: unknown): void => listener(loss);
    ipcRenderer.on(hostChannels.serverLost, relay);
    return () => ipcRenderer.removeListener(hostChannels.serverLost, relay);
  },
};

contextBridge.exposeInMainWorld("keyworkHost", host);
