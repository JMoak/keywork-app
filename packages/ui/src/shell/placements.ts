import type {
  ArrangementAnswer,
  ArrangementShape,
  ArrangementSide,
  PlacementMover,
  PlacementPlace,
  PlacementsReport,
  StageRoom,
} from "@keywork-app/protocol";
import { dealsShaped, shapeWords } from "../surfaces/feel/arrangements.ts";
import { arrangeNotices } from "../surfaces/outside/panes-outside.tsx";
import {
  type LatticeSeat,
  roomWords,
  seatOnTheLattice,
  stageFacts,
  stageHolding,
} from "../surfaces/outside/stage.ts";
import type { Desk, ScreenRect } from "../surfaces/port.ts";

export interface Whereabouts {
  readonly id: string;
  readonly where: PlacementPlace;
  readonly by: PlacementMover;
  readonly bounds?: ScreenRect | undefined;
  readonly note?: string | undefined;
}

export interface Told {
  readonly shape: ArrangementShape | undefined;
  readonly side?: ArrangementSide | undefined;
  readonly look: string | undefined;
  readonly room: StageRoom;
  readonly seated: readonly Named[];
  readonly authored: readonly string[];
  readonly corrected: readonly string[];
  readonly keepers: readonly string[];
  readonly inside: readonly string[];
  readonly rail?: readonly string[] | undefined;
  readonly aside?: readonly string[] | undefined;
  readonly backBeside?: readonly string[] | undefined;
  readonly letGo?: boolean | undefined;
}

export interface Named {
  readonly title: string;
  readonly seat: LatticeSeat | undefined;
}

export const reportMetrics = { quietMs: 200, namedInOneBreath: 4 } as const;

export const toldWords = {
  desktopRefused: "The desktop would not answer, so nothing moved.",
  nothingNamedIsOut: "None of the panes named is outside, so nothing moved.",
  noRoomOutside: "no room outside",
  steppedBack: "stepped back as you asked",
  letGo: "The layout from before the drill was let go.",
} as const;

export function placementsReport(
  desk: Desk,
  settings: readonly Whereabouts[],
  answer?: ArrangementAnswer,
): PlacementsReport {
  const stage = stageHolding(desk, settings.flatMap(standingOutside));
  return {
    stage: stageFacts(desk, stage),
    placements: settings.map(({ id, where, by, bounds, note }) => ({
      id,
      where,
      by,
      ...(where === "outside" &&
        bounds !== undefined && { seat: seatOnTheLattice(stage.room, bounds) }),
      ...(note !== undefined && { note }),
    })),
    ...(answer !== undefined && { arrangement: answer }),
  };
}

export function arrangementSaid(told: Told): string {
  return [
    whatWasDone(told),
    ...(told.letGo === true ? [toldWords.letGo] : []),
    ...whatWasCorrected(told),
    ...whatWasLeft(told),
  ].join(" ");
}

function whatWasDone(told: Told): string {
  const count = told.seated.length;
  if (count === 0) return nothingMoved(told);
  const panes = count === 1 ? "1 pane now stands" : `${count} panes now stand`;
  return `${panes} ${roomWords[told.room]} as ${turnedToFace(lookWords(told), told.side)}.`;
}

function turnedToFace(words: string, side: Told["side"]): string {
  if (side === "top")
    return words.replace("beside a column of the rest", "above a row of the rest");
  if (side === "bottom")
    return words.replace("beside a column of the rest", "below a row of the rest");
  return words;
}

function nothingMoved(told: Told): string {
  const [first] = told.corrected;
  if (told.corrected.includes(arrangeNotices.noRoom)) return sentence(arrangeNotices.noRoom);
  if (told.keepers.length + told.inside.length > 0) return "Nothing moved.";
  return first === undefined ? toldWords.nothingNamedIsOut : "Nothing moved.";
}

