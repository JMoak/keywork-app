import type { ConsoleClient } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "./client-testing.ts";
import { createTiler, refusalNotices, shelfNotices } from "./tiler.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
  prompts.length = 0;
  created = 0;
});

function type(text: string): void {
  const input = document.querySelector(
    ".kw-frame[data-focused] .kw-composer-input",
  ) as HTMLTextAreaElement;
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: "Enter" });
}

const prompts: Array<[string, string]> = [];
let created = 0;

function quietClient(): ConsoleClient {
  const summaries: SessionSummary[] = [];
  return fakeClient({
    sessions: async () => summaries,
    createSession: async () => {
      created += 1;
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
    prompt: async (id, text) => {
      prompts.push([id, text]);
      return "started";
    },
  });
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

async function openWorkspace(): Promise<void> {
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={quietClient}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
}

const frames = () => [...document.querySelectorAll(".kw-frame")] as HTMLElement[];
const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;
const frameNames = () =>
  [...document.querySelectorAll(".kw-frame-name")].map((name) => name.textContent);

describe("keyboard workflows", () => {
  it("splits a new session pane with the leader, jumps by ordinal, zooms, and closes with focus handoff", async () => {
    await openWorkspace();
    expect(frames()).toHaveLength(2);
    expect(focusedName()).toBe("new session");
    await startASession("the first prompt");

    press("k", { ctrlKey: true });
    expect(screen.getByText("ctrl+k …")).toBeTruthy();
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    expect(focusedName()).toBe("new session");

    press("1", { altKey: true });
    expect(focusedName()).toBe("sessions");
    press("3", { altKey: true });
    expect(focusedName()).toBe("new session");

    press("z", { altKey: true });
    expect(frames()).toHaveLength(1);
    press("z", { altKey: true });
    expect(frames()).toHaveLength(3);

    press("k", { ctrlKey: true });
    press("x");
    await waitFor(() => expect(frames()).toHaveLength(2));
    expect(focusedName()).toBe("session 1");
  });

  it("splits beside without making a server session, and focuses the fresh pane already waiting", async () => {
    await openWorkspace();
    press("k", { ctrlKey: true });
    press("s");
    await settle();
    expect(frames()).toHaveLength(2);
    expect(focusedName()).toBe("new session");
    expect(created).toBe(0);
    await startASession("the first prompt");
    expect(created).toBe(1);
  });

  it("summons the changes pane for the session whose composer holds the keyboard", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    const composer = document.querySelector(
      ".kw-frame[data-focused] .kw-composer-input",
    ) as HTMLTextAreaElement;
    press("1", { altKey: true });
    expect(focusedName()).toBe("sessions");

    composer.focus();
    expect(focusedName()).toBe("session 1");

    press("k", { ctrlKey: true });
    press("g");
    await waitFor(() => expect(focusedName()).toBe("changes"));
    const saved = JSON.parse(localStorage.getItem("keywork.layout:C:/work") ?? "{}");
    expect(saved.specs["diff-1"]).toEqual({ kind: "diff", sessionId: "s1" });
  });

  it("lets a text burst on an armed leader fall through without firing verbs", async () => {
    await openWorkspace();
    press("k", { ctrlKey: true });
    for (const character of "quick brown") press(character);
    expect(frames()).toHaveLength(2);
    expect(screen.queryByText("ctrl+k …")).toBeNull();
  });

  it("opens the palette with ctrl+p and the keys overlay with f1, and both close on escape", async () => {
    await openWorkspace();
    press("p", { ctrlKey: true });
    const palette = await screen.findByLabelText("palette");
    expect(screen.getByRole("dialog", { name: "go to" })).toBeTruthy();
    fireEvent.keyDown(palette, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("palette")).toBeNull());

    press("F1");
    const help = await screen.findByRole("dialog", { name: "keys" });
    expect(screen.getByText("ctrl+k s", { selector: ".kw-help-keys" })).toBeTruthy();
    fireEvent.keyDown(help, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "keys" })).toBeNull());
  });

  it("starts a session from a prompt in an unbound pane, and routes the next prompt to the split pane only", async () => {
    await openWorkspace();
    type("please run echo served for me");
    await waitFor(() => expect(prompts).toEqual([["s1", "please run echo served for me"]]));
    expect(focusedName()).toBe("session 1");
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    type("give me the long answer");
    await waitFor(() => expect(prompts).toHaveLength(2));
    expect(prompts[1]).toEqual(["s2", "give me the long answer"]);
  });

  it("runs a palette command by name", async () => {
    await openWorkspace();
    await startASession("the first prompt");
    press("p", { ctrlKey: true, shiftKey: true });
    const palette = (await screen.findByLabelText("palette")) as HTMLInputElement;
    expect(palette.value).toBe("/");
    palette.value = "/split";
    fireEvent.input(palette);
    fireEvent.keyDown(palette, { key: "Enter" });
    await waitFor(() => expect(frames()).toHaveLength(3));
  });

  it("hands the keys back to the focused pane's composer when the palette closes", async () => {
    await openWorkspace();
    const composer = () =>
      document.querySelector(".kw-frame[data-focused] .kw-composer-input") as HTMLElement;
    await waitFor(() => expect(document.activeElement).toBe(composer()));
    press("p", { ctrlKey: true, shiftKey: true });
    const palette = (await screen.findByLabelText("palette")) as HTMLInputElement;
    expect(document.activeElement).toBe(palette);
    palette.value = "/thinking";
    fireEvent.input(palette);
    fireEvent.keyDown(palette, { key: "Enter" });
    await waitFor(() => expect(screen.queryByLabelText("palette")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });
  it("shelves the pane of lowest standing, and says so, when a chord summons one more than the stage shows", async () => {
    await openWorkspace();
    await fillTheMain();
    const showing = shownFrames().length;
    expect(shelfPanes()).toHaveLength(0);
    press("k", { ctrlKey: true });
    press("B", { shiftKey: true });
    await waitFor(() => expect(noticeText()).toBe(shelfNotices.tucked(1)));
    expect(shownFrames()).toHaveLength(showing);
    expect(shelfPanes().map((pane) => pane.dataset.why)).toEqual(["tucked"]);
  });

  it("does the same when the palette summons one more than the stage shows", async () => {
    await openWorkspace();
    await fillTheMain();
    const showing = shownFrames().length;
    press("p", { ctrlKey: true, shiftKey: true });
    const palette = (await screen.findByLabelText("palette")) as HTMLInputElement;
    palette.value = "/chores";
    fireEvent.input(palette);
    fireEvent.keyDown(palette, { key: "Enter" });
    await waitFor(() => expect(noticeText()).toBe(shelfNotices.tucked(1)));
    expect(shownFrames()).toHaveLength(showing);
    expect(shelfPanes()).toHaveLength(1);
  });

  it("returns a tucked pane to its seat when the shelf is clicked, tucking the next in line", async () => {
    await openWorkspace();
    await fillTheMain();
    press("k", { ctrlKey: true });
    press("B", { shiftKey: true });
    await waitFor(() => expect(shelfPanes()).toHaveLength(1));
    const waiting = shelfPanes()[0] as HTMLElement;
    const name = waiting.querySelector(".kw-shelf-name")?.textContent;
    fireEvent.click(waiting);
    await waitFor(() => expect(focusedName()).toBe(name));
    expect(shelfPanes()).toHaveLength(1);
    expect(shelfPanes()[0]?.querySelector(".kw-shelf-name")?.textContent).not.toBe(name);
  });

  it("shows a new session in place of the last one used when the layout is full, and makes no server session for it", async () => {
    await openWorkspace();
    await fillTheMain();
    const open = frames().length;
    const made = created;
    const lastUsed = focusedName() as string;
    fireEvent.click(screen.getByText("+ new session"));
    await waitFor(() =>
      expect(noticeText()).toBe(refusalNotices.shownInstead("new session", lastUsed, "ctrl+k t")),
    );
    expect(focusedName()).toBe("new session");
    expect(frames()).toHaveLength(open);
    expect(frameNames()).not.toContain(lastUsed);
    press("k", { ctrlKey: true });
    press("s");
    await settle();
    expect(frames()).toHaveLength(open);
    expect(created).toBe(made);
  });

  it("brings a listed session back into the pane last used when the layout is full", async () => {
    await openWorkspace();
    await fillTheMain();
    const open = frames().length;
    const lastUsed = focusedName() as string;
    fireEvent.click(screen.getByText("+ new session"));
    await waitFor(() => expect(focusedName()).toBe("new session"));
    fireEvent.click(await screen.findByText(lastUsed, { selector: ".kw-tree-name" }));
    await waitFor(() => expect(focusedName()).toBe(lastUsed));
    expect(frames()).toHaveLength(open);
  });

  it("focuses the optional Stead pane on both its first and subsequent summons", async () => {
    await openWorkspace();
    expect(focusedName()).toBe("new session");
    expect(frames()).toHaveLength(2);
    press("k", { ctrlKey: true });
    press("0");
    await waitFor(() => expect(focusedName()).toBe("stead"));
    expect(frames()).toHaveLength(3);

    press("2", { altKey: true });
    expect(focusedName()).toBe("new session");
    const composer = document.querySelector(
      ".kw-frame[data-focused] .kw-composer-input",
    ) as HTMLTextAreaElement;
    composer.focus();
    expect(document.activeElement).toBe(composer);
    press("k", { ctrlKey: true });
    press("0");
    await waitFor(() => expect(focusedName()).toBe("stead"));
    expect(frames()).toHaveLength(3);
    await waitFor(() => expect(document.activeElement?.closest(".kw-stead")).not.toBeNull());
    expect(document.activeElement).not.toBe(composer);
  });
});

