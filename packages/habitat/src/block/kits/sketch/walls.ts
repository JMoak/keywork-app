import type { Brush, Role } from "../../texture.ts";
import { mixedRole } from "../../texture.ts";
import { type Paint, sketchRandom, truncated } from "./shapes.ts";

export interface Wall {
  readonly face: number;
  readonly base: Role;
  readonly plank: Role | undefined;
  readonly frame: Role;
  readonly foot: Role;
  readonly sill: Role;
  readonly frames: boolean;
  readonly ribbon: boolean;
  readonly piers: boolean;
  readonly storeys: number;
  readonly storeyHeight: number;
  readonly lit: boolean;
  readonly lightColour: Role;
  readonly lightHigh: Role;
  readonly seed: number;
  readonly crates: number;
  readonly chores: number;
  readonly lanterns: number;
  readonly ivy: number;
  readonly door: DoorRoles;
  readonly tower: number;
  readonly notes: number;
  readonly boarded: boolean;
  readonly garland: boolean;
  readonly banner: number;
}

export interface DoorRoles {
  readonly fill: Role;
  readonly light: Role;
  readonly shadow: Role;
  readonly fan: Role;
  readonly fanLit: Role;
}

export const pierColumn = 5;

export const faces = {
  door: 0,
  bench: 1,
  shelf: 2,
  board: 3,
  houseFront: 5,
  houseSide: 6,
  storeFront: 7,
  plain: 8,
  storeDoor: 9,
  highWindow: 10,
  shedDoor: 11,
} as const;

export function wallKey(wall: Wall): string {
  return `wall|${JSON.stringify(wall)}`;
}

export function wallPaint(wall: Wall): Paint {
  return (brush, width, height) => paintWall(brush, wall, width, height);
}

export function rimOf(base: Role): Role {
  return mixedRole(base, "paper", 0.3);
}

export function bandOf(base: Role): Role {
  return mixedRole(base, "ink", 0.22);
}

function paintWall(brush: Brush, wall: Wall, w: number, h: number): void {
  const r = brush.rect;
  const floor = h - 2;
  const band = bandOf(wall.base);
  r(0, 0, w, h, wall.base);
  if (wall.plank !== undefined) for (let y = 3; y < h; y += 4) r(0, y, w, 1, wall.plank);
  if (wall.piers) pilasters(brush, wall, w, h);
  else if (wall.frames) {
    r(0, 0, 2, h, wall.frame);
    r(w - 2, 0, 2, h, wall.frame);
    r(0, 0, w, 1, wall.frame);
    for (let storey = 1; storey < wall.storeys; storey += 1) {
      r(0, h - storey * wall.storeyHeight - 1, w, 2, wall.frame);
    }
  } else {
    r(0, 0, w, 1, rimOf(wall.base));
    r(w - 1, 1, 1, h - 1, band);
    for (let storey = 1; storey < wall.storeys; storey += 1) {
      r(0, h - storey * wall.storeyHeight, w, 1, band);
    }
  }
  r(0, floor, w, 2, wall.foot);
  if (wall.tower > 0) tower(brush, wall, w, band);
  for (let storey = 1; storey < wall.storeys; storey += 1) {
    const y = h - (storey + 1) * wall.storeyHeight + 5;
    if (wall.piers) lightColumns(brush, wall, y - 1, w);
    else if (wall.ribbon) ribbon(brush, wall, 4, y + 1, w - 8);
    else {
      window(brush, wall, 5, y);
      if (w >= 30) window(brush, wall, w - 12, y);
    }
  }
  face(brush, wall, w, h, floor);
  if (wall.garland) garland(brush, w);
  if (wall.banner > 0 && wall.face === faces.door && wall.storeys >= 2) banner(brush, wall, w, h);
  if (wall.ivy > 0) ivy(brush, wall, w, h);
}

