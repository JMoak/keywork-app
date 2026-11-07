import { createSignal } from "solid-js";

export function createCreatureNames() {
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({});
  return {
    nameOf: (slug: string) => names()[slug],
    remember: (slug: string, name: string) => {
      setNames((held) => (held[slug] === name ? held : { ...held, [slug]: name }));
    },
  };
}

export type CreatureNames = ReturnType<typeof createCreatureNames>;
