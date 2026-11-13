import { needYouCount } from "../../shell/needs-you.ts";
import { type CronFields, cronFieldsOf, hourSpan, minuteSpan, progressionStep } from "./cron.ts";
import { outcomeLine, runOutcome } from "./outcome.ts";
import {
  type ChoreDestination,
  type ChoreFile,
  type ChoreRow,
  type ChoreTrigger,
  type GrantsView,
  isOn,
  isRunning,
  type NotificationSettings,
  type NotifyChoice,
  type RunRow,
  type ToolPosture,
} from "./wire.ts";

export const choresName = "chores";
export const newChoreButton = "+ new chore";
export const runsHeading = "runs";
export const grantsHeading = "grants";
export const runColumns = [
  "when",
  "outcome",
  "process",
  "delivery",
  "verified",
  "cost (USD)",
  "minutes",
] as const;
export const factLabels = {
  trigger: "trigger",
  wake: "wake",
  next: "next",
  destination: "to",
  notify: "notify",
  tools: "tools",
  budget: "budget",
  file: "file",
  instructions: "instructions",
} as const;
export const notRecorded = "—";
export const unknownCost = "unknown";

export function choresTitle(creature: string | undefined): string {
  return creature === undefined ? choresName : `${choresName} · ${creature}`;
}

export function noChoresLine(addChord: string): string {
  return `No chores · add one with ${addChord}`;
}

export function noCreatureLine(makeChord: string): string {
  return `No creature yet · make one with ${makeChord}`;
}

export function noRunsLine(runChord: string): string {
  return `No runs yet · run it now with ${runChord}`;
}

export function headLine(rows: readonly ChoreRow[], needsYou: (row: ChoreRow) => boolean): string {
  const needYou = rows.filter(needsYou).length;
  const running = rows.filter((row) => isRunning(row) && !needsYou(row)).length;
  const off = rows.filter((row) => row.routine !== null && !isOn(row)).length;
  const parts = [
    countOf(rows.length, "chore", "chores"),
    needYou > 0 ? needYouCount(needYou) : undefined,
    running > 0 ? `${running} running` : undefined,
    off > 0 ? `${off} off` : undefined,
  ];
  return parts.filter((part) => part !== undefined).join(" · ");
}

export const needsYouWord = "needs you";

export function parkedLine(acceptChord: string): string {
  return `Its run is parked until you accept its grants: read and accept them with ${acceptChord}, and the run proceeds.`;
}

export function creatureAside(count: number): string {
  return countOf(count, "chore", "chores");
}

export function triggerWords(trigger: ChoreTrigger): string {
  switch (trigger.kind) {
    case "cron": {
      const until = trigger.until === undefined ? "" : `, until ${trigger.until}`;
      return `${cronWords(trigger.expr)} (${trigger.tz})${until}`;
    }
    case "interval": {
      const until = trigger.until === undefined ? "" : `, until ${trigger.until}`;
      return `${intervalWords(trigger.minutes)}${until}`;
    }
    case "manual":
      return "by hand only";
    case "at":
      return `once, at ${trigger.at}`;
    case "file-watch":
      return `when ${trigger.paths.join(", ")} changes`;
    case "webhook":
      return `on its webhook, bodies to ${Math.round(trigger.maxBytes / 1024)} KiB`;
    case "event":
      return `on ${trigger.name}${whereWords(trigger.where)}`;
  }
}

export function whereWords(
  where: Readonly<Record<string, string | number | boolean | null>>,
): string {
  const pairs = Object.entries(where).map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length === 0 ? "" : ` where ${pairs.join(", ")}`;
}

export const ownWakeWord = "its own wakeup";

export function wakeWords(requestedAt: string): string {
  return `${ownWakeWord}, asked ${requestedAt}`;
}

export function hookMintedLine(path: string, token: string): string {
  return `hook minted · POST ${path} with header x-keywork-hook: ${token} · shown once, mint again to replace it`;
}

export const hookOnlyForWebhooks = "only a chore with a webhook trigger has a hook token";

