export {
  type ConsoleMove,
  type ConsoleMoved,
  type ConsoleStand,
  type Desk,
  type DeskDisplay,
  type Glide,
  isSurfaceFrame,
  type ScreenPoint,
  type ScreenRect,
  type SurfaceEvent,
  type SurfaceId,
  type SurfaceMove,
  type SurfaceMover,
  type SurfaceOrigin,
  type SurfaceShow,
  type SurfacesPort,
  surfaceChannels,
  surfaceFramePrefix,
  surfacePageUrl,
} from "./channels.ts";
export {
  type ElectronSurfaceSeams,
  type ElectronSurfaces,
  type SurfaceDoor,
  startElectronSurfaces,
} from "./electron.ts";
export { easedToRest } from "./glide.ts";
export { glideFrameMs } from "./pacer.ts";
export {
  newsEveryMs,
  type SurfacePorts,
  type SurfaceService,
  startSurfaces,
} from "./surfaces.ts";
export { surfaceMinimumSize, surfaceWindowOptions } from "./window.ts";