function face(brush: Brush, wall: Wall, w: number, h: number, floor: number): void {
  const r = brush.rect;
  switch (wall.face) {
    case faces.door:
      door(brush, wall, 5, floor - 13);
      sign(brush, wall, 16, floor - 13);
      window(brush, wall, w - 10, floor - 12);
      for (let lantern = 0; lantern < wall.lanterns; lantern += 1) {
        r(17 + lantern * 4, 2, 2, 1, "ink");
        r(17 + lantern * 4, 3, 2, 2, "lamp");
      }
      return;
    case faces.bench:
      bench(brush, wall, (w >> 1) - 7, floor - 13);
      return;
    case faces.shelf:
      shelf(brush, wall, (w >> 1) - 8, floor - 13);
      return;
    case faces.board:
      board(brush, wall, 4, floor - 13);
      if (w >= 30) window(brush, wall, w - 11, floor - 12);
      return;
    case faces.houseFront:
      door(brush, wall, (w >> 1) - 4, floor - 13);
      window(brush, wall, 3, floor - 12);
      window(brush, wall, w - 10, floor - 12);
      return;
    case faces.houseSide:
      window(brush, wall, 5, floor - 12);
      if (w >= 30) window(brush, wall, w - 12, floor - 12);
      return;
    case faces.storeFront:
      for (let cell = 0; cell < 10; cell += 1) {
        const cx = 3 + (cell % 5) * 7;
        const cy = cell < 5 ? floor - 6 : floor - 13;
        r(cx, cy, 6, 6, "ink");
        if (cell < wall.crates) {
          r(cx + 1, cy + 2, 4, 4, "wood");
          r(cx + 1, cy + 2, 4, 1, "woodHi");
        }
      }
      return;
    case faces.storeDoor:
      door(brush, wall, (w >> 1) - 4, floor - 13);
      return;
    case faces.highWindow:
      window(brush, wall, (w >> 1) - 3, (h >> 1) - 4);
      return;
    case faces.shedDoor:
      r((w >> 1) - 3, floor - 8, 6, 8, wall.frame);
      r((w >> 1) - 2, floor - 7, 4, 7, wall.door.fill);
      r((w >> 1) - 2, floor - 7, 4, 1, wall.door.light);
      r((w >> 1) + 4, floor - 8, 1, 2, wall.lit ? "lamp" : wall.frame);
      return;
  }
}

function window(brush: Brush, wall: Wall, x: number, y: number): void {
  if (wall.piers) {
    pierWindow(brush, wall, x, y);
    return;
  }
  const r = brush.rect;
  r(x, y, 7, 8, wall.frame);
  r(x + 1, y + 1, 5, 6, wall.lit ? wall.lightColour : "glass");
  if (wall.lit) r(x + 1, y + 1, 2, 2, wall.lightHigh);
  else r(x + 1, y + 1, 1, 1, "glint");
  r(x + 3, y + 1, 1, 6, wall.frame);
  r(x + 1, y + 3, 5, 1, wall.frame);
  r(x - 1, y + 8, 9, 1, wall.sill);
}

function door(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  if (wall.piers) fannedDoor(brush, wall, x, y);
  else {
    r(x, y, 9, 13, wall.frame);
    r(x + 1, y + 1, 7, 12, wall.door.fill);
    r(x + 1, y + 1, 7, 1, wall.door.light);
    r(x + 4, y + 2, 1, 11, wall.door.shadow);
    r(x + 6, y + 7, 1, 1, "lampHi");
  }
  if (!wall.boarded) return;
  for (const row of [y + 3, y + 8]) {
    r(x - 1, row, 11, 2, "woodHi");
    r(x - 1, row + 1, 11, 1, "woodDk");
  }
}

function sign(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  if (wall.boarded) {
    r(x, y + 1, 6, 4, "stone");
    r(x + 1, y + 2, 4, 1, "ink");
    return;
  }
  const glyph = (wall.seed & 63) | 1;
  r(x, y, 5, 1, "ink");
  r(x, y + 1, 5, 5, "hue.l");
  r(x, y + 5, 5, 1, "hue.d");
  for (let bit = 0; bit < 3; bit += 1) {
    if ((glyph >> bit) & 1) r(x + 1 + bit, y + 2 + ((glyph >> (bit + 3)) & 1), 1, 2, "ink");
  }
}

