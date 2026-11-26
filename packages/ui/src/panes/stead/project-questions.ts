import { type ProjectQuestion, project } from "@keywork-app/habitat";
import {
  type CreatureLedgerChange,
  type CreatureLedgerEntry,
  isServedRefusal,
} from "@keywork-app/protocol";
import { type Accessor, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { waitsOnKeeper } from "../creature/ledger.ts";
import type { LedgerSource } from "../creature/ledger-book.ts";
import type { HabitatWorld } from "./habitat.ts";

export type AskedInProjects = Readonly<Record<string, ProjectQuestion>>;

export function followProjectQuestions(habitat: HabitatWorld, source: LedgerSource): void {
  const asked = createProjectQuestions(source, () => Object.keys(habitat.state().creatures));
  createEffect(
    on(asked, (held) => {
      const questions = Object.values(held);
      const ts = new Date().toISOString();
      habitat.update((world) => project(world, { type: "keeper.questions", ts, questions }));
    }),
  );
}

export function createProjectQuestions(
  source: LedgerSource,
  creatures: () => readonly string[],
): Accessor<AskedInProjects> {
  const [asked, setAsked] = createSignal<AskedInProjects>({});
  const seated = createMemo(() => [...creatures()].sort(), [], { equals: sameSlugs });
  const heardWhileReading = new Map<string, CreatureLedgerChange[]>();
  const latestReading = new Map<string, number>();
  let disposed = false;

  const learned = (change: CreatureLedgerChange): void => {
    const question = waitingInAProject(change.creature, change.entry);
    setAsked((held) =>
      question === undefined
        ? without(held, change.entry.id)
        : { ...held, [question.id]: question },
    );
  };
  const read = async (creature: string): Promise<void> => {
    const reading = (latestReading.get(creature) ?? 0) + 1;
    latestReading.set(creature, reading);
    if (!heardWhileReading.has(creature)) heardWhileReading.set(creature, []);
    const view = await source.read(creature);
    if (disposed || latestReading.get(creature) !== reading) return;
    const heard = heardWhileReading.get(creature) ?? [];
    heardWhileReading.delete(creature);
    if (!isServedRefusal(view)) {
      setAsked((held) => ({ ...othersThan(held, creature), ...askedIn(creature, view.entries) }));
    }
    for (const change of heard) learned(change);
  };
  const readEvery = (slugs: readonly string[]): void => {
    for (const slug of slugs) void read(slug);
  };

  createEffect(
    on(seated, (slugs) => {
      setAsked((held) => onlyOf(held, slugs));
      readEvery(slugs);
    }),
  );
  onCleanup(
    source.follow((change) => {
      const reading = heardWhileReading.get(change.creature);
      if (reading !== undefined) reading.push(change);
      else learned(change);
    }),
  );
  onCleanup(source.reconnected(() => readEvery(seated())));
  onCleanup(() => {
    disposed = true;
  });
  return asked;
}

export function waitingInAProject(
  creature: string,
  entry: CreatureLedgerEntry,
): ProjectQuestion | undefined {
  const asked = entry.project ?? undefined;
  if (asked === undefined || !waitsOnKeeper(entry) || entry.about.kind !== "ask") return undefined;
  return {
    id: entry.id,
    creature,
    project: asked,
    session: entry.session ?? undefined,
    callId: entry.about.callId,
    tool: entry.about.tool,
    title: entry.title,
    directory: entry.directory,
    since: entry.openedAt,
  };
}

function askedIn(creature: string, entries: readonly CreatureLedgerEntry[]): AskedInProjects {
  return Object.fromEntries(
    entries.flatMap((entry) => {
      const question = waitingInAProject(creature, entry);
      return question === undefined ? [] : [[question.id, question]];
    }),
  );
}

function othersThan(held: AskedInProjects, creature: string): AskedInProjects {
  return Object.fromEntries(
    Object.entries(held).filter(([, asked]) => asked.creature !== creature),
  );
}

function onlyOf(held: AskedInProjects, slugs: readonly string[]): AskedInProjects {
  return Object.fromEntries(
    Object.entries(held).filter(([, asked]) => slugs.includes(asked.creature)),
  );
}

function without(held: AskedInProjects, id: string): AskedInProjects {
  if (!(id in held)) return held;
  return Object.fromEntries(Object.entries(held).filter(([kept]) => kept !== id));
}

function sameSlugs(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((slug, at) => slug === other[at]);
}