export function cronWords(expr: string): string {
  const fields = cronFieldsOf(expr);
  return (fields === undefined ? undefined : scheduleWords(fields)) ?? `cron ${expr.trim()}`;
}

export function intervalWords(minutes: number): string {
  if (minutes % dayMinutes === 0) return everyOf(minutes / dayMinutes, "day", "days");
  if (minutes % 60 === 0) return everyOf(minutes / 60, "hour", "hours");
  return everyOf(minutes, "minute", "minutes");
}

export function destinationWords(destination: ChoreDestination): string {
  switch (destination.kind) {
    case "conversation":
      return "the conversation";
    case "thread":
      return `thread ${destination.name}`;
    case "file":
      return destination.path;
  }
}

export const notifyWords: Readonly<Record<NotifyChoice, string>> = {
  always: "every run, at the digest",
  "only-when-needs-me": "only when it needs you",
  never: "never; the log only",
};

export function toolsWords(grants: GrantsView, count: number): string {
  if (!grants.needsAcceptance) return "read-only";
  const declared = `${grants.posture}, ${countOf(count, "grant", "grants")}`;
  return grants.accepted ? `${declared}, accepted` : `${declared}, not accepted`;
}

export function choreFacts(routine: ChoreFile): string {
  return [
    triggerWords(routine.trigger),
    `to ${destinationWords(routine.destination)}`,
    `notify ${notifyWords[routine.notify]}`,
  ].join(" · ");
}

export function budgetWords(budget: ChoreFile["budget"]): string {
  return `$${budget.usd.toFixed(2)} and ${countOf(budget.minutes, "minute", "minutes")} a run`;
}

export function nextWords(row: ChoreRow, now: number, zone: string, needsYou = false): string {
  if (row.routine === null) return "unreadable";
  if (needsYou) return needsYouWord;
  if (isRunning(row)) return "running";
  if (!isOn(row)) return "off";
  if (row.routine.trigger.kind === "manual") return "by hand";
  if (row.schedule.nextRunAt === null) return "no next run";
  return dayClock(row.schedule.nextRunAt, now, zoneOfTrigger(row.routine.trigger, zone));
}

export function disabledLine(reason: string, onChord: string): string {
  return `Off: ${reason}. Turn it back on with ${onChord}.`;
}

export function awaitingLine(posture: ToolPosture, acceptChord: string): string {
  return `Its ${posture} grants wait for you: read and accept them with ${acceptChord}.`;
}

export function problemLine(file: string, problem: string): string {
  return `${file} does not parse: ${problem}`;
}

export function runNotes(run: RunRow, zone: string): string {
  const notes = [
    reasonNote(run),
    run.catchUp ? catchUpNote(run, zone) : undefined,
    run.trigger === "manual" ? "run by hand" : undefined,
    run.attempt > 1 ? `attempt ${run.attempt}` : undefined,
  ];
  return notes.filter((note) => note !== undefined).join(" · ");
}

export function whenWords(iso: string | null, zone: string): string {
  const wall = iso === null ? undefined : wallOf(Date.parse(iso), zone);
  return wall === undefined ? notRecorded : `${wall.month}-${wall.day} ${wall.clock}`;
}

export function costWords(run: RunRow): string {
  if (run.cost !== null) return usdOf(run.cost.usd);
  return run.startedAt === null ? notRecorded : unknownCost;
}

