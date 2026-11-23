import type {
  Annex,
  Construction,
  Crowning,
  Glow,
  HouseSpec,
  MillSpec,
  ProjectSpec,
  ShedSpec,
  StorehouseSpec,
  WallMeaning,
  WorkshopConstruction,
  WorkshopSpec,
} from "../../kit.ts";
import { along, type Footprint, type Part, type Side } from "../../model.ts";
import { mixedRole, type Role } from "../../texture.ts";
import { bladeSign, corniceHeight, finial, steppedCap, sunburst } from "./deco.ts";
import { project } from "./projects.ts";
import { antenna, bell, chimneyPaint, flag, sails, smoke, star, vane } from "./props.ts";
import { roofParts, stepHeight } from "./roofs.ts";
import {
  box,
  filled,
  fillSides,
  type Paint,
  painted,
  placed,
  type SidePaint,
  sameSides,
  topPainted,
} from "./shapes.ts";
import { bearingOf, type SketchStyle } from "./style.ts";
import { type DoorRoles, faces, type Wall, wallKey, wallPaint } from "./walls.ts";

export const storeyHeight = 18;
export const towerFloor = 8;
export const houseFinialOrder = 5;

export interface Builders {
  workshop(spec: WorkshopSpec): WorkshopConstruction;
  house(spec: HouseSpec): Construction;
  storehouse(spec: StorehouseSpec): Construction;
  mill(spec: MillSpec): Construction;
  shed(spec: ShedSpec): Construction;
  project(spec: ProjectSpec): Construction;
}

export function buildersOf(style: SketchStyle): Builders {
  return {
    workshop: (spec) => workshop(style, spec),
    house: (spec) => house(style, spec),
    storehouse: (spec) => storehouse(style, spec),
    mill: (spec) => mill(style, spec),
    shed: (spec) => shed(style, spec),
    project: (spec) => project(style, spec),
  };
}

const identityDoor: DoorRoles = {
  fill: "hue.b",
  light: "hue.l",
  shadow: "hue.d",
  fan: "hue.l",
  fanLit: "hue.h",
};

const slateFan = {
  fan: mixedRole("slate", "paper", 0.3),
  fanLit: mixedRole("slate", "paper", 0.62),
} as const;

const meaningFaces: Readonly<Record<WallMeaning, number>> = {
  door: faces.door,
  bench: faces.bench,
  shelf: faces.shelf,
  board: faces.board,
};

function plainWall(style: SketchStyle): Omit<Wall, "face"> {
  return {
    base: "plaster",
    plank: undefined,
    frame: framed(style, "timber"),
    foot: "timberDk",
    sill: style.piers ? "trim" : "timberDk",
    frames: style.frames,
    ribbon: style.ribbon,
    piers: style.piers,
    storeys: 1,
    storeyHeight,
    lit: false,
    lightColour: "lamp",
    lightHigh: "lampHi",
    seed: 0,
    crates: 0,
    chores: 0,
    lanterns: 0,
    ivy: 0,
    door: identityDoor,
    tower: 0,
    notes: 0,
    boarded: false,
    garland: false,
    banner: 0,
  };
}

function framed(style: SketchStyle, frame: Role): Role {
  return style.piers ? "trimLo" : frame;
}

function walled(style: SketchStyle, wood: boolean): { base: Role; plank: Role | undefined } {
  return wood && !style.stone
    ? { base: "wood", plank: "woodDk" }
    : { base: "plaster", plank: undefined };
}

function lightOf(style: SketchStyle, own: boolean): { colour: Role; high: Role } {
  return own && style.ownLight
    ? { colour: "glow.l", high: "glow.h" }
    : { colour: "lamp", high: "lampHi" };
}

