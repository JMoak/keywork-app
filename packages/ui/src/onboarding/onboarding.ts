import type { CreatureSummary } from "@keywork-app/protocol";
import { createMemo, createSignal } from "solid-js";
import { z } from "zod";
import { hueStop, rampStops } from "../chrome/pane-frame.tsx";
import {
  cloudNeverRequired,
  hostLimitation,
  inheritWord,
  localFirstWord,
  madeLine,
  skinLabel,
  substrateWords,
  surpriseWord,
  threadLine,
  threadRefusedLine,
  threadWaitsLine,
  workshopRaisedLine,
  workshopRefusedLine,
} from "./copy.ts";
import { introductionFrame } from "./introduction.ts";
import {
  type CloudStanding,
  inheritEverywhere,
  introductionOf,
  localFirst,
  proposePolicy,
  type Reach,
  reachOf,
} from "./models.ts";
import { plainNames, proposeNames, slugOf } from "./names.ts";
import {
  type CreatureOnTheStead,
  conversationOf,
  creatureMadeOf,
  creaturesOnTheStead,
  type OnboardingClient,
  refusalOf,
  workshopOwnersOnTheNode,
} from "./requests.ts";
import {
  back as backOne,
  begun,
  creatureRequestOf,
  keep as keepOne,
  type Proposals,
  type Sequence,
  type Settled,
  type Step,
  settle,
  skipRest as skipAll,
  skip as skipOne,
  stepOf,
} from "./sequence.ts";
import { chosenSkin, offeredSkins, surpriseMe } from "./skins.ts";
import type { ServerReading, WorkshopSupport } from "./workshop.ts";
import {
  substrateReportServed,
  workshopChoiceOf,
  workshopChoices,
  workshopSupportOf,
} from "./workshop.ts";

export type Phase =
  | { readonly kind: "reading" }
  | { readonly kind: "step"; readonly step: Step }
  | { readonly kind: "making"; readonly name: string }
  | { readonly kind: "made"; readonly made: Made }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "closed" };

export interface Made {
  readonly slug: string;
  readonly name: string;
  readonly conversation: string | undefined;
  readonly lines: readonly string[];
}

export interface Choice {
  readonly key: string;
  readonly label: string;
  readonly detail?: string | undefined;
}

export type Verb =
  | "down"
  | "up"
  | "keep"
  | "skip"
  | "rest"
  | "back"
  | "close"
  | "dismiss"
  | "connect"
  | "install";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OnboardingRecord {
  readonly made?: { readonly slug: string; readonly at: string } | undefined;
  readonly dismissedAt?: string | undefined;
}

export interface OnboardingSeams {
  readonly client: OnboardingClient;
  readonly workspace: string;
  cloud(): CloudStanding;
  seat(): Promise<void>;
  inject(sessionId: string, text: string, creature: string): Promise<unknown>;
  openThread(sessionId: string): void;
  openConnect(): void;
  openInstall(): void;
  readonly storage: OnboardingStorage | undefined;
  readonly skins?: readonly string[] | undefined;
  readonly now?: (() => number) | undefined;
}

export interface Onboarding {
  phase(): Phase;
  step(): Step | undefined;
  proposals(): Proposals | undefined;
  reach(): Reach | undefined;
  sequence(): Sequence;
  choices(): readonly Choice[];
  cursor(): number;
  shownSkin(): string;
  coat(): number;
  begin(): Promise<void>;
  name(name: string): void;
  point(index: number): void;
  act(verb: Verb): boolean;
}

export const localPolicyKey = "local";
export const inheritPolicyKey = "inherit";

const noWorkshopsDetail = "this node serves no workshops";
const nameTakenStatus = 409;

export function onboardingStorageKey(workspace: string): string {
  return `keywork.onboarding:${workspace}`;
}

export function freeCoat(taken: readonly number[]): number {
  const stops = Array.from({ length: rampStops }, (_, index) => hueStop(index));
  return stops.find((stop) => !taken.includes(stop)) ?? hueStop(taken.length);
}

export function coatsTaken(creatures: readonly CreatureOnTheStead[]): number[] {
  return creatures.map((creature, index) => hueStop(creature.seed ?? index));
}

export function seedForCoat(coat: number): number {
  return coat - 1;
}

export function namesLeft(
  creatures: readonly CreatureOnTheStead[],
  takenOnTheNode: readonly string[] = [],
): string[] {
  const taken = new Set([
    ...creatures.flatMap((creature) => [creature.slug, slugOf(creature.name)]),
    ...takenOnTheNode,
  ]);
  const left = plainNames.filter((name) => !taken.has(slugOf(name)));
  return left.length === 0 ? [...plainNames] : left;
}

