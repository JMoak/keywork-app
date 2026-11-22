import type { Construction, PropSpec, SpriteArt } from "../../kit.ts";
import type { Part } from "../../model.ts";
import type { Role } from "../../texture.ts";
import { anchored, box, filled, type Paint, placed, sameSides, spriteOf } from "./shapes.ts";
import type { SketchStyle } from "./style.ts";

export const sailSteps = 8;
export const driftTicks = 8;

export function propsOf(style: SketchStyle): (spec: PropSpec) => Construction {
  return (spec) => {
    switch (spec.kind) {
      case "crate":
        return { parts: [crate(0, 0)], reach: 0 };
      case "monument":
        return spec.tier === 0
          ? { parts: [], reach: 0 }
          : { parts: [placed(spec.tier === 1 ? stone() : statue(), 0, 0, 0)], reach: 0 };
      case "tree":
        return { parts: [placed(style.piers ? planter() : tree(), 0, 0, 0)], reach: 0 };
      case "well":
        return { parts: [placed(style.piers ? fountain() : well(), 0, 0, 0)], reach: 0 };
      case "road-lamp":
        return {
          parts: [placed(style.piers ? steppedLamp(spec.lit) : roadLamp(spec.lit), 0, 0, 0)],
          reach: 0,
        };
    }
  };
}

export function crate(x: number, z: number): Part {
  return box(x - 3, x + 3, 0, 5, z - 3, z + 3, {
    sides: sameSides(cratePaint, "crate"),
    top: filled("woodHi"),
  });
}

export const chimneyPaint: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "stone");
  brush.rect(0, 0, width, 1, "ink");
  brush.rect(0, 3, width, 1, "slateDk");
};

export function smoke(): SpriteArt {
  return spriteOf(
    Array.from({ length: 12 }, (_, tick) =>
      anchored(`smoke|${tick}`, -3, -18, 7, 18, (put) => {
        for (let puff = 0; puff < 3; puff += 1) {
          const age = (tick + puff * 4) % 12;
          const size = age < 5 ? 2 : 3;
          put(-1 + (((age >> 1) + puff) % 3) - 1, -age - 3, size, size, "smoke");
        }
      }),
    ),
    Array.from({ length: 12 }, (_, tick) => tick),
  );
}

export function flag(): SpriteArt {
  return spriteOf(
    [0, 1].map((wave) =>
      anchored(`flag|${wave}`, 0, -11, 6, 11, (put) => {
        put(0, -9, 1, 9, "ink");
        put(1, -9 + wave, 3, 3, "hue.b");
        put(4, -8 - wave, 2, 3, "hue.b");
        put(1, -9 + wave, 3, 1, "hue.l");
      }),
    ),
    [0, 0, 1, 1],
  );
}

export function antenna(): SpriteArt {
  return spriteOf(
    ["err", "hue.h"].map((tip) =>
      anchored(`antenna|${tip}`, -1, -12, 3, 12, (put) => {
        put(0, -10, 1, 10, "ink");
        put(-1, -6, 3, 1, "ink");
        put(-1, -12, 3, 2, tip);
      }),
    ),
    [0, 0, 0, 0, 1, 1, 1, 1],
  );
}

export function vane(): SpriteArt {
  return spriteOf([
    anchored("vane", -3, -7, 7, 7, (put) => {
      put(0, -7, 1, 7, "ink");
      put(-3, -6, 7, 1, "ink");
      put(2, -7, 1, 3, "ink");
    }),
  ]);
}

export function bell(ringing: boolean): SpriteArt {
  const colour: Role = ringing ? "accent" : "lamp";
  const drawn = (swing: number) =>
    anchored(`bell|${colour}|${swing}`, -3, 0, 7, 8, (put) => {
      put(0, 0, 1, 2, "ink");
      put(-1 + swing, 1, 3, 1, colour);
      put(-2 + swing, 2, 5, 4, colour);
      put(-2 + swing, 6, 5, 1, "ink");
      put(swing, 7, 1, 1, "ink");
    });
  return ringing
    ? spriteOf([drawn(0), drawn(-1), drawn(1)], [1, 1, 2, 2], 0)
    : spriteOf([drawn(0)]);
}

export function star(): SpriteArt {
  return spriteOf([
    anchored("star", -2, -9, 5, 9, (put) => {
      put(0, -3, 1, 3, "ink");
      put(0, -9, 1, 1, "gold");
      put(-2, -8, 5, 1, "gold");
      put(-1, -7, 3, 1, "gold");
      put(-1, -6, 1, 1, "gold");
      put(1, -6, 1, 1, "gold");
      put(0, -8, 1, 1, "goldHi");
    }),
  ]);
}

export function stone(): SpriteArt {
  return spriteOf([
    anchored("stone", -3, -11, 6, 11, (put) => {
      put(-2, -9, 4, 9, "stone");
      put(-2, -9, 1, 9, "plasterHi");
      put(-3, -1, 6, 1, "slateDk");
      put(-1, -11, 2, 2, "gold");
    }),
  ]);
}

export function statue(): SpriteArt {
  return spriteOf([
    anchored("statue", -4, -15, 8, 15, (put) => {
      put(-4, -4, 8, 4, "stone");
      put(-4, -5, 8, 1, "ink");
      put(-4, -4, 8, 1, "plasterHi");
      put(-2, -12, 4, 7, "gold");
      put(-1, -14, 2, 2, "gold");
      put(-3, -11, 1, 3, "gold");
      put(2, -12, 1, 2, "gold");
      put(2, -15, 1, 3, "goldDk");
      put(-1, -14, 1, 1, "goldHi");
      put(-2, -12, 1, 6, "goldHi");
      put(1, -8, 1, 3, "goldDk");
    }),
  ]);
}

