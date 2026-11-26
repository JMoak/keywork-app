import type { Land, Lane } from "@keywork-app/habitat/block";
import type { Rect } from "../../../layout/index.ts";

export interface LandCardProps {
  readonly land: Land;
  readonly rect: Rect;
  readonly stage: { readonly width: number; readonly height: number };
  readonly held: boolean;
  readonly creatures: number;
  readonly product: string;
}

export const landCardGap = 6;
export const landCardRoom = 76;

export function LandCard(props: LandCardProps) {
  return (
    <aside
      class="kw-stead-site kw-stead-land"
      role="status"
      data-land={props.land.kind}
      data-held={props.held ? "" : undefined}
      style={besideTheLand(props.rect, props.stage)}
    >
      <strong class="kw-stead-site-name">{landName(props.land)}</strong>
      <span>{landTelling(props.land, props.creatures, props.product)}</span>
      <span>{laneWords(props.land.lane)}</span>
      <span class="kw-stead-land-press">{pressWords(props.land)}</span>
    </aside>
  );
}

export function landName(land: Land): string {
  return land.name ?? "this machine";
}

export function landTelling(land: Land, creatures: number, product: string): string {
  const system = land.system === undefined ? [] : [land.system];
  switch (land.kind) {
    case "home":
      return [
        land.name === undefined ? "the stead" : "this machine",
        creatures === 1 ? "1 creature" : `${creatures} creatures`,
        ...system,
      ].join(" · ");
    case "hall":
      return [
        land.answers ? `${product} answers here` : `offline · ${product} answered here before`,
        ...system,
      ].join(" · ");
    case "bare":
      return [
        land.online ? `seen on your network · no ${product} answers` : "offline",
        ...system,
      ].join(" · ");
  }
}

export function laneWords(lane: Lane): string {
  switch (lane.kind) {
    case "here":
      return "you are here";
    case "direct":
      return "a plank lane: linked directly";
    case "relayed":
      return lane.by === "derp"
        ? `stepping stones: relayed through ${lane.through === "" ? "a relay" : lane.through}`
        : `stepping stones: relayed through ${lane.through === "" ? "another machine" : lane.through}`;
    case "offline":
      return "no lane while it is offline";
    case "unknown":
      return "no lane: the way there is not known yet";
  }
}

export function pressWords(land: Land): string {
  return land.kind === "home"
    ? "press to step into the town"
    : "press to see it among your parcels";
}

function besideTheLand(
  rect: Rect,
  stage: { readonly width: number; readonly height: number },
): Record<string, string> {
  const middle = rect.x + rect.width / 2;
  const across =
    middle < stage.width / 2
      ? { left: `${Math.max(landCardGap, Math.round(rect.x))}px` }
      : { right: `${Math.max(landCardGap, Math.round(stage.width - rect.x - rect.width))}px` };
  const down =
    rect.y >= landCardRoom
      ? { bottom: `${Math.round(stage.height - rect.y + landCardGap)}px` }
      : {
          top: `${Math.round(Math.min(stage.height - landCardRoom, rect.y + rect.height + landCardGap))}px`,
        };
  return { ...across, ...down };
}
