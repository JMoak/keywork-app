import "../panes/overview/overview.css";
import "./onboarding.css";
import type { CreatureSummary, SessionSummary } from "@keywork-app/protocol";
import {
  createEffect,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import type { AppAction } from "../keys/actions.ts";
import { OverviewRow, SubLine } from "../panes/overview/rows.tsx";
import type { ShellSeams } from "../panes/registry.ts";
import { creaturesListed } from "../shell/first-frame.ts";
import { useKeyboardScope } from "../shell/keyboard-claim.ts";
import { createOnboardingController, type OnboardingController } from "./controller.ts";
import {
  acceptRestKey,
  backKey,
  connectKey,
  madeKeys,
  makingLine,
  modelsAsk,
  modelsKeys,
  nameAsk,
  nameField,
  nameKeys,
  nameRefused,
  notMadeLine,
  notNowKey,
  onboardingName,
  readingLine,
  skinAsk,
  skinKeys,
  stepWords,
  titleLine,
  workshopAsk,
  workshopKeys,
} from "./copy.ts";
import { introducingClient } from "./introduction.ts";
import {
  type CloudStanding,
  localFirst,
  nothingReachable,
  policyLines,
  type Reach,
  reachLines,
} from "./models.ts";
import { nameOf } from "./names.ts";
import {
  firstRunWanted,
  type Onboarding,
  type OnboardingSeams,
  type OnboardingStorage,
  onboardingStorageKey,
  type Phase,
  rememberedOnboarding,
  startOnboarding,
  type Verb,
} from "./onboarding.ts";
import { Portrait } from "./portrait.tsx";
import { onboardingClientFor } from "./requests.ts";
import {
  type Decision,
  decisionOf,
  type Proposals,
  type Sequence,
  type Step,
  steps,
} from "./sequence.ts";

export {
  type Choice,
  choicesFor,
  firstRunWanted,
  type Onboarding,
  type OnboardingSeams,
  type OnboardingStorage,
  onboardingStorageKey,
  type Phase,
  rememberedOnboarding,
  startOnboarding,
  type Verb,
} from "./onboarding.ts";

export const onboardingActionId = "onboarding.start";

export const onboardingAction: AppAction = {
  chords: "leader 1",
  help: "make a creature: name, skin, workshop, models",
  command: {
    name: "creature.new",
    label: "new creature",
    aliases: ["new-creature", "onboard"],
    description:
      "make a creature on the stead: name, skin, workshop, models, then its first thread",
  },
  invoke: (target) => {
    target.requestOnboarding();
    target.summon("stead");
  },
};

const keyVerbs: Readonly<Record<string, Verb>> = {
  j: "down",
  ArrowDown: "down",
  k: "up",
  ArrowUp: "up",
  Enter: "keep",
  Escape: "skip",
  a: "rest",
  Backspace: "back",
  x: "dismiss",
  c: "connect",
  i: "install",
};

export function cardOwnsFocus(phase: Phase["kind"]): boolean {
  return phase === "made" || phase === "failed";
}

export function cloudStandingOf(rows: readonly SessionSummary[]): CloudStanding {
  const answered = [...rows]
    .filter((row) => row.model !== undefined)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  return answered?.model === undefined
    ? { kind: "unknown" }
    : { kind: "answering", model: answered.model };
}

export function onboardingSeamsOf(
  shell: ShellSeams,
  storage: OnboardingStorage | undefined,
): OnboardingSeams {
  return {
    client: onboardingClientFor(shell.host, shell.workspace),
    workspace: shell.workspace,
    cloud: () => cloudStandingOf(shell.store.state.summaries),
    seat: () => shell.store.surfaces.refetch("bots"),
    inject: (sessionId, text, creature) =>
      shell.client.inject(sessionId, { text, client: introducingClient, frame: { creature } }),
    openThread: (sessionId) => shell.sessions.openSession(sessionId),
    openConnect: () => shell.openPane({ kind: "terminal", mode: "bridge", verb: "connect" }),
    openInstall: () => shell.openPane({ kind: "terminal", mode: "shell" }),
    storage,
  };
}

export interface OnboardingOnTheSteadProps {
  readonly shell: ShellSeams;
  readonly automatic?: boolean;
  readonly controller?: OnboardingController;
  readonly storage?: OnboardingStorage | undefined;
  readonly seams?: Partial<OnboardingSeams> | undefined;
}

export function OnboardingOnTheStead(props: OnboardingOnTheSteadProps) {
  const controller = props.controller ?? props.shell.onboarding ?? createOnboardingController();
  const storage = props.storage ?? localStorageOrNone();
  const onboarding = startOnboarding({
    ...onboardingSeamsOf(props.shell, storage),
    ...props.seams,
  });
  const listed = props.automatic ? createCreatureListing(props.shell) : () => undefined;
  const wanted = (): boolean =>
    props.automatic === true &&
    firstRunWanted({
      trusted: props.shell.trust.state().kind === "trusted",
      creatures: listed(),
      remembered: rememberedOnboarding(storage, onboardingStorageKey(props.shell.workspace)),
    });
  const underway = (): boolean => {
    const kind = onboarding.phase().kind;
    return kind === "making" || kind === "made" || kind === "failed";
  };
  const showing = (): boolean =>
    controller.requested() || (onboarding.phase().kind !== "closed" && (underway() || wanted()));
  createEffect(
    on(
      () => onboarding.phase().kind,
      (kind) => {
        if (kind === "closed") controller.clearRequest();
      },
    ),
  );
  createEffect(() => {
    if (showing()) onCleanup(controller.bind(onboarding));
  });
  return (
    <Show when={showing()}>
      <OnboardingCard
        onboarding={onboarding}
        workspace={props.shell.workspace}
        controller={controller}
        home={props.shell.steadHome !== undefined}
      />
    </Show>
  );
}

export interface OnboardingCardProps {
  readonly onboarding: Onboarding;
  readonly workspace: string;
  readonly controller?: OnboardingController;
  readonly home?: boolean;
}

export function OnboardingCard(props: OnboardingCardProps) {
  const keyboard = useKeyboardScope();
  let root: HTMLElement | undefined;
  const phase = () => props.onboarding.phase();
  const step = () => props.onboarding.step();
  const proposals = () => props.onboarding.proposals();
  const [notice, setNotice] = createSignal<string>();
  const installOffered = (): boolean => proposals()?.workshop.installStep !== undefined;

  const keepName = (text: string): void => {
    const name = nameOf(text);
    if (name === undefined) setNotice(nameRefused);
    else props.onboarding.name(name);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement) return;
    const verb = keyVerbs[event.key];
    if (verb !== undefined && props.onboarding.act(verb)) event.preventDefault();
  };

  createEffect(
    on(step, (current) => {
      setNotice(undefined);
      if (current !== undefined && current !== "name" && focusIsHere(root)) {
        root?.focus({ preventScroll: true });
      }
    }),
  );
  createEffect(
    on(
      () => phase().kind,
      (kind) => {
        if (cardOwnsFocus(kind)) root?.focus({ preventScroll: true });
      },
    ),
  );
  onMount(() => {
    if (root === undefined) return;
    if (props.controller !== undefined) onCleanup(props.controller.bindCard(root));
    if (keyboard !== undefined) onCleanup(keyboard.claim(root));
  });
  createEffect(
    on(
      () => props.onboarding,
      (onboarding) => void onboarding.begin(),
    ),
  );

  return (
    <aside
      class="kw-onboard"
      aria-label={onboardingName}
      tabIndex={-1}
      ref={root}
      data-phase={phase().kind}
      onKeyDown={onKeyDown}
    >
      <div class="kw-onboard-head">
        <span class="kw-onboard-title">
          {props.home ? "a creature for your home" : titleLine(props.workspace)}
        </span>
        <ol class="kw-onboard-steps" aria-label="steps">
          <For each={steps}>
            {(each) => (
              <StepMark step={each} current={step()} sequence={props.onboarding.sequence()} />
            )}
          </For>
        </ol>
      </div>
      <div class="kw-onboard-portrait-slot">
        <Portrait skin={props.onboarding.shownSkin()} hueStop={props.onboarding.coat()} />
      </div>
      <div class="kw-onboard-body">
        <Switch>
          <Match when={phase().kind === "reading"}>
            <p class="kw-onboard-line">{readingLine}</p>
          </Match>
          <Match when={step() === "name"}>
            <NameStep
              proposals={proposals()?.names ?? []}
              notice={notice()}
              onKeep={keepName}
              onSkip={() => props.onboarding.act("skip")}
            />
          </Match>
          <Match when={step() !== undefined && step() !== "name"}>
            <ChoiceStep
              step={step() ?? "skin"}
              onboarding={props.onboarding}
              facts={factsFor(step(), proposals(), props.onboarding.reach())}
              keys={keysFor(step(), installOffered())}
            />
          </Match>
          <Match when={makingName(phase())}>
            {(name) => <p class="kw-onboard-line">{makingLine(name())}</p>}
          </Match>
          <Match when={madeLines(phase())}>
            {(lines) => (
              <>
                <For each={lines()}>
                  {(line, index) => (
                    <p class="kw-onboard-line" data-tone={index() === 0 ? "made" : undefined}>
                      {line}
                    </p>
                  )}
                </For>
                <p class="kw-onboard-line">{madeKeys}</p>
              </>
            )}
          </Match>
          <Match when={failureOf(phase())}>
            {(reason) => (
              <p class="kw-onboard-line" data-tone="error">
                {notMadeLine(reason())}
              </p>
            )}
          </Match>
        </Switch>
      </div>
    </aside>
  );
}

