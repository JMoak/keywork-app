import { type Temperament, temperamentFor } from "@keywork-app/client";
import { hashSeed } from "@keywork-app/habitat";
import type { CreatureSummary } from "@keywork-app/protocol";
import { batch, createSignal } from "solid-js";
import { z } from "zod";
import { hueStop, rampStops } from "../chrome/pane-frame.tsx";
import { prefersReducedMotion } from "../chrome/stamp.ts";
import {
  nameRefused,
  nameTaken,
  readyLine,
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
  type ModelClass,
  type ModelPolicy,
  modelClasses,
  type Reach,
  reachOf,
} from "./models.ts";
import { nameOf, plainNames, proposeNames, slugOf } from "./names.ts";
import {
  type CreatureOnTheStead,
  type CreatureRequest,
  conversationOf,
  creatureMadeOf,
  creaturesOnTheStead,
  type OnboardingClient,
  refusalOf,
  workshopOwnersOnTheNode,
} from "./requests.ts";
import { hatchlingAmong, lookBeside, offeredSkins } from "./skins.ts";
import type { ServerReading, Substrate } from "./workshop.ts";
import { substrateReportServed, workshopChoiceOf, workshopSupportOf } from "./workshop.ts";

export type Beat = "still" | "crack" | "split" | "glow" | "open" | "light" | "arrive";

export interface ScoreStep {
  readonly beat: Beat;
  readonly ms: number;
  readonly waitsForProposals?: true;
}

export const hatchScore: readonly ScoreStep[] = [
  { beat: "crack", ms: 125 },
  { beat: "split", ms: 250 },
  { beat: "glow", ms: 500, waitsForProposals: true },
  { beat: "open", ms: 125 },
  { beat: "light", ms: 125 },
  { beat: "arrive", ms: 1000 },
];

export const stillScore: readonly ScoreStep[] = [{ beat: "still", ms: 0, waitsForProposals: true }];

export const madeLingerMs = 5000;

export type Phase =
  | { readonly kind: "egg" }
  | { readonly kind: "hatching"; readonly beat: Beat }
  | { readonly kind: "meet" }
  | { readonly kind: "making" }
  | { readonly kind: "made"; readonly made: Made }
  | { readonly kind: "closed" };

export type Next =
  | { readonly kind: "conversation"; readonly sessionId: string }
  | { readonly kind: "connect" }
  | { readonly kind: "nothing" };

export interface Made {
  readonly slug: string;
  readonly name: string;
  readonly lines: readonly string[];
  readonly next: Next;
}

export interface Proposals {
  readonly names: readonly string[];
  readonly skins: readonly string[];
  readonly workshop: Substrate;
  readonly raising: boolean;
  readonly workshopRefusal: string | undefined;
  readonly policy: ModelPolicy;
}

export interface Hatchling {
  readonly name: string;
  readonly skin: string;
  readonly coat: number;
  readonly temperament: Temperament;
}

export type Verb = "accept" | "leave" | "previous" | "next" | "up" | "down" | "another";

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OnboardingRecord {
  readonly made?: { readonly slug: string; readonly at: string } | undefined;
  readonly dismissedAt?: string | undefined;
}

export type Cancel = () => void;

export interface OnboardingSeams {
  readonly client: OnboardingClient;
  readonly workspace: string;
  cloud(): CloudStanding;
  seat(): Promise<void>;
  inject(sessionId: string, text: string, creature: string): Promise<unknown>;
  openThread(sessionId: string): void;
  openConnect(): void;
  readonly storage: OnboardingStorage | undefined;
  readonly skins?: readonly string[] | undefined;
  readonly now?: (() => number) | undefined;
  readonly random?: (() => number) | undefined;
  readonly still?: (() => boolean) | undefined;
  readonly after?: ((ms: number, run: () => void) => Cancel) | undefined;
}

export interface Onboarding {
  phase(): Phase;
  coat(): number | undefined;
  hatchling(): Hatchling | undefined;
  trouble(): string | undefined;
  shakes(): number;
  begin(): Promise<void>;
  rename(text: string): void;
  wear(coat: number): void;
  act(verb: Verb): boolean;
}

