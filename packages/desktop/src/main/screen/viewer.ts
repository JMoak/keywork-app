import {
  type ConsentTimers,
  type EndReason,
  nextDisplay,
  type PathClass,
  type PeerSignal,
  peerSignalMessage,
  peerSignalOf,
  type ScreenDisplay,
  type Signaler,
  type SignalingEndpoint,
  type SignalingTransport,
  type SignalMessage,
  signaler,
  signalingVersion,
} from "@keywork-app/screen";
import type { ViewerEvent, ViewRequest, ViewStart } from "./channels.ts";
import type { SignalingRouter } from "./routes.ts";
import type { Mint } from "./sharer.ts";

export const keepaliveEveryMs = 15_000;

export interface ViewerSink {
  prepare(webContentsId: number): void;
  send(webContentsId: number, event: ViewerEvent): void;
}

export interface ViewerSeams {
  readonly timers: ConsentTimers;
  readonly mint: Mint;
  readonly endpointFor: SignalingRouter;
  readonly transport: (endpoint: SignalingEndpoint) => SignalingTransport;
  readonly pathTo: (peer: string) => Promise<PathClass>;
  readonly sink: ViewerSink;
}

export interface Viewer {
  view(webContentsId: number, request: ViewRequest): Promise<ViewStart>;
  signal(webContentsId: number, sessionId: string, signal: PeerSignal): Promise<void>;
  state(webContentsId: number, sessionId: string, state: RTCPeerConnectionState): Promise<void>;
  stop(webContentsId: number, sessionId: string): Promise<void>;
  cycleDisplay(webContentsId: number, sessionId: string): Promise<void>;
  closeAll(webContentsId?: number): Promise<void>;
}

export function viewer(seams: ViewerSeams): Viewer {
  const viewing = new Map<string, Viewing>();

  const owned = (webContentsId: number, sessionId: string): Viewing | undefined => {
    const record = viewing.get(sessionId);
    return record?.webContentsId === webContentsId ? record : undefined;
  };

  const emit = (record: Viewing, event: ViewerEvent): void =>
    seams.sink.send(record.webContentsId, event);

  const finish = async (
    record: Viewing,
    reason: EndReason | "denied",
    detail?: string,
  ): Promise<void> => {
    if (viewing.get(record.sessionId) !== record) return;
    viewing.delete(record.sessionId);
    seams.timers.clear(record.keepalive);
    if (reason !== "denied" && reason !== "connection-lost") await record.signals.end(reason);
    record.unlisten();
    emit(record, {
      kind: "ended",
      sessionId: record.sessionId,
      reason,
      ...(detail !== undefined && { detail }),
    });
  };

  const keepAlive = (record: Viewing): void => {
    record.keepalive = seams.timers.set(() => {
      const grantId = record.signals.session().grantId;
      if (viewing.get(record.sessionId) !== record || grantId === undefined) return;
      void record.signals
        .send({ v: signalingVersion, kind: "keepalive", sessionId: record.sessionId, grantId })
        .catch(() => undefined);
      keepAlive(record);
    }, keepaliveEveryMs);
  };

  const inbound = async (record: Viewing, raw: unknown): Promise<void> => {
    const delivery = record.signals.receive(raw);
    if (delivery.kind !== "accepted") return;
    const message: SignalMessage = delivery.message;
    switch (message.kind) {
      case "granted":
        record.displays = message.displays;
        record.current = message.current;
        keepAlive(record);
        emit(record, {
          kind: "granted",
          sessionId: record.sessionId,
          displays: message.displays,
          current: message.current,
          expiresAt: message.expiresAt,
          path: await seams.pathTo(record.peer),
          ...(message.control !== undefined && { control: message.control }),
        });
        return;
      case "control":
        emit(record, {
          kind: "control",
          sessionId: record.sessionId,
          state: message.state,
          ...(message.reason !== undefined && { reason: message.reason }),
        });
        return;
      case "denied":
        return finish(record, "denied", message.reason);
      case "offer":
      case "candidate": {
        const signal = peerSignalOf(message);
        if (signal !== undefined)
          emit(record, { kind: "remote", sessionId: record.sessionId, signal });
        return;
      }
      case "displays":
        record.displays = message.displays;
        record.current = message.current;
        emit(record, {
          kind: "displays",
          sessionId: record.sessionId,
          displays: message.displays,
          current: message.current,
        });
        return;
      case "end":
        return finish(record, message.reason);
      default:
        return;
    }
  };

  return {
    view: async (webContentsId, request) => {
      const sessionId = seams.mint.id("session");
      const route = await seams.endpointFor(request.peer, sessionId);
      if (!route.ok) return { ok: false, problem: route.problem };
      const transport = seams.transport(route.endpoint);
      const record: Viewing = {
        sessionId,
        webContentsId,
        peer: request.peer,
        signals: signaler("viewer", sessionId, transport),
        unlisten: () => {},
        keepalive: undefined,
        displays: [],
        current: undefined,
      };
      viewing.set(sessionId, record);
      seams.sink.prepare(webContentsId);
      record.unlisten = transport.listen({
        message: (raw) => void inbound(record, raw),
        closed: (problem) => void finish(record, "connection-lost", problem),
      });
      try {
        await record.signals.send({
          v: signalingVersion,
          kind: "request",
          sessionId,
          scope: request.control === true ? "control" : "view",
        });
      } catch (error) {
        await finish(record, "connection-lost", String(error));
        return { ok: false, problem: String(error) };
      }
      emit(record, { kind: "asking", sessionId });
      return { ok: true, sessionId };
    },
    signal: async (webContentsId, sessionId, signal) => {
      const record = owned(webContentsId, sessionId);
      const grantId = record?.signals.session().grantId;
      if (record === undefined || grantId === undefined) return;
      await record.signals
        .send(peerSignalMessage(sessionId, grantId, signal))
        .catch(() => undefined);
    },
    state: async (webContentsId, sessionId, state) => {
      const record = owned(webContentsId, sessionId);
      if (record === undefined) return;
      if (state === "connected") record.signals.connected();
      if (state === "failed") await finish(record, "connection-lost", "the peer connection failed");
    },
    stop: async (webContentsId, sessionId) => {
      const record = owned(webContentsId, sessionId);
      if (record !== undefined) await finish(record, "viewer-left");
    },
    cycleDisplay: async (webContentsId, sessionId) => {
      const record = owned(webContentsId, sessionId);
      const grantId = record?.signals.session().grantId;
      if (record?.current === undefined || grantId === undefined) return;
      const next = nextDisplay(
        record.displays.map((display) => ({ ...display, sourceId: display.id })),
        record.current,
      );
      if (next === undefined || next.id === record.current) return;
      await record.signals
        .send({
          v: signalingVersion,
          kind: "switch-display",
          sessionId,
          grantId,
          displayId: next.id,
        })
        .catch(() => undefined);
    },
    closeAll: async (webContentsId) => {
      const records = [...viewing.values()].filter(
        (record) => webContentsId === undefined || record.webContentsId === webContentsId,
      );
      await Promise.all(records.map((record) => finish(record, "viewer-left")));
    },
  };
}

interface Viewing {
  readonly sessionId: string;
  readonly webContentsId: number;
  readonly peer: string;
  readonly signals: Signaler;
  unlisten: () => void;
  keepalive: unknown;
  displays: readonly ScreenDisplay[];
  current: string | undefined;
}
