import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { idleControlsClient } from "./controls-store.test.ts";
import { inertMemoryClient } from "./memory-store.test.ts";
import { emptySurfacesClient } from "./surfaces-store.test.ts";
import { inertWorkspaceClient } from "./trust.test.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
  prompts.length = 0;
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

function quietClient(): KeyworkClient {
  const summaries: SessionSummary[] = [];
  return {
    url: "http://127.0.0.1:4770",
    document: async () => ({ version: "0.0.1", operationIds: [] }),
    sessions: async () => summaries,
    session: async () => undefined,
    createSession: async () => {
      const created: SessionSummary = {
        id: `s${summaries.length + 1}`,
        title: `session ${summaries.length + 1}`,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
      };
      summaries.unshift(created);
      return created;
    },
    prompt: async (id, text) => {
      prompts.push([id, text]);
      return "started";
    },
    abort: async () => "idle",
    events: async function* (): AsyncIterable<BusEnvelope> {
      await new Promise(() => undefined);
    },
    inject: async () => "started",
    entries: async () => undefined,
    fork: async () => "missing",
    labelEntry: async () => "missing",
    moveLeaf: async () => "missing",
    changes: async () => "missing",
    ...inertMemoryClient(),
    ...idleControlsClient(),
    ...emptySurfacesClient(),
    ...inertWorkspaceClient(),
    changedFile: async () => "missing",
    removeSession: async () => "missing",
    listTrash: async () => [],
    restoreSession: async () => "missing",
    discardTrashedSession: async () => "missing",
    purgeTrash: async () => ({ purged: 0 }),
    asks: async () => [],
    answerAsk: async () => "settled" as const,
    permissions: async () => ({ trusted: false, bundle: [], workspace: [], session: {} }),
    revokeWorkspaceGrant: async (rule) => ({ revoked: rule }),
    revokeSessionGrant: async (_sessionId, rule) => ({ revoked: rule }),
  };
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

describe("keyboard workflows", () => {
  it("splits a new session pane with the leader, jumps by ordinal, zooms, and closes with focus handoff", async () => {
    await openWorkspace();
    expect(frames()).toHaveLength(2);
    expect(focusedName()).toBe("new session");

    press("k", { ctrlKey: true });
    expect(screen.getByText("ctrl+k …")).toBeTruthy();
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    expect(focusedName()).toBe("session 1");

    press("1", { altKey: true });
    expect(focusedName()).toBe("sessions");
    press("3", { altKey: true });
    expect(focusedName()).toBe("session 1");

    press("z", { altKey: true });
    expect(frames()).toHaveLength(1);
    press("z", { altKey: true });
    expect(frames()).toHaveLength(3);

    press("k", { ctrlKey: true });
    press("x");
    await waitFor(() => expect(frames()).toHaveLength(2));
    expect(focusedName()).toBe("new session");
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
});

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
  it("teaches five keys while the workspace has no sessions and nothing once one exists", async () => {
    await openWorkspace();
    const block = document.querySelector(".kw-first-run") as HTMLElement;
    expect(block.querySelectorAll(".kw-first-run-row")).toHaveLength(5);
    expect(block.textContent).toContain("ctrl+k s");
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
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
