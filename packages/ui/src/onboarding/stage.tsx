import "./onboarding.css";
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { KeyAct } from "../chrome/key-act.tsx";
import { loadSkin } from "../panes/stead/habitat-render.ts";
import { useKeyboardScope } from "../shell/keyboard-claim.ts";
import type { OnboardingController } from "./controller.ts";
import {
  anotherName,
  closeActs,
  coatName,
  coatsName,
  connectActs,
  conversationActs,
  eggActs,
  eggName,
  lookLine,
  meetActs,
  nameField,
  nextLook,
  notNowAct,
  previousLook,
  retryActs,
  type StageAct,
  stageName,
} from "./copy.ts";
import { nameLimit } from "./names.ts";
import { coats, type Made, type Onboarding, type Phase, type Verb } from "./onboarding.ts";
import { StageCanvas, type StageMeasures } from "./stage-canvas.tsx";

export interface HatchStageProps {
  readonly onboarding: Onboarding;
  readonly controller?: OnboardingController | undefined;
  readonly random?: (() => number) | undefined;
}

export function HatchStage(props: HatchStageProps) {
  const keyboard = useKeyboardScope();
  const keysId = createUniqueId();
  const coatsId = createUniqueId();
  let root: HTMLElement | undefined;
  let egg: HTMLButtonElement | undefined;
  let field: HTMLInputElement | undefined;
  const [measures, setMeasures] = createSignal<StageMeasures>();
  const phase = (): Phase => props.onboarding.phase();
  const kind = (): Phase["kind"] => phase().kind;
  const hatchling = () => props.onboarding.hatchling();
  const trouble = () => props.onboarding.trouble();
  const made = (): Made | undefined => madeIn(phase());
  const named = (): boolean => kind() === "meet" || kind() === "making";
  const who = (): string => whoLine(hatchling()?.skin);
  const said = (): string => saidIn(phase(), trouble(), who());

  const act = (verb: Verb): boolean => {
    const taken = props.onboarding.act(verb);
    if (taken && verb === "another") selectName();
    return taken;
  };
  const selectName = (): void => {
    field?.focus({ preventScroll: true });
    field?.select();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const verb = verbOf(event);
    if (verb === undefined) return;
    if (act(verb) || event.key === "Tab") event.preventDefault();
  };
  const keepFocus = (event: MouseEvent): void => {
    if (event.target !== field) event.preventDefault();
  };
  const measure = (next: StageMeasures): void => {
    const held = measures();
    if (held === undefined || !sameMeasures(held, next)) setMeasures(next);
  };

  createEffect(
    on(kind, (current) => {
      if (current === "meet") selectName();
      else if (current === "egg" && egg !== undefined) egg.focus({ preventScroll: true });
      else if (current !== "making") root?.focus({ preventScroll: true });
    }),
  );
  onMount(() => {
    if (root === undefined) return;
    if (props.controller !== undefined) onCleanup(props.controller.bindCard(root));
    if (keyboard !== undefined) onCleanup(keyboard.claim(root));
    void props.onboarding.begin();
  });

  return (
    <section
      class="kw-hatch"
      aria-label={stageName}
      aria-busy={kind() === "making"}
      tabIndex={-1}
      ref={root}
      data-phase={kind()}
      style={measureStyle(measures())}
      onKeyDown={onKeyDown}
      onMouseDown={keepFocus}
    >
      <StageCanvas
        phase={phase()}
        coat={props.onboarding.coat()}
        skin={hatchling()?.skin}
        label={kind() === "egg" || kind() === "hatching" ? eggName : who()}
        random={props.random}
        onMeasure={measure}
      />
      <p class="kw-hatch-said" role="status">
        {said()}
      </p>
      <Show when={kind() === "egg"}>
        <button
          type="button"
          class="kw-hatch-egg"
          aria-label={eggName}
          aria-describedby={keysId}
          ref={egg}
          onClick={() => act("accept")}
        />
      </Show>
      <Show when={kind() === "meet"}>
        <button
          type="button"
          class="kw-hatch-turn"
          data-side="before"
          aria-label={previousLook}
          tabIndex={-1}
          onClick={() => act("previous")}
        >
          ‹
        </button>
        <button
          type="button"
          class="kw-hatch-turn"
          data-side="after"
          aria-label={nextLook}
          tabIndex={-1}
          onClick={() => act("next")}
        >
          ›
        </button>
      </Show>
      <div class="kw-hatch-words">
        <Show when={named()}>
          <div class="kw-hatch-name" data-shaken={shakenAs(props.onboarding.shakes())}>
            <input
              class="kw-hatch-name-field"
              aria-label={nameField}
              aria-describedby={keysId}
              ref={field}
              value={hatchling()?.name ?? ""}
              maxLength={nameLimit}
              readOnly={kind() === "making"}
              spellcheck={false}
              autocomplete="off"
              style={{ width: `${fieldWidth(hatchling()?.name ?? "")}ch` }}
              onInput={(event) => props.onboarding.rename(event.currentTarget.value)}
            />
            <Show when={kind() === "meet"}>
              <button
                type="button"
                class="kw-hatch-reroll"
                aria-label={anotherName}
                tabIndex={-1}
                onClick={() => act("another")}
              >
                ↻
              </button>
            </Show>
          </div>
          <p class="kw-hatch-line" data-tone={trouble() === undefined ? undefined : "error"}>
            {trouble() ?? who()}
          </p>
        </Show>
        <Show when={kind() === "meet"}>
          <fieldset class="kw-hatch-coats" aria-label={coatsName}>
            <For each={coats()}>
              {(coat) => (
                <input
                  type="radio"
                  class="kw-hatch-coat"
                  name={coatsId}
                  checked={hatchling()?.coat === coat}
                  aria-label={coatName(coat, coats().length)}
                  tabIndex={-1}
                  style={{ "--kw-hatch-coat": `var(--kw-ramp-${coat})` }}
                  onChange={() => props.onboarding.wear(coat)}
                />
              )}
            </For>
          </fieldset>
        </Show>
        <Show when={made()}>
          {(kept) => (
            <>
              <p class="kw-hatch-name">{kept().name}</p>
              <For each={kept().lines}>
                {(line, index) => (
                  <p class="kw-hatch-line" data-tone={index() === 0 ? "made" : "quiet"}>
                    {line}
                  </p>
                )}
              </For>
            </>
          )}
        </Show>
        <Show when={kind() === "egg" && trouble()}>
          {(reason) => (
            <p class="kw-hatch-line" data-tone="error">
              {reason()}
            </p>
          )}
        </Show>
        <p class="kw-hatch-keys" id={keysId}>
          <StageActs acts={actsIn(phase(), trouble())} onAct={act} />
        </p>
        <Show when={kind() === "meet"}>
          <p class="kw-hatch-keys" data-aside="">
            <StageActs acts={[notNowAct]} onAct={act} />
          </p>
        </Show>
      </div>
    </section>
  );
}

