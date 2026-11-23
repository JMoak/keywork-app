import { mixHex, overHex } from "./colour.ts";
import type { Appearance, Kit, KitColours } from "./kit.ts";
import { type FaceKey, identityOfRamp, type RampKey } from "./model.ts";
import type { Role } from "./texture.ts";

export interface BlockPalette {
  readonly key: string;
  readonly appearance: Appearance;
  readonly colours: KitColours;
  readonly background: string;
  readonly haze: string;
  readonly edge?: string | undefined;
  colourOf(
    role: Role,
    ramp: RampKey | undefined,
    light?: FaceKey | undefined,
    fog?: number,
    haze?: number,
  ): string | undefined;
}

export const rampShares = { shadow: 0.42, mid: 0.16, light: 0.3, highlight: 0.62 } as const;
export const rampSteps = ["d", "m", "b", "l", "h"] as const;
export const hazeFloor = 0.01;

export type RampStep = (typeof rampSteps)[number];

export function rampRole(step: RampStep): Role {
  return `hue.${step}`;
}

export function resolveBlockPalette(
  kit: Kit,
  appearance: Appearance,
  background: string = kit.colours[appearance].ground,
): BlockPalette {
  const colours = kit.colours[appearance];
  const ink = colours.roles.ink ?? background;
  const paper = colours.roles.paper ?? background;
  const haze = colours.sky.at(-1) ?? background;
  const ramps = new Map<string, Readonly<Record<RampStep, string>>>();
  const rampOf = (ramp: RampKey | undefined): Readonly<Record<RampStep, string>> | undefined => {
    const base = baseOfRamp(colours, ramp);
    if (base === undefined) return undefined;
    const known = ramps.get(base);
    if (known !== undefined) return known;
    const made = {
      d: mixHex(base, ink, rampShares.shadow),
      m: mixHex(base, ink, rampShares.mid),
      b: base,
      l: mixHex(base, paper, rampShares.light),
      h: mixHex(base, paper, rampShares.highlight),
    };
    ramps.set(base, made);
    return made;
  };
  const plain = (role: Role, ramp: RampKey | undefined): string | undefined => {
    const [named = role, own] = role.split("#");
    if (own !== undefined) return plain(named, own);
    const mixed = /^(.*)>([^>@]+)@([\d.]+)$/.exec(role);
    if (mixed !== null) {
      const from = plain(mixed[1] ?? "", ramp);
      const toward = plain(mixed[2] ?? "", ramp);
      return from === undefined || toward === undefined
        ? undefined
        : mixHex(from, toward, Number(mixed[3]));
    }
    const step = /^(?:hue|glow)\.([dmblh])$/.exec(role)?.[1] as RampStep | undefined;
    if (step !== undefined) return rampOf(ramp)?.[step];
    const stop = /^sky\.(\d+)$/.exec(role)?.[1];
    if (stop !== undefined) return colours.sky[Number(stop)];
    if (role === "orb") return colours.orb;
    return colours.roles[role];
  };
  const shaded = (colour: string, tone: number, fog: number): string => {
    let lit = colour;
    if (tone > 0) lit = mixHex(lit, paper, tone);
    else if (tone < 0) lit = mixHex(lit, ink, -tone);
    if (fog > 0) lit = mixHex(lit, background, fog);
    return lit;
  };
  const resolved = new Map<string, string | undefined>();
  return {
    key: `${kit.id}|${appearance}|${background}`,
    appearance,
    colours,
    background,
    haze,
    colourOf: (role, ramp, light, fog = 0, hazed = 0) => {
      const key = `${role}|${ramp ?? ""}|${light ?? ""}|${fog}|${hazed}`;
      if (resolved.has(key)) return resolved.get(key);
      const [base = "", ...washes] = role.split("~");
      const under = plain(base, ramp);
      let colour =
        under === undefined
          ? undefined
          : shaded(under, light === undefined ? 0 : kit.shading[light], fog);
      for (const wash of washes) {
        const [over = "", alpha = "0"] = wash.split("@");
        const washColour = plain(over, ramp);
        if (colour === undefined || washColour === undefined) break;
        colour = overHex(colour, shaded(washColour, 0, fog), Number(alpha));
      }
      if (colour !== undefined && hazed > hazeFloor) colour = overHex(colour, haze, hazed);
      resolved.set(key, colour);
      return colour;
    },
  };
}

function baseOfRamp(colours: KitColours, ramp: RampKey | undefined): string | undefined {
  if (ramp === undefined) return undefined;
  const identity = identityOfRamp(ramp);
  if (identity !== undefined) return colours.hues[identity % Math.max(1, colours.hues.length)];
  return colours.ramps[ramp];
}