describe("floating, shelving and pinning by key", () => {
  const slotNamed = (name: string): HTMLElement | undefined =>
    [...document.querySelectorAll<HTMLElement>(".kw-slot")].find(
      (slot) => slot.querySelector(".kw-frame-name")?.textContent === name,
    );
  const leader = (key: string): void => {
    press("k", { ctrlKey: true });
    press(key);
  };

  it("floats the focused pane over the tiling with leader space and settles it with the same key", async () => {
    await openWorkspace();
    expect(focusedName()).toBe("new session");
    leader(" ");
    await waitFor(() => expect(slotNamed("new session")?.dataset.floating).toBe(""));
    expect(slotNamed("new session")?.querySelector(".kw-float-grip")).not.toBeNull();
    expect(slotNamed("sessions")?.dataset.floating).toBeUndefined();
    leader(" ");
    await waitFor(() => expect(slotNamed("new session")?.dataset.floating).toBeUndefined());
    expect(document.querySelector(".kw-float-grip")).toBeNull();
  });

  it("lets the pane travel between its seat and its float for one beat, then holds still", async () => {
    await openWorkspace();
    leader(" ");
    await waitFor(() => expect(slotNamed("new session")?.dataset.changingLayer).toBe(""));
    expect(slotNamed("sessions")?.dataset.changingLayer).toBeUndefined();
    await waitFor(() => expect(slotNamed("new session")?.dataset.changingLayer).toBeUndefined());
    expect(slotNamed("new session")?.dataset.floating).toBe("");
    leader(" ");
    await waitFor(() => expect(slotNamed("new session")?.dataset.changingLayer).toBe(""));
    await waitFor(() => expect(slotNamed("new session")?.dataset.changingLayer).toBeUndefined());
    expect(slotNamed("new session")?.dataset.floating).toBeUndefined();
  });

  it("steps from the tiling to the float and back with leader tab", async () => {
    await openWorkspace();
    leader(" ");
    await waitFor(() => expect(slotNamed("new session")?.dataset.floating).toBe(""));
    leader("Tab");
    await waitFor(() => expect(focusedName()).toBe("sessions"));
    leader("Tab");
    await waitFor(() => expect(focusedName()).toBe("new session"));
  });

  it("shelves the focused pane with leader minus, keeps it mounted, and returns it with leader equals", async () => {
    await openWorkspace();
    leader("-");
    await waitFor(() => expect(shelfPanes()).toHaveLength(1));
    expect(shelfPanes()[0]?.dataset.why).toBe("shelved");
    expect(shelfPanes()[0]?.querySelector(".kw-shelf-name")?.textContent).toBe("new session");
    expect(focusedName()).toBe("sessions");
    expect(slotNamed("new session")?.hidden).toBe(true);
    expect(shownFrames()).toHaveLength(1);
    leader("=");
    await waitFor(() => expect(shelfPanes()).toHaveLength(0));
    expect(focusedName()).toBe("new session");
    expect(slotNamed("new session")?.hidden).toBe(false);
  });

  it("keeps the last pane on the stage and says so", async () => {
    await openWorkspace();
    leader("-");
    await waitFor(() => expect(shelfPanes()).toHaveLength(1));
    leader("-");
    await waitFor(() => expect(noticeText()).toBe(shelfNotices.lastPaneStays));
    expect(shelfPanes()).toHaveLength(1);
  });

  it("pins the focused pane with leader quote and marks its title row", async () => {
    await openWorkspace();
    leader("'");
    await waitFor(() => expect(noticeText()).toBe(shelfNotices.pinned));
    expect(slotNamed("new session")?.querySelector(".kw-frame-pin")).not.toBeNull();
    leader("'");
    await waitFor(() => expect(noticeText()).toBe(shelfNotices.unpinned));
    expect(document.querySelector(".kw-frame-pin")).toBeNull();
  });
});

