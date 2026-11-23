import type { Annex } from "../../kit.ts";
import { box, filled, type Paint, sameSides } from "./shapes.ts";

export interface SignPlace {
  readonly left: number;
  readonly front: number;
  readonly height: number;
  readonly lit: boolean;
  readonly brass: boolean;
}

export const longestSign = 10;
export const letterPitch = 6;
export const signWidth = 5;
export const signDepth = 2;

export function signName(name: string | undefined): string {
  return [...(name ?? "").toUpperCase()]
    .map((letter) => (letter === "_" || letter === "." || letter === " " ? "-" : letter))
    .filter((letter) => Object.hasOwn(font, letter))
    .join("");
}

export function nameSign(name: string | undefined, place: SignPlace): Annex | undefined {
  const text = signName(name);
  const room = Math.min(longestSign, Math.floor((place.height - 15) / letterPitch));
  if (text === "" || text.length > room) return undefined;
  const tall = text.length * letterPitch + 1;
  const top = place.height - 2;
  const edge = place.brass ? "trim" : "timberDk";
  const face: Paint = (brush, width, height) => {
    brush.rect(0, 0, width, height, "timberDk");
    brush.rect(0, 0, width, 1, edge);
    brush.rect(0, height - 1, width, 1, edge);
    if (width < signWidth) return;
    [...text].forEach((letter, index) => {
      [...(font[letter] ?? "")].forEach((row, line) => {
        for (let bit = 0; bit < 3; bit += 1) {
          if ((Number(row) & (4 >> bit)) === 0) continue;
          brush.rect(1 + bit, 1 + index * letterPitch + line, 1, 1, place.lit ? "hue.h" : "hue.m");
        }
      });
    });
  };
  return {
    what: "sign",
    x: place.left + signWidth / 2,
    z: place.front + signDepth / 2,
    parts: [
      box(
        place.left,
        place.left + signWidth,
        top - tall,
        top,
        place.front,
        place.front + signDepth,
        { sides: sameSides(face, `name-sign|${text}|${place.lit}|${edge}`), top: filled(edge) },
      ),
    ],
  };
}

const font: Readonly<Record<string, string>> = {
  A: "25755",
  B: "65656",
  C: "34443",
  D: "65556",
  E: "74647",
  F: "74644",
  G: "34553",
  H: "55755",
  I: "72227",
  J: "11152",
  K: "55655",
  L: "44447",
  M: "57755",
  N: "65555",
  O: "25552",
  P: "65644",
  Q: "25563",
  R: "65655",
  S: "34216",
  T: "72222",
  U: "55557",
  V: "55552",
  W: "55775",
  X: "55255",
  Y: "55222",
  Z: "71247",
  "0": "75557",
  "1": "26227",
  "2": "61247",
  "3": "61216",
  "4": "55711",
  "5": "74616",
  "6": "34652",
  "7": "71222",
  "8": "25252",
  "9": "25316",
  "-": "00700",
};
