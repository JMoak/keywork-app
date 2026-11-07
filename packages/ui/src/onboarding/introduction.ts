export const introducingClient = "stead-onboarding";
export const introductionWordLimit = 80;

export interface IntroductionFacts {
  readonly name: string;
  readonly workspace: string;
  readonly named: boolean;
  readonly names: readonly string[];
}

export function introductionFrame(facts: IntroductionFacts): string {
  return facts.named ? namedFrame(facts) : unnamedFrame(facts);
}

function namedFrame(facts: IntroductionFacts): string {
  return [
    `You are ${facts.name}, the keeper's creature, and this is your first thread.`,
    introductionShape(facts.workspace),
  ].join(" ");
}

function unnamedFrame(facts: IntroductionFacts): string {
  const [first, second, third] = facts.names;
  return [
    `You are a new creature whose name is not settled, and this is your first thread.`,
    `Your first message is one question and nothing else: offer the three plain names ${first}, ${second} and ${third}, say that ${facts.name} stands until one is chosen, and wait.`,
    `Once the keeper has chosen: ${introductionShape(facts.workspace)}`,
  ].join(" ");
}

function introductionShape(workspace: string): string {
  return [
    `Introduce yourself in under ${introductionWordLimit} words from what you already know:`,
    "your creature.json, your workshop and the keeper's name.",
    `You live in the workspace at ${workspace}, but read nothing and run no tool before you speak:`,
    "this first message needs no ask.",
    "Say who you are, three concrete things you could take on here once the keeper asks,",
    "and one line saying what you can and cannot reach right now, taken from the capability list you were given.",
    "Propose nothing that needs a gate that does not exist.",
    "Address the keeper by name once if you know it.",
    "No exclamation marks.",
  ].join(" ");
}