function workshop(style: SketchStyle, spec: WorkshopSpec): WorkshopConstruction {
  const bearing = bearingOf(spec.seed);
  const width = bearing.wide ? 36 : 32;
  const depth = bearing.deep ? 32 : 28;
  const height = spec.storeys * storeyHeight;
  const footprint = { x0: -width / 2, x1: width / 2, z0: -depth / 2, z1: depth / 2 };
  const { x0, x1, z0, z1 } = footprint;
  const light = lightOf(style, true);
  const wallFor = (side: Side): Wall => ({
    ...plainWall(style),
    face: meaningFaces[spec.walls[side]],
    storeys: spec.storeys,
    lit: spec.lit,
    lightColour: light.colour,
    lightHigh: light.high,
    seed: bearing.seed,
    crates: spec.delivered,
    chores: spec.chores,
    lanterns: spec.gates,
    ivy: spec.ivy,
    notes: spec.notes,
    boarded: spec.boarded,
    garland: spec.garland,
    banner: spec.banner,
  });
  const parts: Part[] = [
    box(x0, x1, 0, height, z0, z1, {
      sides: wallSides(wallFor),
      top: filled("timberDk"),
      meanings: spec.walls,
    }),
  ];
  let top: number;
  let crown: Crowning[] | undefined;
  if (style.roof === "flat") {
    const flat = flatRoof(style, footprint, height, spec, light.colour);
    parts.push(flat.slab);
    crown = flat.crown;
    top = height + 20;
  } else if (style.roof === "step") {
    const stepped = steppedRoof(footprint, height, spec);
    parts.push(...stepped.parts);
    crown = stepped.crown;
    top = stepped.top;
  } else {
    const steps = roofParts({
      x0: x0 - 2,
      x1: x1 + 2,
      z0: z0 - 2,
      z1: z1 + 2,
      y: height,
      kind: bearing.roof,
      tread: 2,
      gable: "plaster",
      loft: { at: 2, lit: spec.loft },
    });
    parts.push(...steps);
    top = height + steps.length * stepHeight;
    if (bearing.chimney && bearing.roof !== "hip") {
      const hx = bearing.roof === "gx" ? x1 - 10 : -2;
      const hz = bearing.roof === "gx" ? -2 : z0 + 6;
      parts.push(chimney(hx, hz, top - 4, top + 5));
      if (spec.lit) parts.push(placed(smoke(), hx + 2, top + 5, hz + 2, spec.order * 5));
    }
    const fx = bearing.roof === "gx" ? x0 + 3 : 0;
    const fz = bearing.roof === "gz" ? z1 - 3 : 0;
    parts.push(placed(flag(), fx, top, fz, spec.order * 2));
    if (spec.star) parts.push(placed(star(), bearing.roof === "hip" ? 4 : 0, top, 0));
    top += 10;
  }
  const annexes = [
    ...(style.awning ? [awning(footprint, spec.door)] : []),
    ...(style.blade ? [bladeSign(footprint, spec.door, height, spec.lit)] : []),
  ];
  const glow: Glow[] = spec.lit
    ? [
        glowBetween(
          along(footprint, spec.door, 4, 0),
          along(footprint, spec.door, 14, 8),
          light.colour,
          0.18,
        ),
        glowBetween(
          along(footprint, spec.door, 6, 0),
          along(footprint, spec.door, 12, 4),
          light.colour,
          0.22,
        ),
      ]
    : [];
  return {
    parts,
    ...(crown === undefined ? {} : { crown }),
    annexes,
    reach: top,
    footprint,
    lightColour: light.colour,
    foot: footprint,
    glow,
  };
}

