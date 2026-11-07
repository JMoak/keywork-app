import type { LandmarkKind } from "@keywork-app/habitat";
import { formatCost } from "../../instruments/format.ts";
import type { ModelChoice, ModelClass, ThreadState, WorkshopHealthWord } from "./wire.ts";

export const creatureWord = "creature";

export const sectionWords = {
  body: "body",
  workshop: "workshop",
  models: "models",
  threads: "threads",
  usage: "usage",
  chores: "chores",
  memory: "memory",
  remembered: "Remembered",
  calibration: "calibration",
  shadow: "your calls, shadowed",
} as const;

export const groupWords = {
  conversation: "conversation",
  threads: "threads",
  children: "children",
} as const;

export const threadStateWords: Readonly<Record<ThreadState, string>> = {
  working: "working",
  waiting: "waiting on you",
  back: "back",
  blocked: "blocked",
  paused: "paused",
};

export const workshopHealthWords: Readonly<Record<WorkshopHealthWord, string>> = {
  up: "up",
  starting: "starting",
  unresponsive: "not responding",
  down: "down",
};

export const hostWorkshopLine = "host · the bare node, unconfined";
export const workshopHealthUnknown = "health unknown";

export const inheritWord = "inherit";
export const inheritHint = "workspace, then user";
export const unpricedWord = "unpriced";
export const usageHeadings = ["", "sessions", "cost (USD)"] as const;
export const usagePeriods = { today: "today", week: "this week" } as const;

export const nothingEnforced =
  "Nothing is enforced: keeper.would-approve runs in shadow, every ask still waits for the " +
  "keeper, and no recommendation ever reaches a session.";
export const noAsksAnswered = "No answered asks yet · each ask you answer adds a row";
export const noReportRoute =
  "No report route on this node yet · `keywork creatures report` prints it in a shell";
export const oneWayDoorWord = "one-way door, stays ask-only";

export function decidedForYouLine(promotions: readonly { ruleClass: string }[]): string {
  const classes = [...new Set(promotions.map((promotion) => promotion.ruleClass))];
  return `${classes.join(", ")} ${classes.length === 1 ? "decides" : "decide"} for you: an ask in that class is logged as decided, and its notice carries the id to overturn it`;
}

export function calibrationLine(entry: {
  model: string;
  state: string;
  labelled: number;
  sampleSize: number;
  agreement?: number | undefined;
  lowerBound?: number | undefined;
}): string {
  const measured =
    entry.agreement === undefined || entry.lowerBound === undefined
      ? "agreement sealed until the sample completes"
      : `agreement ${(entry.agreement * 100).toFixed(1)}%, lower bound ${(entry.lowerBound * 100).toFixed(1)}%`;
  return `${entry.model} · ${entry.state} · ${entry.labelled} labelled of ${entry.sampleSize} planned · ${measured}`;
}

export const firstLines: Readonly<Record<LandmarkKind, string>> = {
  workshop: "the workshop was raised",
  tree: "the first crate delivered planted the tree",
  "lantern-post": "the first gate walked through lit the lantern post",
  weathervane: "the first chore that ran while you were away set the weathervane turning",
  chair: "the first time you took over its screen left the chair on the porch",
  well: "the first night it worked through dug the well",
};
export const nothingRemembered = "Nothing remembered yet · the first delivery plants the tree";

export const noCreatureHere = "no creature has that slug";
export const noSlugChosen = "no creature chosen";
export const noWorkshopToOpen = "its workshop is the bare host · nothing to open";
export const noChoresToPause = "no chores to pause";
export const noNotesYet = "no notes yet";
export const skinRefusedWord = "skin refused";

export function emptyStateLine(makeChord: string): string {
  return `No creature yet · make one with ${makeChord}`;
}

export function handleLine(slug: string): string {
  return `@${slug}`;
}

export function keyHints(keys: {
  rename: string;
  skin: string;
  policy: string;
  conversation: string;
  pause: string;
  remove: string;
}): string {
  return [
    `${keys.rename} rename`,
    `${keys.skin} body`,
    `${keys.policy} models`,
    `${keys.conversation} conversation`,
    `${keys.pause} pause`,
    `${keys.remove} delete`,
  ].join(" · ");
}

export function bodyLine(skin: string, seed: number): string {
  return `${skin} · seed ${seed}`;
}

export function workshopLine(
  id: string,
  substrate: string | undefined,
  health: WorkshopHealthWord | undefined,
  limitations: readonly string[],
): string {
  const parts = [
    id,
    substrate,
    health === undefined ? workshopHealthUnknown : workshopHealthWords[health],
    ...limitations,
  ];
  return parts.filter((part): part is string => part !== undefined && part !== "").join(" · ");
}

export function modelChoiceLine(choice: ModelChoice): string {
  return choice === "inherit"
    ? `${inheritWord} · ${inheritHint}`
    : `${choice.provider}/${choice.model}`;
}

export function classWord(modelClass: ModelClass): string {
  return modelClass;
}

export function costWord(costNanos: number | null | undefined): string {
  return costNanos === null || costNanos === undefined
    ? unpricedWord
    : formatCost(costNanos / 1e9).slice(1);
}

export function childrenWord(count: number): string {
  return count === 1 ? "1 child" : `${count} children`;
}

