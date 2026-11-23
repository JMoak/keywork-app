import {
  type Annex,
  type Construction,
  type Crowning,
  type ProjectSpec,
  type ProjectStage,
  projectStages,
  type SpriteArt,
} from "../../kit.ts";
import { type Part, type Side, sides } from "../../model.ts";
import { type Brush, mixedRole, type Role } from "../../texture.ts";
import { capTop, cornice, finial, setbackPaint, sunburst } from "./deco.ts";
import { antenna } from "./props.ts";
import {
  anchored,
  box,
  filled,
  type Paint,
  painted,
  placed,
  sameSides,
  sketchRandom,
  spriteOf,
  topPainted,
} from "./shapes.ts";
import { nameSign } from "./sign.ts";
import type { SketchStyle } from "./style.ts";

export interface StagePlan {
  readonly tiers: readonly (readonly [width: number, depth: number, floors: number])[];
  readonly unit?: boolean;
  readonly sign?: boolean;
  readonly antenna?: boolean;
  readonly crown?: boolean;
  readonly spire?: boolean;
}

export const stagePlans: Readonly<Record<Exclude<ProjectStage, "shack">, StagePlan>> = {
  shed: { tiers: [[12, 10, 1]], antenna: true },
  house: { tiers: [[16, 12, 2]], unit: true, antenna: true },
  tower: { tiers: [[16, 14, 9]], unit: true, antenna: true },
  "high-rise": {
    tiers: [
      [22, 16, 11],
      [16, 12, 3],
    ],
    sign: true,
    antenna: true,
  },
  skyscraper: {
    tiers: [
      [28, 20, 14],
      [22, 16, 5],
      [14, 10, 3],
    ],
    crown: true,
    spire: true,
  },
};

export const floorPitch = 6;
export const signFromStage = 3;
export const litShare = { on: 0.8, off: 0.15 } as const;
export const tierCornice = 4;

export function project(style: SketchStyle, spec: ProjectSpec): Construction {
  if (spec.stage === "shack") return shack(style, spec);
  const stage = projectStages.indexOf(spec.stage);
  const plan = stagePlans[spec.stage];
  const parts: Part[] = [];
  const crown: Crowning[] = [];
  let y = 0;
  plan.tiers.forEach(([width, depth, floors], tier) => {
    const ground = tier === 0;
    const tall = ground ? (floors - 1) * floorPitch + 10 : floors * floorPitch + 2;
    const level: Level = {
      floors,
      ground,
      share: spec.lit ? litShare.on : litShare.off,
      piers: style.piers,
      frames: style.frames,
    };
    parts.push(
      box(-width / 2, width / 2, y, y + tall, -depth / 2, depth / 2, {
        sides: (side, across, high) => {
          const seed = spec.seed + stage * 31 + tier * 7 + sides.indexOf(side);
          const facing: Level = { ...level, door: ground && side === "pz", seed };
          return painted(`tier|${JSON.stringify(facing)}`, across, high, tierPaint(facing));
        },
        top: topPainted("tier-roof", width, depth, tierRoof),
      }),
    );
    y += tall;
    if (style.piers) {
      parts.push(
        cornice(-width / 2 - 1, width / 2 + 1, -depth / 2 - 1, depth / 2 + 1, y, tierCornice),
      );
      y += tierCornice;
    }
  });
  const [lastWidth = 0, lastDepth = 0] = plan.tiers[plan.tiers.length - 1] ?? [];
  const last = { width: lastWidth, depth: lastDepth };
  if (style.piers) y = stepCrown(parts, crown, y, last, stage, spec);
  else y = plainCrown(parts, crown, y, last, plan, style, spec, stage);
  const [groundWidth = 0, groundDepth = 0, groundFloors = 1] = plan.tiers[0] ?? [];
  const sign =
    stage < signFromStage
      ? undefined
      : nameSign(spec.name, {
          left: -groundWidth / 2 + 1,
          front: groundDepth / 2,
          height: (groundFloors - 1) * floorPitch + 10,
          lit: spec.lit,
          brass: style.piers,
        });
  return {
    parts,
    crown,
    ...(sign === undefined ? {} : { annexes: [sign] }),
    reach: y + (plan.spire ? 24 : style.piers ? 18 : 14),
  };
}

