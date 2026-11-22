import { mixHex } from "../../colour.ts";
import type { KitColours } from "../../kit.ts";
import { gold } from "./colours.ts";

export interface SketchColours {
  readonly ink: string;
  readonly paper: string;
  readonly star: string | undefined;
  readonly grass: string;
  readonly soil: string;
  readonly rock: string;
  readonly path: string;
  readonly cobble: string;
  readonly plaster: string;
  readonly timber: string;
  readonly wood: string;
  readonly slate: string;
  readonly stone: string;
  readonly glass: string;
  readonly lamp: string;
  readonly accent: string;
  readonly err: string;
  readonly leaf: string;
  readonly chalk: string;
  readonly smoke: string;
  readonly hues: readonly string[];
  readonly sky: readonly string[];
  readonly orb: string | undefined;
  readonly orbSlit?: boolean;
  readonly pool: string | undefined;
  readonly haze: number;
  readonly shadow: number;
}

export function derived(base: SketchColours, night: boolean): KitColours {
  const toward = (from: string, to: string, share: number): string => mixHex(from, to, share);
  const { ink, paper } = base;
  const roles: Record<string, string> = {
    ink,
    paper,
    grass: base.grass,
    grassHi: toward(base.grass, paper, 0.18),
    grassLo: toward(base.grass, ink, 0.22),
    soil: base.soil,
    soilLo: toward(base.soil, ink, 0.2),
    rock: base.rock,
    rockLo: toward(base.rock, ink, 0.22),
    path: base.path,
    pathLo: toward(base.path, ink, 0.2),
    cobble: base.cobble,
    cobbleLo: toward(base.cobble, ink, 0.24),
    plaster: base.plaster,
    plasterHi: toward(base.plaster, paper, 0.3),
    timber: base.timber,
    timberDk: toward(base.timber, ink, 0.3),
    wood: base.wood,
    woodHi: toward(base.wood, paper, 0.25),
    woodDk: toward(base.wood, ink, 0.28),
    slate: base.slate,
    slateDk: toward(base.slate, ink, 0.5),
    stone: base.stone,
    glass: base.glass,
    glint: toward(base.glass, paper, 0.3),
    lamp: base.lamp,
    lampHi: toward(base.lamp, paper, 0.6),
    accent: base.accent,
    err: base.err,
    leaf: base.leaf,
    leafHi: toward(base.leaf, paper, 0.25),
    leafLo: toward(base.leaf, ink, 0.22),
    chalk: base.chalk,
    smoke: base.smoke,
    gold: night ? gold.night : gold.day,
    goldHi: toward(night ? gold.night : gold.day, paper, 0.55),
    goldDk: toward(night ? gold.night : gold.day, ink, 0.38),
    ...(base.star === undefined ? {} : { star: base.star }),
    ...(base.pool === undefined ? {} : { pool: base.pool }),
  };
  return {
    night,
    roles,
    hues: base.hues,
    ramps: { slate: base.slate, accent: base.accent },
    sky: base.sky,
    orb: base.orb,
    orbSlit: base.orbSlit === true,
    star: base.star,
    pool: base.pool,
    haze: base.haze,
    shadow: base.shadow,
  };
}