function bench(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  r(x, y, 15, 9, wall.frame);
  r(x + 1, y + 1, 13, 7, wall.lit ? wall.lightColour : "glass");
  if (wall.lit) {
    r(x + 1, y + 1, 13, 2, wall.lightHigh);
    r(x + 3, y + 4, 4, 1, "ink");
    r(x + 4, y + 5, 2, 3, "ink");
    r(x + 9, y + 5, 3, 3, "ink");
  }
  r(x + 5, y + 1, 1, 7, wall.frame);
  r(x + 10, y + 1, 1, 7, wall.frame);
  r(x - 1, y + 9, 17, 2, wall.sill);
  for (let note = 0; note < Math.min(3, wall.notes); note += 1) {
    r(x + 1 + note * 4, y + 11, 3, 1, "chalk");
  }
}

function shelf(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  r(x, y, 17, 12, wall.frame);
  r(x + 1, y + 1, 15, 10, "ink");
  r(x + 1, y + 5, 15, 1, wall.frame);
  for (let crate = 0; crate < 6 && crate < wall.crates; crate += 1) {
    const cx = x + 2 + (crate % 3) * 5;
    const cy = y + (crate < 3 ? 7 : 1);
    r(cx, cy, 4, 4, "wood");
    r(cx, cy, 4, 1, "woodHi");
  }
}

function board(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  r(x, y, 13, 10, wall.frame);
  r(x + 1, y + 1, 11, 8, "slateDk");
  for (let line = 0; line < wall.chores && line < 3; line += 1) {
    r(x + 2, y + 2 + line * 2, 4 + ((wall.seed >> (line * 2)) & 3) * 2, 1, "chalk");
  }
}

function ribbon(brush: Brush, wall: Wall, x: number, y: number, w: number): void {
  const r = brush.rect;
  r(x, y, w, 6, wall.frame);
  r(x + 1, y + 1, w - 2, 4, wall.lit ? wall.lightColour : "glass");
  if (wall.lit) r(x + 1, y + 1, w - 2, 1, wall.lightHigh);
  else r(x + 1, y + 1, 3, 1, "glint");
  for (let mullion = x + 5; mullion < x + w - 1; mullion += 5) r(mullion, y + 1, 1, 4, wall.frame);
}

function tower(brush: Brush, wall: Wall, w: number, band: Role): void {
  const r = brush.rect;
  for (let floor = 0; floor < wall.tower - 1; floor += 1) {
    const ty = 2 + floor * 8;
    r(0, ty + 7, w, 1, band);
    for (let tx = 2; tx + 2 <= w - 2; tx += 4) {
      const on = wall.lit && ((wall.seed >> ((floor * 3 + tx) % 11)) & 1) === 1;
      r(tx, ty + 1, 2, 4, on ? wall.lightColour : "glass");
    }
  }
}

function garland(brush: Brush, w: number): void {
  const bulbs: readonly Role[] = ["gold", "hue.l", "accent"];
  for (let x = 2; x < w - 2; x += 3) brush.rect(x, 1, 1, 2, bulbs[((x - 2) / 3) % 3] ?? "gold");
}

function banner(brush: Brush, wall: Wall, w: number, h: number): void {
  const r = brush.rect;
  const x = (w >> 1) - 1;
  const y = h - 2 * wall.storeyHeight + 3;
  const golden = wall.banner > 1;
  r(x - 1, y - 1, 5, 1, "ink");
  r(x, y, 3, 9, golden ? "gold" : "hue.b");
  r(x + 1, y + 2, 1, 3, golden ? "goldHi" : "hue.h");
  r(x, y + 8, 3, 1, golden ? "goldDk" : "hue.d");
  r(x + 1, y + 8, 1, 1, wall.base);
}