interface Level {
  readonly floors: number;
  readonly ground: boolean;
  readonly share: number;
  readonly piers: boolean;
  readonly frames: boolean;
  readonly door?: boolean;
  readonly seed?: number;
}

interface Top {
  readonly width: number;
  readonly depth: number;
}

function plainCrown(
  parts: Part[],
  crown: Crowning[],
  y: number,
  last: Top,
  plan: StagePlan,
  style: SketchStyle,
  spec: ProjectSpec,
  stage: number,
): number {
  const { width, depth } = last;
  let top = y;
  if (plan.unit) {
    const unit: Paint = (brush, w, h) => {
      brush.rect(0, 0, w, h, "plaster");
      brush.rect(0, 0, w, 1, "plasterHi");
    };
    crown.push({
      x: -width / 2 + 4,
      z: -depth / 2 + 4,
      part: box(-width / 2 + 2, -width / 2 + 6, top, top + 3, -depth / 2 + 2, -depth / 2 + 6, {
        sides: sameSides(unit, "roof-unit"),
        top: filled("plasterHi"),
      }),
    });
  }
  if (plan.sign) {
    const lit = spec.lit;
    const sign: Paint = (brush, w, h) => {
      brush.rect(0, 0, w, h, lit ? "hue.b" : "hue.d");
      brush.rect(1, 1, w - 2, 1, lit ? "hue.h" : "hue.m");
      brush.rect(1, h - 2, w - 2, 1, lit ? "hue.h" : "hue.m");
    };
    crown.push({
      x: 0,
      z: depth / 2 - 1,
      part: box(-4, 4, top + 2, top + 7, depth / 2 - 2, depth / 2, {
        sides: sameSides(sign, `tower-sign|${lit}`),
        top: filled("hue.h"),
      }),
    });
  }
  if (plan.crown) {
    const lit = spec.lit;
    const band: Paint = (brush, w, h) => {
      brush.rect(0, 0, w, h, lit ? "hue.l" : "hue.d");
      brush.rect(0, 0, w, 1, "hue.h");
      for (let x = 1; x < w; x += 2) brush.rect(x, 1, 1, h - 1, "timberDk");
    };
    parts.push(
      box(-4, 4, top, top + 8, -4, 4, {
        sides: sameSides(band, `tower-crown|${lit}`),
        top: filled("hue.b"),
      }),
    );
    top += 8;
  }
  if (plan.spire) {
    crown.push({ x: 0, z: 0, part: placed(spire(style), 0, top, 0, spec.order * 4) });
  } else if (plan.antenna) {
    crown.push({
      x: width / 2 - 3,
      z: -depth / 2 + 3,
      part: placed(antenna(), width / 2 - 3, top, -depth / 2 + 3, (spec.order + stage) * 4),
    });
  }
  return top;
}

function stepCrown(
  parts: Part[],
  crown: Crowning[],
  y: number,
  last: Top,
  stage: number,
  spec: ProjectSpec,
): number {
  const { width, depth } = last;
  const steps = stage >= 5 ? 2 : stage >= 3 ? 1 : 0;
  let inset = 0;
  let top = y;
  for (let step = 0; step < steps; step += 1) {
    if (width - 2 * (inset + 3) < 6 || depth - 2 * (inset + 3) < 6) break;
    inset += 3;
    parts.push(
      box(
        -width / 2 + inset,
        width / 2 - inset,
        top,
        top + 5,
        -depth / 2 + inset,
        depth / 2 - inset,
        {
          sides: sameSides(setbackPaint(spec.lit, "lamp"), `setback|${spec.lit}|lamp`),
          top: capTop(width - 2 * inset, depth - 2 * inset),
        },
      ),
    );
    top += 5;
  }
  const wanted = stage >= 5 ? 6 : stage >= 3 ? 5 : stage >= 2 ? 4 : 0;
  const half = Math.min(wanted, Math.floor((width - 2 * inset) / 2) - 1);
  if (half >= 3) crown.push(...sunburst(0, depth / 2 - inset - 1, top, half, "x", spec.lit));
  if (stage >= 5) {
    crown.push({ x: 0, z: 0, part: placed(spire({ piers: true }), 0, top, 0, spec.order * 4) });
  } else if (stage >= 3) {
    crown.push({ x: 0, z: 0, part: placed(finial(spec.order + stage), 0, top, 0) });
  }
  return top + (half >= 3 ? 7 : 0);
}