const decisionMarks: Readonly<Record<Decision, string>> = { kept: "█", skipped: "·" };

function StepMark(props: { step: Step; current: Step | undefined; sequence: Sequence }) {
  const decision = () => decisionOf(props.sequence, props.step);
  return (
    <li
      class="kw-onboard-step"
      data-current={props.current === props.step ? "" : undefined}
      data-decided={decision() === undefined ? undefined : ""}
    >
      {stepWords[props.step]}
      <Show when={decision()}>{(made) => <> {decisionMarks[made()]}</>}</Show>
    </li>
  );
}

interface NameStepProps {
  proposals: readonly string[];
  notice: string | undefined;
  onKeep(text: string): void;
  onSkip(): void;
}

function NameStep(props: NameStepProps) {
  let input: HTMLInputElement | undefined;
  const [text, setText] = createSignal("");
  const first = (): string => props.proposals[0] ?? "";
  onMount(() => input?.focus());
  const proposalAt = (key: string): string | undefined => {
    const index = Number.parseInt(key, 10) - 1;
    return Number.isInteger(index) ? props.proposals[index] : undefined;
  };
  return (
    <>
      <p class="kw-onboard-ask">{nameAsk}</p>
      <form
        class="kw-ov-draft"
        onSubmit={(event) => {
          event.preventDefault();
          props.onKeep(text() === "" ? first() : text());
        }}
      >
        <span>{nameField}</span>
        <input
          aria-label={nameField}
          value={text()}
          placeholder={first()}
          ref={input}
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onSkip();
              return;
            }
            const proposal = text() === "" ? proposalAt(event.key) : undefined;
            if (proposal === undefined) return;
            event.preventDefault();
            props.onKeep(proposal);
          }}
        />
      </form>
      <ol class="kw-onboard-choices" aria-label="proposed names">
        <For each={props.proposals}>
          {(name, index) => (
            <OverviewRow
              cursor={false}
              mark={String(index() + 1)}
              onClick={() => props.onKeep(name)}
            >
              {name}
            </OverviewRow>
          )}
        </For>
      </ol>
      <p class="kw-onboard-line">{nameKeys(first())}</p>
      <Show when={props.notice}>
        {(line) => (
          <p class="kw-onboard-line" data-tone="error">
            {line()}
          </p>
        )}
      </Show>
    </>
  );
}

