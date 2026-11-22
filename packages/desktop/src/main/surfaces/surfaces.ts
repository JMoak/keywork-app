import type { Clock } from "../companion/companion.ts";
import {
  type ConsoleMove,
  type ConsoleMoved,
  type ConsoleStand,
  type Desk,
  type Glide,
  type Play,
  type PlayPart,
  type ScreenPoint,
  type ScreenRect,
  type SurfaceEvent,
  type SurfaceId,
  type SurfaceMover,
  type SurfaceShow,
  surfaceChannels,
} from "./channels.ts";
import {
  boundsShowing,
  consoleOutline,
  type DeskScreen,
  deskLayoutKey,
  deskOf,
  originOf,
  sameRect,
  shifted,
  translationBetween,
  wholeRect,
} from "./desk.ts";
import {
  type FrameGlide,
  type GlideClock,
  type Glider,
  type GlideTrack,
  glideFrame,
  glider,
  type PlayTrack,
} from "./glide.ts";
import { frameColour, type PanesHelper } from "./helper.ts";
import { type MoveLedger, moveLedger } from "./ledger.ts";
import { helpedGlider } from "./mover.ts";
import type { EveryFrame } from "./pacer.ts";
import type { CloseRequest, ConsoleWindowLike, SurfaceWindowLike } from "./window.ts";

export interface SenderLike {
  readonly id: number;
}

export interface IpcPort {
  handle(channel: string, handler: (sender: SenderLike, payload: unknown) => unknown): void;
  on(channel: string, listener: (sender: SenderLike, payload: unknown) => void): void;
  release(): void;
}

export interface ScreenPort extends DeskScreen {
  pixelsOf(point: ScreenPoint): ScreenPoint;
  onChange(listener: () => void): () => void;
}

export interface ConsolePort {
  of(sender: SenderLike): ConsoleWindowLike | undefined;
}

export interface SurfacePorts {
  childrenRideWithParent: boolean;
  screen: ScreenPort;
  consoles: ConsolePort;
  ipc: IpcPort;
  clock: Clock;
  everyFrame: EveryFrame;
  helper?: PanesHelper | undefined;
}

export interface SurfaceService {
  adopt(console: ConsoleWindowLike, window: SurfaceWindowLike, id: SurfaceId): void;
  holds(contentsId: number): boolean;
  backdrop(): string | undefined;
  dispose(): void;
}

export const newsEveryMs = 50;

export function startSurfaces(ports: SurfacePorts): SurfaceService {
  const host = new SurfaceHost(ports);
  host.registerIpc();
  return {
    adopt: (console, window, id) => host.adopt(console, window, id),
    holds: (contentsId) => host.holds(contentsId),
    backdrop: () => host.backdrop,
    dispose: () => host.dispose(),
  };
}

interface Owner {
  readonly console: ConsoleWindowLike;
  readonly surfaces: Map<SurfaceId, Surface>;
  readonly moved: Map<Surface, SurfaceMover>;
  frame: ScreenRect;
  flight: ConsoleFlight | undefined;
  deskStale: boolean;
  deskSaid: string | undefined;
  news: unknown;
}

interface ConsoleFlight {
  readonly from: ConsoleStand;
  readonly settled: (moved: ConsoleMoved) => void;
  glide: FrameGlide | undefined;
}

interface Surface {
  readonly id: SurfaceId;
  readonly window: SurfaceWindowLike;
  readonly owner: Owner;
  readonly ledger: MoveLedger;
  follows: boolean;
  leaving: boolean;
  framed: boolean;
  placed: ScreenRect | undefined;
}

class SurfaceHost {
  readonly ports: SurfacePorts;
  readonly owners = new Map<number, Owner>();
  readonly glides: Glider<Surface>;
  readonly frames: GlideClock;
  backdrop: string | undefined;
  stopWatchingScreen: (() => void) | undefined;
  disposed = false;

  constructor(ports: SurfacePorts) {
    this.ports = ports;
    this.frames = { now: () => ports.clock.now(), everyFrame: ports.everyFrame };
    this.glides = this.helped(glider(this.frames));
  }

