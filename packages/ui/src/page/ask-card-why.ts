import type { DenyReason } from "@keywork-app/protocol";
import { createEffect, createSignal, onCleanup } from "solid-js";

export interface ReasonOffer {
  readonly reason: DenyReason;
  readonly key: string;
  readonly label: string;
}

export const whyPrompt = "why?";

export const reasonOffers: readonly ReasonOffer[] = [
  { reason: "unsafe", key: "u", label: "unsafe" },
  { reason: "not-now", key: "n", label: "not now" },
  { reason: "other", key: "o", label: "other" },
];

export const takeBackOffer = { key: "esc", label: "back" } as const;

export const whyLine = [
  whyPrompt,
  ...reasonOffers.map((offer) => `${offer.key} ${offer.label}`),
  `${takeBackOffer.key} ${takeBackOffer.label}`,
].join(" · ");

export function askWhy(callId: string): void {
  setAskedWhy(callId);
}

export function askingWhy(callId: string): boolean {
  return askedWhy() === callId;
}

export function stopAskingWhy(callId: string): void {
  setAskedWhy((current) => (current === callId ? undefined : current));
}

export function denyReasonOf(event: KeyboardEvent): DenyReason | undefined {
  if (isModified(event)) return undefined;
  if (event.key === "Enter") return pressesAButton(event) ? undefined : "other";
  return reasonOffers.find((offer) => offer.key === event.key.toLowerCase())?.reason;
}

export function asksForWords(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === wordsKey;
}

export function readWhyKeys(
  scope: () => HTMLElement | undefined,
  callId: () => string | undefined,
  answer: (reason: DenyReason, words: boolean) => void,
): void {
  createEffect(() => {
    const id = callId();
    if (id === undefined || !askingWhy(id)) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!within(scope(), event.target)) return;
      const reason = denyReasonOf(event);
      if (reason !== undefined) claim(event, () => answer(reason, asksForWords(event)));
      else if (takesItBack(event)) claim(event, () => stopAskingWhy(id));
    };
    onCleanup(listenAheadOfTheKeymap(onKey));
  });
}

const [askedWhy, setAskedWhy] = createSignal<string>();

const wordsKey = reasonOffers.find((offer) => offer.reason === "other")?.key;

function listenAheadOfTheKeymap(onKey: (event: KeyboardEvent) => void): () => void {
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

function claim(event: KeyboardEvent, act: () => void): void {
  event.preventDefault();
  event.stopPropagation();
  act();
}

function takesItBack(event: KeyboardEvent): boolean {
  return event.key === "Escape" && !isModified(event);
}

function isModified(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}

function pressesAButton(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLButtonElement;
}

function within(root: HTMLElement | undefined, target: EventTarget | null): boolean {
  return root !== undefined && target instanceof Node && root.contains(target);
}
