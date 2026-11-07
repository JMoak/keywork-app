import { type Part, part } from "./sprite.ts";

export type GoggleState = "up" | "down" | "fogged";
export type EyeState = "open" | "glint" | "closed" | "happy" | "x";
export type BellTilt = -1 | 0 | 1;

export const head = part("head", 13, 9, [
  "...........l...........",
  ".....cccccclcccccc.....",
  "....ccccccclccccccc....",
  "...cccccccclcccccccc...",
  "..ccccccccclccccccccc..",
  ".cccccccccclcccccccccc.",
  "ccccccccccccccccccccccc",
  "ccccccccccccccccccccccc",
  "ccccccccccccccccccccccc",
  "ccccccccccccccccccccccc",
  "ccccccccccccccccccccccc",
  "ccccccccccccccccccccccc",
  "cccccclllllllllllcccccc",
  "ccccclllllllllllllccccc",
  "ccccclllllllllllllccccc",
  ".cccclllllllllllllcccc.",
  "..ssclllllllllllllcss..",
  "...sscllllsssllllcss...",
  "....sssllllllllllsss...",
  "......ssslllllsss......",
]);

export const horn = part("horn", 12, 2, [
  "o......",
  "oo.....",
  ".h.....",
  "..h....",
  "..ll...",
  "...ll..",
  "...lll.",
  ".....ll",
]);

export const ear = part("ear", 8, 18, ["....c", "csscc", "csscc", "ccccc", "....c"]);

export const earFlick = part("ear-flick", 8, 16, [
  ".c...",
  ".cc..",
  "csscc",
  "csscc",
  ".cccc",
  "....c",
]);

export const beard = part("beard", 23, 29, ["lll", ".l.", ".l."]);

export const torso = part(
  "torso",
  16,
  29,
  [
    "....sssssssss....",
    "....ccccccccc....",
    "....ccccccccc....",
    "...ccccccccccc...",
    ".ccccccccccccccc.",
    ".ccccccccccccccc.",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    "ccccccccccccccccc",
    ".ccccccccccccccc.",
    ".ccccccccccccccc.",
  ],
  { rows: [6, 14], cols: [1, 15] },
);

export const legsStand = part("legs-stand", 17, 46, [
  ".cccc.....cccc.",
  ".wwww.....wwww.",
  ".dddd.....dddd.",
  "dddd.......dddd",
]);

export const legsTiptoe = part("legs-tiptoe", 17, 45, [
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".wwww.....wwww.",
  ".dddd.....dddd.",
  "..ddd.....ddd..",
]);

export const legsSit = part("legs-sit", 17, 40, [
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".cccc.....cccc.",
  ".wwww.....wwww.",
  ".dddd.....dddd.",
  "dddd.......dddd",
]);

export const legsHaunch = part("legs-haunch", 8, 44, [
  "......ccccc...........ccccc......",
  "....cccccc.............cccccc....",
  "..cccccc.................cccccc..",
  ".wwwww.....................wwwww.",
  "ddddd.......................ddddd",
  "ddddd.......................ddddd",
]);

export const walkLegs: readonly Part[] = [
  part("legs-walk-contact", 13, 46, [
    "....cccc......cccc.....",
    "...wwww........wwww....",
    "..dddd..........dddd...",
    ".dddd............dddd..",
  ]),
  part("legs-walk-down", 13, 46, [
    "....cccc......cccc.....",
    "....wwww......wwww.....",
    "...dddd........dddd....",
    "...dddd........dddd....",
  ]),
  part("legs-walk-pass", 13, 45, [
    ".....cccc....cccc......",
    ".....cccc....wwww......",
    ".....wwww....dddd......",
    ".....dddd....dddd......",
    ".....dddd..............",
  ]),
  part("legs-walk-up", 13, 46, [
    "....cccc......cccc.....",
    "...wwww........wwww....",
    "...dddd........dddd....",
    "..dddd..........dddd...",
  ]),
];

export const armDown = part("arm-down", 12, 36, [
  "...c",
  ".ccc",
  "cccc",
  "cccc",
  "cccc",
  "cccc",
  ".sss",
]);

export const armSwing = part("arm-swing", 11, 36, [
  "....c",
  "..ccc",
  ".cccc",
  "cccc.",
  "cccc.",
  "cccc.",
  ".sss.",
]);

export const armRaise = part("arm-raise", 10, 9, [
  "sss...",
  "ccc...",
  "ccc...",
  ...Array.from({ length: 16 }, () => ".ccc.."),
  ...Array.from({ length: 5 }, () => "..ccc."),
  ...Array.from({ length: 4 }, () => "...ccc"),
]);

export const armAcross = part("arm-across", 13, 26, [
  ".......................sss",
  ".....................ccccc",
  "..................cccccc..",
  "...............cccccc.....",
  "............cccccc........",
  ".........cccccc...........",
  "......cccccc..............",
  "...cccccc.................",
  ".ccccc....................",
  "cccc......................",
  "ccc.......................",
]);

