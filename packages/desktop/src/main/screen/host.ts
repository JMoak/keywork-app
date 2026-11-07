import {
  type GrantBook,
  grantBook,
  type PathClass,
  type SessionSummary,
  type SignalingEndpoint,
  type SignalingTransport,
  sessionSummaries,
} from "@keywork-app/screen";
import type { SenderFrame } from "./channels.ts";
import type { SignalingRouter } from "./routes.ts";
import { type Sharer, type SharerSeams, sharer } from "./sharer.ts";
import { type Viewer, type ViewerSink, viewer } from "./viewer.ts";

export const tickEveryMs = 1000;

export const relistenAfterMs = 2000;

export const frameTimeoutMs = 2000;

export interface ScreenHostSeams extends Omit<SharerSeams, "grants"> {
  readonly inbound: SignalingTransport;
  readonly endpointFor: SignalingRouter;
  readonly transport: (endpoint: SignalingEndpoint) => SignalingTransport;
  readonly peerPath: (peer: string) => Promise<PathClass>;
  readonly sink: ViewerSink;
}

export interface ScreenHost {
  readonly sharer: Sharer;
  readonly viewer: Viewer;
  readonly grants: GrantBook;
  listen(): () => void;
  frame(sessionId: string, maxWidth: number): Promise<Uint8Array | undefined>;
  frameArrived(sessionId: string, frame: SenderFrame): void;
  history(): Promise<SessionSummary[]>;
  startTicking(): () => void;
  shutdown(): Promise<void>;
}

export function screenHost(seams: ScreenHostSeams): ScreenHost {
  const grants = grantBook(seams.clock);
  const sharing = sharer(seams.inbound, { ...seams, grants });
  const viewing = viewer({
    timers: seams.timers,
    mint: seams.mint,
    endpointFor: seams.endpointFor,
    transport: seams.transport,
    pathTo: seams.peerPath,
    sink: seams.sink,
  });
  const pendingFrames = new Map<string, (jpeg: Uint8Array | undefined) => void>();
  let nextFrame = 1;

  const listen = (): (() => void) => {
    let stopped = false;
    let unlisten = (): void => {};
    let retry: unknown;
    const follow = (): void => {
      unlisten = seams.inbound.listen({
        message: (raw) => void sharing.receive(raw),
        closed: () => {
          if (!stopped) retry = seams.timers.set(follow, relistenAfterMs);
        },
      });
    };
    follow();
    return () => {
      stopped = true;
      seams.timers.clear(retry);
      unlisten();
    };
  };

  return {
    sharer: sharing,
    viewer: viewing,
    grants,
    listen,
    frame: (sessionId, maxWidth) => {
      if (!sharing.isCapturing(sessionId)) return Promise.resolve(undefined);
      const requestId = nextFrame++;
      const key = `${sessionId}:${requestId}`;
      return new Promise((resolve) => {
        const timer = seams.timers.set(() => settle(undefined), frameTimeoutMs);
        const settle = (jpeg: Uint8Array | undefined): void => {
          seams.timers.clear(timer);
          pendingFrames.delete(key);
          resolve(jpeg);
        };
        pendingFrames.set(key, settle);
        seams.senders.command(sessionId, { kind: "frame", requestId, maxWidth });
      });
    },
    frameArrived: (sessionId, frame) => {
      pendingFrames.get(`${sessionId}:${frame.requestId}`)?.(frame.jpeg);
    },
    history: async () => sessionSummaries(await seams.log.read()),
    startTicking: () => {
      let stopped = false;
      let timer: unknown;
      const tick = (): void => {
        timer = seams.timers.set(async () => {
          await sharing.tick();
          if (!stopped) tick();
        }, tickEveryMs);
      };
      tick();
      return () => {
        stopped = true;
        seams.timers.clear(timer);
      };
    },
    shutdown: async () => {
      await Promise.all([sharing.endAll("shutdown"), viewing.closeAll()]);
    },
  };
}
