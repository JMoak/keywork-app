import type { Facing, PoseName, Skin } from "@keywork-app/habitat";
import {
  createRenderer,
  type Palette,
  paletteKey,
  type RenderedFrame,
  resolvePalette,
} from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import {
  devicePixelRatioOf,
  forcedColorsActive,
  forcedColorsQuery,
  paletteSourceOf,
  reducedMotionActive,
  reducedMotionQuery,
  surfaceOf,
  watchMedia,
  watchTheme,
} from "../panes/stead/painter.ts";

export interface CreaturePortraitProps {
  readonly skin: string;
  readonly hueStop: number;
  readonly name?: string | undefined;
  readonly clip?: PoseName | undefined;
  readonly facing?: Facing | undefined;
  readonly playing?: boolean | undefined;
  readonly size?: number | undefined;
  readonly class?: string | undefined;
  readonly unavailable?: string | undefined;
}

export function CreaturePortrait(props: CreaturePortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  let palette: Palette | undefined;
  let shown:
    | {
        canvas: HTMLCanvasElement;
        frame: RenderedFrame;
        palette: Palette;
        width: number;
        height: number;
      }
    | undefined;
  const loaded = createMemo(() => loadSkin(props.skin));
  const renderer = createMemo(() => {
    const held = loaded();
    return held.ok ? createRenderer(held.skin) : undefined;
  });
  const clip = () => props.clip ?? "idle";
  const [frame, setFrame] = createSignal(0);
  const [reduced, setReduced] = createSignal(reducedMotionActive());
  const [visible, setVisible] = createSignal(document.visibilityState !== "hidden");
  const [onScreen, setOnScreen] = createSignal(true);
  const still = () => reduced() || props.playing === false || !visible() || !onScreen();

  const paint = (): void => {
    const held = loaded();
    const render = renderer();
    if (!held.ok || render === undefined || canvas === undefined) return;
    const fit = portraitFit(held.skin.cell, props.size ?? 1, devicePixelRatioOf());
    palette ??= readPalette(canvas, held.skin);
    const current = render(
      { clip: clip(), frame: reduced() ? 0 : frame(), facing: props.facing ?? "right" },
      palette,
      { scale: fit.scale },
    );
    if (
      shown?.canvas === canvas &&
      shown.frame.indexed === current.indexed &&
      shown.frame.width === current.width &&
      shown.frame.height === current.height &&
      shown.palette === palette &&
      shown.width === fit.cssWidth &&
      shown.height === fit.cssHeight
    )
      return;
    if (canvas.width !== fit.width) canvas.width = fit.width;
    if (canvas.height !== fit.height) canvas.height = fit.height;
    canvas.style.width = `${fit.cssWidth}px`;
    canvas.style.height = `${fit.cssHeight}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, fit.width, fit.height);
    current.paint(surfaceOf(context));
    shown = { canvas, frame: current, palette, width: fit.cssWidth, height: fit.cssHeight };
  };

  const readPalette = (element: Element, skin: Skin): Palette =>
    resolvePalette(paletteSourceOf(element), {
      hueStop: props.hueStop,
      material: skin.material,
      forcedColors: forcedColorsActive(),
    });
  const refreshAppearance = (): void => {
    const held = loaded();
    if (!held.ok || canvas === undefined) return;
    const next = readPalette(canvas, held.skin);
    if (palette !== undefined && paletteKey(next) === paletteKey(palette)) return;
    palette = next;
    paint();
  };

  createEffect(on([loaded, clip, reduced], () => setFrame(0)));
  createEffect(on([loaded, () => props.hueStop], refreshAppearance));
  createEffect(on([renderer, clip, frame, reduced, () => props.facing, () => props.size], paint));
  createEffect(
    on([loaded, clip, frame, still], () => {
      const held = loaded();
      if (!held.ok || still()) return;
      const row = held.skin.rows[clip()];
      const shown = frame() % row.frames;
      if (!row.loop && shown === row.frames - 1) return;
      const timer = setTimeout(() => setFrame((shown + 1) % row.frames), row.ms[shown]);
      onCleanup(() => clearTimeout(timer));
    }),
  );

  createEffect(() => {
    if (!loaded().ok || canvas === undefined) return;
    const stopTheme = watchTheme(
      refreshAppearance,
      canvas.parentElement ?? document.documentElement,
    );
    const stopVisibility = watchIntersection(canvas, setOnScreen);
    onCleanup(() => {
      stopTheme();
      stopVisibility();
    });
  });

  onMount(() => {
    const visibility = (): void => {
      setVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", visibility);
    const stops = [
      watchMedia(forcedColorsQuery, refreshAppearance),
      watchMedia(reducedMotionQuery, () => setReduced(reducedMotionActive())),
      watchPixelRatio(paint),
    ];
    refreshAppearance();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visibility);
      for (const stop of stops) stop();
    });
  });

  return (
    <Show
      when={loaded().ok}
      fallback={
        <p class="kw-onboard-portrait-refused">{props.unavailable ?? "Artwork unavailable"}</p>
      }
    >
      <canvas
        ref={(element) => {
          canvas = element;
          paint();
        }}
        class={props.class ?? "kw-creature-portrait"}
        role="img"
        aria-label={`${props.name ?? props.skin}, ${clip()}`}
        data-skin={props.skin}
        data-clip={clip()}
        data-facing={props.facing ?? "right"}
        data-frame={reduced() ? 0 : frame()}
        data-still={still() ? "" : undefined}
      />
    </Show>
  );
}

export function portraitFit(cell: Skin["cell"], size: number, dpr: number) {
  const amount = Number.isFinite(size) && size > 0 ? Math.min(size, 4) : 1;
  const density = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const ratio = Math.min(48 / cell.width, 52 / cell.height) * 2 * amount;
  const limit = Math.max(1, Math.floor(1024 / Math.max(cell.width, cell.height)));
  const scale = Math.max(1, Math.min(8, limit, Math.round(ratio * density)));
  return {
    scale,
    width: cell.width * scale,
    height: cell.height * scale,
    cssWidth: cell.width * ratio,
    cssHeight: cell.height * ratio,
  };
}

function watchPixelRatio(paint: () => void): () => void {
  let stop: () => void = () => undefined;
  let ratio: number | undefined;
  const changed = (): void => {
    const next = devicePixelRatioOf();
    if (ratio === next) return;
    ratio = next;
    stop();
    stop = watchMedia(`(resolution: ${ratio}dppx)`, changed);
    paint();
  };
  changed();
  window.addEventListener("resize", changed);
  return () => {
    stop();
    window.removeEventListener("resize", changed);
  };
}

function watchIntersection(element: Element, setVisible: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver !== "function") return () => undefined;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.target === element) setVisible(entry.isIntersecting);
  });
  observer.observe(element);
  return () => observer.disconnect();
}