  helped(unaided: Glider<Surface>): Glider<Surface> {
    const { helper, clock, screen } = this.ports;
    if (helper === undefined) return unaided;
    return helpedGlider({
      helper,
      unaided,
      clock,
      windowOf: (surface) => surface.window.nativeHandle(),
      pixelsOf: (point) => screen.pixelsOf(point),
      letGo: (surface) => this.holdPlace(surface),
    });
  }

  registerIpc(): void {
    const { ipc } = this.ports;
    const asked = this.askedByConsole.bind(this);
    ipc.handle(
      surfaceChannels.desk,
      asked((owner) => this.deskOf(owner)),
    );
    ipc.on(surfaceChannels.watchDesk, (sender) => void this.ownerOf(sender));
    ipc.handle(
      surfaceChannels.show,
      asked((owner, request: SurfaceShow) => this.show(owner, request)),
    );
    ipc.handle(
      surfaceChannels.hide,
      asked((owner, id: SurfaceId) => this.hide(owner, id)),
    );
    ipc.handle(
      surfaceChannels.close,
      asked((owner, id: SurfaceId) => this.close(owner, id)),
    );
    ipc.handle(
      surfaceChannels.glide,
      asked((owner, glide: Glide) => this.glide(owner, glide)),
    );
    ipc.handle(
      surfaceChannels.play,
      asked((owner, play: Play) => this.play(owner, play)),
    );
    ipc.handle(
      surfaceChannels.focus,
      asked((owner, id: SurfaceId) => this.named(owner, id).window.focus()),
    );
    ipc.handle(
      surfaceChannels.focusConsole,
      asked((owner) => owner.console.focus()),
    );
    ipc.handle(
      surfaceChannels.stack,
      asked((owner, bottomToTop: readonly SurfaceId[]) => this.stack(owner, bottomToTop)),
    );
    ipc.handle(
      surfaceChannels.moveConsole,
      asked((owner, move: ConsoleMove) => this.moveConsole(owner, move)),
    );
    ipc.on(surfaceChannels.broughtHome, (sender, id) => this.broughtHome(sender, id));
  }

  adopt(console: ConsoleWindowLike, window: SurfaceWindowLike, id: SurfaceId): void {
    if (this.disposed) window.destroy();
    else this.register(this.attend(console), window, id);
  }

  register(owner: Owner, window: SurfaceWindowLike, id: SurfaceId): void {
    const replaced = owner.surfaces.get(id);
    if (replaced !== undefined) this.discard(replaced);
    const surface: Surface = {
      id,
      window,
      owner,
      ledger: moveLedger(),
      follows: false,
      leaving: false,
      framed: false,
      placed: undefined,
    };
    owner.surfaces.set(id, surface);
    this.listenTo(surface);
    this.emit(owner, { kind: "ready", id });
  }

  holds(contentsId: number): boolean {
    return this.everySurface().some((surface) => surface.window.contentsId === contentsId);
  }

  dispose(): void {
    for (const owner of this.owners.values()) owner.console.send(surfaceChannels.leaving, null);
    this.disposed = true;
    this.glides.stop();
    for (const owner of [...this.owners.values()]) this.forget(owner);
    this.stopWatchingScreen?.();
    this.ports.ipc.release();
  }

  show(owner: Owner, request: SurfaceShow): void {
    const surface = this.named(owner, request.id);
    if (!holdsAPane(request.bounds)) throw new Error("a pane outside needs a place to stand");
    this.takeFromGlide(surface);
    this.backdrop = request.backdrop;
    surface.window.setBackgroundColor(request.backdrop);
    surface.window.setTitle(request.title);
    surface.window.setZoomFactor(owner.console.zoomFactor());
    this.place(surface, wholeRect(request.bounds));
    surface.follows = request.follows;
    this.frame(surface, request.frame);
    if (keeperWantsFocus(request)) this.showFocused(surface);
    else surface.window.showInactive();
  }

  showFocused(surface: Surface): void {
    surface.window.show();
    surface.window.focus();
  }

  hide(owner: Owner, id: SurfaceId): void {
    const surface = owner.surfaces.get(id);
    if (surface === undefined) return;
    this.takeFromGlide(surface);
    this.frame(surface, undefined);
    if (this.reusable(surface)) surface.window.hide();
    else this.retire(surface);
  }

  // On Windows a maximised window ignores every placement, shows maximised again from hidden,
  // and can only be restored by a call that also takes focus; and a frame keeps its colour once
  // the helper that set it is gone. Neither window is kept for the next pane.
  reusable(surface: Surface): boolean {
    return !surface.window.isMaximized() && !surface.framed;
  }

