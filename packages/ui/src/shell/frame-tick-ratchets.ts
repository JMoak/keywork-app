import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ratchetsPath = "scripts/textures/ratchets.json";

export function ratchetValue(key: string): number {
  const ratchet = recordedRatchets()[key];
  if (ratchet === undefined) throw new Error(`${ratchetsPath} records no ratchet named ${key}`);
  return ratchet.value;
}

interface RecordedRatchet {
  readonly value: number;
}

function recordedRatchets(): Record<string, RecordedRatchet | undefined> {
  return JSON.parse(readFileSync(join(process.cwd(), ratchetsPath), "utf8"));
}
