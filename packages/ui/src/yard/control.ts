import { type Accessor, createSignal } from "solid-js";
import { yardToggleActionId } from "./actions.ts";
import { nowShownLine, tilesShownLine, trailShownLine, yardShownLine } from "./copy.ts";

export type RailView = "now" | "trail";

export interface YardControlOptions {
  readonly firstFrame: "yard" | "tiles";
  readonly chord: (action: string) => string;
  readonly say: (line: string) => void;
  readonly returnHome: () => void;
}

export interface YardControl {
  readonly on: Accessor<boolean>;
  readonly railActive: Accessor<boolean>;
  readonly view: Accessor<RailView>;
  readonly railAt: Accessor<string | undefined>;
  toggle(): void;
  toggleView(): void;
  focusRail(at?: string): void;
  leaveRail(): void;
  railLeftFor(next: EventTarget | null): void;
}

export function createYardControl(options: YardControlOptions): YardControl {
  const [on, setOn] = createSignal(options.firstFrame === "yard");
  const [railActive, setRailActive] = createSignal(false);
  const [view, setView] = createSignal<RailView>("now");
  const [railAt, setRailAt] = createSignal<string | undefined>(undefined, { equals: false });
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
    view,
    railAt,
    toggle: () => {
      leaveRail();
      const next = !on();
      const chord = options.chord(yardToggleActionId);
      setOn(next);
      options.say(next ? yardShownLine(chord) : tilesShownLine(chord));
    },
    toggleView: () => {
      const next = view() === "now" ? "trail" : "now";
      setView(next);
      options.say(next === "trail" ? trailShownLine : nowShownLine);
    },
    focusRail: (at) => {
      if (!railActive()) returnTo = activeElementOf(document);
      setRailAt(at);
      setOn(true);
      setRailActive(true);
    },
    leaveRail,
    railLeftFor: (next) => {
      if (!(next instanceof HTMLElement)) return leaveRail();
      returnTo = undefined;
      setRailActive(false);
    },
  };
}

function activeElementOf(page: Document): HTMLElement | undefined {
  const active = page.activeElement;
  return active instanceof HTMLElement && active !== page.body ? active : undefined;
}
