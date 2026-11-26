import type { SteadPlace } from "@keywork-app/protocol";
import type { Rect } from "../../../layout/index.ts";

export interface PlaceSource {
  onPage(place: SteadPlace): Rect | undefined;
  face?(place: SteadPlace, creature: string | null): Promise<void> | undefined;
}

export interface SteadPlaceBoard {
  stand(source: PlaceSource): () => void;
  onPage(place: SteadPlace): Rect | undefined;
  face(place: SteadPlace, creature: string | null): Promise<void> | undefined;
}

export function createSteadPlaceBoard(): SteadPlaceBoard {
  const standing: PlaceSource[] = [];
  const newestFirst = (): PlaceSource[] => [...standing].reverse();
  return {
    stand: (source) => {
      standing.push(source);
      return () => {
        const at = standing.indexOf(source);
        if (at >= 0) standing.splice(at, 1);
      };
    },
    onPage: (place) => {
      for (const source of newestFirst()) {
        const found = source.onPage(place);
        if (found !== undefined) return found;
      }
      return undefined;
    },
    face: (place, creature) => {
      for (const source of newestFirst()) {
        const turning = source.face?.(place, creature);
        if (turning !== undefined) return turning;
      }
      return undefined;
    },
  };
}