const keyVerbs: Readonly<Record<string, Verb>> = {
  Enter: "accept",
  Escape: "leave",
  ArrowLeft: "previous",
  ArrowRight: "next",
  ArrowUp: "up",
  ArrowDown: "down",
  Tab: "another",
};

const space = " ";
const narrowestField = 3;

function verbOf(event: KeyboardEvent): Verb | undefined {
  const typing = event.target instanceof HTMLInputElement;
  return event.key === space && !typing ? "accept" : keyVerbs[event.key];
}

function madeIn(phase: Phase): Made | undefined {
  return phase.kind === "made" ? phase.made : undefined;
}

function whoLine(skin: string | undefined): string {
  if (skin === undefined) return "";
  const loaded = loadSkin(skin);
  return lookLine(skin, loaded.ok ? loaded.skin.displayName : skin);
}

function saidIn(phase: Phase, trouble: string | undefined, who: string): string {
  switch (phase.kind) {
    case "egg":
      return trouble ?? eggName;
    case "meet":
      return trouble ?? who;
    case "made":
      return [phase.made.name, ...phase.made.lines].join(" · ");
    default:
      return "";
  }
}

function actsIn(phase: Phase, trouble: string | undefined): readonly StageAct[] {
  switch (phase.kind) {
    case "egg":
      return trouble === undefined ? eggActs : retryActs;
    case "meet":
      return meetActs;
    case "made":
      return madeActs[phase.made.next.kind];
    default:
      return [];
  }
}

const madeActs = {
  conversation: conversationActs,
  connect: connectActs,
  nothing: closeActs,
} as const;

interface StageActsProps {
  readonly acts: readonly StageAct[];
  onAct(verb: Verb): void;
}

function StageActs(props: StageActsProps) {
  return (
    <For each={props.acts}>
      {(act, at) => (
        <>
          <Show when={at() > 0}> · </Show>
          <Show
            when={act.keys.length > 1 ? undefined : act.keys[0]}
            fallback={
              <>
                <For each={act.keys}>
                  {(held) => (
                    <>
                      <KeyAct
                        chord={held.key}
                        spoken={held.spoken}
                        offTheTabPath
                        onPress={() => props.onAct(held.verb)}
                      />{" "}
                    </>
                  )}
                </For>
                {act.words}
              </>
            }
          >
            {(held) => (
              <KeyAct
                chord={held().key}
                label={act.words}
                keyLeads
                offTheTabPath
                onPress={() => props.onAct(held().verb)}
              />
            )}
          </Show>
        </>
      )}
    </For>
  );
}

function shakenAs(shakes: number): "once" | "again" | undefined {
  if (shakes === 0) return undefined;
  return shakes % 2 === 1 ? "once" : "again";
}

function fieldWidth(name: string): number {
  return Math.max(narrowestField, [...name].length) + 1;
}

function sameMeasures(a: StageMeasures, b: StageMeasures): boolean {
  return a.floor === b.floor && a.figureTop === b.figureTop && a.figureWidth === b.figureWidth;
}

function measureStyle(measures: StageMeasures | undefined): Record<string, string> {
  if (measures === undefined) return {};
  return {
    "--kw-hatch-floor": `${measures.floor}px`,
    "--kw-hatch-figure-top": `${measures.figureTop}px`,
    "--kw-hatch-figure": `${measures.figureWidth}px`,
  };
}
