export type Random = () => number;

export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\u001f")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function unit(hash: number): number {
  return (hash >>> 0) / 4294967296;
}

export function between(random: Random, low: number, high: number): number {
  return low + random() * (high - low);
}

export const jitterSpread = 0.15;

export function jittered(random: Random, value: number, spread = jitterSpread): number {
  return value * (1 + (random() * 2 - 1) * spread);
}

export function pick<T>(random: Random, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function weightedPick<T>(
  random: Random,
  items: readonly T[],
  weightOf: (item: T) => number,
): T | undefined {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[0];
  let remaining = random() * total;
  for (const [index, item] of items.entries()) {
    remaining -= weights[index] ?? 0;
    if (remaining <= 0) return item;
  }
  return items[items.length - 1];
}