const noticeText = (): string | undefined =>
  document.querySelector(".kw-status-notice")?.textContent ?? undefined;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function startASession(text: string): Promise<void> {
  const sent = prompts.length;
  type(text);
  await waitFor(() => expect(prompts).toHaveLength(sent + 1));
  await waitFor(() => expect(focusedName()).not.toBe("new session"));
}

const shelfPanes = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".kw-shelf-pane"),
];
const shownFrames = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".kw-slot:not([hidden]) > .kw-frame"),
];

async function fillTheMain(): Promise<void> {
  const room = createRoot((dispose) => {
    const tiler = createTiler();
    const screenOfTheApp = { width: 1280, height: 800 };
    tiler.summon({ kind: "tree" }, screenOfTheApp);
    tiler.open({ kind: "conversation" }, screenOfTheApp);
    let fitted = 0;
    const oneMore = () =>
      tiler.open({ kind: "conversation", sessionId: `fit-${fitted}` }, screenOfTheApp);
    while (oneMore().notice === undefined) fitted += 1;
    dispose();
    return fitted;
  });
  await startASession("the first prompt");
  for (let split = 0; split < room; split++) {
    const open = frames().length;
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(open + 1));
    await startASession(`prompt ${split}`);
  }
}

function pointer(type: string, target: EventTarget, x: number, y: number): void {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }),
  );
}

