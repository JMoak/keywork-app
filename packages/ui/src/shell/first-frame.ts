import type { ConsoleClient } from "@keywork-app/client";
import type { CreatureSummary } from "@keywork-app/protocol";
import { z } from "zod";

export interface FirstFrameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SteadSummonFacts {
  readonly steadShowing: boolean;
  readonly summonedAt: string | undefined;
  readonly creatures: readonly CreatureSummary[] | undefined;
}

export function steadSummonStorageKey(workspace: string): string {
  return `keywork.stead-summoned:${workspace}`;
}

export function steadSummonWanted(facts: SteadSummonFacts): boolean {
  return (
    !facts.steadShowing &&
    facts.summonedAt === undefined &&
    facts.creatures !== undefined &&
    facts.creatures.length === 0
  );
}

export function steadSummonedAt(
  storage: FirstFrameStorage | undefined,
  key: string,
): string | undefined {
  try {
    const stored = storage?.getItem(key);
    const parsed = recordSchema.safeParse(stored == null ? undefined : JSON.parse(stored));
    return parsed.success ? parsed.data.summonedAt : undefined;
  } catch {
    return undefined;
  }
}

export function recordSteadSummoned(
  storage: FirstFrameStorage | undefined,
  key: string,
  summonedAt: string,
): void {
  try {
    storage?.setItem(key, JSON.stringify({ summonedAt }));
  } catch {}
}

export async function creaturesListed(
  client: Pick<ConsoleClient, "creatures">,
): Promise<readonly CreatureSummary[] | undefined> {
  try {
    const answer = await client.creatures();
    return Array.isArray(answer) ? answer : undefined;
  } catch {
    return undefined;
  }
}

const recordSchema = z.object({ summonedAt: z.string() });
