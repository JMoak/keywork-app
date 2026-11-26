import { sameName, sceneChangeOf, scenesAfter } from "@keywork-app/client";
import {
  type CreatureScene,
  isServedRefusal,
  type SceneSetOut,
  type ServedRefusal,
  type SteadPlace,
} from "@keywork-app/protocol";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";
import type { ShellSeams } from "../registry.ts";
import "./scenes.css";

export interface CreatureScenesProps {
  shell: ShellSeams;
  creature: string;
}

export const sceneWords = {
  heading: "scenes",
  none: "No scenes kept. A scene is kept by name when it arranges what is out.",
  setOut: "set out",
  forget: "forget",
  setOutKey: "enter",
  forgetKey: "delete",
  wasSetOut: (name: string) => `${name} set out`,
  missing: (names: readonly string[]) =>
    `${names.join(", ")} ${names.length === 1 ? "is" : "are"} no longer there`,
  asking: (names: readonly string[]) =>
    `${names.join(", ")} ${names.length === 1 ? "waits" : "wait"} for your yes in its conversation`,
  forgotten: (name: string) => `forgot ${name}`,
  refused: (name: string, why: string) => `${name} stays as it was · ${why}`,
  belongsTo: (place: string) => `from ${place}`,
} as const;

export function sceneSetOutLine(name: string, outcome: SceneSetOut): string {
  const { missing, asking, stopped } = outcome;
  return [
    sceneWords.wasSetOut(name),
    ...(missing.length === 0 ? [] : [sceneWords.missing(missing)]),
    ...(asking.length === 0 ? [] : [sceneWords.asking(asking)]),
    ...(stopped === null ? [] : [stopped]),
  ].join(" · ");
}

export function CreatureScenes(props: CreatureScenesProps) {
  const scenes = createSceneShelf(props.shell, () => props.creature);
  const [line, setLine] = createSignal<string>();

  const setOut = async (scene: CreatureScene): Promise<void> => {
    const outcome = await asked(() => props.shell.client.setOutScene(props.creature, scene.name));
    if (isServedRefusal(outcome))
      return void setLine(sceneWords.refused(scene.name, outcome.detail));
    setLine(sceneSetOutLine(scene.name, outcome));
  };
  const forget = async (scene: CreatureScene): Promise<void> => {
    const refusal = await asked(() => props.shell.client.forgetScene(props.creature, scene.name));
    if (refusal !== undefined) return void setLine(sceneWords.refused(scene.name, refusal.detail));
    scenes.forgot(scene);
    setLine(sceneWords.forgotten(scene.name));
  };
  const forgetOnItsKey = (event: KeyboardEvent, scene: CreatureScene): void => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    void forget(scene);
  };

  return (
    <Show when={scenes.listed()}>
      {(listed) => (
        <section class="kw-creature-scenes" aria-label={sceneWords.heading} data-native-activation>
          <h3 class="kw-creature-heading">{sceneWords.heading}</h3>
          <Show
            when={listed().length > 0}
            fallback={<p class="kw-scenes-none">{sceneWords.none}</p>}
          >
            <ul class="kw-scenes">
              <For each={listed()}>
                {(scene) => (
                  <li class="kw-scene" onKeyDown={(event) => forgetOnItsKey(event, scene)}>
                    <span class="kw-scene-name">{scene.name}</span>
                    <Show when={scene.place}>
                      {(place) => (
                        <span class="kw-scene-place">
                          {sceneWords.belongsTo(placeWords(place()))}
                        </span>
                      )}
                    </Show>
                    <span class="kw-scene-holds">{holdsLine(scene)}</span>
                    <span class="kw-scene-acts">
                      <KeyAct
                        label={sceneWords.setOut}
                        chord={sceneWords.setOutKey}
                        onPress={() => void setOut(scene)}
                      />
                      <KeyAct
                        label={sceneWords.forget}
                        chord={sceneWords.forgetKey}
                        onPress={() => void forget(scene)}
                      />
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={line()}>{(said) => <p class="kw-scenes-line">{said()}</p>}</Show>
        </section>
      )}
    </Show>
  );
}

export interface SceneShelf {
  listed(): readonly CreatureScene[] | undefined;
  forgot(scene: CreatureScene): void;
}

export function createSceneShelf(
  shell: Pick<ShellSeams, "client" | "feed">,
  creature: () => string,
): SceneShelf {
  const [listed, setListed] = createSignal<readonly CreatureScene[]>();
  createEffect(
    on(creature, (slug) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      void asked(() => shell.client.creatureScenes(slug)).then((answer) => {
        if (current) setListed(isServedRefusal(answer) ? undefined : answer);
      });
    }),
  );
  onCleanup(
    shell.feed.subscribe((batch) => {
      for (const envelope of batch) {
        const change = sceneChangeOf(envelope);
        if (change !== undefined && change.creature === creature()) {
          setListed((held) => scenesAfter(held ?? [], change));
        }
      }
    }),
  );
  return {
    listed,
    forgot: (scene) =>
      setListed((held) => held?.filter((kept) => !sameName(kept.name, scene.name))),
  };
}

function holdsLine(scene: CreatureScene): string {
  return scene.holds.map((held) => held.title || held.kind).join(", ");
}

function placeWords(place: SteadPlace): string {
  switch (place.kind) {
    case "workshop":
      return "its workshop";
    case "project":
      return (
        place.directory
          .replace(/[\\/]+$/, "")
          .split(/[\\/]/)
          .at(-1) ?? place.directory
      );
    case "porch":
      return "the porch";
    case "store":
      return "the storehouse";
    case "mill":
      return "the mill";
    case "green":
      return "the green";
  }
}

async function asked<Answer>(ask: () => Promise<Answer>): Promise<Answer | ServedRefusal> {
  try {
    return await ask();
  } catch (cause) {
    return { refused: "failed", detail: cause instanceof Error ? cause.message : String(cause) };
  }
}
