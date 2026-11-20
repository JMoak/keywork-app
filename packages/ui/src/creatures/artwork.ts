import type { Illustration } from "@keywork-app/habitat/render";
import cairn from "./assets/illustrations/cairn.png?url";
import folio from "./assets/illustrations/folio.png?url";
import tessera from "./assets/illustrations/tessera.png?url";

export function artworkFor(skin: string): Illustration | undefined {
  return artwork.get(skin);
}

const footprint = { width: 48, height: 52, groundLine: 51 };
const artwork = new Map<string, Illustration>([
  [
    "folio",
    {
      id: "folio-illustrated-v1",
      src: folio,
      source: { width: 1122, height: 1402 },
      footprint,
      still: { x: 16, y: 96, width: 1080, height: 1120 },
      anchor: { x: 0.5, y: 1102 / 1120 },
      facing: "left",
    },
  ],
  [
    "tessera",
    {
      id: "tessera-illustrated-v1",
      src: tessera,
      source: { width: 1254, height: 1254 },
      footprint,
      still: { x: 48, y: 144, width: 1164, height: 972 },
      anchor: { x: 0.5, y: 948 / 972 },
      facing: "left",
    },
  ],
  [
    "cairn",
    {
      id: "cairn-illustrated-v1",
      src: cairn,
      source: { width: 1086, height: 1448 },
      footprint,
      still: { x: 96, y: 80, width: 908, height: 1296 },
      anchor: { x: 0.5, y: 1272 / 1296 },
      facing: "right",
    },
  ],
]);