export function minutesWords(run: RunRow): string {
  if (run.startedAt === null || run.endedAt === null) return notRecorded;
  const minutes = (Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 60_000;
  if (!Number.isFinite(minutes) || minutes < 0) return notRecorded;
  return minutes < 10 ? minutes.toFixed(1).replace(/\.0$/, "") : String(Math.round(minutes));
}

export function settingsLine(settings: NotificationSettings): string {
  const quiet =
    settings.quietHours === null
      ? "no quiet hours"
      : `quiet ${settings.quietHours.start} to ${settings.quietHours.end}`;
  const zone = settings.tz === undefined ? "" : ` (${settings.tz})`;
  return `digest at ${settings.digest.join(", ")} · ${quiet}${zone}`;
}

export const settingsUnservedLine = "Digest times and quiet hours are not available here yet.";

export const settingsPointer =
  "Scheduled chores run only while their engine runs: with background work off, quitting the app pauses them until you open it again. A run that needs you notifies you at once, or after quiet hours. Digest times and quiet hours are set in the engine's config.";

export function acceptHeading(title: string, posture: ToolPosture, count: number): string {
  return `${title} asks for ${posture} with ${countOf(count, "grant", "grants")}:`;
}

export const noGrantsDeclared = "no grants declared; anything it does beyond reading asks";

export function acceptTerms(digest: string): string {
  return `grant set ${digest} · accepting covers exactly these; anything outside them still asks`;
}

export function acceptQuestion(count: number): string {
  if (count === 0)
    return "accept it with no standing grants, so each write asks you as it happens?";
  return `accept ${count === 1 ? "this grant" : `these ${count} grants`}?`;
}

export function acceptedLine(title: string, count: number): string {
  return `Accepted ${countOf(count, "grant", "grants")} for ${title}. Anything outside them still asks.`;
}

export function readOnlyLine(title: string): string {
  return `${title} is read-only: it has no grants to accept.`;
}

export function alreadyAcceptedLine(title: string, at: string | null, zone: string): string {
  const when = at === null ? "" : ` on ${whenWords(at, zone)}`;
  return `${title}'s grants were accepted${when}. Changing them voids the acceptance.`;
}

export function runAnswerLine(title: string, run: RunRow): string {
  return `${title} · ${outcomeLine(run)}`;
}

export function stopRequestedLine(title: string): string {
  return `${title} · stop requested. Stopping does not undo what already ran.`;
}

export function wakeupCancelledLine(title: string, once: boolean, toggleChord: string): string {
  return once
    ? `${title} · wakeup cancelled. It will not run.`
    : `${title} · wakeups cancelled. The schedule is off; ${toggleChord} turns it back on.`;
}

export function switchedLine(title: string, on: boolean, cancelChord: string): string {
  return on
    ? `${title} is on.`
    : `${title} is off. A run in progress keeps going; ${cancelChord} stops it.`;
}

export function savedLine(title: string, created: boolean): string {
  return created ? `${title} added.` : `${title} saved.`;
}

export function savedAwaitingLine(
  title: string,
  posture: ToolPosture,
  acceptChord: string,
): string {
  return `${title} saved. Saving accepts nothing: read and accept its ${posture} grants with ${acceptChord}.`;
}

export function removeQuestion(title: string): string {
  return `remove ${title}? Its file and schedule go; its runs stay in the journal`;
}

export function removedLine(title: string): string {
  return `${title} removed. A run in progress was not stopped.`;
}

export const noThreadLine = "That run opened no thread.";
export const noChoreHere = "Move to a chore first.";
export const unreadableChore = "That chore's file does not parse; fix the file first.";

export function unreadableAnswer(path: string): string {
  return `the node answered ${path} in a shape this console does not read`;
}

export const formWords = {
  heading: (creature: string, editing: boolean) =>
    editing ? `edit a chore of ${creature}` : `new chore for ${creature}`,
  title: "title",
  id: "id",
  instructions: "instructions",
  trigger: "trigger",
  cron: "cron",
  tz: "time zone",
  until: "until",
  every: "every (minutes)",
  at: "at (ISO 8601, with offset)",
  paths: "paths or globs (one per line)",
  eventName: "event",
  where: "where (key=value, one per line)",
  webhookHint: "fires on POST to /hooks/<creature>/<id> with the token minted after saving",
  destination: "to",
  thread: "thread",
  path: "file",
  notify: "notify",
  tools: "tools",
  grants: "grants",
  usd: "budget (USD)",
  minutes: "budget (minutes)",
  save: "save",
  cancel: "cancel",
  keys: "enter or ctrl+enter saves · escape cancels",
  grantsHint: "one per line: an action, a space, then what it covers (for example: write notes/**)",
  untilHint: "optional: YYYY-MM-DD",
} as const;

export function grantsConsentLine(acceptChord: string): string {
  return `Saving accepts nothing: once saved, you read and accept these with ${acceptChord}.`;
}

export function idHint(derived: string): string {
  return derived === "" ? "lowercase letters, digits and dashes" : `${derived} unless you name it`;
}

export const triggerChoiceWords = {
  cron: "on a schedule",
  interval: "every n minutes",
  manual: "by hand",
  at: "once, at a time",
  "file-watch": "when files change",
  webhook: "on a webhook",
  event: "on an event",
} as const;

export const destinationChoiceWords = {
  conversation: "the conversation",
  thread: "a thread",
  file: "a file",
} as const;

export const toolChoiceWords: Readonly<Record<ToolPosture, string>> = {
  "read-only": "read-only",
  write: "write",
  act: "act",
};

export const draftProblems = {
  title: "A chore needs a title.",
  instructions: "A chore needs instructions.",
  id: "The id takes lowercase letters, digits and dashes, starting with a letter or digit.",
  cron: "A schedule needs a cron expression and a time zone.",
  every: "Every takes a whole number of minutes from 1 to 10080.",
  at: "Once needs an ISO 8601 date-time with its offset.",
  paths: "Name at least one path or glob under the workspace, one per line.",
  event: "Name the bus event exactly, for example turn.completed.",
  thread: "Name the thread it reports to.",
  path: "Name the file it writes to.",
  grant: "Each grant is one line: an action, a space, then what it covers.",
  usd: "The budget in USD is a number above 0.",
  minutes: "The budget in minutes is a whole number from 1.",
} as const;

const dayMinutes = 24 * 60;

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const weekdayPlurals = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
] as const;
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const listedTimesLimit = 6;

