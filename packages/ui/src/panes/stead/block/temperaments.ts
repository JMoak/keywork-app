import type { ServerFeed } from "@keywork-app/client";
import { type Temperament, temperamentOf } from "@keywork-app/habitat/block";
import type { CreatureSummary, ServedRefusal } from "@keywork-app/protocol";
import { createSignal, onCleanup } from "solid-js";
import type { ShellSeams } from "../../registry.ts";

export interface TemperamentSeams {
  readCreatures(): Promise<readonly CreatureSummary[] | ServedRefusal>;
  readonly feed: Pick<ServerFeed, "subscribe">;
}

export type Temperaments = Readonly<Record<string, Temperament>>;

export function temperamentSeamsOf(shell: Pick<ShellSeams, "client" | "feed">): TemperamentSeams {
  return { readCreatures: () => shell.client.creatures(), feed: shell.feed };
}

export function createTemperaments(seams: TemperamentSeams): () => Temperaments {
  const [temperaments, setTemperaments] = createSignal<Temperaments>({}, { equals: sameWords });
  let disposed = false;

  const read = (): void => {
    void Promise.resolve()
      .then(() => seams.readCreatures())
      .then(
        (listed) => {
          if (!disposed && Array.isArray(listed)) setTemperaments(temperamentsOf(listed));
        },
        () => undefined,
      );
  };

  onCleanup(
    seams.feed.subscribe((batch) => {
      if (batch.some((envelope) => envelope.type === "creature.changed")) read();
    }),
  );
  onCleanup(() => {
    disposed = true;
  });
  read();
  return temperaments;
}

export function temperamentsOf(creatures: readonly CreatureSummary[]): Temperaments {
  return Object.fromEntries(
    creatures.map((creature) => [creature.slug, temperamentOf(creature.temperament)]),
  );
}

function sameWords(one: Temperaments, other: Temperaments): boolean {
  const slugs = Object.keys(one);
  return (
    slugs.length === Object.keys(other).length && slugs.every((slug) => one[slug] === other[slug])
  );
}