export const armUp = part("arm-up", 8, 24, [
  ".sss....",
  "cccc....",
  "cccc....",
  ".ccc....",
  ".ccc....",
  "..ccc...",
  "..ccc...",
  "...ccc..",
  "...ccc..",
  "....ccc.",
  "....ccc.",
  ".....ccc",
  ".....ccc",
]);

export const armOut = part("arm-out", 5, 33, [
  "sss........",
  "cccccc.....",
  "..ccccccc..",
  ".....cccccc",
  "........ccc",
]);

export const armHalf = part("arm-half", 9, 31, [
  "sss....",
  "ccc....",
  "ccc....",
  ".cc....",
  ".cc....",
  ".cc...c",
  ".cc.ccc",
  ".cccccc",
  "..ccccc",
  "...cccc",
  "...cccc",
  "....ccc",
]);

export const armHug = part("arm-hug", 13, 36, ["ccc....", ".cccc..", "...cccs", "....sss"]);

export const armReach = part("arm-reach", 6, 35, [
  "........cccc",
  ".....ccccccc",
  "sscccccc....",
  "ss..........",
]);

export const armHip = part("arm-hip", 9, 36, [
  "......c",
  "....ccc",
  "..cccc.",
  ".ccc...",
  ".cc....",
  ".ccc...",
  "..cccc.",
  "....ccc",
]);

export const armDust = part("arm-dust", 13, 36, ["ccc....", ".cccc..", "...ccss", "....css"]);

export const armLap = part("arm-lap", 12, 36, [
  "...c....",
  ".ccc....",
  "cccc....",
  "cccc....",
  "cccc....",
  ".ccc....",
  "..cccc..",
  "....cccs",
  ".....sss",
]);

export const apron = part(
  "apron",
  18,
  32,
  [
    ".o.........o.",
    ".o.........o.",
    ".o.........o.",
    "..ggggggggg..",
    "..ggggggggg..",
    "..ggggggggg..",
    ".dddddhddddd.",
    "ggggggggggggg",
    "ggggggggggggg",
    "gggwwwwwwwggg",
    "gggwgggggwggg",
    "gggwgggggwggg",
    "gggwwwwwwwggg",
    "ddddddddddddd",
  ],
  { rows: [7, 8], cols: [3, 9] },
);

export const pocketFull = part("pocket-full", 20, 40, [
  "..wwwww..",
  ".wpppppw.",
  "wpppppppw",
  "wpppppppw",
  ".wwwwwww.",
]);

export const eyes: Readonly<Record<EyeState, Part>> = {
  open: part("eyes-open", 19, 17, ["oo.......oo", "oo.......oo"]),
  glint: part("eyes-glint", 19, 17, ["ho.......ho", "oo.......oo"]),
  closed: part("eyes-closed", 19, 18, ["oo.......oo"]),
  happy: part("eyes-happy", 18, 17, [".o.........o.", "o.o.......o.o"]),
  x: part("eyes-x", 18, 16, ["o.o.......o.o", ".o.........o.", "o.o.......o.o"]),
};

export function goggles(state: GoggleState, glint: 0 | 1 | 2 = 0): Part {
  const glass = state === "fogged" ? "ppp" : `${"www".slice(0, glint)}p${"www".slice(glint + 1)}`;
  if (state === "up") {
    return part("goggles-up", 17, 11, [
      "ggggg.....ggggg",
      `g${glass}gooooog${glass}g`,
      "ggggg.....ggggg",
    ]);
  }
  const lens = `g${glass}g`;
  return part(`goggles-${state}`, 16, 15, [
    ".ggggg.....ggggg.",
    `d${lens}ddddd${lens}d`,
    `.${lens}.....${lens}.`,
    `.${lens}.....${lens}.`,
    ".ggggg.....ggggg.",
  ]);
}

export const hammerBelt = part("hammer-belt", 7, 40, [
  "ddddd",
  "ddddd",
  "ddddd",
  "..w..",
  "..w..",
  "..w..",
  "..w..",
]);

export const hammerSwing = part("hammer-swing", 0, 0, ["ddd.....", "dddwwwww", "ddd....."]);

export const hammerHeld = part("hammer-held", 0, 0, [
  "ddddd",
  "ddddd",
  "ddddd",
  "..w..",
  "..w..",
  "..w..",
  "..w..",
  "..w..",
  "..w..",
]);

export const hammerGround = part("hammer-ground", 41, 47, ["......ddd", "wwwwwwddd", "......ddd"]);

export const chisel = part("chisel", 0, 0, ["ddwww"]);

export const bench = part("bench", 1, 36, [
  "wwwwwwwwww",
  "gggggggggg",
  "gggggggggg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
  "gg......gg",
]);

