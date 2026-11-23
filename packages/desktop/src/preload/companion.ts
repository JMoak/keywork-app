import { contextBridge, ipcRenderer } from "electron";
import {
  type AnswerRequest,
  type CompanionConditions,
  type CompanionSnapshot,
  companionChannels,
  companionGlobal,
  type DragDelta,
  type HitMask,
  type MenuRequest,
  type NudgeStep,
  type SteadAsk,
  type Tier,
} from "../main/companion/channels.ts";
import { servesRendererPage } from "../shared/renderer-page.ts";

function subscribe<Payload>(channel: string): (listener: (payload: Payload) => void) => () => void {
  return (listener) => {
    const relay = (_event: unknown, payload: Payload): void => listener(payload);
    ipcRenderer.on(channel, relay);
    return () => ipcRenderer.removeListener(channel, relay);
  };
}

const port = {
  onSnapshot: subscribe<CompanionSnapshot>(companionChannels.snapshot),
  onConditions: subscribe<CompanionConditions>(companionChannels.conditions),
  ready: () => ipcRenderer.send(companionChannels.ready),
  setInteractive: (inside: boolean) => ipcRenderer.send(companionChannels.interactive, inside),
  sendMask: (mask: HitMask) => ipcRenderer.send(companionChannels.mask, mask),
  drag: (delta: DragDelta) => ipcRenderer.send(companionChannels.drag, delta),
  dragEnd: () => ipcRenderer.send(companionChannels.dragEnd),
  nudge: (step: NudgeStep) => ipcRenderer.send(companionChannels.nudge, step),
  home: () => ipcRenderer.send(companionChannels.home),
  openMenu: (at: MenuRequest) => ipcRenderer.send(companionChannels.menu, at),
  open: (threadId: string | undefined) => ipcRenderer.send(companionChannels.open, threadId),
  answer: (request: AnswerRequest) => ipcRenderer.send(companionChannels.answer, request),
  reportWakeups: (report: { count: number; tier: Tier }) =>
    ipcRenderer.send(companionChannels.wakeups, report),
  choose: (creature: string) => ipcRenderer.send(companionChannels.choose, creature),
  hatch: () => ipcRenderer.send(companionChannels.hatch),
  askForStead: (ask: SteadAsk) => ipcRenderer.send(companionChannels.stead, ask),
  release: () => ipcRenderer.send(companionChannels.release),
  onSteadKey: subscribe<void>(companionChannels.steadKey),
};

if (servesRendererPage(process.argv, location.href)) {
  contextBridge.exposeInMainWorld(companionGlobal, port);
}