function lookWords({ shape, look, seated }: Told): string {
  if (look === arrangeNotices.composedLook || look === undefined) return "you composed them";
  if (shape === undefined) return wordsForLook(look, seated.length);
  const held = dealsShaped(shape, seated.length).some((deal) => deal.name === look);
  return held
    ? shapeWords[shape]
    : `${wordsForLook(look, seated.length)}, since no arrangement of ${shapeWords[shape]} holds ${seated.length} here`;
}

function wordsForLook(look: string, count: number): string {
  const shape = (Object.keys(shapeWords) as ArrangementShape[]).find((candidate) =>
    dealsShaped(candidate, count).some((deal) => deal.name === look),
  );
  return shape === undefined ? look : shapeWords[shape];
}

function whatWasCorrected({ corrected, authored }: Told): string[] {
  const titled = (seat: string, turn: string): string => {
    const title = authored[Number(turn) - 1];
    return title === undefined ? seat : quoted(title);
  };
  const outcomes = new Map<string, string[]>();
  for (const line of corrected.filter((held) => held !== arrangeNotices.noRoom)) {
    const [, turn, rest] = /^seat (\d+) (.*)$/.exec(line) ?? [];
    const outcome = (rest ?? line).replace(/\bseat (\d+)\b/g, titled);
    const who = turn === undefined ? [] : [titled(`seat ${turn}`, turn)];
    outcomes.set(outcome, [...(outcomes.get(outcome) ?? []), ...who]);
  }
  return [...outcomes].map(([outcome, who]) =>
    sentence(who.length === 0 ? outcome : `${several(who)} ${agreeing(outcome, who.length)}`),
  );
}

function whatWasLeft({ keepers, inside, rail = [], aside = [], backBeside = [] }: Told): string[] {
  return [
    ...(aside.length === 0 ? [] : [`${listed(aside)} stepped aside as ${cardOrCards(aside)}.`]),
    ...(backBeside.length === 0
      ? []
      : [
          `${listed(backBeside)} went back beside the conversation as ${cardOrCards(backBeside)}: no room was left on the stage. Name ${itOrThem(backBeside)} in arrange to set ${itOrThem(backBeside)} out again.`,
        ]),
    ...(rail.length === 0
      ? []
      : [
          `${listed(rail)} stayed as ${cardOrCards(rail)} beside the conversation: the stage has no room for ${itOrThem(rail)} at card size.`,
        ]),
    ...(keepers.length === 0
      ? []
      : [`${listed(keepers)} stayed where the keeper put ${itOrThem(keepers)}.`]),
    ...(inside.length === 0
      ? []
      : [
          `${listed(inside)} stayed inside the console, where the keeper brought ${itOrThem(inside)}.`,
        ]),
  ];
}

function standingOutside({ where, bounds }: Whereabouts): ScreenRect[] {
  return where === "outside" && bounds !== undefined ? [bounds] : [];
}

function listed(titles: readonly string[]): string {
  return several(titles.map(quoted));
}

function several(names: readonly string[]): string {
  const shown = names.slice(0, reportMetrics.namedInOneBreath);
  const more = names.length - shown.length;
  const all = more > 0 ? [...shown, `${more} more`] : shown;
  return all.length < 2 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
}

function agreeing(outcome: string, count: number): string {
  if (count < 2) return outcome;
  return outcome
    .replace(/^was /, "were ")
    .replace(/^has /, "have ")
    .replace(/ and was /g, " and were ")
    .replace(/ and has /g, " and have ");
}

function itOrThem(titles: readonly string[]): string {
  return titles.length === 1 ? "it" : "them";
}

function cardOrCards(titles: readonly string[]): string {
  return titles.length === 1 ? "a card" : "cards";
}

function quoted(title: string): string {
  return `"${title}"`;
}

function sentence(line: string): string {
  const capital = line.charAt(0).toUpperCase() + line.slice(1);
  return capital.endsWith(".") ? capital : `${capital}.`;
}
