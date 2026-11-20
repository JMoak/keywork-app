import type { Facing } from "@keywork-app/habitat";
import {
  type Illustration,
  illustrationFrame,
  placeIllustration,
} from "@keywork-app/habitat/render";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import {
  devicePixelRatioOf,
  forcedColorsActive,
  forcedColorsQuery,
  watchMedia,
  watchSize,
} from "../panes/stead/painter.ts";
import { artworkFor } from "./artwork.ts";
import {
  type DecodedIllustration,
  illustrationLibrary,
  paintIllustration,
} from "./illustrations.ts";
import { CreaturePortrait } from "./portrait.tsx";

export interface IllustratedPortraitProps {
  readonly skin: string;
  readonly name: string;
  readonly hueStop: number;
  readonly size?: number | undefined;
  readonly class?: string | undefined;
  readonly facing?: Facing | undefined;
}

export function IllustratedPortrait(props: IllustratedPortraitProps) {
  const [forced, setForced] = createSignal(forcedColorsActive());
  const requested = createMemo(() => (forced() ? undefined : artworkFor(props.skin)));
  const [result, setResult] = createSignal<Loaded>();
  const current = () => (result()?.art === requested() ? result() : undefined);
  createEffect(
    on(requested, (art) => {
      setResult(undefined);
      if (!art) return;
      let active = true;
      onCleanup(() => {
        active = false;
      });
      illustrationLibrary.load(art).then(
        (asset) => {
          if (active) setResult({ art, asset });
        },
        () => {
          if (active) setResult({ art });
        },
      );
    }),
  );
  onMount(() => {
    const stop = watchMedia(forcedColorsQuery, () => setForced(forcedColorsActive()));
    onCleanup(stop);
  });
  return (
    <Show when={requested()} keyed fallback={<CreaturePortrait {...props} playing={false} />}>
      {(art) => (
        <Show
          when={current()}
          keyed
          fallback={
            <span
              role="img"
              aria-busy="true"
              aria-label={`${props.name}, loading portrait`}
              class={props.class}
              data-skin={props.skin}
              style={portraitStyle(art, props.size)}
            />
          }
        >
          {(loaded) => (
            <Show
              when={loaded.asset}
              keyed
              fallback={<CreaturePortrait {...props} playing={false} />}
            >
              {(asset) => (
                <IllustrationCanvas
                  {...props}
                  art={art}
                  asset={asset}
                  failed={() => setResult({ art })}
                />
              )}
            </Show>
          )}
        </Show>
      )}
    </Show>
  );
}

interface Loaded {
  readonly art: Illustration;
  readonly asset?: DecodedIllustration;
}

interface CanvasProps extends IllustratedPortraitProps {
  readonly art: Illustration;
  readonly asset: DecodedIllustration;
  failed(): void;
}

function IllustrationCanvas(props: CanvasProps) {
  let canvas: HTMLCanvasElement | undefined;
  let shown: { width: number; height: number; facing: Facing } | undefined;
  const paint = (): void => {
    if (!canvas) return;
    const { footprint } = props.art;
    const bounds = canvas.getBoundingClientRect();
    const cssWidth = bounds.width || footprint.width * portraitScale(props.size);
    const cssHeight = bounds.height || (cssWidth * footprint.height) / footprint.width;
    const density = Math.min(devicePixelRatioOf(), 1024 / Math.max(cssWidth, cssHeight));
    const width = Math.max(1, Math.round(cssWidth * density));
    const height = Math.max(1, Math.round(cssHeight * density));
    const facing = props.facing ?? props.art.facing;
    if (shown?.width === width && shown.height === height && shown.facing === facing) return;
    try {
      const context = canvas.getContext("2d");
      const crop = illustrationFrame(props.art);
      if (!context || !crop) {
        props.failed();
        return;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      paintIllustration(
        context,
        props.asset,
        placeIllustration(props.art, crop, { width, height }, facing),
      );
      canvas.dataset.artwork = "illustrated";
      shown = { width, height, facing };
    } catch {
      props.failed();
    }
  };
  createEffect(paint);
  onMount(() => {
    if (!canvas) return;
    const stopSize = watchSize(canvas, paint);
    let stopDensity = () => {};
    const moved = () => {
      stopDensity();
      stopDensity = watchMedia(`(resolution: ${devicePixelRatioOf()}dppx)`, moved);
      paint();
    };
    moved();
    window.addEventListener("resize", paint);
    onCleanup(() => {
      stopSize();
      stopDensity();
      window.removeEventListener("resize", paint);
    });
  });
  return (
    <canvas
      ref={canvas}
      class={props.class ?? "kw-creature-portrait"}
      role="img"
      aria-label={`${props.name}, still portrait`}
      data-skin={props.skin}
      data-still=""
      style={portraitStyle(props.art, props.size)}
    />
  );
}

function portraitStyle(art: Illustration, size: number | undefined) {
  return {
    display: "block",
    width: `var(--kw-illustration-width, ${art.footprint.width * portraitScale(size)}px)`,
    height: "var(--kw-illustration-height, auto)",
    "max-width": "100%",
    "aspect-ratio": `${art.footprint.width} / ${art.footprint.height}`,
    "image-rendering": "auto",
  } as const;
}

function portraitScale(size: number | undefined): number {
  return 2 * (size !== undefined && Number.isFinite(size) && size > 0 ? Math.min(size, 4) : 1);
}
