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

export type PtyEvent = { kind: "opened"; title: string } | { kind: "exit"; exit: PtyExit };

export interface PtyConnection {
  write(data: string): void;
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
  void port.open({ ...link, cols: size.cols, rows: size.rows }).then((opened) => {
    if (!live) {
      port.close(opened.id);
      return;
    }
    id = opened.id;
    onEvent({ kind: "opened", title: opened.title });
    stops.push(
      port.onData(opened.id, (bytes) => surface.write(bytes)),
      port.onExit(opened.id, (exit) => {
        id = undefined;
        onEvent({ kind: "exit", exit });
      }),
      surface.onInput((data) => port.write(opened.id, data)),
      surface.onResize((next) => port.resize(opened.id, next.cols, next.rows)),
    );
  });
  return {
    write: (data) => {
      if (id !== undefined) port.write(id, data);
    },
    dispose: () => {
      live = false;
      for (const stop of stops.splice(0)) stop();
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
