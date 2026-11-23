import { createSignal } from "solid-js";
import { isElement, nothing } from "../surfaces/runtime/realm.ts";
import {
  focusedWindow,
  listenInEveryDocument,
  listenInEveryWindow,
} from "../surfaces/runtime/windows.ts";

export type AnswerBy = "key" | "pointer" | "words" | "relayed";

export type After = (ms: number, run: () => void) => () => void;

export const answerWaitMs = 600;
export const typingWaitMs = 2000;
export const keysThatMeanTyping = 3;

export const askClock: { after: After } = { after: afterOnTheClock };

export function admitsAnswer(by: AnswerBy): boolean {
  if (by === "key") return keysReady();
  return by === "pointer" ? pressReady() : true;
}

export function questionAppeared(): void {
  watchTheKeeper();
  waitForQuietKeys();
  waitToBePressed();
}

export function answersTakeKeys(): boolean {
  return keysReady();
}

export function answersTakePresses(): boolean {
  return pressReady();
}

const [keysReady, setKeysReady] = createSignal(true);
const [pressReady, setPressReady] = createSignal(true);

let swallowed = 0;
let stopWaitingForKeys = nothing;
let stopWaitingToBePressed = nothing;
let lastPlace: Element | undefined;
let watching = false;

function watchTheKeeper(): void {
  if (watching) return;
  watching = true;
  lastPlace = placeHoldingFocus();
  listenInEveryWindow("keydown", keyPressed, true);
  listenInEveryWindow("focus", windowCameToTheFront, true);
  listenInEveryDocument("focusin", focusMoved, true);
}

function waitForQuietKeys(): void {
  swallowed = 0;
  holdKeysFor(answerWaitMs);
}

function holdKeysFor(ms: number): void {
  stopWaitingForKeys();
  setKeysReady(false);
  stopWaitingForKeys = askClock.after(ms, () => setKeysReady(true));
}

function waitToBePressed(): void {
  stopWaitingToBePressed();
  setPressReady(false);
  stopWaitingToBePressed = askClock.after(answerWaitMs, () => setPressReady(true));
}

function keyPressed(event: KeyboardEvent): void {
  if (keysReady() || modifierKeys.has(event.key)) return;
  swallowed += 1;
  holdKeysFor(swallowed >= keysThatMeanTyping ? typingWaitMs : answerWaitMs);
}

function windowCameToTheFront(event: FocusEvent): void {
  if (event.target !== event.currentTarget) return;
  waitForQuietKeys();
  waitToBePressed();
}

function focusMoved(event: FocusEvent): void {
  const place = isElement(event.target) ? placeOf(event.target) : null;
  if (place === null || place === lastPlace) return;
  lastPlace = place;
  waitForQuietKeys();
}

function placeHoldingFocus(): Element | undefined {
  const held = focusedWindow().document.activeElement;
  return (held === null ? null : placeOf(held)) ?? undefined;
}

function placeOf(element: Element): Element | null {
  return element.closest("[data-ask-surface], [data-pane-id]");
}

function afterOnTheClock(ms: number, run: () => void): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}

const modifierKeys: ReadonlySet<string> = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);
