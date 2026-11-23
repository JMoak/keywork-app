import type { Construction, GroundSpec, RoadGrade } from "../../kit.ts";
import { cellPitch, type Grid, halfCell } from "../../model.ts";
import type { Brush, Role } from "../../texture.ts";
import {
  box,
  type Paint,
  sameSides,
  sketchRandom,
  type TopPaint,
  topPainted,
  truncated,
} from "./shapes.ts";
import type { SketchStyle } from "./style.ts";

export const soilDepth = 16;
export const keelDepth = 8;
export const keelInset = 8;

export function groundsOf(style: SketchStyle): (spec: GroundSpec) => Construction {
  return (spec) => ({
    parts: [
      box(
        -halfCell + keelInset,
        halfCell - keelInset,
        -soilDepth - keelDepth,
        -soilDepth,
        -halfCell + keelInset,
        halfCell - keelInset,
        { sides: sameSides(rockPaint, "rock") },
      ),
      box(-halfCell, halfCell, -soilDepth, 0, -halfCell, halfCell, {
        sides: sameSides(soilPaint, "soil"),
        top: topPainted(
          `ground|${style.inlay}|${JSON.stringify(spec)}`,
          cellPitch,
          cellPitch,
          topPaint(spec, style.inlay),
        ),
      }),
    ],
    reach: 0,
  });
}

const soilPaint: Paint = (brush, width, height) => {
  const r = brush.rect;
  r(0, 0, width, height, "soil");
  r(0, 0, width, 2, "grassHi");
  r(0, 2, width, 1, "grassLo");
  r(0, 8, width, 1, "soilLo");
  r(0, 11, width, height - 11, "rock");
  for (let x = 3; x < width; x += 11) {
    r(x, 5 + (x % 3), 2, 1, "soilLo");
    r(x + 5, 13 + (x % 2), 3, 1, "rockLo");
  }
};

const rockPaint: Paint = (brush, width, height) => {
  const r = brush.rect;
  r(0, 0, width, height, "rock");
  r(0, height - 3, width, 3, "rockLo");
  r(4, 2, 6, 1, "rockLo");
  r(width - 12, 3, 5, 1, "rockLo");
};

type Edge = "north" | "south" | "west" | "east";

function topPaint(spec: GroundSpec, inlay: boolean): TopPaint {
  return (brush, _across, _deep, grid) => {
    const r = brush.rect;
    r(0, 0, cellPitch, cellPitch, "grass");
    const random = sketchRandom(spec.cx * 31 + spec.cz * 17 + 99);
    for (let tuft = 0; tuft < 16; tuft += 1) {
      const x = truncated(random() * 27) * 2;
      const y = truncated(random() * 27) * 2;
      r(x, y, 2, 2, random() < 0.6 ? "grassHi" : "grassLo");
    }
    const inlayOf = inlay ? grid : undefined;
    for (const edge of ["north", "south", "west", "east"] as const) {
      edgeRoad(brush, edge, spec.roads[edge], inlayOf);
    }
    const corners = [
      [false, false, spec.roads.northWest],
      [true, false, spec.roads.northEast],
      [false, true, spec.roads.southWest],
      [true, true, spec.roads.southEast],
    ] as const;
    for (const [east, south, grade] of corners) corner(brush, east, south, grade, inlayOf);
    const foot = spec.worn;
    if (foot !== undefined) {
      const shade = spec.shadow;
      brush.wash(
        foot.x0 + 26,
        foot.z0 + 26,
        foot.x1 - foot.x0 + 4,
        foot.z1 - foot.z0 + 4,
        "ink",
        shade * 0.55,
      );
      brush.wash(foot.x1 + 28, foot.z0 + 32, 6, foot.z1 - foot.z0 + 2, "ink", shade);
      brush.wash(foot.x0 + 32, foot.z1 + 28, foot.x1 - foot.x0 - 4, 6, "ink", shade);
    }
    if (!spec.pooled) return;
    for (const [east, south, grade] of corners) if (grade === 3) pool(brush, east, south);
    const left = spec.cx * cellPitch - halfCell;
    const top = spec.cz * cellPitch - halfCell;
    for (const glow of spec.glow) {
      brush.wash(
        Math.min(glow.x0, glow.x1) - left,
        Math.min(glow.z0, glow.z1) - top,
        Math.abs(glow.x1 - glow.x0),
        Math.abs(glow.z1 - glow.z0),
        glow.colour,
        glow.alpha,
      );
    }
  };
}

function edgeRoad(brush: Brush, edge: Edge, grade: RoadGrade, inlay: Grid | undefined): void {
  if (grade === 0) return;
  const put = (a: number, b: number, along: number, across: number, role: Role): void => {
    if (edge === "north") brush.rect(8 + a, b, along, across, role);
    else if (edge === "south") brush.rect(8 + a, cellPitch - b - across, along, across, role);
    else if (edge === "west") brush.rect(b, 8 + a, across, along, role);
    else brush.rect(cellPitch - b - across, 8 + a, across, along, role);
  };
  if (grade === 1) {
    for (let a = 2; a < 40; a += 8) put(a, 0, 4, 2, "path");
    return;
  }
  if (grade === 2) {
    put(0, 0, 40, 4, "path");
    for (let a = 4; a < 40; a += 10) put(a, 2, 2, 2, "pathLo");
    return;
  }
  put(0, 0, 40, 6, "cobble");
  put(0, 6, 40, 2, "cobbleLo");
  for (let a = 0; a < 40; a += 4) put(a, ((a / 4) % 3) * 2, 2, 2, "cobbleLo");
  if (inlay === undefined) return;
  const pixel = edge === "north" || edge === "south" ? inlay.z : inlay.x;
  put(0, 0, 40, pixel, "cobbleInlay");
}

function corner(
  brush: Brush,
  east: boolean,
  south: boolean,
  grade: RoadGrade,
  inlay: Grid | undefined,
): void {
  if (grade === 0) return;
  const put = (a: number, b: number, width: number, height: number, role: Role): void =>
    brush.rect(
      east ? cellPitch - a - width : a,
      south ? cellPitch - b - height : b,
      width,
      height,
      role,
    );
  if (grade === 1) {
    put(0, 0, 2, 2, "path");
    return;
  }
  if (grade === 2) {
    put(0, 0, 8, 4, "path");
    put(0, 0, 4, 8, "path");
    return;
  }
  put(0, 0, 8, 8, "cobble");
  put(6, 6, 2, 2, "cobbleLo");
  put(2, 2, 2, 2, "cobbleLo");
  put(6, 0, 2, 2, "cobbleLo");
  put(0, 6, 2, 2, "cobbleLo");
  if (inlay === undefined) return;
  put(0, 0, 8, inlay.z, "cobbleInlay");
  put(0, 0, inlay.x, 8, "cobbleInlay");
}

function pool(brush: Brush, east: boolean, south: boolean): void {
  for (let dy = 0; dy < 16; dy += 2) {
    const wide = Math.round(Math.sqrt(256 - dy * dy) / 2) * 2;
    const inner = dy < 10 ? Math.round(Math.sqrt(100 - dy * dy) / 2) * 2 : 0;
    const y = south ? cellPitch - 2 - dy : dy;
    brush.wash(east ? cellPitch - wide : 0, y, wide, 2, "pool", 0.12);
    if (inner > 0) brush.wash(east ? cellPitch - inner : 0, y, inner, 2, "pool", 0.14);
  }
}
