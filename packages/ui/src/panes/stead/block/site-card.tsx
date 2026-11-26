import { flagCuts, type ProjectSite } from "@keywork-app/habitat/block";
import { For, Show } from "solid-js";
import type { Rect } from "../../../layout/index.ts";

export interface SiteCardProps {
  readonly site: ProjectSite;
  readonly building: Rect;
  readonly stage: { readonly width: number; readonly height: number };
  readonly held: boolean;
  readonly now: number;
}

export const cardGap = 6;
export const roomAbove = 72;

export function SiteCard(props: SiteCardProps) {
  return (
    <aside
      class="kw-stead-site"
      role="status"
      data-held={props.held ? "" : undefined}
      style={besideTheBuilding(props.building, props.stage)}
    >
      <strong class="kw-stead-site-name">{folderName(props.site.id)}</strong>
      <Show when={props.site.root}>
        {(root) => (
          <span class="kw-stead-site-family">
            <Show when={props.site.family !== undefined}>
              <FamilyFlag family={props.site.family ?? 0} />
            </Show>
            in {folderName(root())}
          </span>
        )}
      </Show>
      <span class="kw-stead-site-worked">{workedLine(props.site, props.now)}</span>
    </aside>
  );
}

export function folderName(directory: string): string {
  return (
    directory
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) ?? directory
  );
}

export function workedLine(site: ProjectSite, now: number): string {
  const conversations = site.conversations ?? 1;
  const counted = conversations === 1 ? "1 conversation" : `${conversations} conversations`;
  return site.since === undefined ? counted : `${counted} · since ${dayWord(site.since, now)}`;
}

export function dayWord(at: number, now: number): string {
  const then = new Date(at);
  const today = new Date(now);
  const days = Math.round((startOfDay(today) - startOfDay(then)) / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function FamilyFlag(props: { readonly family: number }) {
  const cut = () => flagCuts[props.family % flagCuts.length] ?? flagCuts[0];
  return (
    <svg
      class="kw-stead-site-flag"
      viewBox={`0 0 ${cut()[0].length} ${cut().length}`}
      aria-hidden="true"
    >
      <For each={cut()}>
        {(row, y) => (
          <For each={[...row]}>
            {(cell, x) => (
              <Show when={cell === "#"}>
                <rect x={x()} y={y()} width="1" height="1" />
              </Show>
            )}
          </For>
        )}
      </For>
    </svg>
  );
}

const dayMs = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function besideTheBuilding(
  building: Rect,
  stage: { readonly width: number; readonly height: number },
): Record<string, string> {
  const middle = building.x + building.width / 2;
  const across =
    middle < stage.width / 2
      ? { left: `${Math.max(cardGap, Math.round(building.x))}px` }
      : {
          right: `${Math.max(cardGap, Math.round(stage.width - building.x - building.width))}px`,
        };
  const down =
    building.y >= roomAbove
      ? { bottom: `${Math.round(stage.height - building.y + cardGap)}px` }
      : { top: `${Math.round(building.y + building.height + cardGap)}px` };
  return { ...across, ...down };
}
