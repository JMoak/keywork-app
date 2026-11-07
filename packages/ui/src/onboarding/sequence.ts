import {
  inheritEverywhere,
  localFirst,
  type ModelClass,
  type ModelPolicy,
  modelClasses,
} from "./models.ts";
import type { CreatureRequest, WorkshopRequest } from "./requests.ts";
import { chosenSkin } from "./skins.ts";
import type { Substrate, WorkshopChoice } from "./workshop.ts";

export const steps = ["name", "skin", "workshop", "models"] as const;

export type Step = (typeof steps)[number];

export interface Proposals {
  readonly names: readonly string[];
  readonly skins: readonly string[];
  readonly coat?: number | undefined;
  readonly workshop: WorkshopChoice;
  readonly workshops: readonly Substrate[];
  readonly policy: ModelPolicy;
}

export interface Choices {
  readonly name?: string;
  readonly skin?: string;
  readonly workshop?: Substrate;
  readonly models?: ModelPolicy;
}

export interface Sequence {
  readonly at: number;
  readonly chosen: Choices;
  readonly skipped: readonly Step[];
}

export interface Settled {
  readonly name: string;
  readonly named: boolean;
  readonly skin: string;
  readonly workshop: Substrate;
  readonly models: ModelPolicy;
}

export type Decision = "kept" | "skipped";

export const begun: Sequence = { at: 0, chosen: {}, skipped: [] };

export const fallbackName = "Wren";

export function stepOf(sequence: Sequence): Step | undefined {
  return steps[sequence.at];
}

export function finished(sequence: Sequence): boolean {
  return sequence.at >= steps.length;
}

export function keep<Chosen extends Step>(
  sequence: Sequence,
  step: Chosen,
  value: NonNullable<Choices[Chosen]>,
): Sequence {
  return {
    at: steps.indexOf(step) + 1,
    chosen: { ...sequence.chosen, [step]: value },
    skipped: sequence.skipped.filter((each) => each !== step),
  };
}

export function skip(sequence: Sequence): Sequence {
  const step = stepOf(sequence);
  if (step === undefined) return sequence;
  const { [step]: _dropped, ...rest } = sequence.chosen;
  return { at: sequence.at + 1, chosen: rest, skipped: [...withoutStep(sequence, step), step] };
}

export function skipRest(sequence: Sequence): Sequence {
  let current = sequence;
  while (!finished(current)) current = skip(current);
  return current;
}

export function back(sequence: Sequence): Sequence {
  return { ...sequence, at: Math.max(0, sequence.at - 1) };
}

export function decisionOf(sequence: Sequence, step: Step): Decision | undefined {
  if (sequence.chosen[step] !== undefined) return "kept";
  return sequence.skipped.includes(step) ? "skipped" : undefined;
}

export function settle(sequence: Sequence, proposals: Proposals, seed: string): Settled {
  const { chosen } = sequence;
  return {
    name: chosen.name ?? proposals.names[0] ?? fallbackName,
    named: chosen.name !== undefined,
    skin: chosenSkin(chosen.skin ?? proposals.skins[0] ?? "", seed, proposals.skins),
    workshop: chosen.workshop ?? proposals.workshop.substrate,
    models: chosen.models ?? inheritEverywhere,
  };
}

export function creatureRequestOf(settled: Settled, raising = false): CreatureRequest {
  return {
    name: settled.name,
    skin: settled.skin,
    ...(raising && { substrate: settled.workshop }),
    ...(localFirst(settled.models) && { models: chosenClasses(settled.models) }),
  };
}

export function workshopRequestOf(slug: string, settled: Settled): WorkshopRequest {
  return { creature: slug, substrate: settled.workshop };
}

function chosenClasses(policy: ModelPolicy): Partial<Record<ModelClass, ModelPolicy[ModelClass]>> {
  return Object.fromEntries(
    modelClasses
      .filter((modelClass) => policy[modelClass] !== "inherit")
      .map((modelClass) => [modelClass, policy[modelClass]]),
  );
}

function withoutStep(sequence: Sequence, step: Step): Step[] {
  return sequence.skipped.filter((each) => each !== step);
}
