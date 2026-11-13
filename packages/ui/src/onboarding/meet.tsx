import type { CreatureSummary } from "@keywork-app/protocol";
import { createSignal, onCleanup, Show } from "solid-js";
import { ModelSetup } from "../model-setup/index.tsx";
import type { SelectedModel } from "../model-setup/inventory.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { creaturesListed } from "../shell/first-frame.ts";
import { proposeNames } from "./names.ts";
import { Portrait } from "./portrait.tsx";
import { fallbackName } from "./sequence.ts";
import { offeredSkins } from "./skins.ts";

export function meetingName(workspace: string): string {
  return proposeNames(workspace)[0] ?? fallbackName;
}

export function MeetCreature(props: {
  readonly shell: ShellSeams;
  readonly creatures: readonly CreatureSummary[] | undefined;
  readonly first: boolean;
  onCustomize(): void;
}) {
  const [created, setCreated] = createSignal<CreatureSummary>();
  const [settingUp, setSettingUp] = createSignal<CreatureSummary>();
  const [met, setMet] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const name = meetingName(props.shell.workspace);
  const skin = offeredSkins()[0] ?? "kid";
  const homeIsEmpty = () => props.first && (props.creatures?.length ?? 0) === 0;
  const introducing = () => !met() && (created() !== undefined || homeIsEmpty());
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const make = async (): Promise<CreatureSummary> => {
    const listed = await creaturesListed(props.shell.client);
    if (listed === undefined || disposed)
      throw new Error("Could not read the creatures in your home.");
    const existing = listed[0] ?? created();
    if (existing !== undefined) return existing;
    const answer = await props.shell.client.createCreature({ name, skin });
    if (!("slug" in answer)) throw new Error("Could not save your creature. Try again.");
    if (!disposed) {
      setCreated(answer);
      void props.shell.store.surfaces.refetch("bots");
    }
    return answer;
  };

  const meet = async (talk: boolean): Promise<void> => {
    if (busy()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const resident = created() ?? (await make());
      if (!disposed && talk) setSettingUp(resident);
    } catch {
      if (!disposed) setNotice("We could not save your creature. Try again.");
    } finally {
      if (!disposed) setBusy(false);
    }
  };

  const openConversation = async (
    resident: CreatureSummary,
    model: SelectedModel,
  ): Promise<void> => {
    const client = props.shell.client;
    const current = await client.creature(resident.slug);
    if (!("slug" in current) || disposed) throw new Error("Could not open this creature.");
    const strong = current.models.strong;
    if (
      strong === "inherit" ||
      strong.provider !== model.provider ||
      strong.model !== model.model
    ) {
      const patched = await client.updateCreature(resident.slug, {
        models: { strong: { provider: model.provider, model: model.model } },
      });
      if (!("slug" in patched)) throw new Error("Could not select a model for this creature.");
    }
    if (disposed) return;
    props.shell.sessions.openSession(current.conversation);
    setSettingUp(undefined);
    setMet(true);
  };

  return (
    <Show
      when={settingUp()}
      keyed
      fallback={
        <Show when={introducing()}>
          <section
            class="kw-meet-creature"
            aria-label="Meet your creature"
            aria-busy={busy()}
            data-native-activation
          >
            <Show
              when={created()}
              fallback={
                <div class="kw-meet-creature-intro">
                  <Portrait skin={skin} hueStop={1} />
                  <div class="kw-meet-creature-copy">
                    <span class="kw-model-kicker">Your creature</span>
                    <h2>{`Meet ${name}`}</h2>
                    <p>{meetLine(name)}</p>
                  </div>
                </div>
              }
            >
              {(resident) => (
                <div class="kw-meet-creature-intro">
                  <div class="kw-meet-creature-copy">
                    <span class="kw-model-kicker">Your creature</span>
                    <h2>{resident().name}</h2>
                    <p>{madeHereLine(resident().name)}</p>
                  </div>
                </div>
              )}
            </Show>
            <div class="kw-model-actions">
              <button type="button" class="kw-model-primary" onClick={() => void meet(true)}>
                Start a conversation
              </button>
              <Show when={created() === undefined}>
                <button type="button" class="kw-model-link" onClick={() => void meet(false)}>
                  Explore first
                </button>
                <button
                  type="button"
                  class="kw-model-link"
                  onClick={() => {
                    if (!busy()) props.onCustomize();
                  }}
                >
                  Customize first
                </button>
              </Show>
            </div>
            <Show when={notice()}>{(line) => <p role="status">{line()}</p>}</Show>
          </section>
        </Show>
      }
    >
      {(resident) => (
        <ModelSetup
          host={props.shell.host}
          workspace={props.shell.workspace}
          heading={`How would you like ${resident.name} to reply?`}
          continueLabel="Open conversation"
          scope="conversation"
          current={resident.models.strong === "inherit" ? undefined : resident.models.strong}
          onContinue={(model) => openConversation(resident, model)}
          onExplore={() => setSettingUp(undefined)}
        />
      )}
    </Show>
  );
}

function meetLine(name: string): string {
  return `${name} lives on this computer and can take on work for you. Start a conversation to choose the model it talks with, or look around first.`;
}

function madeHereLine(name: string): string {
  return `${name} is on the stead. Start a conversation when you are ready; you will choose the model it talks with.`;
}