const noWorkshopsDetail = "this node serves no workshops";
const nameTakenStatus = 409;

export function onboardingStorageKey(workspace: string): string {
  return `keywork.onboarding:${workspace}`;
}

export function freeCoat(taken: readonly number[]): number {
  return coats().find((stop) => !taken.includes(stop)) ?? hueStop(taken.length);
}

export function coats(): number[] {
  return Array.from({ length: rampStops }, (_, index) => hueStop(index));
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

export function proposedTemperament(
  workspace: string,
  neighbours: number,
  skin: string,
): Temperament {
  return temperamentFor(hashSeed(workspace, neighbours, skin, "temperament"));
}

export function creatureRequestOf(chosen: Hatchling, known: Proposals): CreatureRequest {
  return {
    name: chosen.name,
    skin: chosen.skin,
    temperament: chosen.temperament,
    ...(known.raising && { substrate: known.workshop }),
    ...(localFirst(known.policy) && { models: classesChosenIn(known.policy) }),
  };
}

export function startOnboarding(seams: OnboardingSeams): Onboarding {
  const [phase, setPhase] = createSignal<Phase>({ kind: "egg" });
  const [proposals, setProposals] = createSignal<Proposals>();
  const [coat, setCoat] = createSignal<number>();
  const [skin, setSkin] = createSignal<string>();
  const [nameAt, setNameAt] = createSignal(0);
  const [typed, setTyped] = createSignal<string>();
  const [trouble, setTrouble] = createSignal<string>();
  const [shakes, setShakes] = createSignal(0);
  let reach: Reach | undefined;
  let neighbours: readonly CreatureOnTheStead[] = [];
  let takenOnTheNode: readonly string[] = [];
  let reading = 0;
  let readingFailed = false;
  let released: (() => void) | undefined;
  let stopClock: Cancel = nothing;

  const seed = seams.workspace;
  const now = seams.now ?? Date.now;
  const random = seams.random ?? Math.random;
  const still = seams.still ?? prefersReducedMotion;
  const after = seams.after ?? afterOnTheClock;
  const storageKey = onboardingStorageKey(seams.workspace);
  const remember = (change: OnboardingRecord): void =>
    rememberOnboarding(seams.storage, storageKey, {
      ...rememberedOnboarding(seams.storage, storageKey),
      ...change,
    });
  const freeNames = (): string[] => {
    const left = namesLeft(neighbours, takenOnTheNode);
    return proposeNames(seed, left, left.length);
  };

  const hatchling = (): Hatchling | undefined => {
    const known = proposals();
    const look = skin();
    const worn = coat();
    if (known === undefined || look === undefined || worn === undefined) return undefined;
    return {
      name: typed() ?? known.names[nameAt()] ?? "",
      skin: look,
      coat: worn,
      temperament: proposedTemperament(seed, neighbours.length, look),
    };
  };

  const begin = (): Promise<void> => {
    reset();
    return read();
  };

  const read = async (): Promise<void> => {
    const mine = ++reading;
    readingFailed = false;
    try {
      const onTheStead = readNeighbours(seams.client).then((creatures) => {
        if (mine === reading) setCoat(freeCoat(coatsTaken(creatures)));
        return creatures;
      });
      const [creatures, listing, report, models] = await Promise.all([
        onTheStead,
        seams.client.workshops(),
        readSubstrateReport(seams.client),
        seams.client.models(),
      ]);
      if (mine !== reading) return;
      const support = workshopSupportOf(report ?? listing);
      const offered = seams.skins ?? offeredSkins();
      const reached = reachOf(models, seams.cloud());
      neighbours = creatures;
      takenOnTheNode = workshopOwnersOnTheNode(listing);
      reach = reached;
      batch(() => {
        setSkin(hatchlingAmong(offered, wornOnTheStead(creatures), random));
        setProposals({
          names: freeNames(),
          skins: offered,
          workshop: workshopChoiceOf(support).substrate,
          raising: support.served,
          workshopRefusal: support.served ? undefined : (support.detail ?? noWorkshopsDetail),
          policy: inheritEverywhere,
        });
      });
      release();
    } catch (error) {
      if (mine === reading) failReading(messageOf(error));
    }
  };

  const reset = (): void => {
    stopClock();
    released = undefined;
    batch(() => {
      setPhase({ kind: "egg" });
      setProposals(undefined);
      setCoat(undefined);
      setSkin(undefined);
      setNameAt(0);
      setTyped(undefined);
      setTrouble(undefined);
    });
  };

  const failReading = (reason: string): void => {
    readingFailed = true;
    if (phase().kind !== "hatching") return;
    stopClock();
    released = undefined;
    batch(() => {
      setPhase({ kind: "egg" });
      setTrouble(reason);
    });
  };

  const release = (): void => {
    const held = released;
    released = undefined;
    held?.();
  };

  const hatch = (): void => {
    setTrouble(undefined);
    if (readingFailed) void read();
    play(still() ? stillScore : hatchScore);
  };

  const play = (score: readonly ScoreStep[], at = 0): void => {
    const step = score[at];
    if (step === undefined) {
      setPhase({ kind: "meet" });
      return;
    }
    setPhase({ kind: "hatching", beat: step.beat });
    const onward = (): void => play(score, at + 1);
    const breathe = (): void => (step.waitsForProposals ? whenRead(onward) : onward());
    if (step.ms > 0) stopClock = after(step.ms, breathe);
    else breathe();
  };

  const whenRead = (run: () => void): void => {
    if (proposals() === undefined) released = run;
    else run();
  };

  const turnLook = (step: number): void => {
    const known = proposals();
    const look = skin();
    if (known !== undefined && look !== undefined) setSkin(lookBeside(look, known.skins, step));
  };

  const turnCoat = (step: number): void => {
    const worn = coat();
    if (worn !== undefined) setCoat(hueStop(seedForCoat(worn) + step + rampStops));
  };

  const anotherName = (): void => {
    const names = proposals()?.names ?? [];
    if (names.length === 0) return;
    batch(() => {
      setNameAt((at) => (at + 1) % names.length);
      setTyped(undefined);
      setTrouble(undefined);
    });
  };

  const refuse = (reason: string, shake: boolean): void => {
    batch(() => {
      setPhase({ kind: "meet" });
      setTrouble(reason);
      if (shake) setShakes((count) => count + 1);
    });
  };

  const keep = (): void => {
    const known = proposals();
    const chosen = hatchling();
    if (known === undefined || chosen === undefined) return;
    const name = nameOf(chosen.name);
    if (name === undefined) refuse(nameRefused, true);
    else void make({ ...chosen, name }, known);
  };

  const make = async (chosen: Hatchling, known: Proposals): Promise<void> => {
    batch(() => {
      setTrouble(undefined);
      setPhase({ kind: "making" });
    });
    try {
      const outcome = await makeCreature(chosen, known);
      if ("refused" in outcome) refuse(outcome.refused, outcome.taken);
      else settle(outcome);
    } catch (error) {
      refuse(messageOf(error), false);
    }
  };

  const makeCreature = async (chosen: Hatchling, known: Proposals): Promise<Made | Refusal> => {
    const creation = await seams.client.createCreature(creatureRequestOf(chosen, known));
    const creature = creatureMadeOf(creation);
    if (creature === undefined) return refusalIn(creation, chosen.name);
    remember({ made: { slug: creature.slug, at: new Date(now()).toISOString() } });
    await wearCoat(creature.slug, chosen.coat);
    await seams.seat();
    const opened = await seams.client.readCreature(creature.slug);
    const conversation = conversationOf(opened);
    const workshop = workshopLine(known);
    if (conversation === undefined) {
      const lines = [threadRefusedLine(refusalOf(opened)), workshop];
      return { ...creature, lines, next: { kind: "nothing" } };
    }
    const introduction = introductionOf(reach, known.policy.strong);
    if (introduction.kind === "waits") {
      const lines = [threadWaitsLine(introduction.detail), workshop];
      return { ...creature, lines, next: { kind: "connect" } };
    }
    const frame = introductionFrame({ name: creature.name, workspace: seams.workspace });
    await seams.inject(conversation, frame, creature.slug);
    const next: Next = { kind: "conversation", sessionId: conversation };
    return { ...creature, lines: [readyLine, workshop], next };
  };

  const refusalIn = (creation: ServerReading, name: string): Refusal => {
    if (creation.status !== nameTakenStatus) return { refused: refusalOf(creation), taken: false };
    setAside(name);
    return { refused: nameTaken, taken: true };
  };

  const setAside = (name: string): void => {
    takenOnTheNode = [...takenOnTheNode, slugOf(name)];
    const known = proposals();
    if (known === undefined) return;
    const names = freeNames();
    batch(() => {
      setProposals({ ...known, names });
      setNameAt(names.length - 1);
      setTyped(name);
    });
  };

  const wearCoat = async (slug: string, worn: number): Promise<void> => {
    const patch = seams.client.patchCreature;
    if (patch !== undefined)
      await patch.call(seams.client, slug, { body: { seed: seedForCoat(worn) } });
  };

  const settle = (made: Made): void => {
    setPhase({ kind: "made", made });
    if (made.next.kind === "conversation") stopClock = after(madeLingerMs, () => finish(true));
  };

  const finish = (accepted: boolean): void => {
    const current = phase();
    if (current.kind !== "made") return;
    stopClock();
    setPhase({ kind: "closed" });
    if (!accepted) return;
    if (current.made.next.kind === "conversation") seams.openThread(current.made.next.sessionId);
    else if (current.made.next.kind === "connect") seams.openConnect();
  };

  const dismiss = (): void => {
    stopClock();
    released = undefined;
    remember({ dismissedAt: new Date(now()).toISOString() });
    setPhase({ kind: "closed" });
  };

  const actWhileMeeting = (verb: Verb): boolean => {
    switch (verb) {
      case "accept":
        keep();
        return true;
      case "leave":
        dismiss();
        return true;
      case "previous":
        turnLook(-1);
        return true;
      case "next":
        turnLook(1);
        return true;
      case "up":
        turnCoat(1);
        return true;
      case "down":
        turnCoat(-1);
        return true;
      case "another":
        anotherName();
        return true;
    }
  };

  return {
    phase,
    coat,
    hatchling,
    trouble,
    shakes,
    begin,
    rename: (text) => {
      if (phase().kind !== "meet") return;
      batch(() => {
        setTyped(text);
        setTrouble(undefined);
      });
    },
    wear: (worn) => {
      if (phase().kind === "meet") setCoat(worn);
    },
    act: (verb) => {
      const kind = phase().kind;
      if (kind === "meet") return actWhileMeeting(verb);
      if (kind === "made" && (verb === "accept" || verb === "leave")) {
        finish(verb === "accept");
        return true;
      }
      if (kind === "egg" && verb === "accept") {
        hatch();
        return true;
      }
      if ((kind === "egg" || kind === "hatching") && verb === "leave") {
        dismiss();
        return true;
      }
      return kind === "hatching" && verb === "accept";
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

interface Refusal {
  readonly refused: string;
  readonly taken: boolean;
}

const nothing: Cancel = () => undefined;

function afterOnTheClock(ms: number, run: () => void): Cancel {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

function workshopLine(known: Proposals): string {
  return known.workshopRefusal === undefined
    ? workshopRaisedLine(known.workshop)
    : workshopRefusedLine(known.workshopRefusal);
}

function wornOnTheStead(creatures: readonly CreatureOnTheStead[]): string[] {
  return creatures.flatMap((creature) => (creature.skin === undefined ? [] : [creature.skin]));
}

function classesChosenIn(
  policy: ModelPolicy,
): Partial<Record<ModelClass, ModelPolicy[ModelClass]>> {
  return Object.fromEntries(
    modelClasses
      .filter((modelClass) => policy[modelClass] !== "inherit")
      .map((modelClass) => [modelClass, policy[modelClass]]),
  );
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
