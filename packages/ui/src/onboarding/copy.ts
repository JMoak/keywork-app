export const onboardingName = "first creature";

export const stepWords = {
  name: "name",
  skin: "skin",
  workshop: "workshop",
  models: "models",
} as const;

export function titleLine(workspace: string): string {
  return `a creature for ${workspace}`;
}

export const readingLine = "reading what this machine supports and what is reachable";

export const nameAsk = "Name it, or take one it proposes.";
export const nameField = "name";
export const nameRefused = "a name is one to sixty-four characters";

export function nameProposals(names: readonly string[]): string {
  return names.map((name, index) => `${index + 1} ${name}`).join(" · ");
}

export function nameKeys(first: string): string {
  return `enter keeps the name · 1 2 3 take a proposal · esc skips and it answers to ${first} until you rename it`;
}

export const skinAsk = "How it looks on the stead.";
export const surpriseWord = "surprise me";
export const skinKeys = "j k move · enter keeps · esc skips and takes the tinkerer";

const skinWords: Readonly<Record<string, string>> = {
  kid: "the tinkerer · a small ranch hand in a leather apron, tools on its belt",
};

export function skinLabel(id: string): string {
  return skinWords[id] ?? id;
}

export const workshopAsk = "Where its threads run.";
export const substrateWords = {
  host: "a bare host workshop on this machine",
  sbx: "a sealed microVM on this machine (sbx)",
} as const;
export const hostLimitation = "commands run unconfined on this machine and nothing is sealed";
export const installStep =
  "one install step: Docker Sandboxes (sbx), winget install -h Docker.sbx on Windows; the workshop pane raises a sealed one afterwards";

export function noWorkshopsServed(detail: string | undefined): string {
  const because = detail === undefined ? "" : ` (${detail})`;
  return `this node serves no workshops yet${because}; threads run on the bare node`;
}

export function workshopKeys(installOffered: boolean): string {
  const install = installOffered ? " · i opens a terminal for the install step" : "";
  return `j k move · enter keeps${install} · esc skips and takes what this machine has`;
}

export const modelsAsk = "Which models answer, local first.";
export const localFirstWord = "local first";
export const inheritWord = "inherit everywhere";
export const cloudNeverRequired =
  "a cloud key is never required · inherit keeps whatever model the server already answers with";
export const nothingReachableLine = "nothing is reachable that the console can see";
export const connectKey = "c opens `keywork connect` in a terminal pane";
export const modelsKeys = "j k move · enter keeps · esc skips and inherits everywhere";
export const noInventoryLine = (detail: string | undefined): string =>
  detail === undefined
    ? "this node serves no model inventory"
    : `this node serves no model inventory (${detail})`;

export function cloudLine(model: string | undefined): string {
  return model === undefined
    ? "cloud: unknown until the first turn answers"
    : `cloud: ${model} answered this workspace before`;
}

export function connectedCloudLine(providers: readonly string[]): string {
  return `cloud: ${providers.join(", ")} connected with \`keywork connect\``;
}

export function unverifiedCloudLine(providers: readonly string[]): string {
  return `${connectedCloudLine(providers)}, not yet answered`;
}

export function reachableModelLine(facts: {
  model: string;
  node: string;
  server: string;
  classes: readonly string[];
  loaded: boolean;
}): string {
  const classes = facts.classes.length === 0 ? "no class yet" : facts.classes.join(" ");
  const loaded = facts.loaded ? " · loaded" : "";
  return `${facts.model} on ${facts.node} (${facts.server}) · ${classes}${loaded}`;
}

export const acceptRestKey = "a accepts the rest";
export const backKey = "backspace goes back";
export const notNowKey = "x not now";

export function makingLine(name: string): string {
  return `making ${name}`;
}

export function madeLine(name: string): string {
  return `${name} is made · its workshop rises on the stead`;
}

export function workshopRaisedLine(substrate: "host" | "sbx"): string {
  return substrate === "sbx"
    ? "a sealed workshop is raised and stopped until its first thread"
    : "a bare host workshop is raised";
}

export function workshopRefusedLine(detail: string): string {
  return `no workshop was raised: ${detail} · threads run on the bare node`;
}

export function threadLine(name: string, through?: string): string {
  const line = `${name} opens its first thread and introduces itself`;
  return through === undefined ? line : `${line} through ${through}`;
}

export function threadWaitsLine(name: string, refusal?: string): string {
  const line = `${name} opens its first thread and introduces itself once a model is reachable`;
  return refusal === undefined ? line : `${line} · inherit resolves nothing: ${refusal}`;
}

export function threadRefusedLine(detail: string): string {
  return `its first thread did not open: ${detail}`;
}

export function notMadeLine(detail: string): string {
  return `not made: ${detail} · ${backKey}`;
}

export const madeKeys = "enter closes this card · the thread stays open";