function tierPaint(level: Level): Paint {
  return (brush, w, h) =>
    level.piers ? pieredTier(brush, level, w, h) : plainTier(brush, level, w, h);
}

function plainTier(brush: Brush, level: Level, w: number, h: number): void {
  const r = brush.rect;
  const random = sketchRandom(level.seed ?? 0);
  const band = mixedRole("plaster", "ink", 0.3);
  const upper = level.ground ? level.floors - 1 : level.floors;
  r(0, 0, w, h, "plaster");
  r(0, 0, 1, h, band);
  r(w - 1, 0, 1, h, band);
  r(0, 0, w, 1, "hue.b");
  if (level.frames)
    for (let floor = 1; floor <= upper; floor += 1) r(0, floor * floorPitch, w, 1, band);
  for (let floor = 0; floor < upper; floor += 1) {
    const y = 2 + floor * floorPitch;
    const on = random() < level.share;
    r(2, y, w - 4, 3, on ? "hue.l" : "glass");
    if (on) r(2, y, w - 4, 1, "hue.h");
    for (let x = 4; x < w - 3; x += 3) r(x, y, 1, 3, "plaster");
  }
  if (!level.ground) return;
  const y = h - 7;
  const middle = w >> 1;
  if (level.door) {
    r(middle - 2, h - 7, 4, 7, band);
    r(middle - 1, h - 6, 2, 6, "hue.d");
    r(2, y, middle - 5, 3, level.share > 0 ? "hue.l" : "glass");
    r(middle + 3, y, w - middle - 5, 3, level.share > 0 ? "hue.l" : "glass");
  } else r(2, y, w - 4, 3, level.share > 0.5 ? "hue.l" : "glass");
  r(0, h - 1, w, 1, band);
}

function pieredTier(brush: Brush, level: Level, w: number, h: number): void {
  const r = brush.rect;
  const columns = tierColumns(w);
  const random = sketchRandom(level.seed ?? 0);
  const upper = level.ground ? level.floors - 1 : level.floors;
  const middle = w >> 1;
  r(0, 0, w, h, "plaster");
  for (let pier = 0; pier < columns.count - 1; pier += 1) {
    r(columns.offset + 3 + pier * 5, 1, 1, h - 1, mixedRole("plaster", "trim", 0.4));
  }
  for (let floor = 0; floor < upper; floor += 1) {
    const y = 2 + floor * floorPitch;
    for (let column = 0; column < columns.count; column += 1) {
      const on = random() < level.share;
      const x = columns.offset + column * 5;
      r(x, y, 2, 4, on ? "lamp" : "glass");
      if (on) r(x, y, 2, 1, "lampHi");
    }
  }
  if (level.ground) {
    const y = h - 8;
    const on = level.share > 0.5;
    for (let column = 0; column < columns.count; column += 1) {
      const x = columns.offset + column * 5;
      if (level.door && x + 2 > middle - 4 && x < middle + 4) continue;
      r(x, y, 2, 6, on ? "lamp" : "glass");
    }
    if (level.door) {
      r(middle - 3, h - 9, 6, 9, "plaster");
      r(middle - 2, h - 6, 4, 6, "trimLo");
      r(middle - 1, h - 5, 2, 5, "hue.d");
      r(middle - 1, h - 9, 2, 1, "trim");
      r(middle - 2, h - 8, 4, 1, on ? "hue.l" : "hue.m");
      r(middle - 3, h - 7, 6, 1, on ? "hue.l" : "hue.m");
      r(middle - 3, h - 7, 1, 1, "trim");
      r(middle - 1, h - 7, 2, 1, "trim");
      r(middle + 2, h - 7, 1, 1, "trim");
    }
    r(0, h - 1, w, 1, "trimLo");
  }
  r(0, 0, 1, h, "trim");
  r(w - 1, 0, 1, h, "trim");
  r(0, 0, w, 1, "trim");
}

function tierColumns(width: number): { readonly count: number; readonly offset: number } {
  let count = Math.max(1, Math.floor((width + 1) / 5));
  let offset = Math.floor((width - (count * 5 - 3)) / 2);
  if (offset < 2 && count > 1) {
    count -= 1;
    offset = Math.floor((width - (count * 5 - 3)) / 2);
  }
  return { count, offset };
}

