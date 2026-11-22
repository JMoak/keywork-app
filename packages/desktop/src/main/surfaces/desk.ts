import type { Desk, DeskDisplay, ScreenPoint, ScreenRect } from "./channels.ts";

export interface DeskScreen {
  displays(): readonly DeskDisplay[];
  displayMatching(rect: ScreenRect): DeskDisplay;
  cursor(): ScreenPoint | undefined;
}

export interface ConsoleFrame {
  bounds(): ScreenRect;
  contentBounds(): ScreenRect;
  isMaximized(): boolean;
}

export function deskOf(console: ConsoleFrame, screen: DeskScreen): Desk {
  const workArea = workAreaOf(console, screen);
  const outline = visibleOutline(console, workArea);
  return {
    console: outline,
    consoleMaximized: console.isMaximized(),
    workArea,
    displays: screen.displays(),
    cursor: screen.cursor() ?? centerOf(outline),
  };
}

export function consoleOutline(console: ConsoleFrame, screen: DeskScreen): ScreenRect {
  return visibleOutline(console, workAreaOf(console, screen));
}

// On Windows a framed window's bounds include resize borders nobody can see on its left, right
// and bottom, and a maximised one overhangs its display by them; the page area has neither but
// leaves out the title bar. What the keeper sees runs from the top of the one to the other
// three edges of the other.
export function visibleOutline(console: ConsoleFrame, workArea: ScreenRect): ScreenRect {
  const outer = console.bounds();
  const page = console.contentBounds();
  const top = Math.min(page.y, console.isMaximized() ? Math.max(outer.y, workArea.y) : outer.y);
  return { x: page.x, y: top, width: page.width, height: page.y + page.height - top };
}

export function boundsShowing(
  console: ConsoleFrame,
  screen: DeskScreen,
  outline: ScreenRect,
): ScreenRect {
  const outer = console.bounds();
  const seen = consoleOutline(console, screen);
  return {
    x: outline.x - (seen.x - outer.x),
    y: outline.y - (seen.y - outer.y),
    width: outline.width + (outer.width - seen.width),
    height: outline.height + (outer.height - seen.height),
  };
}

export function deskLayoutKey(desk: Desk): string {
  return JSON.stringify([desk.console, desk.consoleMaximized, desk.workArea, desk.displays]);
}

export function translationBetween(before: ScreenRect, after: ScreenRect): ScreenPoint | undefined {
  if (before.width !== after.width || before.height !== after.height) return undefined;
  if (before.x === after.x && before.y === after.y) return undefined;
  return { x: after.x - before.x, y: after.y - before.y };
}

export function wholeRect(rect: ScreenRect): ScreenRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function sameRect(a: ScreenRect, b: ScreenRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function originOf(rect: ScreenRect): ScreenPoint {
  return { x: rect.x, y: rect.y };
}

export function shifted(rect: ScreenRect, by: ScreenPoint): ScreenPoint {
  return { x: rect.x + by.x, y: rect.y + by.y };
}

function workAreaOf(console: ConsoleFrame, screen: DeskScreen): ScreenRect {
  return screen.displayMatching(console.contentBounds()).workArea;
}

function centerOf(rect: ScreenRect): ScreenPoint {
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}