function flatRoof(
  style: SketchStyle,
  footprint: Footprint,
  height: number,
  spec: WorkshopSpec,
  lightColour: Role,
): { slab: Part; crown: Crowning[] } {
  const { x0, x1, z0, z1 } = footprint;
  const slab = box(x0 - 2, x1 + 2, height, height + 3, z0 - 2, z1 + 2, {
    sides: sameSides(slabPaint("hue.b"), "slab|hue.b"),
    top: topPainted(`slab-top|${style.plants}`, x1 - x0 + 4, z1 - z0 + 4, slabTop(style.plants)),
  });
  const penthouse: Paint = (brush, width, tall) => {
    brush.rect(0, 0, width, tall, "plaster");
    brush.rect(0, 0, width, 1, "plasterHi");
    brush.rect(2, 3, width - 4, 3, spec.loft ? lightColour : "glass");
  };
  const crown: Crowning[] = [
    {
      x: x0 + 8,
      z: z0 + 7,
      part: box(x0 + 2, x0 + 14, height + 3, height + 11, z0 + 2, z0 + 12, {
        sides: sameSides(penthouse, `penthouse|${spec.loft}|${lightColour}`),
        top: filled("hue.b"),
      }),
    },
  ];
  if (style.sign) {
    const lit = spec.lit;
    const signPaint: Paint = (brush, width, tall) => {
      brush.rect(0, 0, width, tall, lit ? "hue.b" : "hue.d");
      brush.rect(1, 1, width - 2, 1, lit ? "hue.h" : "hue.m");
      brush.rect(1, tall - 2, width - 2, 1, lit ? "hue.h" : "hue.m");
    };
    const board = signBoard(spec.door, footprint);
    crown.push({
      x: (board.x0 + board.x1) / 2,
      z: (board.z0 + board.z1) / 2,
      part: box(board.x0, board.x1, height + 3, height + 9, board.z0, board.z1, {
        sides: sameSides(signPaint, `sign|${lit}`),
        top: filled("hue.h"),
      }),
    });
  }
  crown.push({
    x: x1 - 4,
    z: z0 + 4,
    part: style.antenna
      ? placed(antenna(), x1 - 4, height + 3, z0 + 4, spec.order * 4)
      : placed(flag(), x1 - 4, height + 3, z0 + 4, spec.order * 2),
  });
  if (spec.lit) {
    crown.push({
      x: x0 + 8,
      z: z0 + 7.5,
      part: placed(smoke(), x0 + 8, height + 11, z0 + 7, spec.order * 5),
    });
  }
  if (spec.star) {
    crown.push({ x: x0 + 8, z: z0 + 7.2, part: placed(star(), x0 + 8, height + 11, z0 + 7) });
  }
  return { slab, crown };
}

function steppedRoof(
  footprint: Footprint,
  height: number,
  spec: WorkshopSpec,
): { parts: Part[]; crown: Crowning[]; top: number } {
  const { x0, x1, z0, z1 } = footprint;
  const cap = steppedCap({ x0, x1, z0, z1, y: height, steps: 1, attic: spec.loft });
  const front = fanSpot(footprint, spec.door);
  const crown: Crowning[] = [
    ...sunburst(front.x, front.z, cap.top, 7, front.axis, spec.lit),
    { x: 0, z: 0, part: placed(finial(spec.order), 0, cap.top, 0) },
  ];
  if (spec.lit) {
    crown.push({
      x: x1 - 9,
      z: z0 + 9,
      part: placed(smoke(), x1 - 9, cap.top, z0 + 9, spec.order * 5),
    });
  }
  if (spec.star) {
    crown.push({ x: x0 + 9, z: z0 + 9, part: placed(star(), x0 + 9, cap.top, z0 + 9) });
  }
  return { parts: cap.parts, crown, top: cap.top + 22 };
}

function fanSpot(
  footprint: Footprint,
  door: Side,
): { readonly x: number; readonly z: number; readonly axis: "x" | "z" } {
  switch (door) {
    case "pz":
      return { x: 0, z: footprint.z1 - 5, axis: "x" };
    case "nz":
      return { x: 0, z: footprint.z0 + 5, axis: "x" };
    case "px":
      return { x: footprint.x1 - 5, z: 0, axis: "z" };
    case "nx":
      return { x: footprint.x0 + 5, z: 0, axis: "z" };
  }
}

