import type { CreatureSummary } from "@keywork-app/protocol";
import { createSignal, onCleanup, Show } from "solid-js";
import { ModelSetup } from "../model-setup/index.tsx";
import type { SelectedModel } from "../model-setup/inventory.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { creaturesListed } from "../shell/first-frame.ts";
import { Portrait } from "./portrait.tsx";
import { fallbackName } from "./sequence.ts";
import { offeredSkins } from "./skins.ts";

export function MeetCreature(props: {
  readonly shell: ShellSeams;
  readonly creatures: readonly CreatureSummary[] | undefined;
  readonly first: boolean;
  onCustomize(): void;
}) {
  const [created, setCreated] = createSignal<CreatureSummary>();
  const [settingUp, setSettingUp] = createSignal<CreatureSummary>();
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const creature = () => props.creatures?.[0] ?? created();
  const returningThread = () => {
    const resident = creature();
    return resident?.slug !== created()?.slug ? resident?.conversation : undefined;
  };
  const skin = offeredSkins()[0] ?? "kid";
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
    const answer = await props.shell.client.createCreature({ name: fallbackName, skin });
    if (!("slug" in answer)) throw new Error("Could not save your creature. Try again.");
    if (!disposed) {
      setCreated(answer);
      void props.shell.store.surfaces.refetch("bots");
    }
    return answer;
  };

  const meet = async (talk: boolean): Promise<void> => {
    setBusy(true);
    setNotice(undefined);
    try {
      const resident = creature() ?? (await make());
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
  };

  return (
    <Show
      when={settingUp()}
      keyed
      fallback={
        <Show when={creature() !== undefined || props.first}>
          <section class="kw-meet-creature" aria-label="Meet your creature" data-native-activation>
            <div class="kw-meet-creature-intro">
              <Show when={creature() === undefined}>
                <Portrait skin={skin} hueStop={1} />
              </Show>
              <div class="kw-meet-creature-copy">
                <span class="kw-model-kicker">Your creature</span>
                <h2>{creature() === undefined ? `Meet ${fallbackName}` : creature()?.name}</h2>
                <p>
                  {creature() === undefined
                    ? "You can meet your creature now and choose a model when you want to talk."
                    : "Choose how your creature replies."}
                </p>
              </div>
            </div>
            <div class="kw-model-actions">
              <Show when={returningThread()}>
                {(thread) => (
                  <button
                    type="button"
                    class="kw-model-primary"
                    disabled={busy()}
                    onClick={() => props.shell.sessions.openSession(thread())}
                  >
                    Open current conversation
                  </button>
                )}
              </Show>
              <button
                type="button"
                class={returningThread() ? "kw-model-link" : "kw-model-primary"}
                disabled={busy()}
                onClick={() => void meet(true)}
              >
                {returningThread() ? "Set up a model" : "Start a conversation"}
              </button>
              <Show when={creature() === undefined}>
                <button
                  type="button"
                  class="kw-model-link"
                  disabled={busy()}
                  onClick={() => void meet(false)}
                >
                  Explore first
                </button>
                <button
                  type="button"
                  class="kw-model-link"
                  disabled={busy()}
                  onClick={() => props.onCustomize()}
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
