import type { SteadPlace } from "@keywork-app/protocol";
import type { Rect } from "../../../layout/index.ts";

export interface PlaceSource {
  onPage(place: SteadPlace): Rect | undefined;
}

export interface SteadPlaceBoard {
  stand(source: PlaceSource): () => void;
  onPage(place: SteadPlace): Rect | undefined;
}

export function createSteadPlaceBoard(): SteadPlaceBoard {
  const standing: PlaceSource[] = [];
  return {
    stand: (source) => {
      standing.push(source);
      return () => {
        const at = standing.indexOf(source);
        if (at >= 0) standing.splice(at, 1);
      };
    },
    onPage: (place) => {
      for (const source of [...standing].reverse()) {
        const found = source.onPage(place);
        if (found !== undefined) return found;
      }
      return undefined;
    },
  };
}
