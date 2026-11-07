import { type MotionPrefs, type Rows, referenceRows } from "@keywork-app/habitat";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { cardKeys } from "../page/ask-card.tsx";
import { wearRememberedTheme } from "../theme/wardrobe.ts";
import { accessibleName } from "./announce.ts";
import {
  createMirror,
  followSnapshot,
  greetBeat,
  type Mirror,
  playInput,
  releaseInput,
  type ShownPose,
  seedOf,
  shownPose,
  walkBeat,
  waveBeat,
} from "./beats.ts";
import { Badge, NeedsYouBubble } from "./bubble.tsx";
import {
  advanceDrag,
  type DragEffect,
  type DragInput,
  type DragState,
  holdMs,
  idleDrag,
} from "./drag.ts";
import { insideWithHysteresis, unionMask } from "./hit-test.ts";
import {
  type CompanionConditions,
  type CompanionPort,
  type CompanionSnapshot,
  type HitMask,
  type NudgeStep,
  restingConditions,
  type Tier,
} from "./port.ts";
import {
  deviceScaleFor,
  hitMaskOf,
  placeholderRenderer,
  type RenderedFrame,
  type Renderer,
  tokensFromStyle,
} from "./renderer.ts";
import { bubbleShown } from "./snapshot.ts";
import { effectiveTier, type SchedulerHost, tierScheduler } from "./tier-scheduler.ts";
import "./companion.css";

export interface PageHost extends SchedulerHost {
  devicePixelRatio(): number;
  systemReducesMotion(): boolean;
  readToken(name: string): string;
  viewport(): { width: number; height: number };
  storage: Pick<Storage, "getItem"> | undefined;
}

export interface CompanionPageProps {
  port: CompanionPort;
  renderer?: Renderer | undefined;
  host?: PageHost | undefined;
}

export const greetCooldownMs = 2000;
export const wakeupReportEveryMs = 10_000;

export function browserPageHost(): PageHost {
  return {
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    requestAnimationFrame: (fn) => window.requestAnimationFrame(fn),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle as number),
    random: () => Math.random(),
    devicePixelRatio: () => window.devicePixelRatio || 1,
    systemReducesMotion: () =>
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    readToken: (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    storage: storageOrNone(),
  };
}

