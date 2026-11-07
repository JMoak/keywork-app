import { hashSeed, mulberry32 } from "@keywork-app/habitat";

export const plainNames: readonly string[] = [
  "Wren",
  "Tam",
  "Moss",
  "Bram",
  "Ida",
  "Fen",
  "Rook",
  "Nell",
  "Oda",
  "Pim",
  "Hal",
  "Lark",
  "Kit",
  "Mab",
  "Ned",
  "Rue",
  "Sol",
  "Tove",
  "Una",
  "Wil",
  "Ash",
  "Bea",
  "Cob",
  "Dun",
  "Elm",
  "Juno",
  "Quin",
  "Pell",
  "Osk",
  "Vey",
];

export const nameLimit = 64;
export const proposalCount = 3;

export function proposeNames(
  seed: string,
  pool: readonly string[] = plainNames,
  count = proposalCount,
): string[] {
  const random = mulberry32(hashSeed(seed, "names"));
  const left = [...pool];
  const picked: string[] = [];
  while (picked.length < count && left.length > 0) {
    const [name] = left.splice(Math.floor(random() * left.length), 1);
    if (name !== undefined) picked.push(name);
  }
  return picked;
}

export function nameOf(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length === 0 || trimmed.length > nameLimit ? undefined : trimmed;
}

export function slugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