type TimeWords = { readonly kind: "every" | "at"; readonly words: string };

type DayWords = { readonly kind: "daily" | "weekdays" | "dates"; readonly words: string };

function scheduleWords(fields: CronFields): string | undefined {
  const time = timeWords(fields.minutes, fields.hours);
  const days = dayWords(fields);
  if (time === undefined || days === undefined) return undefined;
  const months = fields.months === "any" ? "" : ` in ${listOf(fields.months.map(monthName))}`;
  return `${timeOnDays(time, days)}${months}`;
}

function timeOnDays(time: TimeWords, days: DayWords): string {
  if (time.kind === "every")
    return days.kind === "daily" ? time.words : `${time.words} on ${days.words}`;
  switch (days.kind) {
    case "daily":
      return `every day ${time.words}`;
    case "weekdays":
      return `${days.words} ${time.words}`;
    case "dates":
      return `on ${days.words} ${time.words}`;
  }
}

function timeWords(minutes: readonly number[], hours: readonly number[]): TimeWords | undefined {
  const everyHour = hours.length === 24;
  const minuteStep = progressionStep(minutes, minuteSpan);
  const hourStep = progressionStep(hours, hourSpan);
  const [minute] = minutes;
  if (everyHour && minutes.length === 60) return { kind: "every", words: "every minute" };
  if (everyHour && minuteStep !== undefined) {
    return { kind: "every", words: `every ${minuteStep} minutes` };
  }
  if (minutes.length === 1 && minute !== undefined) {
    const past = minute === 0 ? "" : ` at :${pad(minute)}`;
    if (everyHour) return { kind: "every", words: `every hour${past}` };
    if (hourStep !== undefined) return { kind: "every", words: `every ${hourStep} hours${past}` };
  }
  const times = hours.flatMap((hour) => minutes.map((at) => `${pad(hour)}:${pad(at)}`));
  if (times.length > listedTimesLimit) return undefined;
  return { kind: "at", words: `at ${listOf(times)}` };
}