  retire(surface: Surface): void {
    this.release(surface);
    this.emit(surface.owner, { kind: "closed", id: surface.id });
    if (!surface.window.isDestroyed()) surface.window.destroy();
  }

  close(owner: Owner, id: SurfaceId): void {
    const surface = owner.surfaces.get(id);
    if (surface !== undefined) this.discard(surface);
  }

  glide(owner: Owner, glide: Glide): Promise<void> {
    const tracks = glide.moves.flatMap((move) => {
      const surface = owner.surfaces.get(move.id);
      if (surface === undefined || surface.window.isMaximized()) return [];
      return [this.trackOf(surface, wholeRect(move.bounds))];
    });
    return this.glides.run(tracks, glide.durationMs);
  }

  trackOf(surface: Surface, to: ScreenRect): GlideTrack<Surface> {
    this.place(surface, { ...to, ...originOf(surface.window.getBounds()) });
    surface.ledger.hostSends(to);
    return {
      key: surface,
      to: originOf(to),
      body: {
        position: () => originOf(surface.window.getBounds()),
        moveTo: (point) => this.slide(surface, { ...to, ...point }),
      },
    };
  }

  // A play is handed over whole. With the helper each pane reaches its new size as it travels,
  // on the helper's clock; without it each takes its size as it sets off, as a glide does.
  play(owner: Owner, play: Play): Promise<void> {
    const tracks = play.parts.flatMap((part) => {
      const surface = owner.surfaces.get(part.id);
      if (surface === undefined || surface.window.isMaximized()) return [];
      return [this.partOf(surface, part)];
    });
    return this.glides.play(tracks);
  }

  partOf(surface: Surface, part: PlayPart): PlayTrack<Surface> {
    const to = wholeRect(part.bounds);
    surface.ledger.hostSends(to);
    return {
      key: surface,
      to,
      delayMs: Math.max(0, part.atMs),
      durationMs: Math.max(0, part.durationMs),
      body: {
        position: () => originOf(surface.window.getBounds()),
        moveTo: (point) => this.slide(surface, { ...to, ...point }),
        frame: () => surface.window.getBounds(),
        reshape: (frame) => this.place(surface, frame),
      },
    };
  }

  moveConsole(owner: Owner, move: ConsoleMove): Promise<ConsoleMoved> {
    this.landConsole(owner);
    const { console } = owner;
    const from = this.restoredStand(owner);
    return new Promise((settled) => {
      const flight: ConsoleFlight = { from, settled, glide: undefined };
      owner.flight = flight;
      flight.glide = glideFrame(this.frames, {
        from: console.bounds(),
        to: boundsShowing(console, this.ports.screen, wholeRect(move.bounds)),
        durationMs: move.durationMs,
        place: (bounds) => console.setBounds(bounds),
        arrived: () => {
          if (move.maximized) console.maximize();
          this.landConsole(owner);
        },
      });
    });
  }

  restoredStand(owner: Owner): ConsoleStand {
    const maximized = owner.console.isMaximized();
    if (maximized) owner.console.unmaximize();
    return { bounds: consoleOutline(owner.console, this.ports.screen), maximized };
  }

  landConsole(owner: Owner): void {
    const { flight, console } = owner;
    if (flight === undefined) return;
    owner.flight = undefined;
    flight.glide?.halt();
    owner.frame = consoleOutline(console, this.ports.screen);
    this.deskChanged(owner);
    this.tellNews(owner);
    flight.settled({
      from: flight.from,
      to: { bounds: owner.frame, maximized: console.isMaximized() },
    });
  }

  stack(owner: Owner, bottomToTop: readonly SurfaceId[]): void {
    let beneath = owner.console.sourceId();
    for (const id of new Set(bottomToTop)) {
      const surface = owner.surfaces.get(id);
      if (surface === undefined || !surface.window.isVisible()) continue;
      surface.window.moveAbove(beneath);
      beneath = surface.window.sourceId();
    }
  }

  frame(surface: Surface, asked: string | undefined): void {
    const { helper } = this.ports;
    const colour = frameColour(asked);
    if (helper === undefined || !helper.inUse()) return;
    if (colour === undefined && !surface.framed) return;
    helper.frame(surface.window.nativeHandle(), colour);
    surface.framed = colour !== undefined;
  }

