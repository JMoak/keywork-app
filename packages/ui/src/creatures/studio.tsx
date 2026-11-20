import "./studio.css";
import type { Facing, PoseName } from "@keywork-app/habitat";
import { createEffect, createSignal, createUniqueId, For, type JSX, on, Show } from "solid-js";
import { skinName } from "../onboarding/copy.ts";
import { IllustratedPortrait } from "./illustrated-portrait.tsx";
import { CreaturePortrait } from "./portrait.tsx";

export function CreatureStudio(props: {
  readonly skin: string;
  readonly hueStop: number;
  readonly name: string;
  readonly disabled?: boolean;
  readonly portraitClass?: string;
  readonly introduction?: string;
  readonly heading?: JSX.Element;
  readonly actions?: JSX.Element;
}) {
  const [inspecting, setInspecting] = createSignal(false);
  const design = () => descriptions.get(props.skin);
  const inspectorId = createUniqueId();
  let toggle: HTMLButtonElement | undefined;
  const close = (): void => {
    setInspecting(false);
    toggle?.focus();
  };
  createEffect(
    on(
      () => props.skin,
      () => setInspecting(false),
      { defer: true },
    ),
  );

  return (
    <section
      class="kw-creature-studio"
      data-design={props.skin}
      data-native-activation
      aria-label="Creature appearance preview"
    >
      <div class="kw-studio-scene">
        <div class="kw-studio-picture">
          <IllustratedPortrait
            skin={props.skin}
            name={props.name}
            hueStop={props.hueStop}
            size={2}
            class={props.portraitClass ?? "kw-studio-portrait"}
          />
        </div>
        <div class="kw-studio-caption">
          {props.heading ?? <strong class="kw-studio-title">{props.name}</strong>}
          <div class="kw-studio-description" aria-live="polite">
            <span class="kw-studio-material">
              {skinName(props.skin)}
              <Show when={design()}>{(known) => <> · {known().material}</>}</Show>
            </span>
            <Show when={props.introduction ?? design()?.story}>
              {(story) => <span class="kw-studio-story">{story()}</span>}
            </Show>
          </div>
          {props.actions}
          <button
            type="button"
            class="kw-studio-disclosure"
            ref={toggle}
            aria-expanded={inspecting()}
            aria-controls={inspectorId}
            disabled={props.disabled}
            onClick={() => setInspecting(!inspecting())}
          >
            {inspecting() ? "Hide motion preview" : "See it move"}
          </button>
        </div>
      </div>
      <div id={inspectorId} hidden={!inspecting()}>
        <Show when={inspecting()}>
          <MotionInspector
            skin={props.skin}
            name={props.name}
            hueStop={props.hueStop}
            disabled={props.disabled}
            onClose={close}
          />
        </Show>
      </div>
    </section>
  );
}

export function CreatureGallery(props: {
  readonly designs: readonly string[];
  readonly selected: string;
  readonly hueStop: number;
  readonly disabled?: boolean;
  readonly thumbnails?: boolean;
  onSelect(id: string): void;
}) {
  return (
    <fieldset class="kw-creature-gallery" aria-label="Creature design" data-native-activation>
      <For each={props.designs}>
        {(id) => (
          <button
            type="button"
            class="kw-gallery-choice"
            aria-label={skinName(id)}
            aria-pressed={props.selected === id}
            disabled={props.disabled}
            onClick={() => props.onSelect(id)}
          >
            <Show when={props.thumbnails}>
              <span class="kw-gallery-thumbnail" aria-hidden="true">
                <CreaturePortrait
                  skin={id}
                  hueStop={props.hueStop}
                  playing={false}
                  size={0.5}
                  class="kw-studio-portrait"
                />
              </span>
            </Show>
            <span>{skinName(id)}</span>
          </button>
        )}
      </For>
    </fieldset>
  );
}

function MotionInspector(props: {
  readonly skin: string;
  readonly hueStop: number;
  readonly name: string;
  readonly disabled: boolean | undefined;
  onClose(): void;
}) {
  const [motion, setMotion] = createSignal<Motion>("Idle");
  const [facing, setFacing] = createSignal<Facing>("right");
  const [playing, setPlaying] = createSignal(true);
  const clip = (): PoseName =>
    motion() === "Walk" ? (facing() === "right" ? "walk-right" : "walk-left") : motions[motion()];
  return (
    <fieldset
      class="kw-studio-inspector"
      aria-label="Animation preview"
      data-keys-owned
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <div class="kw-studio-motion-art">
        <CreaturePortrait
          skin={props.skin}
          name={props.name}
          hueStop={props.hueStop}
          clip={clip()}
          facing={facing()}
          playing={playing()}
          size={1}
          class="kw-studio-motion-portrait"
        />
      </div>
      <div class="kw-studio-controls">
        <strong>Pixel animation</strong>
        <div class="kw-studio-motions">
          <For each={motionNames}>
            {(option) => (
              <button
                type="button"
                aria-pressed={motion() === option}
                disabled={props.disabled}
                onClick={() => setMotion(option)}
              >
                {option}
              </button>
            )}
          </For>
        </div>
        <div class="kw-studio-playback">
          <button
            class="kw-studio-toggle"
            type="button"
            disabled={props.disabled}
            onClick={() => setPlaying(!playing())}
          >
            {playing() ? "Pause preview" : "Play preview"}
          </button>
          <span class="kw-studio-still">Still frames</span>
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => setFacing(facing() === "right" ? "left" : "right")}
          >
            {facing() === "right" ? "Turn left" : "Turn right"}
          </button>
        </div>
      </div>
    </fieldset>
  );
}
const motions = { Idle: "idle", Walk: "walk-right", Work: "work", Rest: "nap" } as const;
type Motion = keyof typeof motions;
const motionNames = Object.keys(motions) as Motion[];

const descriptions = new Map<string, { material: string; story: string }>([
  [
    "kid",
    {
      material: "Leather & steel",
      story: "A ranch hand with a hammer tucked into a well-worn tool belt.",
    },
  ],
  [
    "carter",
    {
      material: "Hide & canvas",
      story: "A sure-footed mule with long listening ears and a pair of cargo panniers.",
    },
  ],
  [
    "joiner",
    {
      material: "Timber & graphite",
      story: "A patient badger keeps a pencil close and its tools neatly rolled.",
    },
  ],
  [
    "tessera",
    {
      material: "Painted porcelain",
      story:
        "Teal sprigs cross an overhanging porcelain dome. Six jointed legs carry it in a measured tripod walk.",
    },
  ],
  [
    "cairn",
    {
      material: "Moss & sandstone",
      story:
        "Three pieces of weathered stone turn around an open arch, then settle together to rest.",
    },
  ],
  [
    "folio",
    {
      material: "Leaf & gold vein",
      story:
        "A cream-colored dragon folds its veined leaf wings against its back and curls its tail to rest.",
    },
  ],
]);
