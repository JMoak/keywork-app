import { yardMetrics } from "@keywork-app/habitat";
import type { Desk, ScreenRect } from "../port.ts";

export const hubMetrics = {
  width: yardMetrics.readable.width + 2 * yardMetrics.gap,
  slack: 2,
} as const;

export function hubOutline(desk: Desk): ScreenRect {
  const { workArea: area, console: home } = desk;
  const { gap } = yardMetrics;
  const width = Math.min(home.width, hubMetrics.width, area.width - 2 * gap);
  const nearerTheRight = home.x + home.width / 2 > area.x + area.width / 2;
  return {
    x: nearerTheRight ? area.x + area.width - gap - width : area.x + gap,
    y: area.y + gap,
    width,
    height: area.height - 2 * gap,
  };
}

export function standsAsTheHub(desk: Desk): boolean {
  return !desk.consoleMaximized && standsNear(desk.console, hubOutline(desk));
}

export function standsNear(one: ScreenRect, other: ScreenRect): boolean {
  const { slack } = hubMetrics;
  return (
    Math.abs(one.x - other.x) <= slack &&
    Math.abs(one.y - other.y) <= slack &&
    Math.abs(one.width - other.width) <= slack &&
    Math.abs(one.height - other.height) <= slack
  );
}
