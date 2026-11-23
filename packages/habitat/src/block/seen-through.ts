import type { DrawUnit, Quad } from "./draw-list.ts";
import { covers } from "./hit.ts";
import { opaqueAt, type Role } from "./texture.ts";

export const shownThrough: Role = "hue.b";

export function seenThrough(units: readonly DrawUnit[]): DrawUnit[] {
  let walls: Wall[] | undefined;
  return units.flatMap((unit, index) => {
    if (!isCreature(unit)) return [];
    walls ??= wallsOf(units);
    const quads = unit.quads.flatMap((quad) => hiddenHalf(quad, wallsAfter(walls ?? [], index)));
    return quads.length === 0 ? [] : [{ cell: unit.cell, item: unit.item, quads, through: true }];
  });
}

interface Wall {
  readonly quad: Quad;
  readonly drawn: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function isCreature(unit: DrawUnit): boolean {
  return unit.item?.what === "creature";
}

function wallsOf(units: readonly DrawUnit[]): Wall[] {
  return units.flatMap((unit, drawn) =>
    isCreature(unit)
      ? []
      : unit.quads.flatMap((quad) =>
          quad.light === undefined ? [] : [{ quad, drawn, ...boundsOf(quad) }],
        ),
  );
}

function wallsAfter(walls: readonly Wall[], drawn: number): Wall[] {
  return walls.filter((wall) => wall.drawn > drawn);
}

function hiddenHalf(figure: Quad, walls: readonly Wall[]): Quad[] {
  if (!("texture" in figure.paint)) return [];
  const texture = figure.paint.texture;
  const [, , , , left = 0, top = 0] = figure.matrix;
  const near = walls.filter(
    (wall) =>
      wall.right > left &&
      wall.left < left + texture.width &&
      wall.bottom > top &&
      wall.top < top + texture.height,
  );
  if (near.length === 0) return [];
  const shown: Quad[] = [];
  for (let v = 0; v < texture.height; v += 1) {
    for (let u = 0; u < texture.width; u += 1) {
      const x = left + u;
      const y = top + v;
      if (((x + y) & 1) !== 0) continue;
      if (!opaqueAt(texture, u, v)) continue;
      if (!near.some((wall) => covers(wall.quad, x + 0.5, y + 0.5))) continue;
      shown.push({
        ...figure,
        matrix: [1, 0, 0, 1, x, y],
        width: 1,
        height: 1,
        paint: { fill: shownThrough },
      });
    }
  }
  return shown;
}

function boundsOf(quad: Quad): Pick<Wall, "left" | "top" | "right" | "bottom"> {
  const [a, b, c, d, e, f] = quad.matrix;
  const xs = [0, a * quad.width, c * quad.height, a * quad.width + c * quad.height];
  const ys = [0, b * quad.width, d * quad.height, b * quad.width + d * quad.height];
  return {
    left: e + Math.min(...xs),
    top: f + Math.min(...ys),
    right: e + Math.max(...xs),
    bottom: f + Math.max(...ys),
  };
}
