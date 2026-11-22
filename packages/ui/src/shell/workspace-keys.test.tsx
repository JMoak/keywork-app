import type { ConsoleClient } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "./client-testing.ts";
import { isKeyboardHome } from "./keyboard-claim.ts";
import { refusalNotices } from "./tiler.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
  served.prompts.length = 0;
  served.aborted.length = 0;
});

describe("where the keyboard rests", () => {
  it("lands in the focused pane's home after every layout verb, even when focus had fallen away", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    await settled();

    for (const verb of layoutVerbs) {
      dropFocus();
      verb.press();
      await settled();
      expect(focusRestsHome(), verb.name).toBe(true);
    }
  });

  it("keeps the slots in place in the page when panes swap, so the moved pane never loses the keys", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    const order = slotOrder();
    const composer = focusedComposer();
    composer.focus();
    press("k", { ctrlKey: true });
    press("H", { shiftKey: true });
    await settled();
    expect(slotOrder()).toEqual(order);
    expect(document.activeElement).toBe(composer);
  });

  it("takes typing aimed at a pane's text home to its composer, and escape stops the turn from there", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    const page = focusedSlot()?.querySelector(".kw-page") as HTMLElement;
    fireEvent.pointerDown(page, { button: 0 });
    fireEvent.pointerUp(page, { button: 0 });
    const holder = page.closest<HTMLElement>("[tabindex]") as HTMLElement;
    holder.focus();
    expect(focusedSlot()?.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(holder, { key: "s" });
    expect(document.activeElement).toBe(focusedComposer());

    holder.focus();
    fireEvent.keyDown(holder, { key: "Escape" });
    await waitFor(() => expect(served.aborted).toEqual(["s1"]));
    expect(document.activeElement).toBe(focusedComposer());
  });

  it("leaves keys with modifiers, spaces and a pane's own controls where they are", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    const newSession = screen.getByText("+ new session");
    newSession.focus();
    fireEvent.keyDown(newSession, { key: " " });
    fireEvent.keyDown(newSession, { key: "c", ctrlKey: true });
    expect(document.activeElement).toBe(newSession);
  });
});

describe("tab through the panes", () => {
  it("walks the focused pane's controls and moves on to the next pane's home instead of trapping", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    const composer = focusedComposer();
    composer.focus();
    tab(composer);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("sessions");
    expect(focusedName()).toBe("sessions");
    tab(document.activeElement as HTMLElement, { shiftKey: true });
    expect(document.activeElement).toBe(composer);
  });
});

describe("verbs that cannot act", () => {
  it("say why in one line instead of doing nothing", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    const said = (keys: () => void): string | undefined => {
      keys();
      return notice();
    };
    expect(said(() => leaderThen("r"))).toBe(refusalNotices.nothingToRotate);
    expect(said(() => leaderThen("l"))).toBe(refusalNotices.nothingToward("right"));
    expect(said(() => leaderThen(".", { shiftKey: false }))).toBe(
      refusalNotices.notDocked("ctrl+k shift+."),
    );
    expect(said(() => leaderThen(">", { shiftKey: true }))).toBe(refusalNotices.fillsTheMain);
    expect(said(() => press("9", { altKey: true }))).toBe(refusalNotices.noPaneNumbered(9));
    expect(said(() => leaderThen("`"))).toBe(
      "ctrl+k ` does nothing here · ctrl+k / lists every key",
    );
  });

  it("refuses to reshape the tiles the yard is hiding, and paints no empty tile over the yard", async () => {
    await openWorkspace();
    const before = localStorage.getItem("keywork.layout:C:/work");
    leaderThen("Y", { shiftKey: true });
    leaderThen("L", { shiftKey: true });
    expect(notice()).toBe(refusalNotices.yardArranges("ctrl+k shift+y"));
    leaderThen("c");
    expect(localStorage.getItem("keywork.layout:C:/work")).toBe(before);
    expect(document.querySelector(".kw-empty-main")).toBeNull();
  });

  it("leaves ctrl+y to the text field's own redo while nothing asks", async () => {
    await openWorkspace();
    const composer = focusedComposer();
    composer.focus();
    const redo = new KeyboardEvent("keydown", {
      key: "y",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(redo);
    expect(redo.defaultPrevented).toBe(false);
    expect(notice()).toBeUndefined();
  });
});

const served = { prompts: [] as string[], aborted: [] as string[] };

function servingClient(): ConsoleClient {
  const summaries: SessionSummary[] = [];
  return fakeClient({
    sessions: async () => summaries,
    createSession: async () => {
      const made: SessionSummary = {
        id: `s${summaries.length + 1}`,
        title: `session ${summaries.length + 1}`,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
      };
      summaries.unshift(made);
      return made;
    },
    prompt: async (_id, text) => {
      served.prompts.push(text);
      return "started";
    },
    abort: async (id) => {
      served.aborted.push(id);
      return "idle";
    },
  });
}

async function openWorkspace(): Promise<void> {
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={servingClient}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
}

async function startASession(text: string): Promise<void> {
  const input = focusedComposer();
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(served.prompts).toContain(text));
  await waitFor(() => expect(focusedName()).not.toBe("new session"));
}

const layoutVerbs: readonly { name: string; press: () => void }[] = [
  { name: "alt+1", press: () => press("1", { altKey: true }) },
  { name: "alt+3", press: () => press("3", { altKey: true }) },
  { name: "alt+3 again", press: () => press("3", { altKey: true }) },
  ...leader("h", "l", "j", "k", "H", "L", "z", "z", "r", "c", "c", "c", "d", "D", ".", ",", ">"),
  { name: "zoom", press: () => press("z", { altKey: true }) },
  { name: "unzoom", press: () => press("z", { altKey: true }) },
  { name: "help and back", press: () => [press("F1"), press("Escape")] },
  { name: "close", press: () => [press("k", { ctrlKey: true }), press("x")] },
];

function leader(...keys: string[]): { name: string; press: () => void }[] {
  return keys.map((key) => ({
    name: `ctrl+k ${key}`,
    press: () => {
      press("k", { ctrlKey: true });
      press(key, { shiftKey: key !== key.toLowerCase() || "<>".includes(key) });
    },
  }));
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, bubbles: true, ...modifiers });
}

function leaderThen(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  press("k", { ctrlKey: true });
  press(key, modifiers);
}

function tab(from: HTMLElement, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(from, { key: "Tab", bubbles: true, ...modifiers });
}

function dropFocus(): void {
  (document.activeElement as HTMLElement | null)?.blur();
}

const notice = (): string | undefined =>
  document.querySelector(".kw-status-notice")?.textContent ?? undefined;

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const frames = () => [...document.querySelectorAll(".kw-frame")] as HTMLElement[];
const focusedSlot = () => document.querySelector(".kw-frame[data-focused]")?.closest(".kw-slot");
const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;
const focusedComposer = () =>
  document.querySelector(".kw-frame[data-focused] .kw-composer-input") as HTMLTextAreaElement;
const slotOrder = () =>
  [...document.querySelectorAll(".kw-stage > .kw-slot")].map((slot) =>
    slot.getAttribute("data-pane-id"),
  );

function focusRestsHome(): boolean {
  const active = document.activeElement;
  return active !== null && isKeyboardHome(active) && focusedSlot()?.contains(active) === true;
}
