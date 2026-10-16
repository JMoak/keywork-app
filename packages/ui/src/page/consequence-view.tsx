import type { ToolRun } from "@keywork-app/client";
import type { ToolPreview } from "@keywork-app/protocol";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { type MergeSides, mountMergeView } from "../panes/diff/merge-view.ts";
import {
  type ArgumentRow,
  type CommandPart,
  type Consequence,
  consequenceOf,
  fileHead,
  unpreviewedLine,
} from "./consequence.ts";
import "./consequence.css";

export function AskConsequence(props: { run: ToolRun }) {
  const consequence = createMemo(() => consequenceOf(props.run.ask));
  return (
    <Switch fallback={<RawArguments text={props.run.args} />}>
      <Match when={ofKind(consequence(), "file")}>
        {(file) => <FileConsequence tool={file().tool} preview={file().preview} />}
      </Match>
      <Match when={ofKind(consequence(), "unpreviewed")}>
        <RawArguments text={props.run.args} />
        <span class="kw-ask-unpreviewed">{unpreviewedLine}</span>
      </Match>
      <Match when={ofKind(consequence(), "command")}>
        {(command) => <CommandConsequence parts={command().parts} />}
      </Match>
      <Match when={ofKind(consequence(), "call")}>
        {(call) => <CallConsequence server={call().server} tool={call().tool} rows={call().rows} />}
      </Match>
    </Switch>
  );
}

function RawArguments(props: { text: string }) {
  return <span class="kw-ask-args">{props.text}</span>;
}

function FileConsequence(props: { tool: string; preview: ToolPreview }) {
  const [ready, setReady] = createSignal(false);
  let host: HTMLDivElement | undefined;
  onMount(() => {
    if (host === undefined) return;
    const mounted = mountMergeView(host, sidesOf(props.preview), "unified");
    void mounted.languageLoaded().then(() => setReady(true));
    onCleanup(() => mounted.destroy());
  });
  return (
    <figure class="kw-ask-consequence" data-kind="file" data-ready={ready() ? "" : undefined}>
      <figcaption class="kw-ask-consequence-head">{fileHead(props.tool, props.preview)}</figcaption>
      <div class="kw-ask-diff" ref={host} />
    </figure>
  );
}

function CommandConsequence(props: { parts: readonly CommandPart[] }) {
  return (
    <figure class="kw-ask-consequence" data-kind="command">
      <code class="kw-ask-command">
        <For each={props.parts}>{(part) => <span data-role={part.role}>{part.text}</span>}</For>
      </code>
    </figure>
  );
}

function CallConsequence(props: { server: string; tool: string; rows: readonly ArgumentRow[] }) {
  return (
    <figure class="kw-ask-consequence" data-kind="call">
      <figcaption class="kw-ask-consequence-head">
        {props.server} · {props.tool}
      </figcaption>
      <Show when={props.rows.length > 0} fallback={<p class="kw-ask-call-empty">no arguments</p>}>
        <dl class="kw-ask-call-args">
          <For each={props.rows}>
            {(row) => (
              <>
                <dt>{row.name}</dt>
                <dd>
                  {row.value}
                  <Show when={row.fold}>
                    {(fold) => <span class="kw-ask-fold"> {fold()}</span>}
                  </Show>
                </dd>
              </>
            )}
          </For>
        </dl>
      </Show>
    </figure>
  );
}

function sidesOf(preview: ToolPreview): MergeSides {
  return { before: preview.before ?? "", after: preview.after, path: preview.path };
}

function ofKind<K extends Consequence["kind"]>(
  consequence: Consequence,
  kind: K,
): Extract<Consequence, { kind: K }> | undefined {
  return consequence.kind === kind ? (consequence as Extract<Consequence, { kind: K }>) : undefined;
}
