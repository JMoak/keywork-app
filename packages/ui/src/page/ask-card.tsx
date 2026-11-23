import type { ToolRun } from "@keywork-app/client";
import {
  type AnswerOutcome,
  type AskScope,
  type AskVerdict,
  type DenyReason,
  isAskRefusal,
  onceOnlyTools,
  type PermissionAsk,
  type PermissionRule,
  type RememberedScope,
} from "@keywork-app/protocol";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { useKeyboardScope } from "../shell/keyboard-claim.ts";
import { focusedIn, restsOnPage } from "../surfaces/runtime/realm.ts";
import { type AnswerOffer, AskAnswers } from "./ask-card-answers.tsx";
import { type AnswerBy, admitsAnswer } from "./ask-card-guard.ts";
import { askingWhy, askWhy, readWhyKeys, stopAskingWhy } from "./ask-card-why.ts";
import { coverageLines } from "./consequence.ts";
import { AskConsequence } from "./consequence-view.tsx";
import { NoteLine } from "./note-line.tsx";
import "./ask-card.css";

export type AskAnswerer = (
  verdict: AskVerdict,
  scope?: AskScope,
  reason?: DenyReason,
  note?: string,
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
  reason?: DenyReason;
  note?: string;
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
  untrusted?: boolean | undefined;
}

export function acceptedLine(scope: RememberedScope, chords: AskChords): string {
  return scope === "workspace"
    ? `accepted in trust setup · ${chords.workspace} records it for the workspace`
    : `accepted in trust setup · ${chords.session} records it for this session`;
}

