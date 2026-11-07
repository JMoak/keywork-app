import type {
  Chore,
  CreatureReading,
  HabitatState,
  Semantic,
  SkyPhase,
  Thread,
  Waiting,
} from "@keywork-app/habitat";
import { clockWord } from "../../chrome/clock-word.ts";
import {
  askGloss,
  bubbleWords,
  editTools,
  needYouCount,
  shellTools,
} from "../../shell/needs-you.ts";

export const steadName = "stead";

export const stateLabels: Readonly<Record<Semantic, string>> = {
  porch: "at the porch",
  blocked: "blocked",
  back: "back",
  working: "working",
  paused: "paused",
  idle: "idle",
};

export const skyWords: Readonly<Record<SkyPhase, string>> = {
  night: "night",
  dawn: "dawn",
  day: "day",
  dusk: "dusk",
};

export { bubbleWords, editTools, shellTools };
export const commandWidth = 40;
export const staleAfterMs = 10 * 60 * 1000;

export function emptyStateLine(makeChord: string): string {
  return `No creature yet · make one with ${makeChord}`;
}

export function steadTitle(waiting: number): string {
  return waiting === 0 ? steadName : `${steadName} · ${needYouCount(waiting)}`;
}

export function headLine(facts: {
  creatures: number;
  needYou: number;
  working: number;
  phase: SkyPhase;
  clock: string;
  floating?: string | undefined;
}): string {
  const parts = [
    facts.creatures === 1 ? "1 creature" : `${facts.creatures} creatures`,
    facts.needYou > 0 ? needYouCount(facts.needYou) : undefined,
    facts.working > 0 ? `${facts.working} working` : undefined,
    facts.floating === undefined || facts.creatures < 2 ? undefined : `${facts.floating} floats`,
    `${skyWords[facts.phase]} ${facts.clock}`,
  ];
  return parts.filter((part) => part !== undefined).join(" · ");
}

export interface ChoreBoard {
  readonly line: string;
  readonly nextAt: string | undefined;
}

export const boardWords = {
  lead: "chore board",
  nothing: "nothing scheduled",
} as const;

export function choreBoard(
  world: Pick<HabitatState, "creatures">,
  now: number,
  offsetMinutes: number,
): ChoreBoard {
  const next = Object.values(world.creatures)
    .flatMap((creature) => creature.chores.map((chore) => ({ keeper: creature.name, chore })))
    .filter((posted) => posted.chore.nextAt !== undefined)
    .sort((a, b) => (a.chore.nextAt ?? "").localeCompare(b.chore.nextAt ?? ""))[0];
  if (next === undefined) {
    return { line: `${boardWords.lead} · ${boardWords.nothing}`, nextAt: undefined };
  }
  const when = timeWord(next.chore.nextAt, now, offsetMinutes);
  return {
    line: `${boardWords.lead} · next: ${next.chore.title} (${next.keeper}) at ${when}`,
    nextAt: next.chore.nextAt,
  };
}

export function bubbleLine(thread: Pick<Thread, "asks" | "failure" | "back">): string {
  const ask = Object.values(thread.asks).sort((a, b) => a.askedAt.localeCompare(b.askedAt))[0];
  if (ask !== undefined) return askLine(ask.tool, ask.subject);
  if (thread.failure !== undefined) return bubbleWords.blocked;
  if (thread.back !== undefined) return bubbleWords.finished;
  return bubbleWords.question;
}

export function askLine(tool: string, subject: string): string {
  return askGloss(tool, shellTools.has(tool) ? trimmedFromTheLeft(subject) : subject);
}

export function trimmedFromTheLeft(command: string, width = commandWidth): string {
  const flat = command.replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : `…${flat.slice(flat.length - width + 1)}`;
}

export interface Telling {
  readonly reading: CreatureReading;
  readonly thread: Thread | undefined;
  readonly chores: readonly Chore[];
  readonly parcelFogged: string | undefined;
  readonly now: number;
  readonly offsetMinutes: number;
  readonly asOf: string | undefined;
  readonly lastEvent: string | undefined;
}

