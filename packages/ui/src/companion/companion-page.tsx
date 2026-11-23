import { type MotionPrefs, type Rows, referenceRows } from "@keywork-app/habitat";
import type { DenyReason } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { type AskPick, askKeyPick, cardKeys } from "../page/ask-card.tsx";
import { type AnswerBy, admitsAnswer } from "../page/ask-card-guard.ts";
import { askingWhy, askWhy, readWhyKeys, stopAskingWhy } from "../page/ask-card-why.ts";
import { steadName } from "../panes/stead/copy.ts";
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
  type ChoreAccept,
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
import { groundRow, teamRows, zoomFor } from "./team-figures.ts";
import { TeamStrip, type TeamStripHandle } from "./team-strip.tsx";
import { effectiveTier, type SchedulerHost, tierScheduler } from "./tier-scheduler.ts";
import "./companion.css";

export interface PageHost extends SchedulerHost {
  devicePixelRatio(): number;
  systemReducesMotion(): boolean;
  readToken(name: string): string;
  viewport(): { width: number; height: number };
  storage: Pick<Storage, "getItem"> | undefined;
  onWindowFocus?(listener: () => void): () => void;
  onWindowBlur?(listener: () => void): () => void;
}

export interface CompanionPageProps {
  port: CompanionPort;
  renderer?: Renderer | undefined;
  rendererFor?: ((skinId: string | undefined) => Renderer | undefined) | undefined;
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
    onWindowFocus: (listener) => {
      window.addEventListener("focus", listener);
      return () => window.removeEventListener("focus", listener);
    },
    onWindowBlur: (listener) => {
      window.addEventListener("blur", listener);
      return () => window.removeEventListener("blur", listener);
    },
  };
}

