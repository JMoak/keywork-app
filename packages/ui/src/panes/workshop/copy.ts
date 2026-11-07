import type {
  SubstrateKind,
  TerminalRun,
  WorkshopDetailRecord,
  WorkshopHealth,
  WorkshopRecord,
  WorkshopRemoval,
  WorkshopState,
  WorkshopTerminalEntry,
} from "./port.ts";

export const paneName = "workshop";

export const paletteHeading = "in a workshop";

export const substrateWords: Readonly<Record<SubstrateKind, string>> = {
  sbx: "sealed microVM",
  compose: "compose box",
  host: "bare host",
};

export const substrateMarks: Readonly<Record<SubstrateKind, string>> = {
  sbx: "sbx",
  compose: "compose",
  host: "host",
};

export const stateWords: Readonly<Record<WorkshopState, string>> = {
  stopped: "stopped",
  running: "running",
};

export const healthWords: Readonly<Record<WorkshopHealth, string>> = {
  up: "up",
  starting: "starting",
  unresponsive: "not responding",
  down: "down",
};

export const healthUnread = "health unread";

export const roomNames = {
  display: "display",
  terminal: "terminal",
  files: "files",
  egress: "egress",
  refusals: "refusals",
  brokers: "brokers",
  snapshots: "snapshots",
  ledger: "disk and memory",
} as const;

export const threadStateWords = {
  needsYou: "needs you",
  working: "working",
  live: "live",
  idle: "idle",
} as const;

export const sealStep =
  "to seal it: install the sbx CLI (on Windows, turn on Windows Hypervisor Platform first), then raise the workshop again";

export const notReported = "not reported by this node";

export const costUnknown = "unknown";

export const readingLine = "reading the workshops on this node";

export const displayOpeningLine = "opening the window";

export const noTypingLine =
  "typing into the workshop is not served by this node yet · the mirror shows the engine's own bash in it";

export const snapshotsServedLine = "served by this node but not read by this pane yet";

export const typePrompt = "type a command for the workshop";

export const typePlaceholder = "command";

export const nothingRefused = "nothing refused yet";

export const outputLinesShown = 12;

export const typedLogShown = 3;

export const raisePrompt = "raise a workshop for which creature?";

export const raisePlaceholder = "creature slug";

export const removeChoices = { k: "keeps its disk", w: "wipes everything inside" } as const;

export const frameAlt = "the workshop display, view only";

export function workshopTitle(creature: string | undefined): string {
  return creature === undefined ? paneName : `${paneName} · ${creature}`;
}

export function emptyStateLine(raiseChord: string): string {
  return `No workshop yet · raise one with ${raiseChord}`;
}

export function noWorkshopFor(creature: string, raiseChord: string): string {
  return `No workshop for ${creature} yet · raise one with ${raiseChord}`;
}

export function headLine(facts: {
  substrate: SubstrateKind;
  state: WorkshopState;
  health: WorkshopHealth | undefined;
  raised: string;
}): string {
  const health = facts.health === undefined ? healthUnread : healthWords[facts.health];
  return `${substrateWords[facts.substrate]} · ${stateWords[facts.state]} · ${health} · raised ${facts.raised}`;
}

export const elsewhereHeading = "other workshops on this node";

export function elsewhereLine(facts: {
  creature: string;
  id: string;
  substrate: SubstrateKind;
  state: WorkshopState;
  raised: string;
}): string {
  return `${facts.creature} · ${facts.id} · ${substrateWords[facts.substrate]} · ${stateWords[facts.state]} · raised ${facts.raised}`;
}

export function placeLine(
  index: number,
  total: number,
  keys: { next: string; previous: string },
): string {
  if (total < 2) return "";
  return `${index + 1} of ${total} on this node · ${keys.next} next · ${keys.previous} previous`;
}

export function limitationLines(
  substrate: SubstrateKind,
  limitations: readonly string[],
): string[] {
  return substrate === "host" ? [...limitations, sealStep] : [...limitations];
}

export function noDisplayLine(substrate: SubstrateKind): string {
  return substrate === "host"
    ? "no display · a bare host workshop has none"
    : "no display · this workshop runs no Xvfb";
}

export function displayDarkLine(startChord: string): string {
  return `display dark while the workshop is stopped · ${startChord} starts it`;
}

export function displayReadyLine(displayChord: string): string {
  return `${displayChord} opens the window · view only`;
}

export function watchingLine(frameAt: string, displayChord: string): string {
  return `watching · view only · 1 fps · frame at ${frameAt} · ${displayChord} closes it · taking over waits for the screen viewer`;
}

export function displayEndedLine(detail: string | undefined): string {
  return detail === undefined ? "the display went away" : `the display went away · ${detail}`;
}

export function displayRefusedLine(error: string): string {
  return `no display · ${error}`;
}

export function threadsLead(creature: string, count: number, terminalChord: string): string {
  if (count === 0) return `no thread of ${creature} runs in the workshop yet`;
  const threads = count === 1 ? "1 thread" : `${count} threads`;
  return `${threads} of ${creature} in the workshop · ${terminalChord} mirrors the newest bash`;
}