export function choresLine(facts: {
  total: number;
  off: number;
  next: { title: string; at: string } | undefined;
}): string {
  if (facts.total === 0) return "no chores";
  const parts = [
    facts.total === 1 ? "1 chore" : `${facts.total} chores`,
    facts.off > 0 ? `${facts.off} off` : undefined,
    facts.next === undefined ? undefined : `next: ${facts.next.title} at ${facts.next.at}`,
  ];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function memoryLine(notes: number | undefined, inbox: number): string {
  const noteCount =
    notes === undefined
      ? noNotesYet
      : notes === 1
        ? "1 note in its layer"
        : `${notes} notes in its layer`;
  const waiting = inbox === 0 ? "inbox empty" : `${inbox} in the inbox`;
  return `${noteCount} · ${waiting}`;
}

export function opensLine(chord: string, what: string): string {
  return `${chord} opens ${what}`;
}

export function shadowClassLine(facts: {
  ruleClass: string;
  rows: number;
  agreement: number | undefined;
  wouldAct: number;
  gradeWord: string;
  oneWayDoor: boolean;
}): string {
  const parts = [
    facts.rows === 1 ? "1 row" : `${facts.rows} rows`,
    facts.agreement === undefined ? undefined : `agreement ${percent(facts.agreement)}`,
    `would act ${facts.wouldAct}`,
    facts.oneWayDoor ? oneWayDoorWord : facts.gradeWord,
  ];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function deleteTitle(name: string): string {
  return `Delete ${name}`;
}

export function goesLine(facts: {
  name: string;
  threads: number;
  notes: number;
  chores: number;
  workshop: string | undefined;
}): string {
  const items = [
    `${facts.name}'s threads (${facts.threads}, to trash)`,
    `its notes (${facts.notes})`,
    `its chores (${facts.chores})`,
  ];
  if (facts.workshop === undefined) return `Goes: ${joinWithAnd(items)}.`;
  return `Goes: ${items.join(", ")}, and its workshop ${facts.workshop} unless you keep it.`;
}

export const staysLine =
  "Stays: your own notes, the workspace, everything already in the storehouse, and the " +
  "plaque on the boarded workshop.";

export function doesNotUndoLine(name: string): string {
  return `Deleting does not undo anything ${name} already did. The audit log keeps every step.`;
}

export const keepWorkshopWord = "keep the workshop";
export const cancelWord = "Cancel";

export function deleteButtonWord(name: string): string {
  return `Delete ${name}`;
}

export function cardKeysLine(keys: { confirm: string; keep: string | undefined }): string {
  const parts = [
    `${keys.confirm} deletes`,
    keys.keep === undefined ? undefined : `${keys.keep} toggles keeping the workshop`,
    "any other key cancels",
  ];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function goneLine(facts: {
  name: string;
  threads: number;
  notes: number;
  chores: number;
  workshopKept: string | undefined;
  workshopGone: string | undefined;
}): string {
  const parts = [
    `${facts.name} is gone: ${facts.threads} ${facts.threads === 1 ? "thread" : "threads"} to trash`,
    `${facts.notes} ${facts.notes === 1 ? "note" : "notes"} retired`,
    `${facts.chores} ${facts.chores === 1 ? "chore" : "chores"} removed`,
    facts.workshopKept === undefined ? undefined : `workshop ${facts.workshopKept} kept`,
    facts.workshopGone === undefined ? undefined : `workshop ${facts.workshopGone} removed`,
  ];
  const said = parts.filter((part): part is string => part !== undefined).join(", ");
  return `${said}.`;
}

export function noVerbYetLine(thing: string, path: string, editorChord: string): string {
  return `Blocked: the node has no route to change the ${thing} yet. Next step: edit ${path}; ${editorChord} opens it in your editor.`;
}

export function refusedLine(thing: string, detail: string): string {
  return `Blocked: ${thing} refused, ${detail}.`;
}

export function renamedLine(name: string): string {
  return `now named ${name}`;
}

export function skinChangedLine(skin: string): string {
  return `body: ${skin}`;
}

export function policyChangedLine(modelClass: ModelClass, choice: ModelChoice): string {
  return `${modelClass}: ${choice === "inherit" ? inheritWord : `${choice.provider}/${choice.model}`}`;
}

export function pausedLine(count: number, resumeChord: string): string {
  const chores = count === 1 ? "1 chore does" : `${count} chores do`;
  return `Paused: ${chores} not fire until you resume; ${resumeChord} resumes. Live threads finish.`;
}

export function resumedLine(count: number): string {
  return count === 1
    ? "Resumed: 1 chore fires on schedule again."
    : `Resumed: ${count} chores fire on schedule again.`;
}

export const renamePlaceholder = "a plain name · short, pronounceable, one or two syllables";
export const renameLabel = "name";
export const modelLabel = "provider/model";
export const modelPlaceholder = "provider/model · empty inherits";
export const badModelReference = "a model is provider/model, or empty to inherit";
export const badName = "a name is one to sixty-four characters";

export function skinQuestion(name: string): string {
  return `body for ${name}`;
}

export function classQuestion(name: string): string {
  return `which class of ${name}'s models`;
}

export const classChoices: Readonly<Record<string, string>> = {
  s: "strong",
  l: "loop",
  d: "decide",
  v: "vision",
};

export const classOfChoice: Readonly<Record<string, ModelClass>> = {
  s: "strong",
  l: "loop",
  d: "decide",
  v: "vision",
};

function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
