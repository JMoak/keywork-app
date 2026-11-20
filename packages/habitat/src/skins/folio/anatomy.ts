import { type Placement, place } from "../kid/cell.ts";
import type { Part } from "../kid/sprite.ts";
import { indexOfGlyph } from "../legend.ts";
import { cut } from "./parts.ts";

export type Offset = readonly [x: number, y: number];
export type LeafPosture = keyof typeof leafMotion;

export interface DragonPose {
  readonly wing?: LeafPosture;
  readonly wingY?: number;
  readonly bodyY?: number;
  readonly head?: Offset;
  readonly eye?: "open" | "closed" | "troubled";
  readonly fore?: Offset;
  readonly hind?: Offset;
  readonly claw?: boolean;
  readonly tail?: number;
  readonly tucked?: boolean;
}

export function leafDragon(pose: DragonPose = {}): Placement[] {
  const bodyY = pose.bodyY ?? 0;
  const [headX, headY] = pose.head ?? [0, 0];
  const [foreX, foreY] = pose.fore ?? [0, 0];
  const [hindX, hindY] = pose.hind ?? [0, 0];
  const leaves = canopies[pose.wing ?? "bound"];
  const neck = bentNeck(headX, headY);
  return [
    place(leaves.far, { dy: bodyY, layer: "behind" }),
    place(leaves.near, { dy: bodyY + (pose.wingY ?? 0), layer: "behind" }),
    place(farPaw, { dx: foreX, dy: Math.min(0, foreY), layer: "behind" }),
    place(pose.tucked ? restingTail : tail, {
      dy: Math.min(1, bodyY + (pose.tail ?? 0)),
      layer: "skin",
    }),
    place(flank, { dy: bodyY, layer: "skin" }),
    place(haunch, { dx: hindX, dy: hindY, layer: "skin" }),
    place(neck, { dy: bodyY, layer: "skin" }),
    place(skull, { dx: headX, dy: bodyY + headY, layer: "skin" }),
    place(pose.claw ? liftedPaw : forepaw, { dx: foreX, dy: foreY, layer: "skin" }),
    place(eyes[pose.eye ?? "open"], { dx: headX, dy: bodyY + headY, outline: false }),
  ];
}

export function sleepingDragon(inhale: boolean): Placement[] {
  return [
    place(restingTail, { dy: 1 }),
    place(sleepingPaws),
    place(flank, { dy: 2 }),
    place(skull, { dx: -2, dy: 19 }),
    place(eyes.closed, { dx: -2, dy: 19, outline: false }),
    place(sleepingLeaves.far),
    place(sleepingLeaves.near, { dy: inhale ? -1 : 0 }),
  ];
}

const farLeaf = veined(
  "far leaf",
  3,
  10,
  [
    "..................hhhh",
    "...............hhhhhl",
    "............hhhhllll",
    "..........hhhllllll",
    ".........hhlllllll",
    "........hhlllllll",
    ".......hhlllllll",
    ".......hlllllllc",
    "......hhllllllc",
    "......hllllllcc",
    "....l.hlllllcc",
    "...hlhllllllc",
    "...hlllllllcc",
    "..hlllllllcc",
    "..hllllllccc",
    ".hhlllllcccs",
    ".hllllllcccs",
    "hhlllllcccss",
    "hlllllcccsss",
    "hlllllcccsss",
    "hllllcccsss",
    ".lllccccss",
    ".lllccccs",
    "..lccccss",
    "...ccccss",
    "....cccss",
    "....cccss",
    ".....ccss",
    "......css",
    ".......ss",
    ".......s",
  ],
  [
    [
      [10, 39],
      [9, 30],
      [11, 23],
      [15, 16],
      [23, 10],
    ],
    [
      [9, 30],
      [6, 27],
      [4, 23],
    ],
    [
      [10, 27],
      [14, 24],
      [16, 21],
    ],
    [
      [12, 21],
      [10, 18],
      [11, 15],
    ],
    [
      [14, 18],
      [18, 17],
      [19, 16],
    ],
  ],
);

