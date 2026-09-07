import { contextBridge, ipcRenderer } from "electron";
import { hostChannels } from "../shared/channels.ts";

const host = {
  about: () => ipcRenderer.invoke(hostChannels.about),
};

contextBridge.exposeInMainWorld("keyworkHost", host);
