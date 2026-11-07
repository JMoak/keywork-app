import { type InputChannel, type PathClass, pathClasses } from "@keywork-app/screen";
import { type SenderFrame, screenChannels, type ViewRequest } from "./channels.ts";
import type { ScreenHost } from "./host.ts";

export interface IpcEvent {
  readonly sender: { readonly id: number };
}

export interface IpcMainSeam {
  handle(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: IpcEvent, ...args: unknown[]) => void): void;
}

export interface SenderDirectory {
  sessionOf(webContentsId: number): string | undefined;
  ready(webContentsId: number): void;
}

export function registerScreenHandlers(
  ipc: IpcMainSeam,
  host: ScreenHost,
  senders: SenderDirectory,
): () => void {
  const handled = {
    [screenChannels.view]: (event: IpcEvent, request: unknown) =>
      isViewRequest(request)
        ? host.viewer.view(event.sender.id, request)
        : { ok: false, problem: "a view request names one peer" },
    [screenChannels.stop]: (event: IpcEvent, sessionId: unknown) =>
      typeof sessionId === "string" ? host.viewer.stop(event.sender.id, sessionId) : undefined,
    [screenChannels.cycleDisplay]: (event: IpcEvent, sessionId: unknown) =>
      typeof sessionId === "string"
        ? host.viewer.cycleDisplay(event.sender.id, sessionId)
        : undefined,
    [screenChannels.history]: () => host.history(),
  } as Record<string, (event: IpcEvent, ...args: unknown[]) => unknown>;

  const fromSender = (run: (sessionId: string, ...args: unknown[]) => void) => {
    return (event: IpcEvent, ...args: unknown[]): void => {
      const sessionId = senders.sessionOf(event.sender.id);
      if (sessionId !== undefined) run(sessionId, ...args);
    };
  };

  const listened = {
    [screenChannels.viewerSignal]: (event: IpcEvent, sessionId: unknown, signal: unknown) => {
      if (typeof sessionId === "string" && isObject(signal)) {
        void host.viewer.signal(event.sender.id, sessionId, signal as never);
      }
    },
    [screenChannels.viewerState]: (event: IpcEvent, sessionId: unknown, state: unknown) => {
      if (typeof sessionId === "string" && typeof state === "string") {
        void host.viewer.state(event.sender.id, sessionId, state as RTCPeerConnectionState);
      }
    },
    [screenChannels.senderReady]: (event: IpcEvent) => senders.ready(event.sender.id),
    [screenChannels.senderSignal]: fromSender((sessionId, signal) => {
      if (isObject(signal)) void host.sharer.senderSignal(sessionId, signal as never);
    }),
    [screenChannels.senderState]: fromSender((sessionId, state) => {
      if (typeof state === "string")
        void host.sharer.senderState(sessionId, state as RTCPeerConnectionState);
    }),
    [screenChannels.senderPath]: fromSender((sessionId, path) => {
      if (isPathClass(path)) void host.sharer.senderPath(sessionId, path);
    }),
    [screenChannels.senderFrame]: fromSender((sessionId, frame) => {
      if (isSenderFrame(frame)) host.frameArrived(sessionId, frame);
    }),
  } as Record<string, (event: IpcEvent, ...args: unknown[]) => void>;

  for (const [channel, handler] of Object.entries(handled)) ipc.handle(channel, handler);
  for (const [channel, listener] of Object.entries(listened)) ipc.on(channel, listener);
  return () => {
    for (const channel of Object.keys(handled)) ipc.removeHandler(channel);
    for (const [channel, listener] of Object.entries(listened))
      ipc.removeListener(channel, listener);
  };
}

export function registerControlHandlers(
  ipc: IpcMainSeam,
  host: ScreenHost,
  senders: SenderDirectory,
): () => void {
  const listener = (event: IpcEvent, channel: unknown, input: unknown): void => {
    const sessionId = senders.sessionOf(event.sender.id);
    if (sessionId !== undefined && isInputChannel(channel)) {
      host.sharer.senderInput(sessionId, channel, input);
    }
  };
  ipc.on(screenChannels.senderInput, listener as (event: IpcEvent, ...args: unknown[]) => void);
  return () =>
    ipc.removeListener(
      screenChannels.senderInput,
      listener as (event: IpcEvent, ...args: unknown[]) => void,
    );
}

function isViewRequest(value: unknown): value is ViewRequest {
  return (
    isObject(value) &&
    typeof value.peer === "string" &&
    value.peer.length > 0 &&
    (value.control === undefined || typeof value.control === "boolean")
  );
}

function isInputChannel(value: unknown): value is InputChannel {
  return value === "ctl" || value === "ptr";
}

function isPathClass(value: unknown): value is PathClass {
  return typeof value === "string" && (pathClasses as readonly string[]).includes(value);
}

function isSenderFrame(value: unknown): value is SenderFrame {
  return (
    isObject(value) &&
    typeof value.requestId === "number" &&
    (value.jpeg === undefined || value.jpeg instanceof Uint8Array)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