  place(surface: Surface, bounds: ScreenRect): void {
    surface.placed = bounds;
    if (sameRect(surface.window.getBounds(), bounds)) return;
    surface.ledger.hostPlaces(bounds, () => surface.window.setBounds(bounds));
  }

  slide(surface: Surface, to: ScreenRect): void {
    surface.placed = to;
    surface.ledger.hostPlaces(to, () => surface.window.setPosition(to.x, to.y));
  }

  takeFromGlide(surface: Surface): void {
    surface.placed = undefined;
    this.glides.drop(surface);
  }

  holdPlace(surface: Surface): void {
    const { placed, window } = surface;
    if (placed === undefined || !this.keeps(surface) || window.isMaximized()) return;
    this.place(surface, placed);
  }

  listenTo(surface: Surface): void {
    const { window } = surface;
    window.on("move", () => this.reshaped(surface));
    window.on("resize", () => this.reshaped(surface));
    window.on("grab", () => this.grabbed(surface));
    window.on("release", () => this.released(surface));
    window.on("maximize", () => this.keeperSized(surface));
    window.on("unmaximize", () => this.keeperSized(surface));
    window.on("focus", () => this.emit(surface.owner, { kind: "focused", id: surface.id }));
    window.on("blur", () => this.emit(surface.owner, { kind: "blurred", id: surface.id }));
    window.on("closed", () => this.lost(surface));
    window.onCloseRequested((request) => this.closeRequested(surface, request));
  }

  reshaped(surface: Surface): void {
    if (!this.keeps(surface)) return;
    const by = surface.ledger.moverOf(
      () => surface.window.getBounds(),
      () => this.glides.gliding(surface),
    );
    if (by === "keeper") this.keeperTook(surface);
    const { moved } = surface.owner;
    moved.set(surface, moved.get(surface) === "keeper" ? "keeper" : by);
    this.newsSoon(surface.owner);
  }

  keeperSized(surface: Surface): void {
    if (!this.keeps(surface)) return;
    this.keeperTook(surface);
    surface.owner.moved.set(surface, "keeper");
    this.newsSoon(surface.owner);
  }

  grabbed(surface: Surface): void {
    surface.ledger.grabbed();
    this.keeperTook(surface);
  }

  released(surface: Surface): void {
    surface.ledger.released();
    if (this.keeps(surface)) this.tellNews(surface.owner);
  }

  keeperTook(surface: Surface): void {
    surface.follows = false;
    this.takeFromGlide(surface);
  }

  closeRequested(surface: Surface, request: CloseRequest): void {
    if (this.disposed || !this.keeps(surface)) return;
    request.preventDefault();
    this.takeFromGlide(surface);
    this.frame(surface, undefined);
    surface.leaving = true;
    surface.window.hide();
    this.emit(surface.owner, { kind: "closed", id: surface.id });
  }

  broughtHome(sender: SenderLike, id: unknown): void {
    const surface = this.ownerOf(sender)?.surfaces.get(id as SurfaceId);
    if (surface?.leaving) this.discard(surface);
  }

  lost(surface: Surface): void {
    if (!this.keeps(surface)) return;
    this.release(surface);
    this.emit(surface.owner, { kind: "closed", id: surface.id });
  }

  discard(surface: Surface): void {
    this.release(surface);
    if (!surface.window.isDestroyed()) surface.window.destroy();
  }

  release(surface: Surface): void {
    const { owner } = surface;
    if (owner.surfaces.get(surface.id) === surface) owner.surfaces.delete(surface.id);
    owner.moved.delete(surface);
    this.takeFromGlide(surface);
  }

  keeps(surface: Surface): boolean {
    const { owner } = surface;
    return (
      this.owners.get(owner.console.id) === owner && owner.surfaces.get(surface.id) === surface
    );
  }

