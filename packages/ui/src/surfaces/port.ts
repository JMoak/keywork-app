export const surfaceFramePrefix = "kw-surface:";
export const surfacePageUrl = "about:blank";

export type SurfaceId = string;

export type SurfaceOrigin = "keeper" | "creature";

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenRect extends ScreenPoint {
  readonly width: number;
  readonly height: number;
}

export interface DeskDisplay {
  readonly bounds: ScreenRect;
  readonly workArea: ScreenRect;
  readonly scaleFactor: number;
}

export interface Desk {
  readonly console: ScreenRect;
  readonly consoleMaximized: boolean;
  readonly workArea: ScreenRect;
  readonly displays: readonly DeskDisplay[];
  readonly cursor: ScreenPoint;
}

export interface SurfaceShow {
  readonly id: SurfaceId;
  readonly bounds: ScreenRect;
  readonly origin: SurfaceOrigin;
  readonly focus: boolean;
  readonly follows: boolean;
  readonly backdrop: string;
  readonly title: string;
  readonly frame?: string | undefined;
}

export interface SurfaceMove {
  readonly id: SurfaceId;
  readonly bounds: ScreenRect;
}

export interface Glide {
  readonly moves: readonly SurfaceMove[];
  readonly durationMs: number;
}

export interface ConsoleStand {
  readonly bounds: ScreenRect;
  readonly maximized: boolean;
}

export interface ConsoleMove extends ConsoleStand {
  readonly durationMs: number;
}

export interface ConsoleMoved {
  readonly from: ConsoleStand;
  readonly to: ConsoleStand;
}

export type SurfaceMover = "keeper" | "host";

export type SurfaceEvent =
  | { readonly kind: "ready"; readonly id: SurfaceId }
  | {
      readonly kind: "moved";
      readonly id: SurfaceId;
      readonly bounds: ScreenRect;
      readonly by: SurfaceMover;
    }
  | { readonly kind: "focused"; readonly id: SurfaceId }
  | { readonly kind: "blurred"; readonly id: SurfaceId }
  | { readonly kind: "closed"; readonly id: SurfaceId };

export interface SurfacesPort {
  desk(): Promise<Desk>;
  onDeskChanged(listener: (desk: Desk) => void): () => void;
  show(request: SurfaceShow): Promise<void>;
  hide(id: SurfaceId): Promise<void>;
  close(id: SurfaceId): Promise<void>;
  glide(glide: Glide): Promise<void>;
  focus(id: SurfaceId): Promise<void>;
  focusConsole(): Promise<void>;
  stack?(bottomToTop: readonly SurfaceId[]): Promise<void>;
  moveConsole?(move: ConsoleMove): Promise<ConsoleMoved>;
  onLeaving?(listener: () => void): () => void;
  onEvent(listener: (event: SurfaceEvent) => void): () => void;
}

export function isSurfaceFrame(frameName: string): boolean {
  return frameName.startsWith(surfaceFramePrefix);
}
