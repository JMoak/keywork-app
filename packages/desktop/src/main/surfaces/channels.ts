export const surfaceChannels = {
  desk: "surfaces:desk",
  watchDesk: "surfaces:watch-desk",
  deskChanged: "surfaces:desk-changed",
  show: "surfaces:show",
  hide: "surfaces:hide",
  close: "surfaces:close",
  glide: "surfaces:glide",
  play: "surfaces:play",
  focus: "surfaces:focus",
  focusConsole: "surfaces:focus-console",
  stack: "surfaces:stack",
  frame: "surfaces:frame",
  moveConsole: "surfaces:move-console",
  event: "surfaces:event",
  broughtHome: "surfaces:brought-home",
  leaving: "surfaces:leaving",
} as const;

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
  // The colour of the window's own frame as #rrggbb, where the desktop draws one; none when absent.
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

// One pane's part in a play: where it goes, how long after the play starts it sets off, and how
// long it takes. A play is handed over whole, so its timing does not ride on the page's timers.
export interface PlayPart {
  readonly id: SurfaceId;
  readonly bounds: ScreenRect;
  readonly atMs: number;
  readonly durationMs: number;
}

export interface Play {
  readonly parts: readonly PlayPart[];
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
  play?(play: Play): Promise<void>;
  focus(id: SurfaceId): Promise<void>;
  focusConsole(): Promise<void>;
  stack?(bottomToTop: readonly SurfaceId[]): Promise<void>;
  frame?(id: SurfaceId, frame: string | undefined): Promise<void>;
  moveConsole?(move: ConsoleMove): Promise<ConsoleMoved>;
  onLeaving?(listener: () => void): () => void;
  onEvent(listener: (event: SurfaceEvent) => void): () => void;
}

export function isSurfaceFrame(frameName: string): boolean {
  return frameName.startsWith(surfaceFramePrefix);
}
