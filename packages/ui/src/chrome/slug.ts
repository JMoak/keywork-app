export type SlugRole = "word" | "separator";

export interface SlugPart {
  readonly text: string;
  readonly role: SlugRole;
}

export const arcTagMark = "#";

export function arcTagParts(slug: string): SlugPart[] {
  return [{ text: arcTagMark, role: "separator" }, ...slugParts(slug)];
}

export function slugParts(slug: string): SlugPart[] {
  return slug
    .split(/(-)/)
    .filter((piece) => piece !== "")
    .map((piece) => ({ text: piece, role: piece === "-" ? "separator" : "word" }));
}