const nearLeaf = veined(
  "near leaf",
  22,
  10,
  [
    "............hhhh",
    "..........hhhhl",
    "........hhhlll",
    "........hllll",
    ".......hllll",
    ".......lllll",
    "........llllh",
    ".......llllllh",
    ".......lllllll",
    "......lllllll....h",
    "......llllll....hhl",
    "......llllllhhhllll",
    ".....llllllllllllllc",
    ".....lllllllllllllllc",
    ".....llllllllllllllll",
    ".....lllllllllllllllll",
    "....lllllllllllccccccc",
    "....lllllllccccccc",
    "....lllllccccccccc",
    "...llllcccccccccc",
    "..lllccccccccccc",
    "..lccccccccccccc..c",
    "..lcccccccccccccccc",
    ".lcccccccccccccccs",
    ".ccccccccccccccss",
    ".ccccccccccccsss",
    "cccssss..cccsss",
    "csss......csss",
    "ss.........ss",
  ],
  [
    [
      [22, 37],
      [26, 30],
      [31, 24],
      [33, 17],
      [35, 12],
    ],
    [
      [23, 36],
      [27, 30],
      [31, 25],
    ],
    [
      [25, 31],
      [25, 25],
      [24, 22],
    ],
    [
      [27, 29],
      [34, 29],
      [39, 32],
    ],
    [
      [30, 25],
      [36, 23],
      [42, 24],
    ],
    [
      [31, 23],
      [28, 20],
      [27, 15],
    ],
    [
      [33, 18],
      [36, 17],
    ],
  ],
);

const skull = cut("slender horned skull", 9, 15, [
  "...........D.....D",
  "..........DD....DD",
  ".........wD...pDD",
  "........ww..wwDD",
  "......EpppppwDDD",
  "....ppppppwww..DD",
  "..ppppppppppwwDD",
  "pppppppppppww..D",
  "pwwpppppppww..D",
  ".wwpppwwwgwwg",
  "...ggggg..wgg",
]);

const eyes = {
  open: cut("quiet eye", 15, 20, [".ow", "o*o"]),
  closed: cut("sleeping eye", 15, 20, ["...", "oog"]),
  troubled: cut("lowered brow", 15, 20, ["ow.", ".oo"]),
};

const neck = cut("curved cream throat", 12, 22, [
  "......pppEF",
  ".......ppwE",
  ".......ppwE",
  "......pppwE",
  "......ppwwE",
  ".....pppwEE",
  "....ppppwE",
  "...ppppwEE",
  "..ppppwwE",
  ".pppppwEE",
  ".ppppwwE",
  "pppppwEE",
  "ppppwEE",
  "ppgpwEF",
  "pwwppE",
  ".ppppE",
  ".wpppwE",
  "..wwpppE",
  "...gwpppw",
  "....ggwww",
]);

const flank = cut("cream and lichen flank", 16, 35, [
  "..EE",
  ".ppEEEF",
  "wpppEppEE",
  "pppppppEEFF",
  "pppppwwppEEFF",
  "wppwwwwppppEEE",
  "wwwwggggwpppEE",
  ".wwggggggwpppEE",
  "..ggggddddgwppE",
  "....gddddddgwpp",
  "........ddggwwp",
]);

const haunch = cut("rounded haunch", 23, 40, [
  "....EE",
  "..ppppEE",
  ".pppppEEw",
  "pppppppww",
  "ppppppwww",
  ".wpppwwwg",
  "..wppwwg",
  "...wwpww",
  "..wwppww",
  "ppppwwgg",
]);

const forepaw = cut("near paw", 13, 39, [
  "...ppww",
  "...ppww",
  "...wppw",
  "...wppw",
  "...wppg",
  "...wpwg",
  "..wwpwg",
  "..wppg",
  ".wppwg",
  "ppppwg",
  "pwppgg",
]);

const farPaw = cut("far paw", 8, 38, [
  ".....ggg",
  ".....wgg",
  ".....wgg",
  ".....wgg",
  ".....wwg",
  "....wwgg",
  "....wwg",
  "...pwwg",
  "..pwwg",
  ".pwwgg",
  "wwwgg",
  "wwgg",
]);

const liftedPaw = cut("curled forepaw", 10, 37, [
  "......pp",
  ".....ppw",
  ".p...pwg",
  "pppwwwg",
  ".wppwg",
  "..ggg",
]);

const tail = cut("curled teal-backed tail", 27, 35, [
  "...........pppw",
  ".........pppEEpw",
  "........pgE...gpw",
  ".......pg......gpw",
  ".......g........pw",
  "................pw",
  "...............gpw",
  "...............Epw",
  "EE............Epww",
  "pEE.........EEppw",
  "pppEEEE..EEEpppww",
  "wpppEEpEEppppwww",
  ".wwwppppppwwwwg",
  "...ggwwwwwwwgg",
]);

const restingTail = cut("tucked tail", 28, 42, [
  ".......Epww",
  "......Ew..pw",
  "......g...pw",
  "EE.......Epw",
  "pEE.....Epww",
  "pppEEEEEpwwg",
  ".wwpppppwwg",
]);

