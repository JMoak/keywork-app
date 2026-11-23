import {
  backdropOf,
  blockScene,
  drawList,
  firefliesOf,
  identityCount,
  kits,
  lanternKit,
  neonKit,
  type Picture,
  raisedEye,
  residentsOf,
  resolveBlockPalette,
  restCamera,
  systemColourNames,
  viewOf,
} from "@keywork-app/habitat/block";
import { noon, pageGround, sketchTown } from "@keywork-app/habitat/block/testing";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rampStops } from "../../../chrome/pane-frame.tsx";
import { coatOf } from "../herd.ts";
import { artPointOf, BlockWorld, type BlockWorldControls, deviceSizeOf } from "./block-world.tsx";
import { paintPicture, textureCache } from "./paint.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a creature's colour in the world", () => {
  it("is the same colour the console's chrome gives the creature, seeded or not", () => {
    const town = sketchTown(12);
    const mixed = {
      ...town,
      creatures: Object.fromEntries(
        Object.entries(town.creatures).map(([slug, creature], index) => [
          slug,
          { ...creature, seed: index % 3 === 0 ? undefined : 7919 * index + 3 },
        ]),
      ),
    };
    const ranks = Object.keys(mixed.creatures).sort();
    for (const kit of kits) {
      expect(identityCount(kit)).toBe(rampStops);
      for (const resident of residentsOf(mixed, kit)) {
        const chrome = coatOf(mixed.creatures[resident.slug], ranks.indexOf(resident.slug));
        expect(resident.identity + 1, resident.slug).toBe(chrome);
      }
    }
  });
});

describe("forced colours", () => {
  it("paints the world in system colours alone, outlining each face, when the system forces colours", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("forced-colors") || query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const painted = styledCanvas();
    render(() => <BlockWorld world={sketchTown(5)} focused={false} hidden={false} kit={neonKit} />);
    await vi.advanceTimersByTimeAsync(50);
    expect(painted.styles().size).toBeGreaterThan(0);
    expect([...painted.styles()].every((style) => systemNames.has(style))).toBe(true);
    expect(painted.styles()).toContain("CanvasText");
    vi.unstubAllGlobals();
  });
});

describe("fitting, ticks and motion", () => {
  it("measures the canvas in whole device pixels and maps the pointer to art pixels", () => {
    expect(deviceSizeOf(640.4, 480, 1.25)).toEqual({ width: 801, height: 600, dpr: 1.25 });
    const world = blockScene(sketchTown(5), { kit: neonKit, appearance: "night", now: noon }).world;
    const list = drawList(world, restCamera(0, raisedEye), viewOf(world, 1008, 580, raisedEye));
    const size = deviceSizeOf(1008, 580, 1);
    expect(artPointOf(list, size, 30, 60)).toEqual({
      x: 30 / list.view.scale,
      y: 60 / list.view.scale,
    });
  });
});

describe("painting a picture", () => {
  it("paints the sky, every quad on whole pixels with smoothing off, and the drifting lights, from a cache kept per theme", () => {
    const world = blockScene(sketchTown(5), { kit: neonKit, appearance: "night", now: noon }).world;
    const view = viewOf(world, 1008, 580, raisedEye);
    const list = drawList(world, restCamera(1, raisedEye), view, 0, neonKit.colours.night.haze);
    const picture: Picture = {
      list,
      backdrop: backdropOf(neonKit.colours.night, view),
      lights: firefliesOf(neonKit.colours.night, view, list.pivot.y, 0),
    };
    const context = recordingContext();
    let kit = neonKit;
    const palette = () => resolveBlockPalette(kit, "night", pageGround.night);
    const made: number[] = [];
    const cache = textureCache(palette, (width, height) => {
      made.push(width * height);
      return fakeCanvas(width, height);
    });
    paintPicture(context.context, picture, palette(), cache);
    expect(context.smoothing()).toBe(false);
    expect(context.transforms.length).toBeGreaterThanOrEqual(list.quads.length);
    expect(context.transforms.every((matrix) => matrix.every(Number.isInteger))).toBe(true);
    expect(context.fills()).toBeGreaterThan(picture.backdrop.length);
    expect(context.alphas()).toContain(picture.lights[0]?.alpha);
    const first = made.length;
    paintPicture(context.context, picture, palette(), cache);
    expect(made.length).toBe(first);
    kit = lanternKit;
    paintPicture(context.context, picture, palette(), cache);
    expect(made.length).toBe(first * 2);
  });
});

