import type { Tokens } from "marked";
import { type Accessor, createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { fenceIsPaintable, fenceLanguageName, paintedNodes, paintFence } from "./fence-paint.ts";
import { useMarkdownHost } from "./markdown-host.ts";
import { fenceIsClosed } from "./markdown-tokens.ts";

export interface FenceProps {
  code: Tokens.Code;
}

export type CopyState = "idle" | "copied" | "failed";

export const copyWords: Readonly<Record<CopyState, string>> = {
  idle: "copy",
  copied: "copied",
  failed: "could not copy",
};

export const copyFeedbackMs = 1500;

export function Fence(props: FenceProps) {
  const language = () => fenceLanguageName(props.code.lang);
  const painted = usePainting(() => props.code);
  return (
    <div class="kw-fence" data-lang={language() || undefined}>
      <CopyCode text={props.code.text} language={language()} />
      <pre class="kw-fence-code">
        <code>{painted() ?? props.code.text}</code>
      </pre>
    </div>
  );
}

function CopyCode(props: { text: string; language: string }) {
  const host = useMarkdownHost();
  const [state, setState] = createSignal<CopyState>("idle");
  let settling: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(settling));
  const show = (next: CopyState): void => {
    setState(next);
    clearTimeout(settling);
    settling = setTimeout(() => setState("idle"), copyFeedbackMs);
  };
  const copy = (): void => {
    host?.writeClipboard(props.text).then(
      () => show("copied"),
      () => show("failed"),
    );
  };
  return (
    <Show when={host}>
      <button
        type="button"
        class="kw-fence-copy"
        data-walk=""
        data-state={state()}
        aria-label={state() === "idle" ? copyLabel(props.language) : copyWords[state()]}
        onMouseDown={(event) => event.preventDefault()}
        onClick={copy}
      >
        {copyWords[state()]}
      </button>
    </Show>
  );
}

function copyLabel(language: string): string {
  return language === "" ? "copy code" : `copy ${language} code`;
}

interface PaintRequest {
  readonly language: string;
  readonly text: string;
}

function usePainting(code: Accessor<Tokens.Code>): Accessor<Node[] | undefined> {
  const request = createMemo(() => paintRequestOf(code()), undefined, { equals: samePaint });
  const [painted, setPainted] = createSignal<Node[]>();
  createEffect(() => {
    const wanted = request();
    setPainted(undefined);
    if (wanted === undefined) return;
    let current = true;
    onCleanup(() => {
      current = false;
    });
    void paintFence(wanted.language, wanted.text).then((runs) => {
      if (current && runs !== undefined) setPainted(paintedNodes(runs));
    });
  });
  return painted;
}

function paintRequestOf(code: Tokens.Code): PaintRequest | undefined {
  const language = fenceLanguageName(code.lang);
  const paintable = fenceIsClosed(code) && fenceIsPaintable(language, code.text);
  return paintable ? { language, text: code.text } : undefined;
}

function samePaint(a: PaintRequest | undefined, b: PaintRequest | undefined): boolean {
  return a === b || (a?.language === b?.language && a?.text === b?.text);
}