export function AskCard(props: AskCardProps) {
  const keyboard = useKeyboardScope();
  let card: HTMLFieldSetElement | undefined;
  const [refusal, setRefusal] = createSignal<string>();
  const [answering, setAnswering] = createSignal(false);
  const quiet = () => props.quiet === true;
  const rules = () => rememberableRules(props.run);
  const chords = (): AskChords => props.chords ?? cardKeys;
  const remembering = () => rememberingOffers(askOffers(props.run));
  const rememberingChords = () => remembering().map((offer) => chords()[offer.pick]);
  const coverage = () =>
    props.run.ask?.tool === "bash" ? coverageOf(remembering(), rules(), chords()) : [];
  const stillAsks = () => (quiet() ? quietStillAsks(props.run) : undefined);
  const sayingWhy = () => askingWhy(props.run.callId);
  const [noting, setNoting] = createSignal(false);

  const answer = async (choice: AskChoice): Promise<void> => {
    if (answering()) return;
    setAnswering(true);
    setRefusal(undefined);
    try {
      const outcome = await props.onAnswer(
        choice.verdict,
        choice.scope,
        choice.reason,
        choice.note,
      );
      if (isAskRefusal(outcome)) setRefusal(outcome.detail);
      else settle();
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    } finally {
      setAnswering(false);
    }
  };
  const settle = (): void => {
    setNoting(false);
    stopAskingWhy(props.run.callId);
    keyboard?.returnHome();
  };
  const giveReason = (reason: DenyReason, by: AnswerBy): void => {
    if (!admitsAnswer(by)) return;
    if (reason === "other") setNoting(true);
    else void answer(denialFor(reason));
  };
  const choose = (pick: AskPick, by: AnswerBy): void => {
    const choice = askChoiceFor(pick, props.run);
    if (choice === undefined || !admitsAnswer(by)) return;
    if (isBareDenial(choice)) askWhy(props.run.callId);
    else void answer(choice);
  };
  const takeBack = (): void => {
    stopAskingWhy(props.run.callId);
    card?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (sayingWhy()) return;
    const pick = askKeyPick(event);
    if (pick === undefined || askChoiceFor(pick, props.run) === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    choose(pick, "key");
  };

  readWhyKeys(
    () => card,
    () => (noting() ? undefined : props.run.callId),
    (reason) => giveReason(reason, "key"),
  );
  createEffect(() => {
    if (sayingWhy() && card !== undefined && focusRestsNear(card)) card.focus();
  });
  onCleanup(() => {
    if (card?.contains(focusedIn(card))) keyboard?.returnHome();
  });

  return (
    <fieldset
      class="kw-ask"
      aria-label="permission ask"
      tabIndex={-1}
      ref={card}
      data-walk=""
      data-ask-surface=""
      data-call-id={props.run.callId}
      onKeyDown={onKeyDown}
      data-answering={answering() ? "" : undefined}
      data-quiet={quiet() ? "" : undefined}
      data-saying-why={sayingWhy() ? "" : undefined}
    >
      <span class="kw-ask-why">{askReason(props.run.ask, props.untrusted === true)}</span>
      <AskConsequence run={props.run} />
      <Show when={rules().length > 0 && !sayingWhy()}>
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
      <Show when={!sayingWhy() && stillAsks()}>
        {(reason) => <span class="kw-ask-quiet">{reason()}</span>}
      </Show>
      <span class="kw-ask-actions">
        <Show
          when={sayingWhy() && noting()}
          fallback={
            <AskAnswers
              callId={props.run.callId}
              offers={offeredAnswers(props.run)}
              keys={chords()}
              why={sayingWhy()}
              part="kw-ask"
              onAnswer={choose}
              onReason={giveReason}
              onBack={takeBack}
            />
          }
        >
          <NoteLine
            onSend={(note) => void answer(denialFor("other", note))}
            onBack={() => {
              setNoting(false);
              card?.focus();
            }}
          />
        </Show>
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

export function askChoiceFor(pick: AskPick, run: ToolRun): AskChoice | undefined {
  const rememberable = rememberableRules(run).length > 0;
  switch (pick) {
    case "approve":
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

export function quietStillAsks(run: ToolRun): string {
  const tool = run.ask?.tool;
  if (tool !== undefined && onceOnlyTools.has(tool)) return "quiet · write and edit still ask";
  if (run.ask?.rule === "trusted") return "quiet · trusted reads ask before this form on purpose";
  const rules = rememberableRules(run);
  if (rules.length === 0) return "quiet · this call has nothing a grant could remember";
  if (rules.some(remembersExactCommand)) return "quiet · a destructive command still asks";
  if (rules.some(isBareProgram)) return "quiet · a blanket grant still asks";
  return "quiet · this one still needs you";
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

export function askReason(
  ask: Pick<PermissionAsk, "tool" | "rule"> | undefined,
  untrusted = false,
): string {
  switch (ask?.rule) {
    case "policy":
      return "a rule asks before this tool runs";
    case "trusted":
      return "trusted reads ask before this form runs";
    default:
      return untrusted ? untrustedAskReason : defaultAskReason(ask?.tool);
  }
}

export const untrustedAskReason =
  "this folder isn't trusted yet, so every command and edit asks first · trusting it lets plain reads run";

export interface AskOffer {
  readonly pick: AskPick;
  readonly choice: AskChoice;
}

export function askOffers(run: ToolRun): AskOffer[] {
  return offeredPicks.flatMap((pick) => {
    const choice = askChoiceFor(pick, run);
    return choice === undefined ? [] : [{ pick, choice }];
  });
}

export function offeredAnswers(run: ToolRun): AnswerOffer[] {
  return askOffers(run).map(({ pick, choice }) => ({
    pick,
    label: answerLabel(choice),
    tone: choice.verdict === "denied" ? "deny" : "grant",
  }));
}

export function denialFor(reason: DenyReason, note?: string): AskChoice {
  const said = note?.trim() ?? "";
  return said === "" ? { verdict: "denied", reason } : { verdict: "denied", reason, note: said };
}

export function isBareDenial(choice: AskChoice): boolean {
  return choice.verdict === "denied" && choice.reason === undefined;
}

export const pickLabels: Readonly<Record<AskPick, string>> = {
  approve: "once",
  once: "once",
  session: "this session",
  workspace: "this workspace",
  deny: "deny",
};

export function answerLabel(choice: AskChoice): string {
  if (choice.verdict === "denied") return pickLabels.deny;
  switch (choice.scope) {
    case "session":
      return pickLabels.session;
    case "workspace":
      return pickLabels.workspace;
    default:
      return pickLabels.once;
  }
}

const askPicks: readonly AskPick[] = ["approve", "once", "session", "workspace", "deny"];

const onceGrant: AskChoice = { verdict: "granted" };
const sessionGrant: AskChoice = { verdict: "granted", scope: "session" };
const workspaceGrant: AskChoice = { verdict: "granted", scope: "workspace" };
const denial: AskChoice = { verdict: "denied" };

function defaultAskReason(tool: string | undefined): string {
  if (tool === "bash")
    return "shell commands ask before they run · in a trusted folder plain reads don't";
  if (tool !== undefined && onceOnlyTools.has(tool)) return "this changes a file";
  return "this tool asks before it runs";
}

export function askKeyPick(event: KeyboardEvent): AskPick | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  const key = event.key.toLowerCase();
  return askPicks.find((pick) => cardKeys[pick] === key);
}

const offeredPicks: readonly AskPick[] = ["approve", "session", "workspace", "deny"];

function remembersExactCommand(rule: PermissionRule): boolean {
  return rule.action === "bash" && !rule.resource.includes("*");
}

function isBareProgram(rule: PermissionRule): boolean {
  return rule.action === "bash" && /^\S+ \*$/.test(rule.resource);
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

function focusRestsNear(card: HTMLElement): boolean {
  return restsOnPage(card) || (paneOf(card)?.contains(focusedIn(card)) ?? false);
}

function paneOf(card: HTMLElement): Element | null {
  return card.closest(".kw-frame") ?? card.closest(".kw-frame-body");
}