function signBoard(door: Side, footprint: Footprint): Footprint {
  const { x0, x1, z0, z1 } = footprint;
  switch (door) {
    case "pz":
      return { x0: -8, x1: 8, z0: z1, z1: z1 + 2 };
    case "nz":
      return { x0: -8, x1: 8, z0: z0 - 2, z1: z0 };
    case "px":
      return { x0: x1, x1: x1 + 2, z0: -8, z1: 8 };
    case "nx":
      return { x0: x0 - 2, x1: x0, z0: -8, z1: 8 };
  }
}

function awning(footprint: Footprint, door: Side): Annex {
  const a = along(footprint, door, 2, 0);
  const b = along(footprint, door, 16, 4);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const stripes: Paint = (brush, width, height) => {
    for (let q = 0; q < width; q += 4) {
      brush.rect(q, 0, 2, height, "hue.b");
      brush.rect(q + 2, 0, 2, height, "paper");
    }
  };
  return {
    what: "awning",
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    parts: [
      box(x0, x1, 14, 16, z0, z1, {
        sides: sameSides(stripes, "awning"),
        top: topPainted("awning", x1 - x0, z1 - z0, stripes),
      }),
    ],
  };
}

function house(style: SketchStyle, spec: HouseSpec): Construction {
  const x0 = -20;
  const x1 = 12;
  const z0 = -20;
  const z1 = 12;
  const height = 36;
  const flat = style.roof === "flat";
  const stepped = style.roof === "step";
  const wallFor = (side: Side): Wall => ({
    ...plainWall(style),
    face: side === "pz" ? faces.houseFront : faces.houseSide,
    ...walled(style, true),
    frame: framed(style, "timberDk"),
    storeys: 2,
    lit: spec.lit,
    seed: 5,
    door: {
      fill: "accent",
      light: mixedRole("accent", "paper", 0.3),
      shadow: mixedRole("accent", "ink", 0.42),
      ...slateFan,
    },
  });
  const parts: Part[] = [
    box(x0, x1, 0, height, z0, z1, { sides: wallSides(wallFor), top: filled("timberDk") }),
  ];
  let top: number;
  if (stepped) {
    const cap = steppedCap({ x0, x1, z0, z1, y: height, steps: 2, attic: spec.lit });
    parts.push(...cap.parts);
    top = cap.top;
  } else if (flat) {
    parts.push(
      box(x0 - 2, x1 + 2, height, height + 3, z0 - 2, z1 + 2, {
        sides: sameSides(slabPaint("accent"), "slab|accent"),
        top: topPainted(
          `slab-top|${style.plants}`,
          x1 - x0 + 4,
          z1 - z0 + 4,
          slabTop(style.plants),
        ),
        ramp: "slate",
      }),
    );
    top = height + 7;
  } else {
    const steps = roofParts({
      x0: x0 - 2,
      x1: x1 + 2,
      z0: z0 - 2,
      z1: z1 + 2,
      y: height,
      kind: "gx",
      tread: 2,
      gable: "wood",
      ramp: "slate",
      loft: { at: 3, lit: spec.night },
    });
    parts.push(...steps);
    top = height + steps.length * stepHeight;
  }
  if (!stepped) {
    parts.push(chimney(x1 - 10, -6, top - 4, top + 6));
    if (spec.smoke) parts.push(placed(smoke(), x1 - 8, top + 6, -4, 15));
  }
  if (spec.vane) {
    parts.push(
      stepped
        ? placed(finial(houseFinialOrder), -4, top, -4, 0, "accent")
        : placed(vane(), x0 + 4, flat ? height + 3 : top, -4),
    );
  }
  const deck: Paint = (brush, width, tall) => {
    brush.rect(0, 0, width, tall, "wood");
    brush.rect(0, 0, width, 1, "woodHi");
  };
  const porch: Part[] = [
    box(x0, x1, 0, 3, z1, z1 + 8, {
      sides: sameSides(deck, "deck"),
      only: ["pz", "px", "nx"],
      top: filled("woodHi"),
    }),
    box(x0, x0 + 2, 3, 16, z1 + 6, z1 + 8, { sides: fillSides("timberDk") }),
    box(x1 - 2, x1, 3, 16, z1 + 6, z1 + 8, { sides: fillSides("timberDk") }),
    box(x0 - 2, x1 + 2, 16, 19, z1, z1 + 10, {
      sides: fillSides("hue.d"),
      top: filled("hue.l"),
      ramp: "slate",
    }),
    placed(bell(spec.ringing), -14, 16, z1 + 9),
  ];
  return {
    parts,
    annexes: [{ what: "porch", x: -4, z: z1 + 5, parts: porch }],
    reach: top + (stepped ? 18 : 10),
    foot: { x0, x1, z0, z1: z1 + 8 },
    glow: [
      glowBetween({ x: -10, z: z1 + 8 }, { x: 2, z: z1 + 16 }, "lamp", 0.18),
      glowBetween({ x: -8, z: z1 + 8 }, { x: 0, z: z1 + 12 }, "lamp", 0.22),
    ],
  };
}

