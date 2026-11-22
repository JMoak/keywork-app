import {
  backdropOf,
  blockScene,
  cornerTurn,
  drawList,
  firefliesOf,
  identityCount,
  identityIndex,
  kits,
  lanternKit,
  neonKit,
  type Picture,
  quarterTurn,
  raisedEye,
  residentsOf,
  resolveBlockPalette,
  restCamera,
  systemColourNames,
  viewOf,
} from "@keywork-app/habitat/block";
import { noon, pageGround, sketchTown } from "@keywork-app/habitat/block/testing";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rampStops } from "../../../chrome/pane-frame.tsx";
import { coatOf } from "../herd.ts";
import {
  artPointOf,
  BlockWorld,
  type BlockWorldControls,
  deviceSizeOf,
  samePicture,
  tickAt,
} from "./block-world.tsx";
import {
  cameraAt,
  cornered,
  easeInOut,
  eyeFor,
  lifted,
  moving,
  stillMotion,
  turned,
  turnMs,
} from "./motion.ts";
import { paintPicture, textureCache } from "./paint.ts";
import { blockWorldShown, blockWorldSwitch, blockWorldVariable } from "./switch.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the block world switch", () => {
  it("is off unless the one variable says on, and off in this build", () => {
    expect(blockWorldShown).toBe(false);
    expect(blockWorldSwitch({})).toBe(false);
    expect(blockWorldSwitch({ [blockWorldVariable]: "0" })).toBe(false);
    expect(blockWorldSwitch({ [blockWorldVariable]: "1" })).toBe(true);
    expect(blockWorldSwitch({ [blockWorldVariable]: " On " })).toBe(true);
  });

  it("loads with the variable set, which is the only way the app ever turns it on", async () => {
    vi.stubEnv(blockWorldVariable, "1");
    vi.resetModules();
    try {
      const loaded = await import("./switch.ts");
      expect(loaded.blockWorldShown).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("a creature's colour in the world", () => {
  it("is one of eight, chosen by the creature's seed, or its rank when it has none", () => {
    expect(identityCount(neonKit)).toBe(8);
    for (let seed = 0; seed < 40; seed += 1) expect(identityIndex(seed, 8)).toBe(seed % 8);
    const town = sketchTown(10);
    const unseeded = {
      ...town,
      creatures: Object.fromEntries(
        Object.entries(town.creatures).map(([slug, creature]) => [
          slug,
          { ...creature, seed: undefined },
        ]),
      ),
    };
    const ranks = Object.keys(unseeded.creatures).sort();
    for (const resident of residentsOf(unseeded, neonKit)) {
      expect(resident.identity).toBe(ranks.indexOf(resident.slug) % 8);
    }
  });

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
    render(() => <BlockWorld world={sketchTown(5)} focused={false} hidden={false} />);
    await vi.advanceTimersByTimeAsync(50);
    expect(painted.styles().size).toBeGreaterThan(0);
    expect([...painted.styles()].every((style) => systemNames.has(style))).toBe(true);
    expect(painted.styles()).toContain("CanvasText");
    vi.unstubAllGlobals();
  });

  it("paints theme colours, never system ones, when nothing forces them", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const painted = styledCanvas();
    render(() => <BlockWorld world={sketchTown(5)} focused={false} hidden={false} />);
    await vi.advanceTimersByTimeAsync(50);
    expect(painted.styles().size).toBeGreaterThan(0);
    expect([...painted.styles()].some((style) => systemNames.has(style))).toBe(false);
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

  it("counts time in the sketch's ticks, and stands still under reduced motion", () => {
    expect(tickAt(1250, false)).toBe(10);
    expect(tickAt(1250, true)).toBe(0);
  });

  it("turns a quarter in 620 ms, eased at both ends, ignoring a second turn mid-way", () => {
    const start = stillMotion(0, raisedEye);
    const turning = turned(start, 1, 1000, false);
    expect(turned(turning, 1, 1100, false)).toBe(turning);
    expect(cameraAt(turning, 1000 + turnMs / 2).angle).toBeCloseTo(quarterTurn / 2);
    expect(cameraAt(turning, 1000 + turnMs * 0.1).angle).toBeLessThan(quarterTurn * 0.1);
    expect(moving(turning, 1000 + turnMs)).toBe(false);
    expect(cameraAt(turning, 1000 + turnMs).angle).toBe(quarterTurn);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });

  it("rests on a corner and back, jumps under reduced motion, and raises the eye once a street forms", () => {
    const corner = cornered(stillMotion(1, raisedEye), true, 0, true);
    expect(cameraAt(corner, 0).angle).toBeCloseTo(quarterTurn + cornerTurn);
    expect(cameraAt(cornered(corner, false, 0, true), 0).angle).toBeCloseTo(quarterTurn);
    expect(moving(turned(stillMotion(0, raisedEye), -1, 0, true), 0)).toBe(false);
    expect(eyeFor(2)).toBe(0);
    expect(eyeFor(3)).toBe(raisedEye);
    const rising = lifted(stillMotion(0, 0), raisedEye, 0, false);
    expect(cameraAt(rising, 100).eye).toBeGreaterThan(0);
    expect(cameraAt(rising, 100).eye).toBeLessThan(raisedEye);
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

  it("knows an unchanged picture when it sees one", () => {
    const world = blockScene(sketchTown(2), { kit: neonKit, appearance: "day", now: noon }).world;
    const view = viewOf(world, 640, 400, raisedEye);
    const pictureAt = (quarter: number): Picture => ({
      list: drawList(world, restCamera(quarter, raisedEye), view),
      backdrop: [],
      lights: [],
    });
    expect(samePicture(pictureAt(0), pictureAt(0))).toBe(true);
    expect(samePicture(pictureAt(0), pictureAt(1))).toBe(false);
  });
});

describe("the block world on the stead", () => {
  it("turns a quarter at a time on the pane's keys, rests on corners, and changes kit", () => {
    stubCanvas();
    let controls: BlockWorldControls | undefined;
    const { container, getByText } = render(() => (
      <BlockWorld
        world={sketchTown(2)}
        focused={true}
        hidden={false}
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
    fireEvent.click(getByText("Rest on corners"));
    expect(stage.dataset.side).toBe("corner");
    fireEvent.click(getByText("Lantern"));
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
    render(() => <BlockWorld world={sketchTown(9)} focused={false} hidden={false} />);
    await vi.advanceTimersByTimeAsync(50);
    const painted = context.clears();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(painted).toBeGreaterThan(0);
    expect(context.clears()).toBe(painted);
    vi.unstubAllGlobals();
  });

  it("draws nothing while hidden", async () => {
    vi.useFakeTimers();
    const context = stubCanvas();
    render(() => <BlockWorld world={sketchTown(2)} focused={false} hidden={true} />);
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.clears()).toBe(0);
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
