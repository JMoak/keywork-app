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

export const homeTitle = "a creature for your home";

export const readingLine = "checking what this computer can run";

export const nameAsk = "Name it, or take one it proposes.";
export const nameField = "name";
export const nameRefused = "a name is one to sixty-four characters";

export function nameProposals(names: readonly string[]): string {
  return names.map((name, index) => `${index + 1} ${name}`).join(" · ");
}

export const backKey = "backspace goes back";
export const notNowKey = "esc not now";
export const acceptRestKey = "a keeps the suggestions for the rest";

export function nameKeys(first: string): string {
  return `enter keeps what you type, or ${first} · 1 2 3 take a proposal · ${notNowKey}`;
}

export const skinAsk = "How it looks on the stead.";
export const surpriseWord = "surprise me";
export const skinKeys = "j k move · enter keeps";

const skinWords: Readonly<Record<string, string>> = {
  kid: "the tinkerer · a small ranch hand in a leather apron, tools on its belt",
};

export function skinLabel(id: string): string {
  return skinWords[id] ?? id;
}

export const workshopAsk = "Where its commands run.";
export const substrateWords = {
  host: "directly on this computer",
  sbx: "in a sealed sandbox on this computer",
} as const;
export const hostLimitation =
  "no sandbox: commands run with your account's access · anything beyond reading its own folder asks you first";
export const installStep =
  "a sealed sandbox needs Docker Sandboxes installed first (on Windows: winget install -h Docker.sbx) · you can move it into one later from its workshop";

export function noWorkshopsServed(detail: string | undefined): string {
  const because = detail === undefined ? "" : ` (${detail})`;
  return `no sandbox is available here yet${because} · its commands run directly on this computer`;
}

export function workshopKeys(installOffered: boolean): string {
  const install = installOffered ? " · i opens a terminal to install it" : "";
  return `j k move · enter keeps${install}`;
}

export const modelsAsk = "Which models it uses.";
export const localFirstWord = "models on this computer first";
export const inheritWord = "the model your conversations use";
export const cloudNeverRequired =
  "no cloud account needed · it answers with whatever model already answers you here";
export const nothingReachableLine = "no model is connected yet";
export const connectKey = "c connects a model in a terminal (`keywork connect`)";
export const modelsKeys = "j k move · enter keeps";
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

export function makingLine(name: string): string {
  return `making ${name}`;
}

export function madeLine(name: string): string {
  return `${name} is ready · you will find it on the stead`;
}

export function workshopRaisedLine(substrate: "host" | "sbx"): string {
  return substrate === "sbx"
    ? "its sandbox is ready and starts with its first task"
    : "its commands run directly on this computer";
}

export function workshopRefusedLine(detail: string): string {
  return `no sandbox was set up (${detail}) · its commands run directly on this computer`;
}

export function threadLine(name: string, through?: string): string {
  const line = `${name} opens its first conversation and introduces itself`;
  return through === undefined ? line : `${line} through ${through}`;
}

export function threadWaitsLine(name: string, refusal?: string): string {
  const line = `${name} introduces itself once a model is connected`;
  return refusal === undefined ? line : `${line} · ${refusal}`;
}

export function threadRefusedLine(detail: string): string {
  return `its first conversation did not open: ${detail}`;
}

export function notMadeLine(detail: string): string {
  return `not made: ${detail} · ${backKey} · ${notNowKey}`;
}

export const madeKeys = "enter closes this card · the conversation stays open";
