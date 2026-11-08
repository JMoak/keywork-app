import type { Surroundings } from "../shared/channels.ts";
import { notificationStates } from "./companion/foreground.ts";

export interface SurroundingFacts {
  readonly fullscreen: boolean;
  readonly notificationState: number | undefined;
  readonly foregroundIsOurs: boolean | undefined;
  readonly displays: number;
  readonly display: string | undefined;
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
  sharedDisplays(): readonly string[];
}

export interface SurroundingsRelay {
  read(window: SurroundingsWindow | undefined): Surroundings;
  push(): void;
}

export const unknownSurroundings: Surroundings = {
  fullscreen: false,
  fullscreenElsewhere: false,
  displayShared: false,
};

export function surroundingsOf(facts: SurroundingFacts): Surroundings {
  return {
    fullscreen: facts.fullscreen,
    fullscreenElsewhere: anotherAppFullscreenHere(facts),
    displayShared: presenting(facts) || sharedByTheConsole(facts),
  };
}

export function surroundingsRelay(seams: SurroundingsSeams): SurroundingsRelay {
  const sent = new Map<number, string>();
  const factsOf = (window: SurroundingsWindow): SurroundingFacts => ({
    fullscreen: window.isFullScreen(),
    notificationState: seams.notificationState(),
    foregroundIsOurs: seams.foregroundIsOurs(),
    displays: seams.displays(),
    display: window.display(),
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
    facts.displays === 1
  );
}

function presenting(facts: SurroundingFacts): boolean {
  return facts.notificationState === notificationStates.presentationMode;
}

function sharedByTheConsole(facts: SurroundingFacts): boolean {
  return facts.display !== undefined && facts.sharedDisplays.includes(facts.display);
}

const fullscreenStates: ReadonlySet<number> = new Set([
  notificationStates.busy,
  notificationStates.d3dFullScreen,
]);
