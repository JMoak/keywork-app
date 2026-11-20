import "./onboarding.css";
import type { CreatureSummary } from "@keywork-app/protocol";
import { createRenderEffect, createSignal, onCleanup, Show } from "solid-js";
import { CreatureGallery, CreatureStudio } from "../creatures/studio.tsx";
import { ModelSetup } from "../model-setup/index.tsx";
import type { SelectedModel } from "../model-setup/inventory.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { creaturesListed } from "../shell/first-frame.ts";
import { proposeNames } from "./names.ts";
import { fallbackName } from "./sequence.ts";
import { offeredSkins, rolledSkin } from "./skins.ts";

export function meetingName(workspace: string): string {
  return proposeNames(workspace)[0] ?? fallbackName;
}

export function MeetCreature(props: {
  readonly shell: ShellSeams;
  readonly creatures: readonly CreatureSummary[] | undefined;
  readonly first: boolean;
  readonly initialSkin?: string | undefined;
  onShowingChange?(showing: boolean): void;
  onCustomize(skin: string): void;
}) {
  const [settingUp, setSettingUp] = createSignal<CreatureSummary>();
  const [met, setMet] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const name = meetingName(props.shell.workspace);
  const designs = offeredSkins();
  const firstDesign = designs.includes("folio") ? "folio" : (designs[0] ?? "kid");
  const [skin, setSkin] = createSignal(
    props.initialSkin !== undefined && designs.includes(props.initialSkin)
      ? props.initialSkin
      : firstDesign,
  );
  const [beforeRoll, setBeforeRoll] = createSignal<string>();
  const homeIsEmpty = () => props.first && (props.creatures?.length ?? 0) === 0;
  const introducing = () => !met() && (busy() || homeIsEmpty());
  createRenderEffect(() => props.onShowingChange?.(settingUp() !== undefined || introducing()));
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    props.onShowingChange?.(false);
  });

  const make = async (): Promise<CreatureSummary> => {
    const listed = await creaturesListed(props.shell.client);
    if (listed === undefined || disposed)
      throw new Error("Could not read the creatures in your home.");
    const existing = listed[0];
    if (existing !== undefined) return existing;
    const answer = await props.shell.client.createCreature({ name, skin: skin() });
    if (!("slug" in answer)) throw new Error("Could not save your creature. Try again.");
    if (!disposed) void props.shell.store.surfaces.refetch("bots");
    return answer;
  };

  const meet = async (talk: boolean): Promise<void> => {
    if (busy()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const resident = await make();
      if (disposed) return;
      if (talk) setSettingUp(resident);
      else setMet(true);
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
            <CreatureStudio
              skin={skin()}
              hueStop={1}
              name={name}
              disabled={busy()}
              portraitClass="kw-onboard-portrait"
              introduction={`${name} can help with projects on your computer. Try asking it to explain a file.`}
              heading={<h2>{`Meet ${name}`}</h2>}
              actions={
                <div class="kw-encounter-actions">
                  <button
                    type="button"
                    class="kw-encounter-primary"
                    disabled={busy()}
                    onClick={() => void meet(true)}
                  >
                    Start a conversation
                  </button>
                  <button
                    type="button"
                    class="kw-encounter-secondary"
                    disabled={busy()}
                    onClick={() => void meet(false)}
                  >
                    Explore first
                  </button>
                </div>
              }
            />
            <div class="kw-meet-selection">
              <div class="kw-meet-gallery-heading">
                <strong>Choose a design</strong>
                <button
                  type="button"
                  class="kw-meet-minor"
                  disabled={busy()}
                  onClick={() => props.onCustomize(skin())}
                >
                  Customize first
                </button>
              </div>
              <CreatureGallery
                designs={designs}
                selected={skin()}
                hueStop={1}
                disabled={busy()}
                onSelect={(id) => {
                  setSkin(id);
                  setBeforeRoll(undefined);
                }}
              />
              <div class="kw-meet-roll">
                <button
                  type="button"
                  class="kw-meet-minor"
                  disabled={busy() || designs.length < 2}
                  onClick={() => {
                    setBeforeRoll(skin());
                    setSkin(rolledSkin(skin(), designs));
                  }}
                >
                  Roll a design
                </button>
                <Show when={beforeRoll()}>
                  {(previous) => (
                    <button
                      type="button"
                      class="kw-meet-minor"
                      disabled={busy()}
                      onClick={() => {
                        setSkin(previous());
                        setBeforeRoll(undefined);
                      }}
                    >
                      Undo roll
                    </button>
                  )}
                </Show>
              </div>
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
          onExplore={() => {
            setMet(true);
            setSettingUp(undefined);
          }}
        />
      )}
    </Show>
  );
}
