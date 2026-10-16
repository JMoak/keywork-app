import { createSignal, Show } from "solid-js";
import { glossOf, type NeedsYouItem, needsYouGlyph, needYouCount } from "../shell/needs-you.ts";
import "./needs-you-strip.css";

export interface StripLine {
  readonly count: string;
  readonly next?: StripNext | undefined;
}

export interface StripNext {
  readonly gloss: string;
  readonly where: string;
  readonly hint: string;
}

export interface StripInputs {
  readonly shown: boolean;
  readonly count: number;
  readonly head: NeedsYouItem | undefined;
  readonly paneOpen: boolean;
  readonly hint: string;
  where(item: NeedsYouItem): string;
}

export function stripLine(inputs: StripInputs): StripLine | undefined {
  if (!inputs.shown || inputs.count === 0) return undefined;
  const count = needYouCount(inputs.count);
  if (inputs.paneOpen || inputs.head === undefined) return { count };
  return {
    count,
    next: { gloss: glossOf(inputs.head), where: inputs.where(inputs.head), hint: inputs.hint },
  };
}

export interface NeedsYouStripProps {
  line: StripLine | undefined;
}

export function NeedsYouStrip(props: NeedsYouStripProps) {
  return (
    <Show when={props.line}>
      {(line) => (
        <aside
          class="kw-needs-you"
          role="status"
          aria-label="needs you"
          data-detail={line().next === undefined ? "count" : "next"}
        >
          <span class="kw-needs-you-stamp" aria-hidden="true">
            {needsYouGlyph}
          </span>
          <span class="kw-needs-you-count">{line().count}</span>
          <Show when={line().next}>
            {(next) => (
              <>
                <span class="kw-needs-you-gloss">{next().gloss}</span>
                <span class="kw-needs-you-where">({next().where})</span>
                <kbd class="kw-needs-you-hint">{next().hint}</kbd>
              </>
            )}
          </Show>
        </aside>
      )}
    </Show>
  );
}

export const stripStorageKey = "keywork.needs-you-strip";

export interface StripPreference {
  shown(): boolean;
  toggle(): boolean;
}

export function createStripPreference(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): StripPreference {
  const [shown, setShown] = createSignal(readShown(storage));
  return {
    shown,
    toggle: () => {
      const next = !shown();
      setShown(next);
      writeShown(storage, next);
      return next;
    },
  };
}

function readShown(storage: Pick<Storage, "getItem"> | undefined): boolean {
  return storage?.getItem(stripStorageKey) !== "hidden";
}

function writeShown(storage: Pick<Storage, "setItem"> | undefined, shown: boolean): void {
  storage?.setItem(stripStorageKey, shown ? "shown" : "hidden");
}