export const workpiece = part("workpiece", 3, 33, [".ggg.", "ggggg", "ggggg"]);

export const anvil = part("anvil", 1, 38, [
  "ddddddddd",
  "ddddddddd",
  "...ddd...",
  "...ddd...",
  "...ddd...",
  ".ddddddd.",
  ".ddddddd.",
  "..wwwww..",
  "..wwwww..",
  "..wwwww..",
  "..wwwww..",
  "..wwwww..",
]);

export const spark = part("spark", 0, 0, ["*.", ".*"]);

export const shavings: readonly Part[] = [
  part("shaving-1", 3, 35, ["p"]),
  part("shaving-2", 2, 34, ["p.", "pp"]),
  part("shaving-3", 1, 33, [".pp", "p.p", "pp."]),
  part("shaving-dropped", 1, 48, ["pp.", ".pp"]),
];

export const rope = part("rope", 7, 9, [...Array.from({ length: 14 }, () => ".w."), "www", "www"], {
  rows: [2, 12],
  cols: [1, 1],
});

export function bell(tilt: BellTilt, ringing: boolean): Part {
  const tone = ringing ? "@" : "w";
  const still = [
    "....w....",
    "...www...",
    "..wwwww..",
    "..wwwww..",
    ".wwwwwww.",
    "wwwwwwwww",
    "....d....",
  ];
  const leaning = [
    ".....w...",
    "....www..",
    "...wwww..",
    "..wwwww..",
    ".wwwwww..",
    "wwwwww...",
    "wwww.....",
    ".d.......",
  ];
  const rows = tilt === 0 ? still : tilt > 0 ? leaning : leaning.map(reversed);
  return part(
    `bell-${tilt}`,
    4,
    1,
    rows.map((row) => row.replaceAll("w", tone)),
  );
}

function reversed(row: string): string {
  return [...row].reverse().join("");
}

export const crate = part("crate", 18, 29, [
  "ppppppppppppp",
  "wwwwwwwwwwwww",
  "wdddddddddddw",
  "wwwwwwwwwwwww",
  "wwwwwwwwwwwww",
  "wdddddddddddw",
  "wwwwwwwwwwwww",
  "wwwwwwwwwwwww",
  "ddddddddddddd",
]);

export const sheet = part("sheet", 19, 30, [
  "ppppppppppp",
  "pddddddpppp",
  "ppppppppppp",
  "pdddddddddp",
  "ppppppppppp",
  "pddddddpppp",
  "ppppppppppp",
  "ppppppppppp",
]);

export const sheetTurning = part("sheet-turning", 19, 30, [
  "pppppppwwww",
  "pddddddwwww",
  "pppppppwwww",
  "pddddddwwww",
  "pppppppwwww",
  "pddddddwwww",
  "pppppppwwww",
  "pppppppwwww",
]);

export const plankHeld = part("plank-held", 10, 33, [
  "wwwwwwwwwwwwwwwwwwwwwwwwww",
  "wdddddddddddddddddddddddww",
  "wwwwwwwwwwwwwwwwwwwwwwwwww",
]);

export const post = part("post", 3, 35, [
  "www",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "wdw",
  "www",
]);

export const stool = part("stool", 15, 46, [
  "wwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwww",
  "gg...............gg",
  "gg...............gg",
]);

export const sweat: readonly Part[] = [
  part("sweat-1", 34, 14, ["p"]),
  part("sweat-2", 34, 15, ["p", "p"]),
  part("sweat-3", 34, 16, [".p", "pp"]),
];

export const hay = part("hay", 4, 42, [
  "........p......................p........",
  ".......ppw.........p..........ppw.......",
  "......wwww........pw.........wwww.......",
  "...wwwwwwww.....wwwww......wwwwwww......",
  ".wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
  "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
]);

export const napBody = part(
  "nap-body",
  12,
  39,
  [
    "..........ccccccccccc......",
    ".......ccccccccccccccccc...",
    ".....ccccccccccccccccccccc.",
    "...cccccccccccccccccccccccc",
    "..ccccccccgggggggcccccccccc",
    ".cccccccccgggggggcccccccccc",
    "ccccccccccgggggggcccccccccc",
    "cccccccccccccccccccccccccc.",
    "clllllllllllllllllllllllcc.",
    "..dddd..llllllllllllllllc..",
    "..dddd...................ll",
  ],
  { rows: [3, 7], cols: [4, 22] },
);

export const napHead = part("nap-head", 5, 34, [
  "...............lhh.",
  ".........llllllll..",
  "......cccccccc.....",
  "....cccccccccc.....",
  "...ccccccccccc.....",
  "..llcccccccccc.....",
  ".llllccccccccsc....",
  ".lllllcccccccsc....",
  "..llllccccccsss....",
  "...lllssssssss.....",
  "....lssss..........",
  ".....l.............",
]);

export const napEyes = part("nap-eyes", 10, 40, ["ooo"]);