export function whatAreYouDoing(telling: Telling): string {
  const { reading, thread } = telling;
  const title = thread === undefined || thread.title === "" ? "a thread" : thread.title;
  const when = (iso: string | number | undefined): string =>
    timeWord(iso, telling.now, telling.offsetMinutes);
  const carrier = reading.carrier;
  switch (reading.state) {
    case "working": {
      const tool = carrier?.tool === undefined ? "" : `: ${carrier.tool.name}`;
      const others = reading.lamps + reading.lanterns - 1;
      const live =
        others > 0 ? ` ${others} other ${others === 1 ? "thread" : "threads"} live.` : "";
      return `Working on ${title}${tool} since ${when(carrier?.since)}.${live}`;
    }
    case "porch": {
      const line = thread === undefined ? bubbleWords.question : bubbleLine(thread);
      return `Waiting on you: ${line} in ${title}, since ${when(carrier?.since)}. Everything else keeps going.`;
    }
    case "back": {
      const label = (carrier?.back?.report ?? carrier?.back?.preview ?? "").trim();
      const result = label === "" ? "" : ` ${label}`;
      return `Finished ${title} at ${when(carrier?.back?.at)}. The result is on the porch, not yet opened:${result} Delivery: unknown.`;
    }
    case "blocked": {
      const reason = thread?.failure?.message ?? "no reason recorded";
      return `${title} stopped at ${when(thread?.failure?.at)}: ${reason}. Next step: open it.`;
    }
    case "paused":
      return `Paused since ${when(carrier?.since)}: ${pauseReason(thread?.waiting, telling.parcelFogged)}. I resume when it clears. Nothing is lost.`;
    case "idle": {
      if (telling.asOf === undefined) {
        return "I cannot tell. No event has arrived yet; the picture may be stale.";
      }
      const next = nextChore(telling.chores);
      return next === undefined
        ? "Nothing, and nothing scheduled."
        : `Nothing. Next chore: ${next.title} at ${when(next.nextAt)}.`;
    }
  }
}

export function timeWord(
  at: string | number | undefined,
  now: number,
  offsetMinutes: number,
): string {
  if (at === undefined) return "an unknown time";
  const ms = typeof at === "number" ? at : Date.parse(at);
  if (Number.isNaN(ms)) return "an unknown time";
  const clock = clockWord(ms, offsetMinutes);
  const age = now - ms;
  return age > staleAfterMs ? `${clock} (${ageWord(age)} ago)` : clock;
}

export function ageWord(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export const noPaneYet = (thing: string): string => `no pane for ${thing} yet`;
export const noThreadYet = (name: string): string => `${name} has no thread yet`;
export const skinRefusedLine = (slug: string, id: string, fault: string): string =>
  `${slug} stays off the stead: skin ${id} refused, ${fault}`;
export const noAskHere = "nothing is asking on the porch";
export const acceptHint = (approve: string): string =>
  `${approve} accepts its grants · the bubble opens the chores pane`;
export const acceptsOnly = (approve: string): string =>
  `a held chore takes only accept · ${approve} accepts its grants`;
export const overturnHint = (overturn: string, open: string): string =>
  `${overturn} overturns it and its class waits for you again · ${open} opens the conversation that keeps the notice`;
export const overturnsOnly = (overturn: string): string =>
  `a decision made for you takes only overturn · ${overturn} overturns it`;
export const nothingDecidedHere = "nothing decided for you stands on the porch";

function pauseReason(waiting: Waiting | undefined, parcel: string | undefined): string {
  if (waiting?.reason === "rate-limited") return "the provider is rate-limiting";
  if (waiting?.reason === "overloaded") return "the provider is overloaded";
  if (waiting?.reason === "unreachable") return "the provider is unreachable";
  if (parcel !== undefined) return `${parcel} is unreachable`;
  return "the turn is waiting";
}

function nextChore(chores: readonly Chore[]): Chore | undefined {
  return chores
    .filter((chore) => chore.nextAt !== undefined)
    .sort((a, b) => (a.nextAt ?? "").localeCompare(b.nextAt ?? ""))[0];
}
