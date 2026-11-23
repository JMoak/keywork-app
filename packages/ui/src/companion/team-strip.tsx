import { tickMs } from "@keywork-app/habitat/block";
import { createEffect, createMemo, createSignal, createUniqueId, For, on, Show } from "solid-js";
import type { TeamMember, TeamSnapshot } from "./port.ts";
import {
  cellsShown,
  eggCell,
  hopLift,
  hopMs,
  nextFrameTick,
  paintStrip,
  type StripScene,
  sceneKey,
  stripPalette,
  stripTexels,
  teamRows,
  ticksPerBeat,
  zoomFor,
} from "./team-figures.ts";
import "./team.css";

export interface TeamStripHost {
  now(): number;
  devicePixelRatio(): number;
  readToken(name: string): string;
}

export interface TeamStripProps {
  team: TeamSnapshot;
  current: string | undefined;
  scale: number;
  still: boolean;
  quiet: boolean;
  forcedColors: boolean;
  host: TeamStripHost;
  onChoose(creature: string): void;
  onWhereItLives(creature: string): void;
  onHatch(): void;
  onChanged(): void;
  ref(strip: TeamStripHandle): void;
}

export interface TeamStripHandle {
  paint(now: number): number | undefined;
  lively(): boolean;
  step(by: number): void;
  land(): void;
  rest(): void;
  holdsKeyboard(): boolean;
  under(): string | undefined;
}

export const eggKey = "+egg";
export const attentionEveryMs = 2400;
export const eggSwayMs = 120;
export const keysHint = "Enter opens the conversation. Space shows where it lives in the stead.";
export const eggWords = "hatch a creature";

export function figureLabel(member: TeamMember, current: boolean): string {
  return `${member.name}, ${member.telling}${current ? ", your companion" : ""}`;
}

export function whereLabel(member: TeamMember): string {
  return `show where ${member.name} lives`;
}

