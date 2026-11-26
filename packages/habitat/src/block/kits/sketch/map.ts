import type { Construction, Glow } from "../../kit.ts";
import type { HallSpec, LaneAxis, LaneSpec, MapKit, SignpostSpec } from "../../map/kit.ts";
import type { Part, RampKey, Side } from "../../model.ts";
import { mixedRole, type Role } from "../../texture.ts";
import { steppedCap } from "./deco.ts";
import { groundsOf } from "./ground.ts";
import { roadLamp, steppedLamp } from "./props.ts";
import { roofParts, stepHeight } from "./roofs.ts";
import {
  box,
  filled,
  type Paint,
  painted,
  placed,
  type SidePaint,
  sameSides,
  topPainted,
} from "./shapes.ts";
import { font } from "./sign.ts";
import type { SketchStyle } from "./style.ts";
import { faces, type Wall, wallKey, wallPaint } from "./walls.ts";

export const hallFootprint = { x0: -16, x1: 16, z0: -10, z1: 10 } as const;
export const hallHeight = 22;
export const longestPostName = 10;
export const plankWidth = 12;
export const stoneSize = 8;
export const stonePitch = 14;

export function mapPartsOf(style: SketchStyle): MapKit {
  const ground = groundsOf(style);
  return {
    land: ground,
    hall: (spec) => hall(style, spec),
    signpost: (spec) => signpost(style, spec),
    lane: (spec) => (spec.kind === "plank" ? planks(style, spec) : stones(style, spec)),
  };
}

export function postName(name: string): string {
  return [...name.toUpperCase()]
    .map((letter) => (letter === "_" || letter === "." || letter === " " ? "-" : letter))
    .filter((letter) => Object.hasOwn(font, letter))
    .join("")
    .slice(0, longestPostName);
}

const slate: RampKey = "slate";

function hall(style: SketchStyle, spec: HallSpec): Construction {
  const { x0, x1, z0, z1 } = hallFootprint;
  const wallFor = (side: Side): Wall => ({
    face: side === "pz" || side === "nz" ? faces.houseFront : faces.houseSide,
    runRibbon: 0,
    base: style.frames && !style.stone ? "wood" : "plaster",
    plank: style.frames && !style.stone ? "woodDk" : undefined,
    frame: style.piers ? "trimLo" : "timberDk",
    foot: "timberDk",
    sill: style.piers ? "trim" : "timberDk",
    frames: style.frames,
    ribbon: style.ribbon,
    piers: style.piers,
    storeys: 1,
    storeyHeight: hallHeight,
    lit: spec.lit,
    lightColour: "lamp",
    lightHigh: "lampHi",
    seed: 31,
    crates: 0,
    chores: 0,
    lanterns: 0,
    ivy: 0,
    door: {
      fill: "hue.b",
      light: "hue.l",
      shadow: "hue.d",
      fan: mixedRole("slate", "paper", 0.3),
      fanLit: mixedRole("slate", "paper", 0.62),
    },
    tower: 0,
    notes: 0,
    boarded: false,
    garland: false,
    banner: 0,
  });
  const walls: SidePaint = (side, width, height) => {
    const wall = wallFor(side);
    return painted(wallKey(wall), width, height, wallPaint(wall));
  };
  const parts: Part[] = [
    box(x0, x1, 0, hallHeight, z0, z1, { sides: walls, top: filled("timberDk"), ramp: slate }),
  ];
  const top = hallRoof(style, spec, parts);
  parts.push(
    placed(style.piers ? steppedLamp(spec.lit) : roadLamp(spec.lit), x0 - 4, 0, z1 + 4, 0),
  );
  const glow: Glow[] =
    spec.lit && spec.night
      ? [
          { x0: -8, x1: 8, z0: z1, z1: z1 + 8, colour: "lamp", alpha: 0.18 },
          { x0: -4, x1: 4, z0: z1, z1: z1 + 4, colour: "lamp", alpha: 0.22 },
          { x0: x0 - 10, x1: x0 + 2, z0: z1, z1: z1 + 10, colour: "lamp", alpha: 0.18 },
        ]
      : [];
  return { parts, reach: top + 6, foot: { x0, x1, z0, z1 }, glow };
}

