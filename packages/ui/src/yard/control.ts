import { type Accessor, createSignal } from "solid-js";
import { yardToggleActionId } from "./actions.ts";
import { tilesShownLine, yardShownLine } from "./copy.ts";

export interface YardControlOptions {
  readonly firstFrame: "yard" | "tiles";
  readonly chord: (action: string) => string;
  readonly say: (line: string) => void;
  readonly returnHome: () => void;
}

export interface YardControl {
  readonly on: Accessor<boolean>;
  readonly railActive: Accessor<boolean>;
  toggle(): void;
  focusRail(): void;
  leaveRail(): void;
}

export function createYardControl(options: YardControlOptions): YardControl {
  const [on, setOn] = createSignal(options.firstFrame === "yard");
  const [railActive, setRailActive] = createSignal(false);
  let returnTo: HTMLElement | undefined;

  const leaveRail = (): void => {
    if (!railActive()) return;
    setRailActive(false);
    const back = returnTo;
    returnTo = undefined;
    if (back?.isConnected) back.focus({ preventScroll: true });
    else options.returnHome();
  };

  return {
    on,
    railActive,
    toggle: () => {
      leaveRail();
      const next = !on();
      const chord = options.chord(yardToggleActionId);
      setOn(next);
      options.say(next ? yardShownLine(chord) : tilesShownLine(chord));
    },
    focusRail: () => {
      if (!railActive()) returnTo = activeElementOf(document);
      setOn(true);
      setRailActive(true);
    },
    leaveRail,
  };
}

function activeElementOf(page: Document): HTMLElement | undefined {
  const active = page.activeElement;
  return active instanceof HTMLElement && active !== page.body ? active : undefined;
}