const sleepingPaws = cut("tucked paws", 12, 46, [
  "..wwgg.......wwgg",
  ".pwwwgg...pppwwgg",
  "pppwwgg..ppppwwgg",
  "pwppgg...pwppwwg",
]);

const leafMotion = {
  bound: [
    [1, 1, 0],
    [1, 1, 0],
  ],
  ease: [
    [0.94, 1.03, 1],
    [1, 1.04, -1],
  ],
  listening: [
    [0.72, 1.22, 3],
    [0.74, 1.23, -2],
  ],
  spread: [
    [1.06, 1.04, 1],
    [1.04, 1.05, -1],
  ],
  sweep: [
    [0.94, 0.71, 2],
    [1, 0.76, 2],
  ],
  low: [
    [0.89, 0.5, 3],
    [1.03, 0.43, 2],
  ],
  buckled: [
    [0.76, 0.68, 4],
    [0.75, 0.72, -6],
  ],
} as const;

type LeafTransform = readonly [width: number, height: number, lean: number];
type Canopy = { readonly far: Part; readonly near: Part };

const canopies = Object.fromEntries(
  Object.entries(leafMotion).map(([name, [far, near]]) => [
    name,
    { far: bendLeaf(farLeaf, far, [10, 39]), near: bendLeaf(nearLeaf, near, [22, 37]) },
  ]),
) as Record<LeafPosture, Canopy>;
const sleepingLeaves = {
  far: bendLeaf(farLeaf, [0.64, 0.22, 6], [10, 39], [14, 44]),
  near: bendLeaf(nearLeaf, [0.93, 0.36, -7], [22, 37], [18, 47]),
};

function bentNeck(dx: number, dy: number): Part {
  if (dx === 0 && dy === 0) return neck;
  const height = Math.max(5, neck.sprite.height - dy);
  const padding = Math.abs(dx);
  const width = neck.sprite.width + padding;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const share = y / (height - 1);
    const sourceY = Math.round(share * (neck.sprite.height - 1));
    const shift = Math.round(dx * (1 - share)) - Math.min(0, dx);
    const start = sourceY * neck.sprite.width;
    pixels.set(neck.sprite.pixels.subarray(start, start + neck.sprite.width), y * width + shift);
  }
  return {
    name: neck.name,
    x: neck.x + Math.min(0, dx),
    y: neck.y + dy,
    sprite: { width, height, pixels },
  };
}

function bendLeaf(
  leaf: Part,
  [scaleX, scaleY, lean]: LeafTransform,
  hinge: Offset,
  destination = hinge,
): Part {
  if (scaleX === 1 && scaleY === 1 && lean === 0 && destination === hinge) return leaf;
  const [hx, hy] = hinge;
  const height = Math.max(1, Math.round(leaf.sprite.height * scaleY));
  const top = destination[1] + Math.round((leaf.y - hy) * scaleY);
  const left = destination[0] + Math.round((leaf.x - hx) * scaleX) + Math.min(lean, 0);
  const width = Math.ceil(leaf.sprite.width * scaleX) + Math.abs(lean);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(leaf.sprite.height - 1, Math.floor(y / scaleY));
    const tilt = Math.round(lean * (1 - y / (height - 1))) - Math.min(lean, 0);
    for (let x = tilt; x < width; x += 1) {
      const sourceX = Math.floor((x - tilt) / scaleX);
      if (sourceX < leaf.sprite.width)
        pixels[y * width + x] = leaf.sprite.pixels[sourceY * leaf.sprite.width + sourceX] ?? 0;
    }
  }
  return { name: leaf.name, x: left, y: top, sprite: { width, height, pixels } };
}

function veined(
  name: string,
  x: number,
  y: number,
  rows: readonly string[],
  veins: readonly (readonly Offset[])[],
): Part {
  const leaf = cut(name, x, y, rows);
  const amber = indexOfGlyph("D");
  for (const branch of veins) {
    branch.slice(1).forEach(([bx, by], i) => {
      const [ax, ay] = branch[i] as Offset;
      const length = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let tick = 0; tick <= length; tick += 1) {
        const px = Math.round(ax + ((bx - ax) * tick) / length) - x;
        const py = Math.round(ay + ((by - ay) * tick) / length) - y;
        const at = py * leaf.sprite.width + px;
        if (px >= 0 && px < leaf.sprite.width && leaf.sprite.pixels[at])
          leaf.sprite.pixels[at] = amber;
      }
    });
  }
  return leaf;
}