export function CompanionPage(props: CompanionPageProps) {
  const host = props.host ?? browserPageHost();
  const renderer = props.renderer ?? placeholderRenderer;
  const rows: Rows = renderer.rows ?? referenceRows;
  const [snapshot, setSnapshot] = createSignal<CompanionSnapshot>();
  const [conditions, setConditions] = createSignal<CompanionConditions>(restingConditions);
  const [hovering, setHovering] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [reacting, setReacting] = createSignal(false);
  let stage: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let mask: HitMask | undefined;
  let interactive = false;
  let painted = false;
  let shown: Look | undefined;
  let lastReport = host.now();
  let lastGreet = Number.NEGATIVE_INFINITY;
  let mirror: Mirror = createMirror(host.now(), seedOf(undefined));
  let drag: DragState = idleDrag;
  let holdTimer: unknown;
  let pending = { dx: 0, dy: 0 };
  let flushHandle: unknown;

  const reducedMotion = () =>
    conditions().motion === "reduce" ||
    (conditions().motion === "system" && host.systemReducesMotion());
  const still = () => conditions().still || reducedMotion();
  const desire = (): Tier => {
    if (dragging() || hovering()) return "interact";
    return reacting() ? "active" : "ambient";
  };
  const tier = () => effectiveTier(conditions().ceiling, desire());
  const prefs = (): MotionPrefs => ({ reducedMotion: still(), tier: tier() });
  const tokens = createMemo(() =>
    tokensFromStyle(host.readToken, snapshot()?.creature.hueStop, conditions().forcedColors),
  );
  const bubble = () => {
    const current = snapshot();
    return conditions().quiet || current === undefined ? undefined : bubbleShown(current);
  };
  const label = () => {
    const current = snapshot();
    return current === undefined ? "companion" : accessibleName(current);
  };

  const react = (beat: typeof greetBeat): void => {
    if (still()) return;
    mirror = playInput(mirror, beat, prefs(), rows);
    setReacting(true);
    scheduler.poke();
  };

  const draw = (now: number): number | undefined => {
    const current = snapshot();
    const seed = seedOf(current?.creature);
    if (seed !== mirror.seed) mirror = createMirror(now, seed);
    mirror = followSnapshot(mirror, current, now, prefs(), rows);
    const pose = shownPose(mirror.body, rows, prefs());
    const look: Look = {
      pose,
      tokens: tokens(),
      deviceScale: deviceScaleFor(conditions().scale, host.devicePixelRatio()),
      hueStop: current?.creature.hueStop,
      forcedColors: conditions().forcedColors,
    };
    if (shown === undefined || !sameLook(shown, look)) {
      shown = look;
      const frame = renderer(
        { clip: pose.clip, frame: pose.frame, facing: pose.facing },
        look.tokens,
        { deviceScale: look.deviceScale, hueStop: look.hueStop, forcedColors: look.forcedColors },
      );
      paintFrame(canvas, frame, host.devicePixelRatio());
      refreshMask(frame);
    }
    if (!painted) {
      painted = true;
      props.port.ready();
    }
    report(now);
    if (reacting() && mirror.body.clip.lane !== "input") setReacting(false);
    return pose.nextWakeAt;
  };
  const scheduler = tierScheduler(host, draw);

  const refreshMask = (frame: RenderedFrame): void => {
    const rect = canvas?.getBoundingClientRect();
    const offset = rect === undefined ? { x: 0, y: 0 } : { x: rect.left, y: rect.top };
    const base = hitMaskOf(frame, 1 / host.devicePixelRatio(), offset, host.viewport());
    const chrome = [...(stage?.querySelectorAll("[data-hit]") ?? [])].map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    });
    mask = unionMask(base, chrome);
    if (conditions().wantsMask) props.port.sendMask(mask);
  };

  const report = (now: number): void => {
    if (now - lastReport < wakeupReportEveryMs) return;
    lastReport = now;
    props.port.reportWakeups({ count: scheduler.takeWakeups(), tier: scheduler.tier() });
  };

  const setInteractive = (inside: boolean): void => {
    if (inside === interactive) return;
    interactive = inside;
    props.port.setInteractive(inside);
  };

  const open = (): void => props.port.open(snapshot()?.threadId);

  const step = (input: DragInput): void => {
    const result = advanceDrag(drag, input);
    drag = result.state;
    for (const effect of result.effects) applyDrag(effect);
    if (drag.kind === "idle") host.clearTimeout(holdTimer);
  };

  const flushDrag = (): void => {
    if (flushHandle !== undefined) host.cancelAnimationFrame(flushHandle);
    flushHandle = undefined;
    if (pending.dx === 0 && pending.dy === 0) return;
    props.port.drag(pending);
    pending = { dx: 0, dy: 0 };
  };

  const applyDrag = (effect: DragEffect): void => {
    switch (effect.kind) {
      case "face":
        mirror = playInput(mirror, walkBeat(effect.facing), prefs(), rows);
        setDragging(true);
        scheduler.poke();
        return;
      case "drag":
        pending = { dx: pending.dx + effect.dx, dy: pending.dy + effect.dy };
        if (flushHandle === undefined) flushHandle = host.requestAnimationFrame(flushDrag);
        return;
      case "dragEnd":
        flushDrag();
        mirror = releaseInput(mirror);
        setDragging(false);
        scheduler.poke();
        props.port.dragEnd();
        return;
      case "click":
        open();
        return;
      case "hold":
        react(waveBeat);
    }
  };

  const overChrome = (event: Event): boolean =>
    event.target instanceof Element && event.target.closest("[data-hit]") !== null;

  const onPointerMove = (event: PointerEvent): void => {
    const point = { x: event.clientX, y: event.clientY };
    if (drag.kind !== "idle") {
      step({ type: "move", ...point, t: host.now() });
      return;
    }
    const inside =
      overChrome(event) || (mask !== undefined && insideWithHysteresis(mask, point, interactive));
    setInteractive(inside);
    if (inside && !hovering() && host.now() - lastGreet >= greetCooldownMs) {
      lastGreet = host.now();
      react(greetBeat);
    }
    setHovering(inside);
  };

  const onPointerLeave = (): void => {
    if (drag.kind !== "idle") return;
    setInteractive(false);
    setHovering(false);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || overChrome(event)) return;
    if (stage !== undefined && "setPointerCapture" in stage)
      stage.setPointerCapture(event.pointerId);
    step({ type: "down", x: event.clientX, y: event.clientY, t: host.now() });
    holdTimer = host.setTimeout(() => step({ type: "tick", t: host.now() }), holdMs);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    step({ type: "up", t: host.now() });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const nudge = nudgeOf(event.key);
    if (nudge !== undefined) {
      event.preventDefault();
      props.port.nudge(nudge);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.port.home();
    }
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    props.port.openMenu({ x: event.clientX, y: event.clientY });
  };

  const tucked = () => conditions().ceiling === "hidden";
  let heldWhileTucked: CompanionSnapshot | undefined;
  const receive = (next: CompanionSnapshot): void => {
    if (tucked()) heldWhileTucked = next;
    else setSnapshot(next);
  };
  createEffect(
    on(tucked, (isTucked) => {
      if (isTucked || heldWhileTucked === undefined) return;
      setSnapshot(heldWhileTucked);
      heldWhileTucked = undefined;
    }),
  );
  createEffect(() => scheduler.setTier(tier(), conditions().onBattery));
  createEffect(() => scheduler.setStill(still()));
  createEffect(
    on([() => snapshot()?.state, () => snapshot()?.threadId, tokens], () => scheduler.poke(), {
      defer: true,
    }),
  );

  onMount(() => {
    wearRememberedTheme({ storage: host.storage });
    const stops = [props.port.onSnapshot(receive), props.port.onConditions(setConditions)];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });
  onCleanup(() => {
    scheduler.stop();
    host.clearTimeout(holdTimer);
    if (flushHandle !== undefined) host.cancelAnimationFrame(flushHandle);
  });

  return (
    <div
      ref={stage}
      class="kw-companion"
      role="application"
      aria-label="companion"
      data-hover={hovering() ? "" : undefined}
      data-plate={conditions().reducedTransparency ? "" : undefined}
      data-forced-colors={conditions().forcedColors ? "" : undefined}
      data-tier={tier()}
      style={{ "--kw-companion-scale": String(conditions().scale / 100) }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => step({ type: "cancel" })}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <Show when={bubble()} fallback={<span />}>
        {(needs) => (
          <NeedsYouBubble
            bubble={needs()}
            keys={cardKeys}
            onAnswer={(pick) => {
              const callId = needs().callId;
              if (callId !== undefined) props.port.answer({ callId, pick });
            }}
            onAccept={(accept) =>
              props.port.answer({
                callId: `chore:${accept.creature}/${accept.routineId}`,
                pick: "approve",
                accept,
              })
            }
            onOverturn={(overturn) =>
              props.port.answer({ callId: `decided:${overturn.recordId}`, pick: "deny", overturn })
            }
            onOpen={open}
          />
        )}
      </Show>
      <button
        type="button"
        class="kw-companion-creature"
        aria-label={label()}
        tabIndex={conditions().keyboardReachable ? 0 : -1}
        onClick={(event) => {
          if (event.detail === 0) open();
        }}
      >
        <canvas ref={canvas} class="kw-companion-canvas" />
        <Badge
          activeThreads={snapshot()?.activeThreads ?? 0}
          finishedUnseen={snapshot()?.finishedUnseen ?? 0}
          waiting={snapshot()?.waiting ?? 0}
        />
      </button>
      <div class="kw-companion-controls">
        <button type="button" class="kw-companion-control" data-hit onClick={open}>
          open
        </button>
        <button
          type="button"
          class="kw-companion-control"
          data-hit
          aria-haspopup="menu"
          onClick={(event) => props.port.openMenu({ x: event.clientX, y: event.clientY })}
        >
          menu
        </button>
      </div>
    </div>
  );
}

