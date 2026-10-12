import type { ToolRun } from "@keywork-app/client";
import {
  type AnswerOutcome,
  type AskScope,
  type AskVerdict,
  isAskRefusal,
  onceOnlyTools,
  type PermissionRule,
} from "@keywork-app/protocol";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { returnKeyboardHome } from "../panes/keyboard-home.ts";

export type AskAnswerer = (
  verdict: AskVerdict,
  scope?: AskScope,
) => Promise<AnswerOutcome> | undefined;

export interface AskChords {
  readonly once: string;
  readonly session: string;
  readonly workspace: string;
  readonly deny: string;
}

export const cardKeys: AskChords = { once: "y", session: "s", workspace: "w", deny: "n" };

export function askChordsOf(keys: { chord(action: string): string }): AskChords {
  return {
    once: keys.chord("ask.approve"),
    session: keys.chord("ask.session"),
    workspace: keys.chord("ask.workspace"),
    deny: keys.chord("ask.deny"),
  };
}

export interface AskCardProps {
  run: ToolRun;
  onAnswer: AskAnswerer;
  chords?: AskChords | undefined;
}

export function AskCard(props: AskCardProps) {
  let card: HTMLFieldSetElement | undefined;
  const [refusal, setRefusal] = createSignal<string>();
  const [answering, setAnswering] = createSignal(false);
  const rules = () => rememberableRules(props.run);
  const remembers = () => rules().length > 0;
  const chords = (): AskChords => props.chords ?? cardKeys;

  const answer = async (verdict: AskVerdict, scope?: AskScope): Promise<void> => {
    if (answering()) return;
    setAnswering(true);
    setRefusal(undefined);
    try {
      const outcome = await props.onAnswer(verdict, scope);
      if (isAskRefusal(outcome)) setRefusal(outcome.detail);
      else returnKeyboardHome();
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    } finally {
      setAnswering(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const choice = askKeyChoice(event, remembers());
    if (choice === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    void answer(choice.verdict, choice.scope);
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
      onKeyDown={onKeyDown}
      data-answering={answering() ? "" : undefined}
    >
      <span class="kw-ask-why">{askReason(props.run.ask?.rule)}</span>
      <span class="kw-ask-args">{props.run.args}</span>
      <Show when={remembers()}>
        <span class="kw-ask-rules">
          <span class="kw-ask-rules-label">
            {chords().session} or {chords().workspace} would allow
          </span>
          <For each={rules()}>{(rule) => <code class="kw-ask-rule">{ruleText(rule)}</code>}</For>
        </span>
        <For each={rules().flatMap(blanketWarning)}>
          {(warning) => <span class="kw-ask-blanket">{warning}</span>}
        </For>
      </Show>
      <span class="kw-ask-actions">
        <AskButton
          tone="grant"
          label="once"
          chord={chords().once}
          onPress={() => void answer("granted")}
        />
        <Show when={remembers()}>
          <AskButton
            tone="grant"
            label="this session"
            chord={chords().session}
            onPress={() => void answer("granted", "session")}
          />
          <AskButton
            tone="grant"
            label="this workspace"
            chord={chords().workspace}
            onPress={() => void answer("granted", "workspace")}
          />
        </Show>
        <AskButton
          tone="deny"
          label="deny"
          chord={chords().deny}
          onPress={() => void answer("denied")}
        />
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

export interface AskChoice {
  verdict: AskVerdict;
  scope?: AskScope;
}

export function askKeyChoice(event: KeyboardEvent, remembers: boolean): AskChoice | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined;
  switch (event.key.toLowerCase()) {
    case "y":
      return { verdict: "granted" };
    case "n":
      return { verdict: "denied" };
    case "s":
      return remembers ? { verdict: "granted", scope: "session" } : undefined;
    case "w":
      return remembers ? { verdict: "granted", scope: "workspace" } : undefined;
    default:
      return undefined;
  }
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
  tone: "grant" | "deny";
  label: string;
  chord: string;
  onPress: () => void;
}

function AskButton(props: AskButtonProps) {
  return (
    <button
      type="button"
      class="kw-ask-answer"
      data-tone={props.tone}
      onClick={() => props.onPress()}
    >
      <span class="kw-ask-label">{props.label}</span> <kbd>{props.chord}</kbd>
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
