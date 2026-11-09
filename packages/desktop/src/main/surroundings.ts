import type { Surroundings } from "../shared/channels.ts";
import { notificationStates, type ScreenRect } from "./companion/foreground.ts";

export interface SurroundingFacts {
  readonly fullscreen: boolean;
  readonly notificationState: number | undefined;
  readonly foregroundIsOurs: boolean | undefined;
  readonly displays: number;
  readonly display: string | undefined;
  readonly coveredDisplays: readonly string[];
  readonly sharedDisplays: readonly string[];
}

export interface SurroundingsWindow {
  readonly id: number;
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  display(): string | undefined;
  send(surroundings: Surroundings): void;
}

export interface SurroundingsSeams {
  windows(): readonly SurroundingsWindow[];
  displays(): number;
  notificationState(): number | undefined;
  foregroundIsOurs(): boolean | undefined;
  coveredDisplays(): readonly string[];
  sharedDisplays(): readonly string[];
}

export interface SurroundingsRelay {
  read(window: SurroundingsWindow | undefined): Surroundings;
  push(): void;
}

export interface DisplayArea {
  readonly id: string;
  readonly bounds: ScreenRect;
}

export const unknownSurroundings: Surroundings = {
  fullscreen: false,
  fullscreenElsewhere: false,
  displayShared: false,
};

export const coverSlackDip = 1;

export function surroundingsOf(facts: SurroundingFacts): Surroundings {
  return {
    fullscreen: facts.fullscreen,
    fullscreenElsewhere: anotherAppFullscreenHere(facts),
    displayShared: presenting(facts) || sharedByTheConsole(facts),
  };
}

export function displaysCoveredBy(
  window: ScreenRect | undefined,
  displays: readonly DisplayArea[],
): readonly string[] {
  if (window === undefined) return [];
  return displays.filter((display) => covers(window, display.bounds)).map((display) => display.id);
}

export function surroundingsRelay(seams: SurroundingsSeams): SurroundingsRelay {
  const sent = new Map<number, string>();
  const factsOf = (window: SurroundingsWindow): SurroundingFacts => ({
    fullscreen: window.isFullScreen(),
    notificationState: seams.notificationState(),
    foregroundIsOurs: seams.foregroundIsOurs(),
    displays: seams.displays(),
    display: window.display(),
    coveredDisplays: seams.coveredDisplays(),
    sharedDisplays: seams.sharedDisplays(),
  });
  return {
    read: (window) =>
      window === undefined ? unknownSurroundings : surroundingsOf(factsOf(window)),
    push: () => {
      for (const window of seams.windows()) {
        if (window.isDestroyed()) continue;
        const surroundings = surroundingsOf(factsOf(window));
        const said = JSON.stringify(surroundings);
        if (sent.get(window.id) === said) continue;
        sent.set(window.id, said);
        window.send(surroundings);
      }
    },
  };
}

function anotherAppFullscreenHere(facts: SurroundingFacts): boolean {
  return (
    facts.notificationState !== undefined &&
    fullscreenStates.has(facts.notificationState) &&
    facts.foregroundIsOurs === false &&
    onTheConsolesDisplay(facts)
  );
}

function onTheConsolesDisplay(facts: SurroundingFacts): boolean {
  if (facts.displays === 1) return true;
  return facts.display !== undefined && facts.coveredDisplays.includes(facts.display);
}

function presenting(facts: SurroundingFacts): boolean {
  return facts.notificationState === notificationStates.presentationMode;
}

function sharedByTheConsole(facts: SurroundingFacts): boolean {
  return facts.display !== undefined && facts.sharedDisplays.includes(facts.display);
}

function covers(outer: ScreenRect, inner: ScreenRect): boolean {
  return (
    outer.x <= inner.x + coverSlackDip &&
    outer.y <= inner.y + coverSlackDip &&
    outer.x + outer.width >= inner.x + inner.width - coverSlackDip &&
    outer.y + outer.height >= inner.y + inner.height - coverSlackDip
  );
}

const fullscreenStates: ReadonlySet<number> = new Set([
  notificationStates.busy,
  notificationStates.d3dFullScreen,
]);
