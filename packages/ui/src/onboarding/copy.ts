export const stageName = "a new creature";

export const eggName = "an egg";
export const notNowKey = "esc not now";
export const eggKeys = `enter hatches it · ${notNowKey}`;
export const meetKeys = "← → who · ↑ ↓ colour · tab another name · enter keeps";
export const retryKeys = `enter tries again · ${notNowKey}`;

export const nameField = "name";
export const nameRefused = "a name is one to sixty-four characters";
export const nameTaken = "that name is taken on this computer";

export const previousLook = "who: the one before";
export const nextLook = "who: the next one";
export const coatsName = "colour";
export const anotherName = "another name";

export function coatName(coat: number, coats: number): string {
  return `colour ${coat} of ${coats}`;
}

const lookLines: Readonly<Record<string, string>> = {
  cairn: "cairn · three floating stones, the middle one a ring",
  tessera: "tessera · a crab under a dome of mosaic tiles",
  folio: "folio · a small dragon whose wings are leaves",
  purl: "purl · a small cuttlefish in a striped mantle",
  hush: "hush · a ring of stone with a small storm kept inside",
  knot: "knot · a length of ribbon, knotted so that it stands",
  beaver: "beaver · lab coat, square glasses, a twig behind one ear",
  newfie: "newfie · a big gentle dog in round glasses",
  hippo: "hippo · round and solid, one eyebrow up at its own joke",
};

export function lookLine(id: string, displayName: string = id): string {
  return lookLines[id] ?? displayName.toLowerCase();
}

export const hostLimitation =
  "no sandbox: commands run with your account's access · anything beyond reading its own folder asks you first";
export const installStep =
  "a sealed sandbox needs Docker Sandboxes installed first (on Windows: winget install -h Docker.sbx) · you can move it into one later from its workshop";

export function noWorkshopsServed(detail: string | undefined): string {
  const because = detail === undefined ? "" : ` (${detail})`;
  return `no sandbox is available here yet${because} · its commands run directly on this computer`;
}

export const nothingReachableLine = "no model is connected yet";
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

export const readyLine = "ready";

export function workshopRaisedLine(substrate: "host" | "sbx"): string {
  return substrate === "sbx"
    ? "its sandbox is ready and starts with its first task"
    : "its commands run directly on this computer · anything beyond reading its own folder asks you first";
}

export function workshopRefusedLine(detail: string): string {
  return `no sandbox was set up (${detail}) · its commands run directly on this computer`;
}

export function threadWaitsLine(refusal?: string): string {
  const line = "introduces itself once a model is connected";
  return refusal === undefined ? line : `${line} · ${refusal}`;
}

export function threadRefusedLine(detail: string): string {
  return `its first conversation did not open: ${detail}`;
}

export const conversationKeys = "enter opens its conversation";
export const connectKeys = "enter connects a model · esc later";
export const closeKeys = "enter closes";