export function choicesFor(step: Step | undefined, proposals: Proposals | undefined): Choice[] {
  if (proposals === undefined) return [];
  switch (step) {
    case "skin":
      return [
        ...proposals.skins.map((id) => ({ key: id, label: skinLabel(id) })),
        { key: surpriseMe, label: surpriseWord },
      ];
    case "workshop":
      return proposals.workshops.map((substrate) => ({
        key: substrate,
        label: substrateWords[substrate],
        detail:
          substrate === "host" ? (proposals.workshop.limitation ?? hostLimitation) : undefined,
      }));
    case "models":
      return [
        ...(localFirst(proposals.policy) ? [{ key: localPolicyKey, label: localFirstWord }] : []),
        { key: inheritPolicyKey, label: inheritWord, detail: cloudNeverRequired },
      ];
    default:
      return [];
  }
}

export function startOnboarding(seams: OnboardingSeams): Onboarding {
  const [phase, setPhase] = createSignal<Phase>({ kind: "reading" });
  const [proposals, setProposals] = createSignal<Proposals>();
  const [reach, setReach] = createSignal<Reach>();
  const [support, setSupport] = createSignal<WorkshopSupport>();
  const [sequence, setSequence] = createSignal<Sequence>(begun);
  const [pointed, setPointed] = createSignal(0);
  const [neighbours, setNeighbours] = createSignal<readonly CreatureOnTheStead[]>([]);
  const [takenOnTheNode, setTakenOnTheNode] = createSignal<readonly string[]>([]);
  const seed = seams.workspace;
  const freeNames = (): string[] => proposeNames(seed, namesLeft(neighbours(), takenOnTheNode()));
  const now = seams.now ?? Date.now;
  const storageKey = onboardingStorageKey(seams.workspace);
  const remember = (change: OnboardingRecord): void =>
    rememberOnboarding(seams.storage, storageKey, {
      ...rememberedOnboarding(seams.storage, storageKey),
      ...change,
    });

  const step = (): Step | undefined => {
    const current = phase();
    return current.kind === "step" ? current.step : undefined;
  };
  const choices = createMemo(() => choicesFor(step(), proposals()));
  const cursor = (): number => Math.min(Math.max(0, pointed()), Math.max(0, choices().length - 1));
  const skins = (): readonly string[] => proposals()?.skins ?? offeredSkins();
  const shownSkin = (): string => {
    const underCursor = step() === "skin" ? choices()[cursor()]?.key : undefined;
    const picked = underCursor ?? sequence().chosen.skin ?? skins()[0] ?? "";
    return chosenSkin(picked, seed, skins());
  };

  const show = (next: Sequence): void => {
    setSequence(next);
    setPointed(0);
    const current = stepOf(next);
    if (current === undefined) void make(next);
    else setPhase({ kind: "step", step: current });
  };

  const make = async (final: Sequence): Promise<void> => {
    const known = proposals();
    if (known === undefined) return;
    const settled = settle(final, known, seed);
    setPhase({ kind: "making", name: settled.name });
    try {
      const outcome = await makeCreature(settled, known);
      setPhase(
        typeof outcome === "string"
          ? { kind: "failed", reason: outcome }
          : { kind: "made", made: outcome },
      );
    } catch (error) {
      setPhase({ kind: "failed", reason: messageOf(error) });
    }
  };

  const makeCreature = async (settled: Settled, known: Proposals): Promise<Made | string> => {
    const raising = support()?.served === true;
    const creation = await seams.client.createCreature(creatureRequestOf(settled, raising));
    const creature = creatureMadeOf(creation);
    if (creature === undefined) return refusedName(creation, settled.name);
    remember({ made: { slug: creature.slug, at: new Date(now()).toISOString() } });
    await wearCoat(creature.slug, known.coat);
    await seams.seat();
    const lines = [madeLine(creature.name), workshopLine(settled, raising)];
    const opened = await seams.client.readCreature(creature.slug);
    const conversation = conversationOf(opened);
    lines.push(
      conversation === undefined
        ? threadRefusedLine(refusalOf(opened))
        : await openFirstThread(conversation, creature, settled, known),
    );
    return { slug: creature.slug, name: creature.name, conversation, lines };
  };

  const refusedName = (creation: ServerReading, name: string): string => {
    if (creation.status === nameTakenStatus) setAside(slugOf(name));
    return refusalOf(creation);
  };

  const setAside = (slug: string): void => {
    setTakenOnTheNode((taken) => [...taken, slug]);
    const known = proposals();
    if (known !== undefined) setProposals({ ...known, names: freeNames() });
  };

  const wearCoat = async (slug: string, coat: number | undefined): Promise<void> => {
    const patch = seams.client.patchCreature;
    if (coat === undefined || patch === undefined) return;
    await patch.call(seams.client, slug, { body: { seed: seedForCoat(coat) } });
  };

  const workshopLine = (settled: Settled, raising: boolean): string =>
    raising
      ? workshopRaisedLine(settled.workshop)
      : workshopRefusedLine(support()?.detail ?? noWorkshopsDetail);

  const openFirstThread = async (
    conversation: string,
    creature: { readonly slug: string; readonly name: string },
    settled: Settled,
    known: Proposals,
  ): Promise<string> => {
    const name = creature.name;
    const introduction = introductionOf(reach(), settled.models.strong);
    if (introduction.kind === "promised") {
      const frame = introductionFrame({
        name,
        workspace: seams.workspace,
        named: settled.named,
        names: known.names,
      });
      await seams.inject(conversation, frame, creature.slug);
    }
    seams.openThread(conversation);
    return introduction.kind === "promised"
      ? threadLine(name, introduction.through)
      : threadWaitsLine(name, introduction.detail);
  };

  const keepCursor = (): void => {
    const known = proposals();
    const choice = choices()[cursor()];
    if (known === undefined || choice === undefined) return;
    switch (step()) {
      case "skin":
        show(keepOne(sequence(), "skin", choice.key));
        return;
      case "workshop": {
        const substrate = known.workshops.find((each) => each === choice.key);
        if (substrate !== undefined) show(keepOne(sequence(), "workshop", substrate));
        return;
      }
      case "models":
        show(
          keepOne(
            sequence(),
            "models",
            choice.key === localPolicyKey ? known.policy : inheritEverywhere,
          ),
        );
        return;
      default:
        return;
    }
  };

  const close = (): void => {
    setPhase({ kind: "closed" });
  };

  const actInStep = (verb: Verb): boolean => {
    switch (verb) {
      case "down":
        setPointed(cursor() + 1);
        return true;
      case "up":
        setPointed(cursor() - 1);
        return true;
      case "keep":
        if (step() === "name") return false;
        keepCursor();
        return true;
      case "skip":
        show(skipOne(sequence()));
        return true;
      case "rest":
        show(skipAll(sequence()));
        return true;
      case "back":
        show(backOne(sequence()));
        return true;
      case "connect":
        if (step() !== "models") return false;
        seams.openConnect();
        return true;
      case "install":
        if (step() !== "workshop" || proposals()?.workshop.installStep === undefined) return false;
        seams.openInstall();
        return true;
      case "close":
      case "dismiss":
        remember({ dismissedAt: new Date(now()).toISOString() });
        close();
        return true;
    }
  };

  return {
    phase,
    step,
    proposals,
    reach,
    sequence,
    choices,
    cursor,
    shownSkin,
    coat: () => proposals()?.coat ?? hueStop(0),
    begin: async () => {
      setPhase({ kind: "reading" });
      try {
        const [listing, report, models, onTheStead] = await Promise.all([
          seams.client.workshops(),
          readSubstrateReport(seams.client),
          seams.client.models(),
          readNeighbours(seams.client),
        ]);
        const support = workshopSupportOf(report ?? listing);
        setSupport(support);
        setNeighbours(onTheStead);
        setTakenOnTheNode(workshopOwnersOnTheNode(listing));
        const reached = reachOf(models, seams.cloud());
        setReach(reached);
        setProposals({
          names: freeNames(),
          skins: seams.skins ?? offeredSkins(),
          coat: freeCoat(coatsTaken(onTheStead)),
          workshop: workshopChoiceOf(support),
          workshops: workshopChoices(support),
          policy: proposePolicy(reached),
        });
        show(begun);
      } catch (error) {
        setPhase({ kind: "failed", reason: messageOf(error) });
      }
    },
    name: (name) => {
      if (step() === "name") show(keepOne(sequence(), "name", name));
    },
    point: setPointed,
    act: (verb) => {
      switch (phase().kind) {
        case "step":
          return actInStep(verb);
        case "made":
          if (verb !== "keep" && verb !== "close" && verb !== "dismiss") return false;
          close();
          return true;
        case "failed":
          if (verb === "back") {
            show({ ...sequence(), at: 0 });
            return true;
          }
          if (verb !== "close" && verb !== "dismiss") return false;
          close();
          return true;
        default:
          return false;
      }
    },
  };
}