const tierRoof: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "timberDk");
  brush.rect(2, 2, width - 4, height - 4, "hue.d");
};

function shack(style: SketchStyle, spec: ProjectSpec): Construction {
  const lantern: Annex = { what: "lantern", x: 6, z: 6, parts: [placed(shackLantern(), 6, 0, 6)] };
  if (style.piers) {
    const wall =
      (door: boolean): Paint =>
      (brush, w, h) => {
        const r = brush.rect;
        r(0, 0, w, h, "plaster");
        r(0, 0, 1, h, "trim");
        r(w - 1, 0, 1, h, "trim");
        if (door) {
          r((w >> 1) - 1, h - 5, 3, 5, "trimLo");
          r(w >> 1, h - 4, 1, 4, "hue.d");
        } else r((w >> 1) - 1, 2, 2, 2, spec.lit ? "lamp" : "glass");
      };
    const cap: Paint = (brush, w, h) => {
      brush.rect(0, 0, w, h, "timberDk");
      brush.rect(0, 0, w, 1, "trim");
    };
    return {
      parts: [
        box(-4, 4, 0, 6, -4, 4, {
          sides: shackSides(wall, `pier-shack|${spec.lit}`),
          top: filled("timberDk"),
        }),
        box(-5, 5, 6, 8, -5, 5, {
          sides: sameSides(cap, "pier-shack-cap"),
          top: capTop(10, 10),
        }),
      ],
      crown: sunburst(0, 3, 8, 3, "x", spec.lit),
      annexes: [lantern],
      reach: 14,
    };
  }
  const wall =
    (door: boolean): Paint =>
    (brush, w, h) => {
      const r = brush.rect;
      r(0, 0, w, h, "wood");
      for (let q = 2; q < h; q += 3) r(0, q, w, 1, "woodDk");
      r(0, 0, 1, h, "woodDk");
      r(w - 1, 0, 1, h, "woodDk");
      if (!door) return;
      r((w >> 1) - 1, h - 5, 3, 5, "ink");
      r(w >> 1, h - 4, 1, 4, "hue.d");
    };
  const roofSide: Paint = (brush, w, h) => {
    brush.rect(0, 0, w, h, "slateDk");
    brush.rect(0, 0, w, 1, "hue.d");
  };
  const patched: Paint = (brush, w, h) => {
    brush.rect(0, 0, w, h, "slateDk");
    brush.rect(2, 0, 2, 2, "woodHi");
  };
  return {
    parts: [
      box(-4, 4, 0, 6, -4, 4, { sides: shackSides(wall, "shack"), top: filled("woodDk") }),
      box(-4, 4, 6, 7, -4, 4, {
        sides: sameSides(roofSide, "shack-roof"),
        top: topPainted("shack-patch", 8, 8, patched),
      }),
      box(-4, 4, 7, 9, -4, 0, { sides: sameSides(roofSide, "shack-roof"), top: filled("slateDk") }),
    ],
    annexes: [lantern],
    reach: 14,
  };
}

function shackSides(wall: (door: boolean) => Paint, key: string) {
  return (side: Side, width: number, height: number) =>
    painted(`${key}|${side === "pz"}`, width, height, wall(side === "pz"));
}

function shackLantern(): SpriteArt {
  return spriteOf([
    anchored("shack-lantern", -1, -9, 3, 9, (put) => {
      put(0, -6, 1, 6, "ink");
      put(-1, -9, 3, 1, "ink");
      put(-1, -8, 3, 3, "hue.l");
      put(0, -7, 1, 1, "hue.h");
    }),
  ]);
}

function spire(style: Pick<SketchStyle, "piers">): SpriteArt {
  const mast: Role = style.piers ? "trim" : "ink";
  return spriteOf(
    (["hue.l", "hue.h"] as const).map((tip) =>
      anchored(`spire|${mast}|${tip}`, -1, -21, 3, 21, (put) => {
        put(0, -18, 1, 18, mast);
        put(-1, -6, 3, 1, mast);
        put(-1, -12, 3, 1, mast);
        put(-1, -21, 3, 3, tip);
      }),
    ),
    [0, 0, 0, 0, 1, 1, 1, 1],
  );
}