export function typedTerminalLead(creature: string, count: number, typeChord: string): string {
  const threads =
    count === 0
      ? `no thread of ${creature} runs in the workshop yet`
      : `${count === 1 ? "1 thread" : `${count} threads`} of ${creature} in the workshop`;
  return `${threads} · ${typeChord} types a command into it`;
}

export function terminalNote(terminal: WorkshopDetailRecord["terminal"]): string {
  return terminal.allowed
    ? `typed commands run as the creature's bash would · ${terminal.reason}`
    : `typing is refused by this node · ${terminal.reason}`;
}

export function typedLogLine(time: string, entry: WorkshopTerminalEntry): string {
  const outcome =
    "code" in entry.outcome
      ? entry.outcome.timedOut
        ? "timed out"
        : `exit ${entry.outcome.code}`
      : `refused · ${entry.outcome.error}`;
  return `${time} · ${entry.input.command} · ${outcome}`;
}

export function typedRunLines(command: string, run: TerminalRun): string[] {
  const out = [...run.stdout.trimEnd().split("\n"), ...run.stderr.trimEnd().split("\n")].filter(
    (line) => line !== "",
  );
  const ending = run.timedOut ? `exit ${run.code} · timed out` : `exit ${run.code}`;
  return [`$ ${command}`, ...out.slice(-outputLinesShown), ending];
}

export function egressLines(detail: WorkshopDetailRecord): string[] {
  const { egress } = detail;
  const policy =
    egress.policy === "none"
      ? "none · a bare host has no egress policy"
      : egress.enforced
        ? "deny-all · enforced by the microVM"
        : "deny-all · recorded, not enforced";
  const rules =
    egress.rules.length > 0
      ? `allows ${egress.rules.map(egressRuleWord).join(", ")}`
      : egress.policy === "none"
        ? undefined
        : "allows no host beyond the brokers";
  const brokers =
    egress.brokerHosts.length > 0 ? `brokers reach ${egress.brokerHosts.join(", ")}` : undefined;
  return [policy, rules, brokers].filter((line) => line !== undefined);
}

export function egressRuleWord(rule: WorkshopDetailRecord["egress"]["rules"][number]): string {
  const where = rule.port === undefined ? rule.host : `${rule.host}:${rule.port}`;
  return rule.methods === undefined || rule.methods === "any"
    ? where
    : `${where} (${rule.methods.join(" ")})`;
}

export function refusalEntryLine(
  time: string,
  entry: WorkshopDetailRecord["refusals"]["entries"][number],
): string {
  return `${time} · ${entry.operation} refused (${entry.refused}) · ${entry.error}`;
}

export function measuredWord(
  used: number | null,
  whole: number | null,
  unmeasured: readonly string[],
): string {
  if (used === null)
    return unmeasured.length === 0 ? notReported : `not measured · ${unmeasured.join("; ")}`;
  return whole === null
    ? `${bytesWord(used)} used`
    : `${bytesWord(used)} used of ${bytesWord(whole)}`;
}

export function bytesWord(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function noThreadToMirror(creature: string): string {
  return `no thread of ${creature} to mirror yet`;
}

export function filesLines(
  substrate: SubstrateKind,
  workdir: string,
  filesChord: string,
): string[] {
  if (substrate === "host") return [workdir, `${filesChord} opens it in your file browser`];
  return [
    `${workdir} inside the ${substrateWords[substrate]}`,
    "not reachable from this console · the creature's threads read and write it",
  ];
}

export function filesRefusedLine(substrate: SubstrateKind): string {
  return `files inside a ${substrateWords[substrate]} are not served to this console yet`;
}

export function egressLine(substrate: SubstrateKind): string {
  return substrate === "host"
    ? "none · a bare host has no egress policy"
    : "deny-all except the hosts named when it was raised · the log of refusals is not served by this node yet";
}

export function brokersLine(brokers: readonly string[]): string {
  if (brokers.length === 0) return "none · no provider credential is brokered";
  return `${brokers.join(", ")} · names only; the values stay on the node and the workshop sees sentinels`;
}

export function costWord(nanos: number | undefined): string {
  if (nanos === undefined) return costUnknown;
  const usd = nanos / 1_000_000_000;
  if (usd > 0 && usd < 0.01) return "under 0.01 USD";
  return `${usd.toFixed(2)} USD`;
}

export function threadCountWord(count: number): string {
  return String(count);
}

export function refusalLine(verb: string, refusal: { error: string }): string {
  return `could not ${verb} · ${refusal.error}`;
}

export function raisedLine(record: WorkshopRecord): string {
  return `raised a ${substrateWords[record.substrate]} for ${record.creature} · ${record.id}`;
}

export function removedLine(removal: WorkshopRemoval): string {
  return removal.keptDisk
    ? "removed · its disk is kept under workshops-kept on the node"
    : "removed · everything inside is gone";
}

export function removeQuestion(creature: string): string {
  return `remove the workshop of ${creature}?`;
}

export function raisedWord(iso: string, offsetMinutes: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "an unknown time";
  const shifted = new Date(ms + offsetMinutes * 60_000);
  const date = shifted.toISOString().slice(0, 10);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${date} ${hours}:${minutes}`;
}