function nudgeOf(key: string): NudgeStep | undefined {
  switch (key) {
    case "ArrowLeft":
      return { dx: -1, dy: 0 };
    case "ArrowRight":
      return { dx: 1, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
      return { dx: 0, dy: 1 };
    default:
      return undefined;
  }
}

interface Look {
  readonly pose: ShownPose;
  readonly tokens: ReturnType<typeof tokensFromStyle>;
  readonly deviceScale: number;
  readonly hueStop: number | undefined;
  readonly forcedColors: boolean;
}

function sameLook(a: Look, b: Look): boolean {
  return (
    a.pose.clip === b.pose.clip &&
    a.pose.frame === b.pose.frame &&
    a.pose.facing === b.pose.facing &&
    a.tokens === b.tokens &&
    a.deviceScale === b.deviceScale &&
    a.hueStop === b.hueStop &&
    a.forcedColors === b.forcedColors
  );
}

function paintFrame(
  canvas: HTMLCanvasElement | undefined,
  frame: RenderedFrame,
  devicePixelRatio: number,
): void {
  if (canvas === undefined) return;
  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.style.width = `${frame.width / devicePixelRatio}px`;
    canvas.style.height = `${frame.height / devicePixelRatio}px`;
  }
  const context = contextOf(canvas);
  if (context !== null) frame.paint(context);
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function storageOrNone(): Storage | undefined {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
