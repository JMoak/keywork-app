import type { SessionProjection } from "@keywork-app/client";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { For, Show } from "solid-js";
import { useProductProfile } from "./product.ts";
import { acceptLabel, type UpdateOffer, updateLine } from "./update-offer.ts";
import "./status-line.css";

export interface StatusLineProps {
  serverLabel: string;
  serverLost?: boolean | undefined;
  folder?: string | undefined;
  model?: string | undefined;
  projection: SessionProjection;
  usage: string;
  preset: string | undefined;
  trust: string | undefined;
  leader: string | undefined;
  notice: string | undefined;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
  update?: UpdateOffer | undefined;
}

export type StatusTone = "mark" | "where" | "warn" | "word" | "quiet";

export interface StatusItem {
  readonly tone: StatusTone;
  readonly text: string;
  readonly detail?: string | undefined;
}

export function statusItems(
  props: StatusLineProps,
  profile: ProductProfile = keyworkProfile,
): StatusItem[] {
  const candidates: StatusCandidate[] = [
    { tone: "mark", text: profile.name },
    whereItem(props),
    { tone: "warn", text: props.trust },
    { tone: "word", text: props.model },
    { tone: "word", text: props.preset },
    { tone: "word", text: props.projection.mode },
    { tone: "quiet", text: props.usage },
  ];
  return candidates.filter(
    (item): item is StatusItem => item.text !== undefined && item.text !== "",
  );
}

export function StatusLine(props: StatusLineProps) {
  const profile = useProductProfile();
  return (
    <footer class="kw-status" data-lost={props.lost !== undefined ? "" : undefined}>
      <span class="kw-status-items">
        <For each={statusItems(props, profile)}>
          {(item) => (
            <span class="kw-status-item" data-tone={item.tone} title={item.detail}>
              {item.text}
            </span>
          )}
        </For>
      </span>
      <span class="kw-status-moment" role="status">
        <Show when={props.leader}>
          {(leader) => <kbd class="kw-status-leader">{leader()} …</kbd>}
        </Show>
        <Show when={props.notice}>
          {(text) => (
            <span class="kw-status-notice" title={text()}>
              {text()}
            </span>
          )}
        </Show>
        <Show when={props.lost}>{(reason) => <span class="kw-status-lost">{reason()}</span>}</Show>
        <Show when={props.gap}>
          {(gap) => (
            <span class="kw-status-gap">
              events {gap().from} to {gap().to} were missed while disconnected
            </span>
          )}
        </Show>
        <Show when={props.update}>{(offer) => <UpdateNotice offer={offer()} />}</Show>
      </span>
    </footer>
  );
}

interface StatusCandidate extends Omit<StatusItem, "text"> {
  readonly text: string | undefined;
}

function whereItem(props: StatusLineProps): StatusItem {
  if (props.serverLost) return { tone: "warn", text: props.serverLabel, detail: props.folder };
  if (props.folder === undefined) return { tone: "where", text: props.serverLabel };
  return {
    tone: "where",
    text: folderName(props.folder),
    detail: `${props.folder} · served at ${props.serverLabel}`,
  };
}

function folderName(path: string): string {
  return path.split(pathSeparator).findLast((segment) => segment !== "") ?? path;
}

function UpdateNotice(props: { offer: UpdateOffer }) {
  return (
    <Show when={props.offer.waiting()}>
      {(update) => (
        <span class="kw-status-update">
          {updateLine(update(), props.offer.accepted())}
          <Show when={update().reviewRequired !== true && !props.offer.accepted()}>
            <button
              type="button"
              class="kw-status-update-accept"
              onClick={() => props.offer.accept()}
            >
              {acceptLabel}
            </button>
          </Show>
        </span>
      )}
    </Show>
  );
}

const pathSeparator = /[\\/]/;