interface ChoiceStepProps {
  step: Step;
  onboarding: Onboarding;
  facts: readonly string[];
  keys: string;
}

function ChoiceStep(props: ChoiceStepProps) {
  const cursor = () => props.onboarding.cursor();
  return (
    <>
      <p class="kw-onboard-ask">{askFor(props.step)}</p>
      <Show when={props.facts.length > 0}>
        <ul class="kw-onboard-facts" aria-label="what this machine has">
          <For each={props.facts}>{(fact) => <li>{fact}</li>}</For>
        </ul>
      </Show>
      <ol class="kw-onboard-choices" aria-label={`${props.step} choices`}>
        <For each={props.onboarding.choices()}>
          {(choice, index) => (
            <>
              <OverviewRow
                cursor={index() === cursor()}
                density={index() === cursor() ? "full" : "light"}
                mark={index() === cursor() ? "█" : undefined}
                onClick={() => {
                  props.onboarding.point(index());
                  props.onboarding.act("keep");
                }}
              >
                <span onPointerEnter={() => props.onboarding.point(index())}>{choice.label}</span>
              </OverviewRow>
              <Show when={choice.detail}>{(detail) => <SubLine text={detail()} />}</Show>
            </>
          )}
        </For>
      </ol>
      <p class="kw-onboard-line">
        {props.keys} · {acceptRestKey} · {backKey} · {notNowKey}
      </p>
    </>
  );
}

