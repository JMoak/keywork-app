export const ratchetsFile = "scripts/textures/ratchets.json";
export const textures = ["T1", "T2", "T6", "T7", "T8"] as const;

export type Better = "higher" | "lower";

export interface Ratchet {
  readonly value: number;
  readonly better: Better;
  readonly why: string;
}

export type Ratchets = Readonly<Record<string, Ratchet>>;

export function parseRatchets(candidate: unknown): Ratchets {
  if (!isRecord(candidate)) throw new Error(`${ratchetsFile} must be an object of ratchets`);
  return Object.fromEntries(
    Object.entries(candidate).map(([key, ratchet]) => [key, parseRatchet(key, ratchet)]),
  );
}

export function coverageGaps(ratchets: Ratchets): string[] {
  return textures
    .filter((texture) => !Object.keys(ratchets).some((key) => key.startsWith(`${texture}.`)))
    .map((texture) => `${texture} has no ratchet; a texture without one is an aspiration`);
}

export function loosenings(ratchets: Ratchets, committed: Ratchets): string[] {
  return Object.entries(committed).flatMap(([key, before]) => {
    const after = ratchets[key];
    if (after === undefined) return [`${key} was dropped; a ratchet only ever tightens`];
    if (!isWorse(after.better, after.value, before.value) || after.why !== before.why) return [];
    return [`${key} loosened from ${before.value} to ${after.value} without a new why`];
  });
}

export function regressions(
  ratchets: Ratchets,
  measured: Readonly<Record<string, number>>,
): string[] {
  return Object.entries(measured).flatMap(([key, value]) => {
    const ratchet = ratchets[key];
    if (ratchet === undefined) return [`${key} measures ${value} but records no ratchet`];
    if (!isWorse(ratchet.better, value, ratchet.value)) return [];
    return [
      `${key} regressed to ${value}; the ratchet holds ${ratchet.value} (${ratchet.better} is better)`,
    ];
  });
}

export function tightenable(
  ratchets: Ratchets,
  measured: Readonly<Record<string, number>>,
): string[] {
  return Object.entries(measured).flatMap(([key, value]) => {
    const ratchet = ratchets[key];
    if (ratchet === undefined || !isWorse(ratchet.better, ratchet.value, value)) return [];
    return [`${key} measures ${value}; tighten it from ${ratchet.value}`];
  });
}

function isWorse(better: Better, value: number, than: number): boolean {
  return better === "higher" ? value < than : value > than;
}

function parseRatchet(key: string, candidate: unknown): Ratchet {
  if (!/^T\d+\.[\w.-]+$/.test(key)) {
    throw new Error(`ratchet "${key}" must be named T<n>.<measure>`);
  }
  if (!isRecord(candidate)) throw new Error(`ratchet "${key}" must be an object`);
  const { value, better, why } = candidate;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ratchet "${key}" needs a finite number value`);
  }
  if (better !== "higher" && better !== "lower") {
    throw new Error(`ratchet "${key}" needs better: "higher" or "lower"`);
  }
  if (typeof why !== "string" || why.trim() === "") {
    throw new Error(`ratchet "${key}" needs a written why`);
  }
  return { value, better, why };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
