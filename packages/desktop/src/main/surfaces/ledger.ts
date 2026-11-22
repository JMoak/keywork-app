import type { ScreenRect, SurfaceMover } from "./channels.ts";

export interface MoveLedger {
  hostSends(bounds: ScreenRect): void;
  hostPlaces(bounds: ScreenRect, place: () => void): void;
  grabbed(): void;
  released(): void;
  moverOf(seen: () => ScreenRect, gliding: () => boolean): SurfaceMover;
}

export const placementSlack = 1;
export const placementsRemembered = 64;

export function moveLedger(): MoveLedger {
  let placing = false;
  let held = false;
  let awaited: ScreenRect[] = [];

  const confirm = (bounds: ScreenRect): boolean => {
    const at = awaited.findLastIndex((placed) => near(placed, bounds));
    if (at !== -1) awaited = awaited.slice(at);
    return at !== -1;
  };

  const hostSends = (bounds: ScreenRect): void => {
    held = false;
    awaited = [...awaited, bounds].slice(-placementsRemembered);
  };

  return {
    hostSends,
    hostPlaces: (bounds, place) => {
      hostSends(bounds);
      placing = true;
      try {
        place();
      } finally {
        placing = false;
      }
    },
    grabbed: () => {
      held = true;
    },
    released: () => {
      held = false;
    },
    moverOf: (seen, gliding) => {
      if (placing) return "host";
      if (held) return "keeper";
      return confirm(seen()) || gliding() ? "host" : "keeper";
    },
  };
}

function near(placed: ScreenRect, seen: ScreenRect): boolean {
  return (
    Math.abs(placed.x - seen.x) <= placementSlack &&
    Math.abs(placed.y - seen.y) <= placementSlack &&
    Math.abs(placed.width - seen.width) <= placementSlack &&
    Math.abs(placed.height - seen.height) <= placementSlack
  );
}
