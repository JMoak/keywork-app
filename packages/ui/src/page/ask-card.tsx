import type { ToolRun } from "@keywork-app/client";
import {
  type AnswerOutcome,
  type AskScope,
  type AskVerdict,
  isAskRefusal,
  onceOnlyTools,
  type PermissionRule,
  type RememberedScope,
} from "@keywork-app/protocol";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { returnKeyboardHome } from "../panes/keyboard-home.ts";
import { coverageLines } from "./consequence.ts";
import { AskConsequence } from "./consequence-view.tsx";

export type AskAnswerer = (
  verdict: AskVerdict,
  scope?: AskScope,
) => Promise<AnswerOutcome> | undefined;

export interface AskChords {
  readonly approve: string;
  readonly once: string;
  readonly session: string;
  readonly workspace: string;
  readonly deny: string;
}

export type AskPick = keyof AskChords;

export interface AskChoice {
  verdict: AskVerdict;
  scope?: AskScope;
}

export const cardKeys: AskChords = {
  approve: "y",
  once: "o",
  session: "s",
  workspace: "w",
  deny: "n",
};

export function askChordsOf(keys: { chord(action: string): string }): AskChords {
  return {
    approve: keys.chord("ask.approve"),
    once: keys.chord("ask.once"),
    session: keys.chord("ask.session"),
    workspace: keys.chord("ask.workspace"),
    deny: keys.chord("ask.deny"),
  };
}

export interface AskCardProps {
  run: ToolRun;
  onAnswer: AskAnswerer;
  chords?: AskChords | undefined;
  quiet?: boolean | undefined;
  accepted?: RememberedScope | undefined;
}

export function acceptedLine(scope: RememberedScope, chords: AskChords): string {
  return scope === "workspace"
    ? `accepted in trust setup · ${chords.workspace} records it for the workspace`
    : `accepted in trust setup · ${chords.session} records it for this session`;
}