function hallRoof(style: SketchStyle, spec: HallSpec, parts: Part[]): number {
  const { x0, x1, z0, z1 } = hallFootprint;
  if (style.roof === "step") {
    const cap = steppedCap({ x0, x1, z0, z1, y: hallHeight, steps: 1, attic: spec.lit });
    parts.push(...cap.parts);
    return cap.top;
  }
  if (style.roof === "flat") {
    parts.push(
      box(x0 - 2, x1 + 2, hallHeight, hallHeight + 3, z0 - 2, z1 + 2, {
        sides: sameSides(slabEdge, "map-slab"),
        top: topPainted(`map-slab|${style.plants}`, x1 - x0 + 4, z1 - z0 + 4, slabTop(style)),
        ramp: slate,
      }),
    );
    if (!style.sign) return hallHeight + 3;
    const lit = spec.lit;
    const board: Paint = (brush, width, height) => {
      brush.rect(0, 0, width, height, lit ? "hue.b" : "hue.d");
      brush.rect(1, 1, width - 2, 1, lit ? "hue.h" : "hue.m");
      brush.rect(1, height - 2, width - 2, 1, lit ? "hue.h" : "hue.m");
    };
    parts.push(
      box(-8, 8, hallHeight + 3, hallHeight + 9, z1 - 2, z1, {
        sides: sameSides(board, `map-hall-sign|${lit}`),
        top: filled("hue.h"),
        ramp: slate,
      }),
    );
    return hallHeight + 9;
  }
  const steps = roofParts({
    x0: x0 - 2,
    x1: x1 + 2,
    z0: z0 - 2,
    z1: z1 + 2,
    y: hallHeight,
    kind: "gx",
    tread: 2,
    gable: style.frames ? "wood" : "plaster",
    ramp: slate,
    loft: { at: 2, lit: spec.lit },
  });
  parts.push(...steps);
  return hallHeight + steps.length * stepHeight;
}

const slabEdge: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "timberDk");
  brush.rect(0, 0, width, 1, "hue.b");
};

function slabTop(style: SketchStyle): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, "timberDk");
    brush.rect(2, 2, width - 4, height - 4, "hue.d");
    brush.rect(4, 4, width - 8, height - 8, "hue.m");
    if (!style.plants) return;
    for (let x = 4; x < width - 6; x += 8) {
      brush.rect(x, 2, 2, 2, "leafHi");
      brush.rect(x + 4, height - 4, 2, 2, "leaf");
    }
  };
}

function signpost(style: SketchStyle, spec: SignpostSpec): Construction {
  const text = postName(spec.name);
  const half = Math.max(5, Math.ceil((text.length * 4 + 3) / 2));
  const wood: Role = style.piers ? "trimLo" : "woodDk";
  const post = (y0: number, y1: number): Part =>
    box(-1, 1, y0, y1, -1, 1, { sides: () => filled(wood), top: filled(wood) });
  const named = (facing: readonly Side[]): SidePaint => {
    return (side, width, height) =>
      facing.includes(side)
        ? painted(`signpost|${style.piers}|${text}`, width, height, signBoard(style, text))
        : filled(boardRole(style));
  };
  return {
    parts: [
      post(0, 14),
      box(-half, half, 14, 21, -1, 1, { sides: named(["pz", "nz"]), top: filled(wood) }),
      box(-1, 1, 21, 28, -half, half, { sides: named(["px", "nx"]), top: filled(wood) }),
      post(28, 31),
    ],
    reach: 34,
    foot: { x0: -2, x1: 2, z0: -2, z1: 2 },
  };
}

function boardRole(style: SketchStyle): Role {
  return style.piers ? "timberDk" : "woodHi";
}

