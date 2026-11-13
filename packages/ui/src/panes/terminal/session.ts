import type { SessionProjection } from "@keywork-app/client";
import type { PtyExit, PtyPort, PtyProgram } from "../../host/port.ts";
import { mirrorDelta, mirrorText } from "./mirror.ts";

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalSurface {
  write(data: string | Uint8Array): void;
  clear(): void;
  reset(): void;
  size(): TerminalSize;
  selection(): string;
  focus(): void;
  blur(): void;
  onInput(listener: (data: string) => void): () => void;
  onResize(listener: (size: TerminalSize) => void): () => void;
  dispose(): void;
}

export interface PtyLink {
  workspace: string;
  program: PtyProgram;
  args: readonly string[];
}

export type PtyEvent =
  | { kind: "opened"; title: string }
  | { kind: "exit"; exit: PtyExit }
  | { kind: "failed" };

export interface PtyConnection {
  write(data: string): void;
  attached(): boolean;
  running(): Promise<readonly string[]>;
  dispose(): void;
}

export function connectPty(
  surface: TerminalSurface,
  port: PtyPort,
  link: PtyLink,
  onEvent: (event: PtyEvent) => void,
): PtyConnection {
  let id: number | undefined;
  let live = true;
  const stops: Array<() => void> = [];
  const size = surface.size();
  const stopListening = (): void => {
    for (const stop of stops.splice(0)) stop();
  };
  const fail = (): void => {
    if (!live) return;
    stopListening();
    if (id !== undefined) port.close(id);
    id = undefined;
    onEvent({ kind: "failed" });
  };
  const remember = (stop: () => void): void => {
    if (live) stops.push(stop);
    else stop();
  };
  void Promise.resolve()
    .then(() => (live ? port.open({ ...link, cols: size.cols, rows: size.rows }) : undefined))
    .then((opened) => {
      if (opened === undefined) return;
      if (!live) {
        port.close(opened.id);
        return;
      }
      id = opened.id;
      remember(port.onData(opened.id, (bytes) => surface.write(bytes)));
      remember(
        surface.onInput((data) => {
          if (id !== undefined) port.write(id, data);
        }),
      );
      remember(
        surface.onResize((next) => {
          if (id !== undefined) port.resize(id, next.cols, next.rows);
        }),
      );
      const settled = surface.size();
      if (!sameSize(settled, size)) port.resize(opened.id, settled.cols, settled.rows);
      remember(
        port.onExit(opened.id, (exit) => {
          id = undefined;
          onEvent({ kind: "exit", exit });
        }),
      );
      if (id !== undefined) onEvent({ kind: "opened", title: opened.title });
    })
    .catch(fail);
  return {
    write: (data) => {
      if (id !== undefined) port.write(id, data);
    },
    attached: () => id !== undefined,
    running: async () => (id === undefined ? [] : ((await port.running?.(id)) ?? [])),
    dispose: () => {
      live = false;
      stopListening();
      if (id !== undefined) port.close(id);
      id = undefined;
    },
  };
}

export interface MirrorPainter {
  paint(projection: SessionProjection): void;
}

export function mirrorPainter(surface: TerminalSurface): MirrorPainter {
  let painted = "";
  return {
    paint: (projection) => {
      const next = mirrorText(projection);
      const delta = mirrorDelta(painted, next);
      if (delta.reset) surface.reset();
      if (delta.write !== "") surface.write(delta.write);
      painted = next;
    },
  };
}

export function bridgeArgs(spec: { sessionId?: string | undefined; verb?: string | undefined }) {
  if (spec.verb === "connect") return ["connect"];
  return spec.sessionId === undefined ? ["attach"] : ["attach", "--session", spec.sessionId];
}

function sameSize(left: TerminalSize, right: TerminalSize): boolean {
  return left.cols === right.cols && left.rows === right.rows;
}