export function AskCard(props: AskCardProps) {
  let card: HTMLFieldSetElement | undefined;
  const [refusal, setRefusal] = createSignal<string>();
  const [answering, setAnswering] = createSignal(false);
  const quiet = () => props.quiet === true;
  const rules = () => rememberableRules(props.run);
  const chords = (): AskChords => props.chords ?? cardKeys;
  const offers = () => askOffers(props.run, quiet());
  const remembering = () => rememberingOffers(offers());
  const rememberingChords = () => remembering().map((offer) => chords()[offer.pick]);
  const coverage = () =>
    props.run.ask?.tool === "bash" ? coverageOf(remembering(), rules(), chords()) : [];
  const exemption = () => (quiet() ? quietExemption(props.run) : undefined);

  const answer = async (choice: AskChoice): Promise<void> => {
    if (answering()) return;
    setAnswering(true);
    setRefusal(undefined);
    try {
      const outcome = await props.onAnswer(choice.verdict, choice.scope);
      if (isAskRefusal(outcome)) setRefusal(outcome.detail);
      else returnKeyboardHome();
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    } finally {
      setAnswering(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const pick = askKeyPick(event);
    const choice = pick === undefined ? undefined : askChoiceFor(pick, props.run, quiet());
    if (choice === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    void answer(choice);
  };

  onMount(() => {
    if (card !== undefined && mayClaimFocus(card)) card.focus({ preventScroll: true });
  });
  onCleanup(() => {
    if (card?.contains(document.activeElement)) returnKeyboardHome();
  });

  return (
    <fieldset
      class="kw-ask"
      aria-label="permission ask"
      tabIndex={-1}
      ref={card}
      data-call-id={props.run.callId}
      onKeyDown={onKeyDown}
      data-answering={answering() ? "" : undefined}
      data-quiet={quiet() ? "" : undefined}
    >
      <span class="kw-ask-why">{askReason(props.run.ask?.rule)}</span>
      <AskConsequence run={props.run} />
      <Show when={rules().length > 0}>
        <span class="kw-ask-rules">
          <span class="kw-ask-rules-label">{rememberingChords().join(" or ")} would allow</span>
          <For each={rules()}>{(rule) => <code class="kw-ask-rule">{ruleText(rule)}</code>}</For>
        </span>
        <For each={coverage()}>
          {(line) => (
            <span class="kw-ask-covers">
              <span class="kw-ask-covers-key">{line.chord}</span> {line.text}
            </span>
          )}
        </For>
        <For each={rules().flatMap(blanketWarning)}>
          {(warning) => <span class="kw-ask-blanket">{warning}</span>}
        </For>
        <Show when={props.accepted}>
          {(scope) => <span class="kw-ask-accepted">{acceptedLine(scope(), chords())}</span>}
        </Show>
      </Show>
      <Show when={exemption()}>{(reason) => <span class="kw-ask-quiet">{reason()}</span>}</Show>
      <span class="kw-ask-actions">
        <For each={offers()}>
          {(offer) => (
            <AskButton
              choice={offer.choice}
              chord={chords()[offer.pick]}
              onPress={() => void answer(offer.choice)}
            />
          )}
        </For>
      </span>
      <Show when={refusal()}>
        {(detail) => (
          <span class="kw-ask-refusal" role="alert">
            {detail()}
          </span>
        )}
      </Show>
    </fieldset>
  );
}

export function askChoiceFor(pick: AskPick, run: ToolRun, quiet: boolean): AskChoice | undefined {
  const rememberable = rememberableRules(run).length > 0;
  switch (pick) {
    case "approve":
      return approvesForSession(run, quiet) ? sessionGrant : onceGrant;
    case "once":
      return onceGrant;
    case "session":
      return rememberable ? sessionGrant : undefined;
    case "workspace":
      return rememberable ? workspaceGrant : undefined;
    case "deny":
      return denial;
  }
}

export function quietExemption(run: ToolRun): string | undefined {
  const tool = run.ask?.tool;
  if (tool !== undefined && onceOnlyTools.has(tool)) {
    return "quiet · write and edit are approved once at a time";
  }
  if (run.ask?.rule === "trusted") return "quiet · trusted reads ask before this form on purpose";
  const rules = rememberableRules(run);
  if (rules.length === 0) return "quiet · this call has nothing a grant could remember";
  if (rules.some(remembersExactCommand)) {
    return "quiet · a destructive command is never the quiet default";
  }
  return rules.some((rule) => blanketProgram(rule) !== undefined)
    ? "quiet · a blanket grant is never the quiet default"
    : undefined;
}

export function rememberableRules(run: ToolRun): readonly PermissionRule[] {
  const ask = run.ask;
  if (ask === undefined || onceOnlyTools.has(ask.tool)) return [];
  return ask.rules ?? [];
}

export function ruleText(rule: PermissionRule): string {
  if (rule.action === "bash") return rule.resource;
  return rule.resource === "*" ? rule.action : `${rule.action} ${rule.resource}`;
}

export function blanketWarning(rule: PermissionRule): string[] {
  const program = blanketProgram(rule);
  return program === undefined ? [] : [`this would allow every ${program} command`];
}

export function blanketProgram(rule: PermissionRule): string | undefined {
  if (rule.action !== "bash") return undefined;
  const [program = "", second] = rule.resource.split(/\s+/);
  if (second === "*") return program;
  return codeRunners.has(program) && second?.startsWith("-") === true ? program : undefined;
}

export function askReason(rule: "policy" | "default" | "trusted" | undefined): string {
  switch (rule) {
    case "policy":
      return "a rule asks before this tool runs";
    case "trusted":
      return "trusted reads ask before this form runs";
    default:
      return "this tool changes things";
  }
}

export interface AskOffer {
  readonly pick: AskPick;
  readonly choice: AskChoice;
}

export function askOffers(run: ToolRun, quiet: boolean): AskOffer[] {
  return offeredPicks(run, quiet).flatMap((pick) => {
    const choice = askChoiceFor(pick, run, quiet);
    return choice === undefined ? [] : [{ pick, choice }];
  });
}

export function answerLabel(choice: AskChoice): string {
  if (choice.verdict === "denied") return "deny";
  switch (choice.scope) {
    case "session":
      return "this session";
    case "workspace":
      return "this workspace";
    default:
      return "once";
  }
}

const askPicks: readonly AskPick[] = ["approve", "once", "session", "workspace", "deny"];

const onceGrant: AskChoice = { verdict: "granted" };
const sessionGrant: AskChoice = { verdict: "granted", scope: "session" };
const workspaceGrant: AskChoice = { verdict: "granted", scope: "workspace" };
const denial: AskChoice = { verdict: "denied" };

function askKeyPick(event: KeyboardEvent): AskPick | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  const key = event.key.toLowerCase();
  return askPicks.find((pick) => cardKeys[pick] === key);
}

function approvesForSession(run: ToolRun, quiet: boolean): boolean {
  return quiet && quietExemption(run) === undefined;
}

function offeredPicks(run: ToolRun, quiet: boolean): readonly AskPick[] {
  return approvesForSession(run, quiet)
    ? ["approve", "once", "workspace", "deny"]
    : ["approve", "session", "workspace", "deny"];
}

function remembersExactCommand(rule: PermissionRule): boolean {
  return rule.action === "bash" && !rule.resource.includes("*");
}

interface RememberingOffer {
  readonly pick: AskPick;
  readonly scope: RememberedScope;
}

interface CoverageLine {
  readonly chord: string;
  readonly text: string;
}

function rememberingOffers(offers: readonly AskOffer[]): RememberingOffer[] {
  return offers.flatMap(({ pick, choice }) =>
    choice.scope === "session" || choice.scope === "workspace"
      ? [{ pick, scope: choice.scope }]
      : [],
  );
}

function coverageOf(
  offers: readonly RememberingOffer[],
  rules: readonly PermissionRule[],
  chords: AskChords,
): CoverageLine[] {
  const lines = coverageLines(
    rules,
    offers.map((offer) => offer.scope),
  );
  return offers.map((offer, at) => ({ chord: chords[offer.pick], text: lines[at] ?? "" }));
}

const codeRunners: ReadonlySet<string> = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "pwsh",
  "powershell",
  "cmd",
  "python",
  "python3",
  "py",
  "node",
  "bun",
  "deno",
  "ruby",
  "perl",
  "php",
]);

interface AskButtonProps {
  choice: AskChoice;
  chord: string;
  onPress: () => void;
}

function AskButton(props: AskButtonProps) {
  return (
    <button
      type="button"
      class="kw-ask-answer"
      data-tone={props.choice.verdict === "denied" ? "deny" : "grant"}
      onClick={() => props.onPress()}
    >
      <span class="kw-ask-label">{answerLabel(props.choice)}</span> <kbd>{props.chord}</kbd>
    </button>
  );
}

function mayClaimFocus(card: HTMLElement): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  return (paneOf(card)?.contains(active) ?? false) && !holdsDraft(active);
}

function paneOf(card: HTMLElement): Element | null {
  return card.closest(".kw-frame") ?? card.closest(".kw-frame-body");
}

function holdsDraft(element: Element): boolean {
  const editable = element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
  return editable && element.value.trim() !== "";
}