function dayWords(fields: CronFields): DayWords | undefined {
  const { days, weekdays } = fields;
  if (days === "any" && weekdays === "any") return { kind: "daily", words: "" };
  if (days === "any" && weekdays !== "any")
    return { kind: "weekdays", words: weekdayWords(weekdays) };
  if (days !== "any" && weekdays === "any") return { kind: "dates", words: dayOfMonthWords(days) };
  if (days === "any" || weekdays === "any" || !fields.eitherDay) return undefined;
  return { kind: "dates", words: `${dayOfMonthWords(days)} or ${weekdayWords(weekdays)}` };
}

function weekdayWords(weekdays: readonly number[]): string {
  const key = weekdays.join(",");
  if (key === "1,2,3,4,5") return "weekdays";
  if (key === "0,6") return "weekends";
  const [only] = weekdays;
  if (weekdays.length === 1 && only !== undefined) return weekdayPlurals[only] ?? String(only);
  return listOf(weekdays.map((day) => weekdayNames[day] ?? String(day)));
}

function dayOfMonthWords(days: readonly number[]): string {
  return days.length === 1 ? `day ${days[0]}` : `days ${listOf(days.map(String))}`;
}

function monthName(month: number): string {
  return monthNames[month - 1] ?? String(month);
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function everyOf(count: number, one: string, many: string): string {
  return count === 1 ? `every ${one}` : `every ${count} ${many}`;
}

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function zoneOfTrigger(trigger: ChoreTrigger, zone: string): string {
  return trigger.kind === "cron" ? trigger.tz : zone;
}

function reasonNote(run: RunRow): string | undefined {
  const outcome = runOutcome(run);
  return outcome.reason === null ? undefined : `${outcome.word}: ${outcome.reason}`;
}

function catchUpNote(run: RunRow, zone: string): string {
  const slot = wallOf(Date.parse(run.scheduledFor), zone)?.clock ?? run.scheduledFor;
  const ran = run.startedAt === null ? undefined : wallOf(Date.parse(run.startedAt), zone);
  return ran === undefined
    ? `catch-up of the ${slot} slot`
    : `caught up: the ${slot} slot ran at ${ran.clock}`;
}

function usdOf(usd: number): string {
  if (usd > 0 && usd < 0.01) return usd.toFixed(4).replace(/0+$/, "");
  return usd.toFixed(2);
}

function dayClock(iso: string, now: number, zone: string): string {
  const at = wallOf(Date.parse(iso), zone);
  const today = wallOf(now, zone);
  if (at === undefined || today === undefined) return iso;
  const ahead = at.dayNumber - today.dayNumber;
  if (ahead === 0) return `today ${at.clock}`;
  if (ahead === 1) return `tomorrow ${at.clock}`;
  if (ahead > 1 && ahead < 7) return `${at.weekday} ${at.clock}`;
  return `${at.month}-${at.day} ${at.clock}`;
}

interface Wall {
  readonly month: string;
  readonly day: string;
  readonly weekday: string;
  readonly clock: string;
  readonly dayNumber: number;
}

const formatters = new Map<string, Intl.DateTimeFormat | undefined>();

function wallOf(ms: number, zone: string): Wall | undefined {
  const formatter = Number.isFinite(ms) ? formatterOf(zone) : undefined;
  if (formatter === undefined) return undefined;
  const parts = Object.fromEntries(
    formatter.formatToParts(ms).map((part) => [part.type, part.value]),
  );
  const [year, month, day] = [Number(parts.year), Number(parts.month), Number(parts.day)];
  return {
    month: parts.month ?? "",
    day: parts.day ?? "",
    weekday: parts.weekday ?? "",
    clock: `${parts.hour}:${parts.minute}`,
    dayNumber: Date.UTC(year, month - 1, day) / (dayMinutes * 60_000),
  };
}

function formatterOf(zone: string): Intl.DateTimeFormat | undefined {
  if (!formatters.has(zone)) formatters.set(zone, formatterIn(zone));
  return formatters.get(zone);
}

function formatterIn(zone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return undefined;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