const stage = () => document.querySelector(".kw-stage") as HTMLElement;
const seams = () => [...document.querySelectorAll(".kw-seam")] as HTMLElement[];
const slotOf = (name: string): HTMLElement =>
  (
    [...document.querySelectorAll(".kw-frame-name")].find((node) => node.textContent === name) as
      | HTMLElement
      | undefined
  )?.closest(".kw-slot") as HTMLElement;

describe("the first run", () => {
  it("teaches five keys until the first prompt makes a session, through a split", async () => {
    await openWorkspace();
    const block = document.querySelector(".kw-first-run") as HTMLElement;
    expect(block.querySelectorAll(".kw-first-run-row")).toHaveLength(5);
    expect(block.textContent).toContain("ctrl+k s");
    press("k", { ctrlKey: true });
    press("s");
    await settle();
    expect(document.querySelector(".kw-first-run")).not.toBeNull();
    await startASession("the first prompt");
    await waitFor(() => expect(document.querySelector(".kw-first-run")).toBeNull());
  });
});

describe("pointer gestures", () => {
  it("drags the dock seam to a stepped ratio and shows the seam only while dragging", async () => {
    await openWorkspace();
    expect(seams()).toHaveLength(1);
    const seam = seams()[0] as HTMLElement;
    expect(seam.dataset.axis).toBe("x");
    expect(seam.style.left).toBe("316px");
    pointer("pointerdown", seam, 320, 100);
    pointer("pointermove", window, 640, 100);
    expect(stage().dataset.gesture).toBe("resizing");
    expect((seams()[0] as HTMLElement).hasAttribute("data-active")).toBe(true);
    expect((seams()[0] as HTMLElement).style.left).toBe("636px");
    pointer("pointerup", window, 640, 100);
    expect(stage().dataset.gesture).toBe("idle");
    expect((seams()[0] as HTMLElement).hasAttribute("data-active")).toBe(false);
    expect(slotOf("new session").style.left).toBe("640px");
  });

  it("drags a pane by its title row onto the other dock and lifts the target's ink on the way", async () => {
    await openWorkspace();
    const title = slotOf("sessions").querySelector(".kw-frame-title") as HTMLElement;
    pointer("pointerdown", title, 10, 10);
    pointer("pointermove", window, 400, 300);
    expect(stage().dataset.gesture).toBe("dragging");
    pointer("pointermove", window, 1270, 300);
    const hot = document.querySelector(".kw-drop[data-hot]") as HTMLElement;
    expect(hot.dataset.zone).toBe("right");
    pointer("pointerup", window, 1270, 300);
    expect(document.querySelector(".kw-drop")).toBeNull();
    expect(Number.parseInt(slotOf("sessions").style.left, 10)).toBeGreaterThan(640);
    expect(slotOf("new session").style.left).toBe("0px");
  });

  it("abandons a drag on escape, leaving only the focus the press already gave", async () => {
    await openWorkspace();
    const before = slotOf("sessions").style.left;
    const title = slotOf("sessions").querySelector(".kw-frame-title") as HTMLElement;
    pointer("pointerdown", title, 10, 10);
    expect(focusedName()).toBe("sessions");
    pointer("pointermove", window, 1270, 300);
    expect(document.querySelector(".kw-drop[data-hot]")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(stage().dataset.gesture).toBe("idle");
    expect(document.querySelector(".kw-drop")).toBeNull();
    pointer("pointerup", window, 1270, 300);
    expect(slotOf("sessions").style.left).toBe(before);
  });

  it("focuses on a body press and never drags from it", async () => {
    await openWorkspace();
    expect(focusedName()).toBe("new session");
    const before = slotOf("sessions").style.left;
    const body = slotOf("sessions").querySelector(".kw-frame-body") as HTMLElement;
    pointer("pointerdown", body, 100, 300);
    pointer("pointermove", window, 900, 300);
    expect(stage().dataset.gesture).not.toBe("dragging");
    pointer("pointerup", window, 900, 300);
    expect(focusedName()).toBe("sessions");
    expect(slotOf("sessions").style.left).toBe(before);
  });
});