describe("the block world on the stead", () => {
  it("turns a quarter at a time on the pane's keys, rests on corners, and changes kit", () => {
    stubCanvas();
    let controls: BlockWorldControls | undefined;
    const [corners, setCorners] = createSignal(false);
    const [kit, setKit] = createSignal(neonKit);
    const { container } = render(() => (
      <BlockWorld
        world={sketchTown(2)}
        focused={true}
        hidden={false}
        kit={kit()}
        corners={corners()}
        onControls={(given) => {
          controls = given;
        }}
      />
    ));
    const stage = container.querySelector<HTMLElement>(".kw-stead-block");
    if (stage === null || controls === undefined) throw new Error("no block world");
    expect(stage.dataset.side).toBe("front");
    expect(stage.dataset.kit).toBe("neon");
    controls.turn(1);
    expect(stage.dataset.side).toBe("right");
    setCorners(true);
    expect(stage.dataset.side).toBe("corner");
    setKit(lanternKit);
    expect(stage.dataset.kit).toBe("lantern");
  });

  it("paints once and then sleeps under reduced motion, however lively the town", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const context = stubCanvas();
    render(() => <BlockWorld world={sketchTown(9)} focused={false} hidden={false} kit={neonKit} />);
    await vi.advanceTimersByTimeAsync(50);
    const painted = context.clears();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(painted).toBeGreaterThan(0);
    expect(context.clears()).toBe(painted);
    vi.unstubAllGlobals();
  });
});

const systemNames = new Set(Object.values(systemColourNames));

function styledCanvas(): { styles(): ReadonlySet<string> } {
  const styles = new Set<string>();
  const context = {
    canvas: { width: 640, height: 400 },
    fillStyle: "" as unknown,
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    setTransform: () => undefined,
    fillRect() {
      if (typeof this.fillStyle === "string") styles.add(this.fillStyle);
    },
    clearRect: () => undefined,
    drawImage: () => undefined,
    createPattern: () => ({}),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as RenderingContext,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  return { styles: () => styles };
}

function stubCanvas(): { clears(): number } {
  const recorded = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    recorded.context as unknown as RenderingContext,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  return { clears: () => recorded.fills() };
}

function recordingContext() {
  const transforms: number[][] = [];
  const alphas: number[] = [];
  let smoothing = true;
  let fills = 0;
  let alpha = 1;
  const context = {
    canvas: { width: 640, height: 400 },
    fillStyle: "",
    set imageSmoothingEnabled(value: boolean) {
      smoothing = value;
    },
    get imageSmoothingEnabled() {
      return smoothing;
    },
    set globalAlpha(value: number) {
      alpha = value;
      alphas.push(value);
    },
    get globalAlpha() {
      return alpha;
    },
    setTransform: (...matrix: number[]) => transforms.push(matrix),
    fillRect: () => {
      fills += 1;
    },
    clearRect: () => undefined,
    drawImage: () => undefined,
    createPattern: () => ({}),
  };
  return {
    context: context as unknown as CanvasRenderingContext2D,
    transforms,
    smoothing: () => smoothing,
    fills: () => fills,
    alphas: () => alphas,
  };
}

function fakeCanvas(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: () => ({ fillStyle: "", fillRect: () => undefined }),
  } as unknown as HTMLCanvasElement;
}