export function CompanionPage(props: CompanionPageProps) {
  const host = props.host ?? browserPageHost();
  const [snapshot, setSnapshot] = createSignal<CompanionSnapshot>();
  const skinId = createMemo(() => snapshot()?.creature.skin);
  const renderer = createMemo(() =>
    props.rendererFor === undefined
      ? (props.renderer ?? placeholderRenderer)
      : props.rendererFor(skinId()),
  );
  const rows = (): Rows => renderer()?.rows ?? referenceRows;
  const unavailable = () => renderer() === undefined;
  const [conditions, setConditions] = createSignal<CompanionConditions>(restingConditions);
  const [hovering, setHovering] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [reacting, setReacting] = createSignal(false);
  const [strip, setStrip] = createSignal<TeamStripHandle>();
  const [airUnderFeet, setAirUnderFeet] = createSignal(0);
  const [wording, setWording] = createSignal<string>();
  let stage: HTMLDivElement | undefined;
  let creature: HTMLButtonElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let mask: HitMask | undefined;
  let lastFrame: RenderedFrame | undefined;
  let maskStale = false;
  let leastAir = Number.POSITIVE_INFINITY;
  let interactive = false;
  let painted = false;
  let shown: Look | undefined;
  let lastReport = host.now();
  let lastGreet = Number.NEGATIVE_INFINITY;
  let mirror: Mirror = createMirror(host.now(), seedOf(undefined));
  let mirroredRenderer: Renderer | undefined;
  let mirroredResident: string | undefined;
  let drag: DragState = idleDrag;
  let holdTimer: unknown;
  let pending = { dx: 0, dy: 0 };
  let flushHandle: unknown;

  const reducedMotion = () =>
    conditions().motion === "reduce" ||
    (conditions().motion === "system" && host.systemReducesMotion());
  const still = () => conditions().still || reducedMotion();
  const team = () => snapshot()?.team;
  const steadOut = () => snapshot()?.steadOut === true;
  const desire = (): Tier => {
    if (dragging() || hovering() || strip()?.lively() === true) return "interact";
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
    const name = current === undefined ? "companion" : accessibleName(current);
    return unavailable() ? `${name}, appearance unavailable` : name;
  };

  const react = (beat: typeof greetBeat): void => {
    if (still()) return;
    mirror = playInput(mirror, beat, prefs(), rows());
    setReacting(true);
    scheduler.poke();
  };

  const draw = (now: number): number | undefined => {
    const current = snapshot();
    const seed = seedOf(current?.creature);
    const selected = renderer();
    const resident = current?.creature.slug ?? current?.creature.name;
    if (selected !== mirroredRenderer || resident !== mirroredResident) {
      mirror = createMirror(now, seed);
      mirroredRenderer = selected;
      mirroredResident = resident;
      shown = undefined;
      leastAir = Number.POSITIVE_INFINITY;
    }
    mirror = followSnapshot(mirror, current, now, prefs(), rows());
    const pose = shownPose(mirror.body, rows(), prefs());
    const look: Look = {
      pose,
      renderer: selected,
      tokens: tokens(),
      deviceScale: deviceScaleFor(conditions().scale, host.devicePixelRatio()),
      hueStop: current?.creature.hueStop,
      forcedColors: conditions().forcedColors,
      wantsMask: conditions().wantsMask,
    };
    if (shown === undefined || !sameLook(shown, look)) {
      shown = look;
      const frame =
        selected === undefined
          ? unavailableFrame
          : selected({ clip: pose.clip, frame: pose.frame, facing: pose.facing }, look.tokens, {
              deviceScale: look.deviceScale,
              hueStop: look.hueStop,
              forcedColors: look.forcedColors,
            });
      paintFrame(canvas, frame, host.devicePixelRatio());
      lastFrame = frame;
      standOn(frame);
      refreshMask(frame);
      if (selected === undefined) setInteractive(false);
    } else if (maskStale && lastFrame !== undefined) refreshMask(lastFrame);
    maskStale = false;
    const teamWakeAt = team() === undefined ? undefined : strip()?.paint(now);
    if (!painted) {
      painted = true;
      props.port.ready();
    }
    report(now);
    if (reacting() && mirror.body.clip.lane !== "input") setReacting(false);
    return together(selected === undefined ? undefined : pose.nextWakeAt, teamWakeAt, now);
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

  const standOn = (frame: RenderedFrame): void => {
    const air = rowsUnderTheFeet(frame);
    if (air === undefined || air >= leastAir) return;
    leastAir = air;
    setAirUnderFeet(air / host.devicePixelRatio());
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

  const asked = (): string | undefined => bubble()?.callId;
  const wordingHere = (): boolean => wording() !== undefined && wording() === asked();
  const answer = (pick: AskPick, by: AnswerBy): void => {
    const callId = asked();
    if (callId === undefined || !admitsAnswer(by)) return;
    if (pick === "deny") askWhy(callId);
    else props.port.answer({ callId, pick });
  };
  const deny = (callId: string, reason: DenyReason, note?: string): void => {
    stopAskingWhy(callId);
    props.port.answer({ callId, pick: "deny", reason, ...(note !== undefined && { note }) });
  };
  const giveReason = (reason: DenyReason, by: AnswerBy): void => {
    const callId = asked();
    if (callId === undefined || !admitsAnswer(by)) return;
    if (reason === "other") setWording(callId);
    else deny(callId, reason);
  };
  const sendWords = (note: string): void => {
    const callId = wording();
    setWording(undefined);
    if (callId !== undefined) deny(callId, "other", note.trim() === "" ? undefined : note);
  };
  const accept = (chore: ChoreAccept, by: AnswerBy): void => {
    if (!admitsAnswer(by)) return;
    props.port.answer({
      callId: `chore:${chore.creature}/${chore.routineId}`,
      pick: "approve",
      accept: chore,
    });
  };
  const answerByKey = (event: KeyboardEvent): boolean => {
    const held = bubble();
    const pick = held === undefined || wordingHere() ? undefined : askKeyPick(event);
    if (held === undefined || pick === undefined) return false;
    if (held.accept !== undefined && grants(pick)) accept(held.accept, "key");
    else if (held.answers.includes(grants(pick) ? "approve" : pick)) answer(pick, "key");
    else return false;
    return true;
  };

  const askForStead = (): void =>
    props.port.askForStead({ creature: strip()?.under() ?? snapshot()?.creature.slug });

  const teamChanged = (): void => {
    maskStale = true;
    scheduler.poke();
  };

  const restsOnAnotherControl = (held: Element | null): boolean =>
    held !== null &&
    held !== stage &&
    stage?.contains(held) === true &&
    held.closest("[data-team-key]") === null;

  const landKeyboard = (): void => {
    if (restsOnAnotherControl(document.activeElement)) return;
    if (team() !== undefined && strip() !== undefined) strip()?.land();
    else creature?.focus();
  };

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
        mirror = playInput(mirror, walkBeat(effect.facing), prefs(), rows());
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
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (answerByKey(event)) {
      event.preventDefault();
      return;
    }
    const act = event.shiftKey ? movingKeys[event.key] : teamKeys[event.key];
    if (act === undefined || (act === "reveal" && !steadKeyReaches(event.target, stage))) return;
    event.preventDefault();
    if (act === "reveal") askForStead();
    else if (act === "before") strip()?.step(-1);
    else if (act === "after") strip()?.step(1);
    else if (act === "leave") stepBack();
    else if (act === "home") props.port.home();
    else props.port.nudge(act);
  };

  const stepBack = (): void => {
    if (steadOut()) askForStead();
    else props.port.release();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === " " && steadKeyReaches(event.target, stage)) event.preventDefault();
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
  readWhyKeys(
    () => stage,
    () => (wordingHere() ? undefined : asked()),
    (reason) => giveReason(reason, "key"),
  );
  createEffect(
    on(
      [() => asked() !== undefined && askingWhy(asked() ?? ""), wordingHere],
      () => teamChanged(),
      { defer: true },
    ),
  );
  createEffect(() => scheduler.setTier(tier(), conditions().onBattery));
  createEffect(() => scheduler.setStill(still()));
  createEffect(
    on(
      [
        () => snapshot()?.state,
        () => snapshot()?.threadId,
        () => snapshot()?.tool,
        () => snapshot()?.creature.slug ?? snapshot()?.creature.name,
        () => conditions().scale,
        () => conditions().wantsMask,
        renderer,
        tokens,
      ],
      () => scheduler.poke(),
      {
        defer: true,
      },
    ),
  );

  onMount(() => {
    wearRememberedTheme({ storage: host.storage });
    const stops = [
      props.port.onSnapshot(receive),
      props.port.onConditions(setConditions),
      props.port.onSteadKey(askForStead),
      host.onWindowFocus?.(landKeyboard) ?? (() => undefined),
      host.onWindowBlur?.(() => strip()?.rest()) ?? (() => undefined),
    ];
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
      onKeyUp={onKeyUp}
      onContextMenu={onContextMenu}
    >
      <Show when={bubble()} fallback={<span />}>
        {(needs) => (
          <NeedsYouBubble
            bubble={needs()}
            keys={cardKeys}
            wording={wordingHere()}
            onAnswer={answer}
            onReason={giveReason}
            onWords={sendWords}
            onAccept={accept}
            onOverturn={(overturn) =>
              props.port.answer({ callId: `decided:${overturn.recordId}`, pick: "deny", overturn })
            }
            onOpen={open}
          />
        )}
      </Show>
      <div class="kw-companion-floor">
        <Show when={team()}>
          {(standing) => (
            <div
              class="kw-companion-team"
              style={{
                "margin-bottom": `${airUnderFeet() - airUnderTheTeam(conditions().scale, host.devicePixelRatio())}px`,
              }}
            >
              <TeamStrip
                ref={setStrip}
                team={standing()}
                current={snapshot()?.creature.slug}
                scale={conditions().scale}
                still={still()}
                quiet={conditions().quiet}
                forcedColors={conditions().forcedColors}
                host={host}
                onChoose={(slug) => props.port.choose(slug)}
                onWhereItLives={(slug) => props.port.askForStead({ creature: slug })}
                onHatch={() => props.port.hatch()}
                onChanged={teamChanged}
              />
            </div>
          )}
        </Show>
        <button
          ref={creature}
          type="button"
          class="kw-companion-creature"
          data-hit={unavailable() ? "" : undefined}
          aria-label={label()}
          aria-keyshortcuts="Enter Space"
          tabIndex={conditions().keyboardReachable ? 0 : -1}
          onClick={(event) => {
            if (event.detail === 0) open();
          }}
        >
          <canvas ref={canvas} class="kw-companion-canvas" hidden={unavailable()} />
          <Show when={unavailable()}>
            <span class="kw-companion-unavailable" role="status">
              appearance unavailable
            </span>
          </Show>
          <Badge
            activeThreads={snapshot()?.activeThreads ?? 0}
            finishedUnseen={snapshot()?.finishedUnseen ?? 0}
            waiting={snapshot()?.waiting ?? 0}
          />
        </button>
      </div>
      <div class="kw-companion-controls">
        <button
          type="button"
          class="kw-companion-control"
          data-hit
          aria-keyshortcuts="Enter"
          onClick={open}
        >
          talk <kbd>enter</kbd>
        </button>
        <button
          type="button"
          class="kw-companion-control"
          data-hit
          aria-pressed={steadOut()}
          aria-keyshortcuts="Space"
          onClick={askForStead}
        >
          {steadName} <kbd>space</kbd>
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

function grants(pick: AskPick): boolean {
  return pick === "approve" || pick === "once";
}

type KeyAct = "reveal" | "before" | "after" | "leave" | "home" | NudgeStep;

export const teamKeys: Readonly<Record<string, KeyAct>> = {
  " ": "reveal",
  ArrowLeft: "before",
  ArrowRight: "after",
  Escape: "leave",
  Home: "home",
};

export const movingKeys: Readonly<Record<string, KeyAct>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

function steadKeyReaches(target: EventTarget | null, stage: HTMLElement | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return target === stage || target.closest("[data-team-key], .kw-companion-creature") !== null;
}

function airUnderTheTeam(sizePercent: number, devicePixelRatio: number): number {
  return ((teamRows - groundRow) * zoomFor(sizePercent, devicePixelRatio)) / devicePixelRatio;
}

function rowsUnderTheFeet(frame: RenderedFrame): number | undefined {
  for (let row = frame.height - 1; row >= 0; row -= 1) {
    const from = row * frame.width;
    for (let at = from; at < from + frame.width; at += 1) {
      if ((frame.alpha[at] ?? 0) !== 0) return frame.height - 1 - row;
    }
  }
  return undefined;
}

export const teamWaitsMs = 125;

function together(
  creatureWakeAt: number | undefined,
  teamWakeAt: number | undefined,
  now: number,
): number | undefined {
  if (creatureWakeAt === undefined || teamWakeAt === undefined) return creatureWakeAt ?? teamWakeAt;
  const wait = creatureWakeAt - teamWakeAt;
  const teamCanWait = teamWakeAt > now && wait >= 0 && wait <= teamWaitsMs;
  return teamCanWait ? creatureWakeAt : Math.min(creatureWakeAt, teamWakeAt);
}

interface Look {
  readonly pose: ShownPose;
  readonly renderer: Renderer | undefined;
  readonly tokens: ReturnType<typeof tokensFromStyle>;
  readonly deviceScale: number;
  readonly hueStop: number | undefined;
  readonly forcedColors: boolean;
  readonly wantsMask: boolean;
}

const unavailableFrame: RenderedFrame = {
  width: 1,
  height: 1,
  alpha: new Uint8Array(1),
  paint: (context) => context.clearRect(0, 0, 1, 1),
};

function sameLook(a: Look, b: Look): boolean {
  return (
    a.renderer === b.renderer &&
    a.pose.clip === b.pose.clip &&
    a.pose.frame === b.pose.frame &&
    a.pose.facing === b.pose.facing &&
    a.tokens === b.tokens &&
    a.deviceScale === b.deviceScale &&
    a.hueStop === b.hueStop &&
    a.forcedColors === b.forcedColors &&
    a.wantsMask === b.wantsMask
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
