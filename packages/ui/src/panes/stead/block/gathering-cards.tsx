import type { HabitatState } from "@keywork-app/habitat";
import {
  type ArtRect,
  councilAt,
  councilPlace,
  councilsOf,
  type Line,
  lineKey,
  lineOf,
  type PlaceRects,
  type ProjectSite,
  placeKey,
  reserved,
  seatedAt,
  type BlockWorld as Town,
  type Waiting,
} from "@keywork-app/habitat/block";
import type { SteadPlace } from "@keywork-app/protocol";
import "./gathering-cards.css";
import { createMemo, For, Show } from "solid-js";
import type { Rect } from "../../../layout/index.ts";
import { besideTheBuilding, folderName } from "./site-card.tsx";

export interface GatheringCardsProps {
  readonly town: Town;
  readonly creatures: HabitatState["creatures"];
  readonly projects: Readonly<Record<string, readonly ProjectSite[]>> | undefined;
  readonly waiting: readonly Waiting[] | undefined;
  readonly pointed: SteadPlace | undefined;
  readonly pointedCreature: string | undefined;
  readonly held: SteadPlace | undefined;
  readonly stage: {
    readonly rects: PlaceRects;
    readonly cssPerArt: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface CouncilRow {
  readonly directory: string;
  readonly sitting: string;
}

export function GatheringCards(props: GatheringCardsProps) {
  const named = (slug: string): string => props.creatures[slug]?.name ?? slug;
  const onStage = (key: string): Rect | undefined => {
    const art = props.stage.rects.get(key);
    return art === undefined ? undefined : scaled(art, props.stage.cssPerArt);
  };
  const place = (): SteadPlace | undefined =>
    props.pointed?.kind === "project" ? props.pointed : props.held;
  const atTheCouncil = (): boolean =>
    councilAt(place()) !== undefined ||
    (props.pointedCreature !== undefined &&
      seatedAt(props.town, "council").includes(props.pointedCreature));
  const council = createMemo(() => {
    const [sitting] = councilsOf(props.projects);
    if (!atTheCouncil() || sitting === undefined) return undefined;
    const table = onStage(placeKey(councilPlace(sitting.directory)));
    return table === undefined
      ? undefined
      : { table, rows: councilRows(props.projects, props.town, named) };
  });
  const line = createMemo(() => {
    const standing = lineUnder(props.town, props.pointedCreature, props.pointed ?? props.held);
    const row = standing === undefined ? undefined : onStage(lineKey(standing));
    if (standing === undefined || row === undefined) return undefined;
    return { row, lines: waitLines(props.waiting ?? [], props.town, standing, named) };
  });
  return (
    <>
      <Show when={council()}>
        {(card) => (
          <aside
            class="kw-stead-site kw-stead-gathering"
            role="status"
            data-gathering="council"
            data-held={councilAt(props.held) !== undefined ? "" : undefined}
            style={besideTheBuilding(card().table, props.stage)}
          >
            <For each={card().rows}>
              {(row) => (
                <>
                  <strong class="kw-stead-site-name">{folderName(row.directory)}</strong>
                  <span class="kw-stead-site-worked">{row.sitting}</span>
                </>
              )}
            </For>
          </aside>
        )}
      </Show>
      <Show when={line()}>
        {(card) => (
          <aside
            class="kw-stead-site kw-stead-gathering"
            role="status"
            data-gathering="line"
            style={besideTheBuilding(card().row, props.stage)}
          >
            <For each={card().lines}>{(words) => <span>{words}</span>}</For>
          </aside>
        )}
      </Show>
    </>
  );
}

export function councilRows(
  projects: GatheringCardsProps["projects"],
  town: Town,
  named: (slug: string) => string,
): CouncilRow[] {
  const seated = seatedAt(town, "council");
  return councilsOf(projects).map((council) => ({
    directory: council.directory,
    sitting: sittingLine(
      seated.filter((slug) => council.active.includes(slug)).map(named),
      council.active
        .filter((slug) => !seated.includes(slug))
        .map((slug) => ({ name: named(slug), atThePorch: atThePorch(town, slug) })),
    ),
  }));
}

export function sittingLine(
  sitting: readonly string[],
  away: readonly { readonly name: string; readonly atThePorch: boolean }[],
): string {
  const together = `${listed(sitting)} ${sitting.length === 1 ? "is" : "are"} at work here`;
  const kept = away.map(({ name, atThePorch }) =>
    atThePorch ? `${name} too, from the porch` : `${name} too`,
  );
  return [sitting.length > 1 ? `${together} together` : together, ...kept].join(" · ");
}

export function waitLines(
  waiting: readonly Waiting[],
  town: Town,
  line: Line,
  named: (slug: string) => string,
): string[] {
  const inLine = [...waiting]
    .sort((a, b) => a.since - b.since)
    .filter((wait) => lineOf(town, wait.creature) === line)
    .filter((wait, at, all) => all.findIndex((each) => each.creature === wait.creature) === at);
  const causes = [...new Set(inLine.map(causeOf))];
  return causes.map((cause) => {
    const names = inLine
      .filter((wait) => causeOf(wait) === cause)
      .map((wait) => named(wait.creature));
    return `${listed(names)} ${names.length === 1 ? "is" : "are"} ${cause}`;
  });
}

export function causeOf(wait: Pick<Waiting, "cloud" | "reason">): string {
  const model = wait.cloud ? "the cloud model" : "the local model";
  return `waiting on ${model}: ${wait.reason === "busy" ? "it is busy" : "the limit was reached"}`;
}

export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function lineUnder(
  town: Town,
  pointedCreature: string | undefined,
  place: SteadPlace | undefined,
): Line | undefined {
  const standing = lineOf(town, pointedCreature);
  if (standing !== undefined) return standing;
  return place?.kind === "mill" && seatedAt(town, "mill").length > 0 ? "mill" : undefined;
}

function atThePorch(town: Town, slug: string): boolean {
  const cell = town.cast.find((member) => member.slug === slug)?.stands.cell;
  return cell?.cx === reserved.house.cx && cell.cz === reserved.house.cz;
}

function scaled(art: ArtRect, cssPerArt: number): Rect {
  return {
    x: Math.round(art.x * cssPerArt),
    y: Math.round(art.y * cssPerArt),
    width: Math.round(art.width * cssPerArt),
    height: Math.round(art.height * cssPerArt),
  };
}
