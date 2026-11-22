import type { BaseWindow, BrowserWindowConstructorOptions } from "electron";
import type { ScreenRect } from "./channels.ts";

export const surfaceMinimumSize = { width: 200, height: 120 } as const;

export interface SurfaceWindowSpec {
  parent: BaseWindow;
  backdrop: string;
  title: string;
}

export function surfaceWindowOptions(spec: SurfaceWindowSpec): BrowserWindowConstructorOptions {
  return {
    parent: spec.parent,
    modal: false,
    frame: false,
    transparent: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    minimizable: false,
    maximizable: true,
    fullscreenable: false,
    fullscreen: false,
    kiosk: false,
    resizable: true,
    minWidth: surfaceMinimumSize.width,
    minHeight: surfaceMinimumSize.height,
    backgroundColor: spec.backdrop,
    title: spec.title,
  };
}

export type SurfaceSignal =
  | "move"
  | "resize"
  | "grab"
  | "release"
  | "maximize"
  | "unmaximize"
  | "focus"
  | "blur"
  | "closed";

export interface CloseRequest {
  preventDefault(): void;
}

export interface SurfaceWindowLike {
  readonly id: number;
  readonly contentsId: number;
  nativeHandle(): string;
  sourceId(): string;
  moveAbove(sourceId: string): void;
  getBounds(): ScreenRect;
  setBounds(bounds: ScreenRect): void;
  setPosition(x: number, y: number): void;
  setBackgroundColor(color: string): void;
  setTitle(title: string): void;
  setZoomFactor(factor: number): void;
  show(): void;
  showInactive(): void;
  hide(): void;
  focus(): void;
  isVisible(): boolean;
  isMaximized(): boolean;
  isDestroyed(): boolean;
  destroy(): void;
  on(signal: SurfaceSignal, listener: () => void): void;
  onCloseRequested(listener: (request: CloseRequest) => void): void;
}

export type ConsoleSignal = "reframed" | "grabbed" | "unloaded" | "closed";

export interface ConsoleWindowLike {
  readonly id: number;
  sourceId(): string;
  bounds(): ScreenRect;
  contentBounds(): ScreenRect;
  isMaximized(): boolean;
  isMinimized(): boolean;
  setBounds(bounds: ScreenRect): void;
  maximize(): void;
  unmaximize(): void;
  zoomFactor(): number;
  focus(): void;
  send(channel: string, payload: unknown): void;
  on(signal: ConsoleSignal, listener: () => void): void;
}

export const grabEvents = ["will-move", "will-resize"] as const;

// Electron emits `moved` once per finished drag only on Windows; on macOS it is an alias of
// `move`, and neither `moved` nor `resized` exists on Linux.
export function releaseEvents(platform: NodeJS.Platform): readonly ("moved" | "resized")[] {
  if (platform === "win32") return ["moved", "resized"];
  return platform === "darwin" ? ["resized"] : [];
}

export const reframeEvents = ["move", "resize", "maximize", "unmaximize", "restore"] as const;

export const unloadEvents = ["did-navigate", "render-process-gone"] as const;