export interface FirstRunFacts {
  readonly trusted: boolean;
  readonly creatures: readonly CreatureSummary[] | undefined;
  readonly remembered: OnboardingRecord;
}

export function firstRunWanted(facts: FirstRunFacts): boolean {
  return (
    facts.trusted &&
    facts.creatures !== undefined &&
    facts.creatures.length === 0 &&
    facts.remembered.made === undefined &&
    facts.remembered.dismissedAt === undefined
  );
}

export function rememberedOnboarding(
  storage: OnboardingStorage | undefined,
  key: string,
): OnboardingRecord {
  try {
    const stored = storage?.getItem(key);
    const parsed = recordSchema.safeParse(stored == null ? undefined : JSON.parse(stored));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function rememberOnboarding(
  storage: OnboardingStorage | undefined,
  key: string,
  record: OnboardingRecord,
): void {
  try {
    storage?.setItem(key, JSON.stringify(record));
  } catch {}
}

async function readSubstrateReport(client: OnboardingClient): Promise<ServerReading | undefined> {
  const report = client.substrates === undefined ? undefined : await client.substrates();
  return report !== undefined && substrateReportServed(report) ? report : undefined;
}

async function readNeighbours(client: OnboardingClient): Promise<CreatureOnTheStead[]> {
  if (client.creatures === undefined) return [];
  try {
    return creaturesOnTheStead(await client.creatures());
  } catch {
    return [];
  }
}

const recordSchema = z.object({
  made: z.object({ slug: z.string(), at: z.string() }).optional(),
  dismissedAt: z.string().optional(),
});

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