function storehouse(style: SketchStyle, spec: StorehouseSpec): Construction {
  const x0 = -20;
  const x1 = 20;
  const z0 = -14;
  const z1 = 14;
  const height = 16;
  const facing: Readonly<Record<Side, number>> = {
    pz: faces.storeFront,
    px: faces.plain,
    nz: faces.plain,
    nx: faces.storeDoor,
  };
  const wallFor = (side: Side): Wall => ({
    ...plainWall(style),
    face: facing[side],
    ...walled(style, true),
    frame: framed(style, "timberDk"),
    storeyHeight: 16,
    seed: 9,
    crates: spec.shelves,
    door: { fill: "timber", light: "wood", shadow: "timberDk", ...slateFan },
  });
  const parts: Part[] = [
    box(x0, x1, 0, height, z0, z1, { sides: wallSides(wallFor), top: filled("timberDk") }),
  ];
  if (style.roof === "step") {
    const cap = steppedCap({ x0, x1, z0, z1, y: height, steps: 0 });
    parts.push(...cap.parts);
    parts.push(
      ...sunburst(0, z1 - 1, height + corniceHeight, 6, "x", false, "slate").map(
        (crowned) => crowned.part,
      ),
    );
  } else if (style.roof === "flat") {
    parts.push(
      box(x0 - 2, x1 + 2, height, height + 3, z0 - 2, z1 + 2, {
        sides: sameSides(slabPaint("hue.b"), "slab|hue.b"),
        top: topPainted("slab-top|false", x1 - x0 + 4, z1 - z0 + 4, slabTop(false)),
        ramp: "slate",
      }),
    );
  } else {
    parts.push(
      ...roofParts({
        x0: x0 - 2,
        x1: x1 + 2,
        z0: z0 - 2,
        z1: z1 + 2,
        y: height,
        kind: "gx",
        tread: 4,
        gable: "wood",
        ramp: "slate",
      }),
    );
  }
  return { parts, reach: 0, foot: { x0, x1, z0, z1 } };
}

function mill(style: SketchStyle, spec: MillSpec): Construction {
  const tiers: readonly (readonly [number, number, number, number])[] = [
    [12, 0, 18, faces.storeDoor],
    [10, 18, 34, faces.highWindow],
    [8, 34, 46, faces.plain],
  ];
  const parts: Part[] = tiers.map(([reach, y0, y1, front]) =>
    box(-reach, reach, y0, y1, -reach, reach, {
      sides: wallSides((side) => ({
        ...plainWall(style),
        face: side === "pz" ? front : front === faces.storeDoor ? faces.highWindow : front,
        frame: framed(style, "timber"),
        foot: "timber",
        ribbon: false,
        storeyHeight: y1 - y0,
        lit: spec.busy,
        seed: 21 + reach,
        door: { fill: "wood", light: "woodHi", shadow: "woodDk", ...slateFan },
      })),
      top: filled("timberDk"),
      ramp: "slate",
    }),
  );
  if (style.roof === "step") {
    parts.push(...steppedCap({ x0: -8, x1: 8, z0: -8, z1: 8, y: 46, steps: 1 }).parts);
  } else {
    parts.push(
      ...roofParts({
        x0: -10,
        x1: 10,
        z0: -10,
        z1: 10,
        y: 46,
        kind: "hip",
        tread: 2,
        gable: "plaster",
        ramp: "slate",
      }),
    );
  }
  parts.push(placed(sails(spec.turning, style.piers ? "trim" : "plaster"), 0, 40, 0));
  return { parts, reach: 62, foot: { x0: -12, x1: 12, z0: -12, z1: 12 } };
}