export function tree(): SpriteArt {
  return spriteOf([
    anchored("tree", -6, -34, 12, 34, (put) => {
      put(-1, -14, 3, 14, "wood");
      put(1, -14, 1, 14, "woodDk");
      put(-4, -34, 8, 2, "leafHi");
      put(-6, -32, 12, 6, "leafHi");
      put(-6, -26, 12, 8, "leaf");
      put(-5, -18, 10, 4, "leafLo");
      put(-4, -29, 2, 2, "leaf");
      put(1, -24, 3, 2, "leafHi");
      put(-5, -21, 2, 2, "leafLo");
      put(2, -30, 2, 2, "leaf");
    }),
  ]);
}

export function roadLamp(lit: boolean): SpriteArt {
  return spriteOf([
    anchored(`road-lamp|${lit}`, -1, -15, 3, 15, (put) => {
      put(0, -11, 1, 11, "ink");
      put(-1, -14, 3, 3, lit ? "lamp" : "glint");
      put(-1, -15, 3, 1, "ink");
      if (lit) put(0, -13, 1, 1, "lampHi");
    }),
  ]);
}

export function well(): SpriteArt {
  return spriteOf([
    anchored("well", -6, -16, 12, 16, (put) => {
      put(-5, -5, 10, 5, "stone");
      put(-5, -6, 10, 1, "ink");
      put(-5, -1, 10, 1, "slateDk");
      put(-5, -14, 1, 8, "woodDk");
      put(4, -14, 1, 8, "woodDk");
      put(-6, -16, 12, 2, "wood");
      put(-6, -16, 12, 1, "woodHi");
      put(0, -14, 1, 5, "ink");
    }),
  ]);
}

export function planter(): SpriteArt {
  return spriteOf([
    anchored("planter", -6, -31, 12, 31, (put) => {
      put(-4, -4, 8, 4, "stone");
      put(-4, -5, 8, 1, "trim");
      put(-1, -3, 2, 1, "trim");
      put(0, -13, 1, 8, "woodDk");
      put(-3, -31, 6, 3, "leafHi");
      put(-5, -28, 10, 5, "leafHi");
      put(-6, -23, 12, 6, "leaf");
      put(-5, -17, 10, 4, "leafLo");
      put(-3, -26, 2, 2, "leaf");
      put(2, -21, 2, 2, "leafHi");
    }),
  ]);
}

export function fountain(): SpriteArt {
  return spriteOf(
    [0, 1].map((spray) =>
      anchored(`fountain|${spray}`, -7, -15, 14, 15, (put) => {
        put(-7, -3, 14, 3, "stone");
        put(-7, -4, 14, 1, "trim");
        put(-6, -3, 12, 1, "glint");
        put(-1, -9, 2, 6, "stone");
        put(-3, -10, 6, 1, "trim");
        put(-2, -11, 4, 1, "stone");
        put(0, -14, 1, 3, "trim");
        put(-1, -15, 3, 1, "trim");
        put(-4, -9 + spray, 1, 2, "glint");
        put(3, -8 - spray, 1, 2, "glint");
      }),
    ),
    [0, 0, 0, 0, 1, 1, 1, 1],
  );
}

export function steppedLamp(lit: boolean): SpriteArt {
  return spriteOf([
    anchored(`stepped-lamp|${lit}`, -2, -17, 5, 17, (put) => {
      put(-1, -1, 3, 1, "trim");
      put(0, -11, 1, 10, "trimLo");
      put(-2, -11, 5, 1, "trim");
      put(-1, -15, 3, 4, lit ? "lamp" : "glint");
      put(-2, -16, 5, 1, "trim");
      put(-1, -17, 3, 1, "trim");
      if (lit) put(0, -14, 1, 2, "lampHi");
    }),
  ]);
}

export function sails(turning: "still" | "drift" | "quick", cloth: Role = "plaster"): SpriteArt {
  const steps = turning === "still" ? 1 : sailSteps;
  const frames = Array.from({ length: steps }, (_, step) =>
    anchored(`sails|${cloth}|${step}`, -22, -22, 45, 45, (put) => {
      const angle = (step * Math.PI) / 16;
      for (let arm = 0; arm < 4; arm += 1) {
        const theta = angle + (arm * Math.PI) / 2;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        for (let reach = 5; reach <= 18; reach += 1) {
          for (let across = 1; across <= 3; across += 1) {
            put(
              Math.round(c * reach - s * across),
              Math.round(s * reach + c * across),
              1,
              1,
              cloth,
            );
          }
        }
        for (let reach = 2; reach <= 19; reach += 1) {
          put(Math.round(c * reach), Math.round(s * reach), 1, 1, "ink");
        }
      }
      put(-1, -1, 3, 3, "ink");
    }),
  );
  if (turning === "still") return spriteOf(frames);
  const pace = turning === "quick" ? 1 : driftTicks;
  return spriteOf(
    frames,
    Array.from({ length: sailSteps * pace }, (_, tick) => Math.floor(tick / pace) % sailSteps),
    0,
  );
}

const cratePaint: Paint = (brush, width, height) => {
  brush.rect(0, 0, width, height, "wood");
  brush.rect(0, 0, width, 1, "woodHi");
  brush.rect(0, height - 1, width, 1, "woodDk");
  brush.rect(width >> 1, 1, 1, height - 2, "woodDk");
};