function ivy(brush: Brush, wall: Wall, w: number, h: number): void {
  const random = sketchRandom(wall.seed * 13 + 5 + wall.face);
  const leaves = wall.ivy * 10;
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const climb = random();
    const y = h - 3 - truncated(climb * climb * h * 0.85);
    const x = truncated(random() * Math.max(3, w * 0.5 * (1 - climb * 0.6)));
    brush.rect(x, y, 2, 2, random() < 0.5 ? "leaf" : "leafHi");
  }
}

export function columnsOf(width: number): { readonly count: number; readonly offset: number } {
  const count = Math.max(1, Math.floor((width - 6) / pierColumn));
  const span = count * pierColumn - 3;
  return { count, offset: Math.floor((width - span) / 2) };
}

function pilasters(brush: Brush, wall: Wall, w: number, h: number): void {
  const r = brush.rect;
  const columns = columnsOf(w);
  if (wall.tower === 0) {
    for (let pier = 0; pier < columns.count - 1; pier += 1) {
      r(columns.offset + 3 + pier * pierColumn, 2, 1, h - 4, mixedRole(wall.base, "trim", 0.4));
    }
  }
  const face = mixedRole(wall.base, "paper", 0.16);
  const shade = mixedRole(wall.base, "ink", 0.25);
  r(0, 0, 3, h, face);
  r(1, 2, 1, h - 4, shade);
  r(w - 3, 0, 3, h, face);
  r(w - 2, 2, 1, h - 4, shade);
  r(0, 0, w, 1, "trim");
  r(0, 1, 4, 1, "trim");
  r(w - 4, 1, 4, 1, "trim");
  r(0, h - 3, 4, 1, "trim");
  r(w - 4, h - 3, 4, 1, "trim");
}

function lightColumns(brush: Brush, wall: Wall, y: number, w: number): void {
  const r = brush.rect;
  const columns = columnsOf(w);
  const glass = wall.lit ? wall.lightColour : "glass";
  for (let column = 0; column < columns.count; column += 1) {
    const x = columns.offset + column * pierColumn;
    r(x, y, 2, 10, glass);
    if (wall.lit) r(x, y, 2, 1, wall.lightHigh);
    else r(x, y, 1, 1, "glint");
    r(x, y + 5, 2, 1, wall.base);
  }
}

function pierWindow(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  const glass = wall.lit ? wall.lightColour : "glass";
  r(x, y - 1, 7, 10, wall.frame);
  r(x + 1, y, 2, 8, glass);
  r(x + 4, y, 2, 8, glass);
  if (wall.lit) {
    r(x + 1, y, 2, 1, wall.lightHigh);
    r(x + 4, y, 2, 1, wall.lightHigh);
  } else r(x + 1, y, 1, 1, "glint");
  r(x + 1, y + 4, 5, 1, wall.frame);
  r(x - 1, y + 9, 9, 1, wall.sill);
}

function fannedDoor(brush: Brush, wall: Wall, x: number, y: number): void {
  const r = brush.rect;
  const fan = wall.lit ? wall.door.fanLit : wall.door.fan;
  r(x, y + 2, 9, 11, wall.frame);
  r(x + 1, y + 3, 7, 10, wall.door.fill);
  r(x + 1, y + 3, 7, 1, wall.door.light);
  r(x + 4, y + 4, 1, 9, wall.door.shadow);
  r(x + 3, y + 8, 1, 2, "trim");
  r(x + 5, y + 8, 1, 2, "trim");
  r(x + 3, y - 1, 3, 1, "trim");
  r(x + 1, y, 7, 1, fan);
  r(x, y + 1, 9, 1, fan);
  for (const rib of [1, 4, 7]) r(x + rib, y, 1, 1, "trim");
  for (let rib = 0; rib < 9; rib += 2) r(x + rib, y + 1, 1, 1, "trim");
}