function shed(style: SketchStyle, spec: ShedSpec): Construction {
  const { spot } = spec;
  const floors = Math.max(1, Math.floor(spec.floors));
  const bearing = bearingOf(spec.seed);
  const tall = floors > 1;
  const y0 = spot.y0;
  const y1 = y0 + spot.height + (floors - 1) * towerFloor;
  const light = lightOf(style, true);
  const wallFor = (side: Side): Wall => ({
    ...plainWall(style),
    face: side === spot.door ? (y0 > 0 ? faces.highWindow : faces.shedDoor) : faces.plain,
    ...walled(style, !tall),
    frame: framed(style, "timberDk"),
    storeyHeight: spot.height,
    lit: spec.lit,
    lightColour: light.colour,
    lightHigh: light.high,
    seed: bearing.seed + spot.x0 + 77,
    tower: tall ? floors : 0,
  });
  const parts: Part[] = [
    box(spot.x0, spot.x1, y0, y1, spot.z0, spot.z1, {
      sides: wallSides(wallFor),
      top: filled("timberDk"),
    }),
  ];
  if (spec.roofed) {
    if (style.roof !== "gable" || floors >= 3) {
      parts.push(
        box(spot.x0, spot.x1, y1, y1 + 2, spot.z0, spot.z1, {
          sides: sameSides(slabPaint("hue.b"), "slab|hue.b"),
          top: filled("hue.m"),
        }),
      );
      if (floors >= 6) {
        parts.push(placed(antenna(), (spot.x0 + spot.x1) / 2, y1 + 2, (spot.z0 + spot.z1) / 2, 12));
      }
    } else {
      parts.push(
        ...roofParts({
          x0: spot.x0,
          x1: spot.x1,
          z0: spot.z0,
          z1: spot.z1,
          y: y1,
          kind: spot.ridge,
          tread: 2,
          gable: "wood",
        }),
      );
    }
  }
  return { parts, reach: y1 + (floors >= 6 ? 16 : 10) };
}

function chimney(x: number, z: number, y0: number, y1: number): Part {
  return box(x, x + 4, y0, y1, z, z + 4, {
    sides: sameSides(chimneyPaint, "chimney"),
    top: filled("ink"),
  });
}

function slabPaint(edge: Role): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, "timberDk");
    brush.rect(0, 0, width, 1, edge);
  };
}

function slabTop(plants: boolean): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, "timberDk");
    brush.rect(2, 2, width - 4, height - 4, "hue.d");
    brush.rect(4, 4, width - 8, height - 8, "hue.m");
    if (!plants) return;
    for (let x = 4; x < width - 6; x += 8) {
      brush.rect(x, 2, 2, 2, "leafHi");
      brush.rect(x + 4, height - 4, 2, 2, "leaf");
    }
  };
}

function wallSides(wallFor: (side: Side) => Wall): SidePaint {
  return (side, width, height) => {
    const wall = wallFor(side);
    return painted(wallKey(wall), width, height, wallPaint(wall));
  };
}

function glowBetween(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
  colour: Role,
  alpha: number,
): Glow {
  return { x0: a.x, z0: a.z, x1: b.x, z1: b.z, colour, alpha };
}