  attend(console: ConsoleWindowLike): Owner {
    const known = this.owners.get(console.id);
    if (known !== undefined) return known;
    const owner: Owner = {
      console,
      surfaces: new Map(),
      moved: new Map(),
      frame: consoleOutline(console, this.ports.screen),
      flight: undefined,
      deskStale: false,
      deskSaid: undefined,
      news: undefined,
    };
    this.owners.set(console.id, owner);
    console.on("reframed", () => this.consoleReframed(owner));
    console.on("grabbed", () => this.landConsole(owner));
    console.on("unloaded", () => this.discardAll(owner));
    console.on("closed", () => this.forget(owner));
    this.stopWatchingScreen ??= this.ports.screen.onChange(() => this.screenChanged());
    return owner;
  }

  consoleReframed(owner: Owner): void {
    if (!this.attends(owner) || owner.console.isMinimized()) return;
    const frame = consoleOutline(owner.console, this.ports.screen);
    const carried = translationBetween(owner.frame, frame);
    owner.frame = frame;
    if (owner.flight !== undefined) return;
    if (carried !== undefined) this.carryFollowers(owner, carried);
    this.deskChanged(owner);
  }

  carryFollowers(owner: Owner, by: ScreenPoint): void {
    if (this.ports.childrenRideWithParent) return;
    for (const surface of owner.surfaces.values()) {
      if (!surface.follows || !surface.window.isVisible()) continue;
      if (surface.window.isMaximized()) continue;
      const at = surface.window.getBounds();
      this.slide(surface, { ...at, ...shifted(at, by) });
    }
  }

  screenChanged(): void {
    for (const owner of this.owners.values()) this.deskChanged(owner);
  }

  deskChanged(owner: Owner): void {
    owner.deskStale = true;
    this.newsSoon(owner);
  }

  newsSoon(owner: Owner): void {
    owner.news ??= this.ports.clock.setTimeout(() => this.tellNews(owner), newsEveryMs);
  }

  tellNews(owner: Owner): void {
    this.ports.clock.clearTimeout(owner.news);
    owner.news = undefined;
    for (const [surface, by] of owner.moved) {
      this.emit(owner, { kind: "moved", id: surface.id, bounds: surface.window.getBounds(), by });
    }
    owner.moved.clear();
    if (owner.deskStale) this.tellDesk(owner);
  }

  tellDesk(owner: Owner): void {
    owner.deskStale = false;
    const desk = this.deskOf(owner);
    const said = deskLayoutKey(desk);
    if (said === owner.deskSaid) return;
    owner.deskSaid = said;
    owner.console.send(surfaceChannels.deskChanged, desk);
  }

  deskOf(owner: Owner): Desk {
    return deskOf(owner.console, this.ports.screen);
  }

  discardAll(owner: Owner): void {
    for (const surface of [...owner.surfaces.values()]) this.discard(surface);
  }

  forget(owner: Owner): void {
    this.abandonFlight(owner);
    this.discardAll(owner);
    this.ports.clock.clearTimeout(owner.news);
    owner.news = undefined;
    this.owners.delete(owner.console.id);
  }

  abandonFlight(owner: Owner): void {
    const { flight } = owner;
    owner.flight = undefined;
    flight?.glide?.halt();
    flight?.settled({ from: flight.from, to: flight.from });
  }

  attends(owner: Owner): boolean {
    return this.owners.get(owner.console.id) === owner;
  }

  emit(owner: Owner, event: SurfaceEvent): void {
    if (!this.disposed && this.attends(owner)) owner.console.send(surfaceChannels.event, event);
  }

  named(owner: Owner, id: SurfaceId): Surface {
    const surface = owner.surfaces.get(id);
    if (surface === undefined || surface.leaving) {
      throw new Error(`no pane outside the window answers to "${id}"`);
    }
    return surface;
  }

  ownerOf(sender: SenderLike): Owner | undefined {
    const console = this.ports.consoles.of(sender);
    return console === undefined || this.disposed ? undefined : this.attend(console);
  }

  askedByConsole<Payload>(act: (owner: Owner, payload: Payload) => unknown) {
    return (sender: SenderLike, payload: unknown): unknown => {
      const owner = this.ownerOf(sender);
      if (owner === undefined) throw new Error("only a console window keeps panes outside itself");
      return act(owner, payload as Payload);
    };
  }

  everySurface(): Surface[] {
    return [...this.owners.values()].flatMap((owner) => [...owner.surfaces.values()]);
  }
}

function holdsAPane(bounds: ScreenRect): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

function keeperWantsFocus(request: SurfaceShow): boolean {
  return request.origin === "keeper" && request.focus;
}