function askFor(step: Step): string {
  switch (step) {
    case "name":
      return nameAsk;
    case "skin":
      return skinAsk;
    case "workshop":
      return workshopAsk;
    case "models":
      return modelsAsk;
  }
}

function keysFor(step: Step | undefined, installOffered: boolean): string {
  switch (step) {
    case "workshop":
      return workshopKeys(installOffered);
    case "models":
      return modelsKeys;
    default:
      return skinKeys;
  }
}

export function factsFor(
  step: Step | undefined,
  proposals: Proposals | undefined,
  reach: Reach | undefined,
): string[] {
  if (proposals === undefined) return [];
  switch (step) {
    case "workshop":
      return proposals.workshop.installStep === undefined ? [] : [proposals.workshop.installStep];
    case "models": {
      if (reach === undefined) return [];
      const connect = nothingReachable(reach) ? [connectKey] : [];
      const policy = localFirst(proposals.policy)
        ? policyLines(proposals.policy).map(([modelClass, word]) => `${modelClass}: ${word}`)
        : [];
      return [...reachLines(reach), ...policy, ...connect];
    }
    default:
      return [];
  }
}

function makingName(phase: ReturnType<Onboarding["phase"]>): string | undefined {
  return phase.kind === "making" ? phase.name : undefined;
}

function madeLines(phase: ReturnType<Onboarding["phase"]>): readonly string[] | undefined {
  return phase.kind === "made" ? phase.made.lines : undefined;
}

function failureOf(phase: ReturnType<Onboarding["phase"]>): string | undefined {
  return phase.kind === "failed" ? phase.reason : undefined;
}

function createCreatureListing(
  shell: Pick<ShellSeams, "client" | "feed" | "trust">,
): () => readonly CreatureSummary[] | undefined {
  const [listed, setListed] = createSignal<readonly CreatureSummary[]>();
  const read = (): void => {
    void creaturesListed(shell.client).then((listing) => {
      if (listing !== undefined) setListed(listing);
    });
  };
  createEffect(
    on(
      () => shell.trust.state().kind,
      (kind) => {
        if (kind === "trusted") read();
      },
    ),
  );
  onCleanup(
    shell.feed.subscribe((batch) => {
      if (batch.some((envelope) => envelope.type === "creature.changed")) read();
    }),
  );
  return listed;
}

function focusIsHere(root: HTMLElement | undefined): boolean {
  const focused = document.activeElement;
  return focused === null || focused === document.body || root?.contains(focused) === true;
}

function localStorageOrNone(): OnboardingStorage | undefined {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
