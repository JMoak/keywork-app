import type { PostureFacts } from "./facts.ts";

export interface Fingerprint {
  readonly version: string;
  readonly manifests: readonly string[];
  readonly mcp: readonly string[];
  readonly bots: readonly string[];
}

export type FactKind = "manifest" | "mcp" | "bot" | "version";

export interface Fact {
  readonly kind: FactKind;
  readonly name: string;
}

export const blankFingerprint: Fingerprint = { version: "", manifests: [], mcp: [], bots: [] };

export function fingerprintOf(
  facts: PostureFacts,
  settled: Fingerprint = blankFingerprint,
): Fingerprint {
  return {
    version: facts.version ?? settled.version,
    manifests: sorted(facts.manifests ?? settled.manifests),
    mcp: sorted(facts.mcp?.map((server) => server.name) ?? settled.mcp),
    bots: sorted(facts.bots ?? settled.bots),
  };
}

export function factsBeyond(settled: Fingerprint | undefined, current: Fingerprint): Fact[] {
  const before = settled ?? blankFingerprint;
  return [
    ...added("manifest", before.manifests, current.manifests),
    ...added("mcp", before.mcp, current.mcp),
    ...added("bot", before.bots, current.bots),
    ...(current.version === before.version ? [] : [fact("version", current.version)]),
  ];
}

export function sameFingerprint(left: Fingerprint | undefined, right: Fingerprint): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

export function sameFact(left: Fact, right: Fact): boolean {
  return left.kind === right.kind && left.name === right.name;
}

export function differenceNotice(
  facts: readonly Fact[],
  proposed: number,
  firstSetup: boolean,
): string {
  const proposes = `trust-setup proposes ${counted(proposed, "rule")}`;
  if (firstSetup) return `no trust setup for this workspace yet · ${proposes}`;
  return [...factPhrases(facts), proposes].join(" · ");
}

export function counted(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

const factNouns: Readonly<Record<Exclude<FactKind, "version">, string>> = {
  manifest: "manifest",
  mcp: "mcp server",
  bot: "bot",
};

export function factPhrases(facts: readonly Fact[]): string[] {
  const named = (kind: FactKind): string[] =>
    facts.filter((fact) => fact.kind === kind).map((fact) => fact.name);
  const version = named("version")[0];
  return [
    ...(["manifest", "mcp", "bot"] as const).flatMap((kind) => {
      const names = named(kind);
      if (names.length === 0) return [];
      const noun = names.length === 1 ? factNouns[kind] : `${factNouns[kind]}s`;
      return [`new ${noun}: ${names.join(", ")}`];
    }),
    ...(version === undefined ? [] : [`keywork now ${version}`]),
  ];
}

function added(kind: FactKind, before: readonly string[], after: readonly string[]): Fact[] {
  return after.filter((name) => !before.includes(name)).map((name) => fact(kind, name));
}

function fact(kind: FactKind, name: string): Fact {
  return { kind, name };
}

function sorted(names: readonly string[]): string[] {
  return [...names].sort();
}