export function TeamStrip(props: TeamStripProps) {
  let root: HTMLFieldSetElement | undefined;
  let row: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let tag: HTMLElement | undefined;
  let painted: string | undefined;
  const hops = new Map<string, number>();
  const askedFor = new Set<string>();
  const hint = createUniqueId();
  let lastAttention = Number.NEGATIVE_INFINITY;

  const [cursor, setCursor] = createSignal<string | undefined>(props.current);
  const [hovered, setHovered] = createSignal<string>();
  const [focused, setFocused] = createSignal<string>();
  const [scrolled, setScrolled] = createSignal(0);
  const [hopping, setHopping] = createSignal(false);

  const members = () => props.team.members;
  const zoom = () => zoomFor(props.scale, props.host.devicePixelRatio());
  const texel = () => zoom() / props.host.devicePixelRatio();
  const pitch = () => props.team.pitch;
  const shown = () => hovered() ?? focused();
  const shownMember = () => members().find((member) => member.slug === shown());
  const keys = createMemo(() => [...members().map((member) => member.slug), eggKey]);
  const reach = () => stripTexels(Math.min(members().length, cellsShown), pitch()) * texel();
  const span = () => stripTexels(members().length, pitch()) * texel();
  const overflows = () => members().length > cellsShown;
  const palette = createMemo(() =>
    stripPalette(
      props.team.kit,
      props.host.readToken("--kw-appearance") === "light",
      props.host.readToken("--kw-background"),
      props.forcedColors,
    ),
  );
  const roving = () => {
    const held = cursor();
    return held !== undefined && keys().includes(held) ? held : (props.current ?? keys()[0]);
  };

  const hop = (key: string | undefined): void => {
    if (key === undefined || key === eggKey || props.still) return;
    hops.set(key, props.host.now());
    askedFor.add(key);
    setHopping(true);
  };

  const landed = (now: number): void => {
    for (const [key, began] of [...hops]) {
      if (now - began < hopMs) continue;
      hops.delete(key);
      askedFor.delete(key);
    }
  };

  const liftOf = (key: string, now: number): number => {
    const began = hops.get(key);
    return began === undefined ? 0 : hopLift(now - began);
  };

  const callForAttention = (now: number): void => {
    const waiting = members().find((member) => member.first)?.slug;
    if (waiting === undefined || props.quiet || waiting === shown()) return;
    if (now - lastAttention < attentionEveryMs) return;
    lastAttention = now;
    hops.set(waiting, now);
  };

  const sceneAt = (now: number): StripScene => ({
    pitch: pitch(),
    zoom: zoom(),
    tick: props.still ? 0 : beatAt(now) * ticksPerBeat,
    quiet: props.quiet,
    standing: members().map((member) => ({
      member,
      current: member.slug === props.current,
      lift: props.still ? 0 : liftOf(member.slug, now),
    })),
    eggSway: props.still || shown() !== eggKey ? 0 : swayAt(now),
  });

  const paint = (now: number): number | undefined => {
    landed(now);
    if (!props.still) callForAttention(now);
    const scene = sceneAt(now);
    const colours = palette();
    const key = sceneKey(scene, colours);
    if (key !== painted) {
      painted = key;
      draw(scene);
    }
    setHopping(askedFor.size > 0);
    if (props.still) return undefined;
    if (hops.size > 0) return now;
    if (shown() === eggKey) return (Math.floor(now / eggSwayMs) + 1) * eggSwayMs;
    const frame = nextFrameTick(scene.standing, scene.tick);
    const waiting = members().some((member) => member.first) && !props.quiet;
    return earliest(
      frame === undefined ? undefined : frame * tickMs,
      waiting ? lastAttention + attentionEveryMs : undefined,
    );
  };

  const draw = (scene: StripScene): void => {
    if (canvas === undefined) return;
    const width = stripTexels(scene.standing.length, scene.pitch) * scene.zoom;
    const height = teamRows * scene.zoom;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = contextOf(canvas);
    if (context !== null) paintStrip(context, scene, palette());
  };

  const buttonOf = (key: string): HTMLElement | undefined =>
    [...(row?.querySelectorAll<HTMLElement>("[data-team-key]") ?? [])].find(
      (button) => button.dataset.teamKey === key,
    );

  const land = (): void => {
    const key = roving();
    if (key === undefined) return;
    setCursor(key);
    setFocused(key);
    buttonOf(key)?.focus();
  };

  const step = (by: number): void => {
    const all = keys();
    const at = all.indexOf(roving() ?? eggKey);
    const next = all[Math.min(all.length - 1, Math.max(0, at + by))];
    if (next === undefined) return;
    setCursor(next);
    buttonOf(next)?.focus();
  };

  const holdsKeyboard = (): boolean => focused() !== undefined;

  props.ref({
    paint,
    lively: hopping,
    step,
    land,
    rest: () => setFocused(undefined),
    holdsKeyboard,
    under: () => {
      const key = focused();
      return key === eggKey ? undefined : key;
    },
  });

  createEffect(
    on(
      () => props.current,
      (current, before) => {
        if (current !== before && !holdsKeyboard()) setCursor(current);
      },
      { defer: true },
    ),
  );
  createEffect(on(shown, (key) => hop(key), { defer: true }));
  createEffect(
    on(
      [
        members,
        () => props.current,
        () => props.scale,
        () => props.still,
        () => props.quiet,
        palette,
        shown,
      ],
      () => props.onChanged(),
      { defer: true },
    ),
  );
  createEffect(() => {
    const key = shown();
    scrolled();
    if (tag === undefined || key === undefined || root === undefined) return;
    const at = keys().indexOf(key);
    const cell = key === eggKey ? eggCell : pitch();
    const centre = (at * pitch() + cell / 2) * texel() - scrolled();
    const room = root.clientWidth;
    const wide = tag.offsetWidth;
    const left = Math.max(0, Math.min(room - wide, centre - wide / 2));
    tag.style.left = `${Math.round(left)}px`;
  });

  const scrollByWheel = (event: WheelEvent): void => {
    if (row === undefined || !overflows()) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY === 0 ? event.deltaX : event.deltaY;
  };

  return (
    <fieldset
      ref={root}
      class="kw-team"
      aria-label={teamLabel(members())}
      data-still={props.still ? "" : undefined}
      onPointerLeave={() => setHovered(undefined)}
      onFocusOut={(event) => {
        if (!(event.relatedTarget instanceof Node) || root?.contains(event.relatedTarget) !== true)
          setFocused(undefined);
      }}
    >
      <span id={hint} class="kw-team-hint">
        {keysHint}
      </span>
      <div class="kw-team-tags">
        <Show when={shownMember()}>
          {(member) => (
            <button
              ref={(shownTag) => {
                tag = shownTag;
              }}
              type="button"
              class="kw-team-tag"
              data-hit
              tabIndex={-1}
              aria-label={whereLabel(member())}
              title={whereLabel(member())}
              onClick={() => props.onWhereItLives(member().slug)}
            >
              <HomeSign />
              <span class="kw-team-name">{member().name}</span>
              <span class="kw-team-telling">{member().telling}</span>
            </button>
          )}
        </Show>
        <Show when={shown() === eggKey}>
          <span
            ref={(shownTag) => {
              tag = shownTag;
            }}
            class="kw-team-tag"
            data-egg
            aria-hidden="true"
          >
            {eggWords}
          </span>
        </Show>
      </div>
      <div
        ref={row}
        class="kw-team-row"
        data-more-before={overflows() && scrolled() > 0 ? "" : undefined}
        data-more-after={overflows() && scrolled() + reach() < span() - 1 ? "" : undefined}
        style={{ width: `${reach()}px`, height: `${teamRows * texel()}px` }}
        onScroll={() => setScrolled(row?.scrollLeft ?? 0)}
        onWheel={scrollByWheel}
      >
        <canvas
          ref={canvas}
          class="kw-team-canvas"
          style={{ width: `${span()}px`, height: `${teamRows * texel()}px` }}
        />
        <For each={members()}>
          {(member, at) => (
            <button
              type="button"
              class="kw-team-figure"
              data-hit
              data-team-key={member.slug}
              data-doing={member.doing}
              data-first={member.first ? "" : undefined}
              data-cursor={focused() === member.slug ? "" : undefined}
              aria-label={figureLabel(member, member.slug === props.current)}
              aria-current={member.slug === props.current ? "true" : undefined}
              aria-describedby={hint}
              aria-keyshortcuts="Enter Space"
              tabIndex={roving() === member.slug ? 0 : -1}
              style={{ left: `${at() * pitch() * texel()}px`, width: `${pitch() * texel()}px` }}
              onClick={() => props.onChoose(member.slug)}
              onPointerEnter={() => setHovered(member.slug)}
              onFocus={() => {
                setCursor(member.slug);
                setFocused(member.slug);
              }}
            />
          )}
        </For>
        <button
          type="button"
          class="kw-team-figure"
          data-hit
          data-team-key={eggKey}
          data-cursor={focused() === eggKey ? "" : undefined}
          aria-label={eggWords}
          tabIndex={roving() === eggKey ? 0 : -1}
          style={{
            left: `${members().length * pitch() * texel()}px`,
            width: `${eggCell * texel()}px`,
          }}
          onClick={() => props.onHatch()}
          onPointerEnter={() => setHovered(eggKey)}
          onFocus={() => {
            setCursor(eggKey);
            setFocused(eggKey);
          }}
        />
      </div>
    </fieldset>
  );
}

function HomeSign() {
  return (
    <svg class="kw-team-home" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">
      <path d="M4 0h1v1h1v1h1v1h1v1h1v1h-1v4h-3v-3h-1v3h-3v-4h-1v-1h1v-1h1v-1h1v-1h1z" />
    </svg>
  );
}

function teamLabel(members: readonly TeamMember[]): string {
  const waiting = members.filter((member) => member.doing === "porch").length;
  const count = `the team, ${members.length} ${members.length === 1 ? "creature" : "creatures"}`;
  return waiting === 0 ? count : `${count}, ${waiting} waiting on you`;
}

function beatAt(now: number): number {
  return Math.floor(now / (tickMs * ticksPerBeat));
}

function swayAt(now: number): number {
  return [0, 1, 0, -1][Math.floor(now / eggSwayMs) % 4] ?? 0;
}

function earliest(...wakes: readonly (number | undefined)[]): number | undefined {
  const known = wakes.filter((wake): wake is number => wake !== undefined);
  return known.length === 0 ? undefined : Math.min(...known);
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}