function signBoard(style: SketchStyle, text: string): Paint {
  const letter: Role = style.piers ? "trimHi" : "ink";
  const edge: Role = style.piers ? "trim" : "woodDk";
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, boardRole(style));
    brush.rect(0, 0, width, 1, edge);
    brush.rect(0, height - 1, width, 1, edge);
    const left = Math.floor((width - (text.length * 4 - 1)) / 2);
    [...text].forEach((glyph, index) => {
      [...(font[glyph] ?? "")].forEach((row, line) => {
        for (let bit = 0; bit < 3; bit += 1) {
          if ((Number(row) & (4 >> bit)) !== 0)
            brush.rect(left + index * 4 + bit, 1 + line, 1, 1, letter);
        }
      });
    });
  };
}

function planks(style: SketchStyle, spec: LaneSpec): Construction {
  const half = spec.length / 2;
  const wide = plankWidth / 2;
  const rail: Role = style.piers ? "trim" : "woodDk";
  const deck = lengthwise(spec.axis, -half, half, -3, 0, -wide, wide, {
    sides: sameSides(deckEdge, "map-deck"),
    top: topPainted(
      `map-planks|${spec.axis}|${spec.length}`,
      spec.axis === "x" ? spec.length : plankWidth,
      spec.axis === "x" ? plankWidth : spec.length,
      plankTop(spec.axis),
    ),
  });
  const posts = [-1, 1].flatMap((end) =>
    [-1, 1].map((edge) => {
      const along = end * (half - 4);
      const across = edge * (wide - 1);
      return lengthwise(spec.axis, along - 1, along + 1, 0, 6, across - 1, across + 1, {
        sides: () => filled(rail),
        top: filled(rail),
      });
    }),
  );
  const rails = [-1, 1].map((edge) =>
    lengthwise(spec.axis, -half + 4, half - 4, 4, 5, edge * (wide - 1) - 1, edge * (wide - 1) + 1, {
      sides: () => filled(rail),
      top: filled(rail),
    }),
  );
  return { parts: [deck, ...rails, ...posts], reach: 6 };
}

const deckEdge: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "wood");
  brush.rect(0, height - 1, width, 1, "woodDk");
};

function plankTop(axis: LaneAxis): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, "wood");
    if (axis === "x") {
      for (let x = 3; x < width; x += 4) brush.rect(x, 0, 1, height, "woodDk");
      brush.rect(0, 0, width, 2, "woodHi");
    } else {
      for (let y = 4; y < height; y += 4) brush.rect(0, y, width, 2, "woodDk");
      brush.rect(0, 0, 1, height, "woodHi");
    }
  };
}

function stones(style: SketchStyle, spec: LaneSpec): Construction {
  const count = Math.max(2, Math.round(spec.length / stonePitch));
  const pitch = spec.length / count;
  const half = stoneSize / 2;
  const parts = Array.from({ length: count }, (_, index) => {
    const along = even(-spec.length / 2 + pitch * (index + 0.5));
    const across = index % 2 === 0 ? -2 : 2;
    return lengthwise(spec.axis, along - half, along + half, -4, 1, across - half, across + half, {
      sides: sameSides(stoneSide, "map-stone"),
      top: topPainted(`map-stone|${style.piers}`, stoneSize, stoneSize, stoneTop(style)),
    });
  });
  return { parts, reach: 1 };
}

const stoneSide: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "rock");
  brush.rect(0, 0, width, 1, "stone");
  brush.rect(0, height - 2, width, 2, "rockLo");
};

function stoneTop(style: SketchStyle): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, "stone");
    brush.rect(0, height - 2, width, 2, "rockLo");
    brush.rect(2, 2, 2, 2, "plasterHi");
    if (style.piers) {
      brush.rect(0, 0, width, 1, "trim");
      brush.rect(0, 0, 1, height, "trim");
    }
  };
}

function lengthwise(
  axis: LaneAxis,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  b0: number,
  b1: number,
  paints: Parameters<typeof box>[6],
): Part {
  return axis === "x" ? box(a0, a1, y0, y1, b0, b1, paints) : box(b0, b1, y0, y1, a0, a1, paints);
}

function even(value: number): number {
  return Math.round(value / 2) * 2;
}
