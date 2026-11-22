import type { ConsoleClient } from "@keywork-app/client";
import { steadProfile } from "@keywork-app/product";
import type { PlacementsReport, SessionSummary, Setting } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import type { HostPort } from "../host/port.ts";
import {
  type PoppedOutside,
  surfacesPerfHookName,
  surfacesPerfRequest,
} from "../surfaces/feel/perf-hook.ts";
import type {
  ConsoleMove,
  Desk,
  Glide,
  ScreenRect,
  SurfaceShow,
  SurfacesPort,
} from "../surfaces/port.ts";
import type { Realm } from "../surfaces/runtime/realm.ts";
import { type FakeDesktop, fakeDesktop } from "../surfaces/runtime/testing.ts";
import { conversation, conversationId, homePath, reading, wren } from "../yard/app-testing.tsx";
import { aSetting, eventFeed, proposed } from "../yard/testing.ts";
import { fakeClient } from "./client-testing.ts";
import { outsideNotices } from "./outside-panes.ts";

const restores: Array<() => void> = [];

afterEach(() => {
  cleanup();
  for (const restore of restores.splice(0)) restore();
  localStorage.clear();
});

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

const desk: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [{ bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 }],
  cursor: { x: 640, y: 480 },
};

const layoutKey = "keywork.layout:C:/work";

interface Desktop {
  readonly fake: FakeDesktop;
  readonly port: SurfacesPort;
  readonly shows: SurfaceShow[];
  readonly glides: Glide[];
  readonly stacks: string[][];
  readonly windows: Realm[];
}

interface DesktopManner {
  readonly restacks?: boolean;
  readonly refusesFocus?: boolean;
}

function standingDesktop(manner: DesktopManner = {}): Desktop {
  const fake = fakeDesktop({ announces: false });
  const shows: SurfaceShow[] = [];
  const glides: Glide[] = [];
  const stacks: string[][] = [];
  const windows: Realm[] = [];
  const open = window.open;
  window.open = ((url?: string | URL, frame?: string) => {
    const child = open.call(window, url, frame) as Realm;
    windows.push(child);
    queueMicrotask(() => fake.announce(String(frame)));
    return child;
  }) as typeof window.open;
  restores.push(() => {
    window.open = open;
    for (const child of windows) if (!child.closed) child.close();
  });
  const port: SurfacesPort = {
    ...fake.port,
    desk: async () => desk,
    show: (request) => {
      shows.push(request);
      return fake.port.show(request);
    },
    glide: (glide) => {
      glides.push(glide);
      return fake.port.glide(glide);
    },
    focus: (id) =>
      manner.refusesFocus === true
        ? Promise.reject(new Error("the desktop would not focus it"))
        : fake.port.focus(id),
    ...(manner.restacks === true && {
      stack: async (bottomToTop: readonly string[]) => {
        stacks.push([...bottomToTop]);
      },
    }),
  };
  return { fake, port, shows, glides, stacks, windows };
}

function restingPlaceOf(desktop: Desktop, show: SurfaceShow | undefined): ScreenRect | undefined {
  const landing = desktop.glides
    .flatMap((glide) => glide.moves)
    .findLast((move) => move.id === show?.id);
  return landing?.bounds ?? show?.bounds;
}

function quietClient(): ConsoleClient {
  const summaries: SessionSummary[] = [];
  return fakeClient({ sessions: async () => summaries });
}

async function openWorkspace(surfaces?: SurfacesPort): Promise<void> {
  const host: HostPort = {
    ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
    surfaces,
  };
  render(() => <App host={host} connect={quietClient} />);
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}, page = document): void {
  fireEvent.keyDown(page.body, { key, bubbles: true, ...modifiers });
}

function leader(key: string, page = document, modifiers: Partial<KeyboardEventInit> = {}): void {
  press("k", { ctrlKey: true }, page);
  press(key, modifiers, page);
}

const framesInside = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".kw-slot:not([hidden]) > .kw-frame"),
];
const namesInside = (): Array<string | null> =>
  framesInside().map((frame) => frame.querySelector(".kw-frame-name")?.textContent ?? null);
const framesOutside = (desktop: Desktop): HTMLElement[] =>
  desktop.windows.flatMap((child) =>
    child.closed ? [] : [...child.document.querySelectorAll<HTMLElement>(".kw-frame")],
  );
const pageOf = (frame: HTMLElement | undefined): Document => frame?.ownerDocument as Document;
const noticeText = (): string | undefined =>
  document.querySelector(".kw-status-notice")?.textContent ?? undefined;
const savedOutside = (): unknown =>
  JSON.parse(localStorage.getItem(layoutKey) ?? "{}").layout?.outside;
const composerIn = (root: ParentNode): HTMLTextAreaElement =>
  root.querySelector(".kw-composer-input") as HTMLTextAreaElement;

async function sendFocusedOutside(desktop: Desktop): Promise<HTMLElement> {
  const standing = framesOutside(desktop).length;
  leader("Enter");
  await waitFor(() => expect(framesOutside(desktop)).toHaveLength(standing + 1));
  await waitFor(() => expect(desktop.shows).toHaveLength(standing + 1));
  return framesOutside(desktop).at(-1) as HTMLElement;
}

describe("sending a pane outside the window", () => {
  it("moves the focused pane, with what was typed in it, to a window of its own on the leader", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const draft = composerIn(document);
    draft.value = "a thought half typed";
    fireEvent.input(draft);
    expect(namesInside()).toEqual(["sessions", "new session"]);

    const frame = await sendFocusedOutside(desktop);

    expect(namesInside()).toEqual(["sessions"]);
    expect(pageOf(frame)).not.toBe(document);
    expect(composerIn(frame)).toBe(draft);
    expect(draft.value).toBe("a thought half typed");
    expect(desktop.shows[0]).toMatchObject({ origin: "keeper", focus: true, follows: true });
    const titles = [...pageOf(frame).querySelectorAll("h2")].map((title) => title.textContent);
    expect(titles).toEqual(["new session"]);
    expect(savedOutside()).toEqual([
      {
        id: "conversation-1",
        follows: true,
        by: "keeper",
        rect: restingPlaceOf(desktop, desktop.shows[0]),
      },
    ]);
  });

  it("brings it back where it sat when the leader is pressed again in the pane outside", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const draft = composerIn(document);
    const frame = await sendFocusedOutside(desktop);

    leader("Enter", pageOf(frame));

    await waitFor(() => expect(namesInside()).toEqual(["sessions", "new session"]));
    expect(composerIn(document)).toBe(draft);
    expect(framesOutside(desktop)).toEqual([]);
    expect(savedOutside()).toBeUndefined();
    expect(desktop.fake.calls).toContain("focus console");
  });

  it("hears the leader and the hot keys pressed in the pane outside", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    press("k", { ctrlKey: true }, pageOf(frame));
    expect(screen.getByText("ctrl+k …")).toBeTruthy();
    press("Escape", {}, pageOf(frame));
    press("1", { altKey: true }, pageOf(frame));
    expect(document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent).toBe(
      "sessions",
    );
    await waitFor(() => expect(desktop.fake.calls.at(-1)).toBe("focus console"));
  });

  it("keeps a terminal inside and says so plainly", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    leader("T", document, { shiftKey: true });
    await waitFor(() => expect(namesInside()).toContain("shell"));
    leader("Enter");
    await waitFor(() => expect(noticeText()).toBe(outsideNotices.staysInside("shell")));
    expect(desktop.shows).toEqual([]);
    expect(namesInside()).toContain("shell");
  });

  it("brings the pane inside when its window is closed underneath it", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    await sendFocusedOutside(desktop);
    desktop.fake.emit({ kind: "closed", id: desktop.shows[0]?.id as string });
    expect(namesInside()).toEqual(["sessions", "new session"]);
    expect(savedOutside()).toBeUndefined();
  });

  it("remembers where the keeper dragged it", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    await sendFocusedOutside(desktop);
    const dragged = { x: 40, y: 60, width: 520, height: 400 };
    desktop.fake.emit({
      kind: "moved",
      id: desktop.shows[0]?.id as string,
      bounds: dragged,
      by: "keeper",
    });
    expect(savedOutside()).toEqual([
      { id: "conversation-1", follows: false, by: "keeper", rect: dragged },
    ]);
  });

  it("closes a pane outside like any other and lets its window go", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    leader("x", pageOf(frame));
    await waitFor(() => expect(framesOutside(desktop)).toEqual([]));
    expect(namesInside()).toEqual(["sessions"]);
    expect(savedOutside()).toBeUndefined();
  });
});

describe("every pane outside at once", () => {
  it("brings them all back on one chord, and says so when none is outside", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    leader("Backspace");
    expect(noticeText()).toBe(outsideNotices.noneOutside);

    await sendFocusedOutside(desktop);
    press("1", { altKey: true });
    await sendFocusedOutside(desktop);
    expect(namesInside()).toEqual([]);

    leader("Backspace");
    await waitFor(() => expect(namesInside()).toEqual(["sessions", "new session"]));
    expect(framesOutside(desktop)).toEqual([]);
    expect(savedOutside()).toBeUndefined();
  });

  it("steps to a pane outside with the layer key and hands its window the keeper's focus", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    await sendFocusedOutside(desktop);
    press("1", { altKey: true });
    await waitFor(() => expect(desktop.fake.calls).toContain("focus console"));
    leader("Tab");
    await waitFor(() =>
      expect(desktop.fake.calls.at(-1)).toBe(`focus ${desktop.shows[0]?.id as string}`),
    );
  });
});

describe("overlays opened from a pane outside", () => {
  it("open in the console and hand the keeper back to the pane when dismissed", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    const before = desktop.fake.calls.length;
    press("F1", {}, pageOf(frame));
    expect(document.querySelector(".kw-help-keys")).not.toBeNull();
    expect(desktop.fake.calls.slice(before)).toEqual(["focus console"]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", bubbles: true });
    await waitFor(() => expect(document.querySelector(".kw-help-keys")).toBeNull());
    expect(desktop.fake.calls.at(-1)).toBe(`focus ${desktop.shows[0]?.id as string}`);
  });
});

describe("panes the saved layout says are outside", () => {
  const stood = { x: 1300, y: 300, width: 520, height: 400 };
  const savedWith = (rect: ScreenRect | undefined): string =>
    JSON.stringify({
      layout: {
        version: 1,
        tree: {
          kind: "split",
          orientation: "row",
          ratio: 0.5,
          first: { kind: "leaf", id: "conversation-1" },
          second: { kind: "leaf", id: "conversation-2" },
        },
        focused: "conversation-1",
        outside: [{ id: "conversation-2", follows: false, ...(rect !== undefined && { rect }) }],
      },
      specs: {
        "conversation-1": { kind: "conversation" },
        "conversation-2": { kind: "conversation" },
      },
    });

  async function openSaved(surfaces?: SurfacesPort): Promise<void> {
    const host: HostPort = {
      ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
      surfaces,
    };
    render(() => <App host={host} connect={quietClient} />);
    const input = await screen.findByLabelText("workspace");
    fireEvent.input(input, { target: { value: "C:/work" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(framesInside().length).toBeGreaterThan(0));
  }

  it("stand outside again where they stood, without taking the keeper's focus", async () => {
    localStorage.setItem(layoutKey, savedWith(stood));
    const desktop = standingDesktop();
    await openSaved(desktop.port);
    await waitFor(() => expect(desktop.shows).toHaveLength(1));
    expect(desktop.shows[0]).toMatchObject({ origin: "keeper", focus: false, follows: false });
    expect(restingPlaceOf(desktop, desktop.shows[0])).toEqual(stood);
    expect(framesInside()).toHaveLength(1);
    expect(framesOutside(desktop)).toHaveLength(1);
  });

  it("come back inside when this window cannot keep panes outside", async () => {
    localStorage.setItem(layoutKey, savedWith(stood));
    await openSaved();
    await waitFor(() => expect(framesInside()).toHaveLength(2));
    expect(savedOutside()).toBeUndefined();
    leader("Enter");
    expect(noticeText()).toBe(outsideNotices.windowKeepsItsPanes);
    expect(framesInside()).toHaveLength(2);
  });
});

describe("a file pane across the window's edge", () => {
  const notes = "one line\nanother line\n";
  const savedWithAFile = JSON.stringify({
    layout: { version: 1, tree: { kind: "leaf", id: "file-1" }, focused: "file-1" },
    specs: { "file-1": { kind: "file", path: "notes.md" } },
  });

  async function openTheFile(surfaces: SurfacesPort): Promise<{ reads: () => number }> {
    let reads = 0;
    const client = (): ConsoleClient =>
      fakeClient({
        sessions: async () => [],
        file: async (path) => {
          reads += 1;
          return {
            path,
            bytes: notes.length,
            from: 0,
            to: notes.length,
            text: notes,
            truncated: false,
            encoding: "utf-8",
          };
        },
      });
    const host: HostPort = {
      ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
      surfaces,
    };
    localStorage.setItem(layoutKey, savedWithAFile);
    render(() => <App host={host} connect={client} />);
    const input = await screen.findByLabelText("workspace");
    fireEvent.input(input, { target: { value: "C:/work" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull());
    return { reads: () => reads };
  }

  it("keeps the view it already has: nothing is read again and no editor is rebuilt", async () => {
    const desktop = standingDesktop();
    const file = await openTheFile(desktop.port);
    const editor = document.querySelector(".cm-editor");
    const readsInside = file.reads();

    const frame = await sendFocusedOutside(desktop);
    expect(frame.querySelector(".cm-editor")).toBe(editor);

    leader("Enter", pageOf(frame));
    await waitFor(() => expect(framesInside()).toHaveLength(1));
    expect(document.querySelector(".cm-editor")).toBe(editor);
    expect(file.reads()).toBe(readsInside);
  });
});

describe("the measuring hook", () => {
  it("puts one more plain pane outside as a creature would: unfocused, following, nothing displaced", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const before = namesInside();
    const focused = document.querySelector(".kw-frame[data-focused]");
    window.dispatchEvent(new Event(surfacesPerfRequest));
    const hook = Reflect.get(window, surfacesPerfHookName) as {
      popOutside(): Promise<PoppedOutside>;
    };
    const popped = await hook.popOutside();
    expect(desktop.shows.at(-1)).toMatchObject({
      id: popped.id,
      origin: "creature",
      focus: false,
      follows: true,
    });
    expect(popped.bounds).toEqual(restingPlaceOf(desktop, desktop.shows.at(-1)));
    expect(popped.shownAt).toBeGreaterThanOrEqual(popped.requestedAt);
    expect(popped.paintedAt).toBeGreaterThanOrEqual(popped.requestedAt);
    expect(namesInside()).toEqual(before);
    expect(document.querySelector(".kw-frame[data-focused]")).toBe(focused);
    expect(framesOutside(desktop)).toHaveLength(1);
    const again = await hook.popOutside();
    expect(again.id).not.toBe(popped.id);
    expect(framesOutside(desktop)).toHaveLength(2);
  });
});

describe("working between panes outside by key", () => {
  const lettersOn = (frame: HTMLElement): string | undefined =>
    pageOf(frame).querySelector(".kw-surface-hint")?.textContent ?? undefined;
  const focusedInside = (): string | undefined =>
    document.querySelector(".kw-slot:not([hidden]) > .kw-frame[data-focused] .kw-frame-name")
      ?.textContent ?? undefined;
  const lastCall = (desktop: Desktop): string | undefined => desktop.fake.calls.at(-1);
  const idOf = (desktop: Desktop, at: number): string => desktop.shows[at]?.id as string;

  async function bothOutside(desktop: Desktop) {
    await openWorkspace(desktop.port);
    const conversation = await sendFocusedOutside(desktop);
    press("1", { altKey: true }, pageOf(conversation));
    await waitFor(() => expect(lastCall(desktop)).toBe("focus console"));
    const sessions = await sendFocusedOutside(desktop);
    return { conversation, sessions };
  }

  it("letters the panes outside and goes to the one whose letter is pressed in the console", async () => {
    const desktop = standingDesktop();
    const { conversation, sessions } = await bothOutside(desktop);
    leader(":", document, { shiftKey: true });
    expect(noticeText()).toBe(outsideNotices.lettered);
    expect([lettersOn(conversation), lettersOn(sessions)]).toEqual(["a", "s"]);
    press("a");
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${idOf(desktop, 0)}`));
    expect([lettersOn(conversation), lettersOn(sessions)]).toEqual([undefined, undefined]);
    expect(
      pageOf(conversation).querySelector(".kw-surface .kw-frame[data-focused]"),
    ).not.toBeNull();
  });

  it("takes the letter pressed in a pane outside, and keeps it from the pane it was pressed in", async () => {
    const desktop = standingDesktop();
    const { conversation, sessions } = await bothOutside(desktop);
    const draft = composerIn(conversation);
    leader(":", pageOf(conversation), { shiftKey: true });
    const typed = new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true });
    draft.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(true);
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${idOf(desktop, 1)}`));
    expect(lettersOn(sessions)).toBeUndefined();
  });

  it("ignores a key held down, and lets a chord through after taking the letters off", async () => {
    const desktop = standingDesktop();
    const { conversation } = await bothOutside(desktop);
    leader(":", document, { shiftKey: true });
    fireEvent.keyDown(document.body, { key: ":", shiftKey: true, repeat: true, bubbles: true });
    expect(lettersOn(conversation)).toBe("a");
    press("k", { ctrlKey: true });
    expect(lettersOn(conversation)).toBeUndefined();
    expect(screen.getByText("ctrl+k …")).toBeTruthy();
    press("Escape");
  });

  it("moves focus by direction from a pane outside into the console, and out past the console's edge", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    leader("h", pageOf(frame));
    await waitFor(() => expect(focusedInside()).toBe("sessions"));
    await waitFor(() => expect(lastCall(desktop)).toBe("focus console"));
    leader("l");
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${idOf(desktop, 0)}`));
    expect(focusedInside()).toBeUndefined();
  });

  it("shows a pane's ordinal on its strip outside while the modifier is held, and focuses it there by it", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    press("1", { altKey: true }, pageOf(frame));
    await waitFor(() => expect(lastCall(desktop)).toBe("focus console"));
    const badge = (): string | undefined =>
      pageOf(frame).querySelector(".kw-surface > .kw-ordinal-badge")?.textContent ?? undefined;
    expect(badge()).toBe("alt+2");
    fireEvent.keyUp(pageOf(frame).body, { key: "Alt", altKey: false, bubbles: true });
    expect(badge()).toBeUndefined();
    fireEvent.keyDown(document.body, { key: "Alt", altKey: true, bubbles: true });
    expect(badge()).toBe("alt+2");
    fireEvent.keyUp(document.body, { key: "Alt", altKey: false, bubbles: true });
    expect(badge()).toBeUndefined();
    press("2", { altKey: true });
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${idOf(desktop, 0)}`));
  });

  it("raises the pane it goes to above the others, and sends one behind on the backslash", async () => {
    const desktop = standingDesktop({ restacks: true });
    const { conversation } = await bothOutside(desktop);
    const [first, second] = [idOf(desktop, 0), idOf(desktop, 1)];
    leader(":", document, { shiftKey: true });
    press(lettersOn(conversation) as string);
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${first}`));
    expect(desktop.stacks).toEqual([[second, first]]);
    leader("\\", pageOf(conversation));
    await waitFor(() => expect(lastCall(desktop)).toBe(`focus ${second}`));
    expect(desktop.stacks).toEqual([
      [second, first],
      [first, second],
    ]);
  });

  it("steps a pane outside across the grid and along the named sizes, and remembers where that left it", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    const arrived = restingPlaceOf(desktop, desktop.shows[0]) as ScreenRect;
    expect(arrived).toEqual({ x: 1112, y: 100, width: 624, height: 624 });
    leader("L", pageOf(frame), { shiftKey: true });
    await waitFor(() =>
      expect(savedOutside()).toEqual([
        { id: "conversation-1", follows: false, by: "keeper", rect: { ...arrived, x: 1284 } },
      ]),
    );
    leader(">", pageOf(frame), { shiftKey: true });
    await waitFor(() =>
      expect(savedOutside()).toEqual([
        {
          id: "conversation-1",
          follows: false,
          by: "keeper",
          rect: { x: 966, y: 12, width: 942, height: 1016 },
        },
      ]),
    );
    expect(restingPlaceOf(desktop, desktop.shows[0])).toEqual({
      x: 966,
      y: 12,
      width: 942,
      height: 1016,
    });
    expect(noticeText()).not.toBe(outsideNotices.isOutside("ctrl+k enter"));
  });

  it("still moves and sizes a pane inside exactly as before while another is outside", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    await sendFocusedOutside(desktop);
    press("1", { altKey: true });
    const glides = desktop.glides.length;
    leader("L", document, { shiftKey: true });
    leader(">", document, { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(desktop.glides).toHaveLength(glides);
    expect(savedOutside()).toHaveLength(1);
  });

  it("says so in the status line when the desktop refuses, rather than failing unheard", async () => {
    const desktop = standingDesktop({ refusesFocus: true });
    await openWorkspace(desktop.port);
    const frame = await sendFocusedOutside(desktop);
    press("1", { altKey: true }, pageOf(frame));
    press("2", { altKey: true });
    await waitFor(() =>
      expect(noticeText()).toBe(outsideNotices.desktopRefused("the desktop would not focus it")),
    );
  });
});

describe("dealing the panes outside on one key", () => {
  const savedRects = (): ScreenRect[] =>
    (savedOutside() as Array<{ rect: ScreenRect }>).map((entry) => entry.rect);
  const overlapsAny = (rects: readonly ScreenRect[]): boolean =>
    rects.some((one, at) =>
      rects
        .slice(at + 1)
        .some(
          (other) =>
            one.x < other.x + other.width &&
            other.x < one.x + one.width &&
            one.y < other.y + other.height &&
            other.y < one.y + one.height,
        ),
    );

  const dealThem = (page = document): void => leader("Enter", page, { shiftKey: true });

  async function twoOutside(desktop: Desktop): Promise<HTMLElement> {
    await openWorkspace(desktop.port);
    const conversation = await sendFocusedOutside(desktop);
    press("1", { altKey: true }, pageOf(conversation));
    await waitFor(() => expect(desktop.fake.calls.at(-1)).toBe("focus console"));
    return sendFocusedOutside(desktop);
  }

  it("deals them into the next arrangement each time, names it, and remembers the seats", async () => {
    const desktop = standingDesktop();
    await twoOutside(desktop);
    const arrived = savedRects();
    dealThem();
    await waitFor(() =>
      expect(noticeText()).toBe(
        outsideNotices.dealt({ name: "rows", turn: 1, of: 2 }, "ctrl+k shift+enter"),
      ),
    );
    expect(noticeText()).toBe("dealt as rows · 1 of 2 · ctrl+k shift+enter deals the next");
    await waitFor(() => expect(savedRects()).not.toEqual(arrived));
    const inRows = savedRects();
    expect(overlapsAny(inRows)).toBe(false);
    expect(new Set(inRows.map((rect) => rect.y)).size).toBe(1);
    dealThem();
    await waitFor(() => expect(noticeText()).toContain("dealt as columns · 2 of 2"));
    await waitFor(() => expect(new Set(savedRects().map((rect) => rect.x)).size).toBe(1));
    dealThem();
    await waitFor(() => expect(noticeText()).toContain("dealt as rows · 1 of 2"));
    await waitFor(() => expect(savedRects()).toEqual(inRows));
    expect((savedOutside() as Array<{ follows: boolean }>).map((entry) => entry.follows)).toEqual([
      false,
      false,
    ]);
  });

  it("leaves shift+enter to the draft when the leader was not pressed", async () => {
    const desktop = standingDesktop();
    await openWorkspace(desktop.port);
    await sendFocusedOutside(desktop);
    const before = desktop.glides.length;
    press("Enter", { shiftKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(desktop.glides).toHaveLength(before);
  });
});

describe("what a creature set outside, when the window opens again", () => {
  const stood = { x: 1300, y: 300, width: 520, height: 400 };
  const parts = {
    id: "set-1",
    creature: "oda",
    sessionId: "thread-1",
    what: { kind: "note", ref: "a camera board and a perch sensor", title: "Parts" },
  } as const;
  const stillOut: Setting = {
    ...parts,
    rung: "card",
    why: "",
    at: "2026-11-20T10:00:00.000Z",
    until: "rests",
    state: "live",
    where: "outside",
  };
  const asItStood = { id: "setting-1", follows: true, by: "creature", rect: stood };
  const saved = JSON.stringify({
    layout: {
      version: 1,
      tree: {
        kind: "split",
        orientation: "row",
        ratio: 0.5,
        first: { kind: "leaf", id: "conversation-1" },
        second: { kind: "leaf", id: "setting-1" },
      },
      focused: "conversation-1",
      outside: [asItStood],
    },
    specs: {
      "conversation-1": { kind: "conversation" },
      "setting-1": { kind: "setting", setting: parts },
    },
  });
  const settingsInside = (): number => document.querySelectorAll(".kw-setting").length;

  async function openedAgain(surfaces: SurfacesPort | undefined, listed: readonly Setting[]) {
    localStorage.setItem(layoutKey, saved);
    const summaries: SessionSummary[] = [];
    const client = fakeClient({ sessions: async () => summaries, settings: async () => listed });
    const host: HostPort = {
      ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
      surfaces,
    };
    render(() => <App host={host} connect={() => client} />);
    const input = await screen.findByLabelText("workspace");
    fireEvent.input(input, { target: { value: "C:/work" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(framesInside().length).toBeGreaterThan(0));
  }

  it("stands outside again in its seat, still the creature's, without taking the keeper's focus", async () => {
    const desktop = standingDesktop();
    await openedAgain(desktop.port, [stillOut]);
    await waitFor(() => expect(desktop.shows).toHaveLength(1));
    expect(desktop.shows[0]).toMatchObject({ origin: "creature", focus: false, follows: true });
    expect(restingPlaceOf(desktop, desktop.shows[0])).toEqual(stood);
    expect(savedOutside()).toEqual([asItStood]);
    expect(settingsInside()).toBe(0);
  });

  it("does not come back once it was settled while the window was closed", async () => {
    const desktop = standingDesktop();
    await openedAgain(desktop.port, []);
    await waitFor(() => expect(savedOutside()).toBeUndefined());
    expect(desktop.shows).toEqual([]);
    expect(settingsInside()).toBe(0);
    expect(framesInside()).toHaveLength(1);
  });

  it("keeps its place in what is saved when its window goes because the app is leaving", async () => {
    const desktop = standingDesktop();
    const leaving: Array<() => void> = [];
    const port: SurfacesPort = {
      ...desktop.port,
      onLeaving: (listener) => {
        leaving.push(listener);
        return () => undefined;
      },
    };
    await openedAgain(port, [stillOut]);
    await waitFor(() => expect(desktop.shows).toHaveLength(1));
    for (const leave of leaving) leave();
    desktop.fake.emit({ kind: "closed", id: desktop.shows[0]?.id as string });
    expect(savedOutside()).toEqual([asItStood]);
    expect(framesInside()).toHaveLength(1);
  });

  it("is never seated inside a window that cannot keep panes outside", async () => {
    await openedAgain(undefined, [stillOut]);
    await waitFor(() => expect(savedOutside()).toBeUndefined());
    expect(settingsInside()).toBe(0);
    expect(framesInside()).toHaveLength(1);
  });
});

describe("nine things a creature sets outside in one turn", () => {
  const inTheMiddle: ScreenRect = { x: 560, y: 100, width: 761, height: 800 };
  const asTheHub: ScreenRect = { x: 12, y: 12, width: 504, height: 1016 };
  const titles = [
    "Plan",
    "Parts",
    "Morning",
    "Afternoon",
    "Sunday",
    "Risks",
    "Storage",
    "Power",
    "Two",
  ];

  async function steadWith(desktop: Desktop, makesRoom = true) {
    const feed = eventFeed();
    const reports: PlacementsReport[] = [];
    const moves: ConsoleMove[] = [];
    let stands = inTheMiddle;
    const surfaces: SurfacesPort = {
      ...desktop.port,
      desk: async () => ({ ...desk, console: stands }),
      ...(makesRoom && {
        moveConsole: async (move: ConsoleMove) => {
          moves.push(move);
          const from = { bounds: stands, maximized: false };
          stands = move.bounds;
          return { from, to: { bounds: stands, maximized: false } };
        },
      }),
    };
    const client = fakeClient({
      workspace: async () => reading(),
      sessions: async () => [conversation],
      session: async (id) =>
        id === conversationId
          ? { ...conversation, cwd: homePath, asOf: 0, live: true, messages: [] }
          : undefined,
      creatures: async () => [wren],
      routines: async () => [],
      listCreatureProjects: async () => ({ projects: [] }),
      bots: async () => [{ name: "wren", sigil: "W", source: "project", sessions: 1 }],
      settings: async () => [],
      events: feed.events,
      reportPlacements: async (_sessionId, report) => {
        reports.push(report);
        return undefined;
      },
    } as Partial<ConsoleClient>);
    const host: HostPort = {
      ...browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } }),
      surfaces,
      openHome: async () => ({
        ok: true,
        opened: {
          workspace: homePath,
          serverLabel: "localhost",
          attached: true,
          version: "test",
          binary: undefined,
        },
      }),
    };
    render(() => <App profile={steadProfile} host={host} connect={() => client} />);
    await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
    return { feed, reports, moves };
  }

  const setOutside = titles.map((title, at) =>
    proposed(
      at + 1,
      aSetting({
        id: `set-${at}`,
        sessionId: conversationId,
        what: { kind: "note", ref: `${title} in a few lines`, title },
        where: "outside",
      }),
    ),
  );

  it("stand as one arrangement beside the console, which steps aside as their hub and returns when they come in", async () => {
    const desktop = standingDesktop();
    const { feed, reports, moves } = await steadWith(desktop);
    feed.emit(setOutside);
    await waitFor(() => expect(desktop.shows).toHaveLength(9), { timeout: 4000 });
    await waitFor(
      () => {
        const seated = reports.at(-1)?.placements.filter((placement) => placement.seat);
        expect(seated).toHaveLength(9);
      },
      { timeout: 4000 },
    );
    expect(moves).toEqual([expect.objectContaining({ bounds: asTheHub, maximized: false })]);
    expect(reports.at(-1)?.stage.room).toBe("beside");
    expect(reports.every((report) => report.placements.every(isTold))).toBe(true);
    await waitFor(() => {
      const places = desktop.shows.map((show) => restingPlaceOf(desktop, show) as ScreenRect);
      expect(places.filter((place) => place.x < asTheHub.x + asTheHub.width + 12)).toEqual([]);
      expect(places.filter((place) => place.y < asTheHub.y)).toEqual([]);
      expect(overlappingPairs(places)).toBe(0);
    });
    expect(namesInside()).toEqual(["Wren at home"]);
    expect(document.querySelectorAll(".kw-shelf-pane")).toHaveLength(0);
    leader("Backspace");
    await waitFor(() => expect(moves).toHaveLength(2), { timeout: 4000 });
    expect(moves[1]).toMatchObject({ bounds: inTheMiddle, maximized: false });
    expect(document.querySelectorAll(".kw-setting")).toHaveLength(0);
    expect(document.querySelectorAll(".kw-shelf-pane")).toHaveLength(0);
    await waitFor(() =>
      expect(
        reports.at(-1)?.placements.map((placement) => [placement.where, placement.by]),
      ).toEqual(Array(9).fill(["beside", "keeper"])),
    );
  });

  it("come out again in one arrangement when an arrange names them all after they were put away", async () => {
    const desktop = standingDesktop();
    const { feed, reports, moves } = await steadWith(desktop);
    feed.emit(setOutside);
    await waitFor(() => expect(desktop.shows).toHaveLength(9), { timeout: 4000 });
    leader("Backspace");
    await waitFor(() => expect(moves).toHaveLength(2), { timeout: 4000 });
    await waitFor(() =>
      expect(reports.at(-1)?.placements.every((placement) => placement.where === "beside")).toBe(
        true,
      ),
    );
    const glidesBefore = desktop.glides.length;
    feed.emit([
      {
        id: 40,
        ts: "2026-11-20T10:00:00.000Z",
        sessionId: conversationId,
        type: "show.arranged",
        payload: {
          arrangement: {
            id: "arr-1",
            creature: "wren",
            sessionId: conversationId,
            at: "2026-11-20T10:00:00.000Z",
            panes: setOutside.map((_, at) => `set-${at}`),
            shape: "lead-and-cards",
            lead: "set-0",
          },
        },
      },
    ]);
    await waitFor(() => expect(desktop.shows).toHaveLength(18), { timeout: 4000 });
    await waitFor(() => expect(reports.at(-1)?.arrangement?.id).toBe("arr-1"), { timeout: 4000 });
    expect(moves).toHaveLength(3);
    expect(moves[2]).toMatchObject({ bounds: asTheHub, maximized: false });
    const again = desktop.shows.slice(9);
    const movedAfter = desktop.glides.slice(glidesBefore).flatMap((glide) => glide.moves);
    const timesMoved = again.map((show) => movedAfter.filter((move) => move.id === show.id).length);
    expect(Math.max(...timesMoved)).toBeLessThanOrEqual(1);
    const places = again.map((show) => restingPlaceOf(desktop, show) as ScreenRect);
    expect(overlappingPairs(places)).toBe(0);
    expect(places.filter((place) => place.x < asTheHub.x + asTheHub.width + 12)).toEqual([]);
    const lead = places[again.findIndex((show) => show.title === "Plan")] as ScreenRect;
    const others = places.filter((place) => place !== lead);
    expect(others.every((place) => place.width < lead.width && place.height < lead.height)).toBe(
      true,
    );
    expect(reports.at(-1)?.arrangement?.said).toBe(
      "9 panes now stand beside the console as one large pane with the rest as cards around it.",
    );
    await waitFor(() =>
      expect(
        reports.at(-1)?.placements.map((placement) => [placement.where, placement.by]),
      ).toEqual(Array(9).fill(["outside", "creature"])),
    );
  });

  it("leave the hub no room, so a card the keeper opens there is set out as his own pane", async () => {
    const desktop = standingDesktop();
    const { feed, moves } = await steadWith(desktop);
    feed.emit(setOutside.slice(0, 3));
    await waitFor(() => expect(desktop.shows).toHaveLength(3), { timeout: 4000 });
    await waitFor(() => expect(moves).toHaveLength(1), { timeout: 4000 });
    const aside = aSetting({
      id: "aside",
      sessionId: conversationId,
      what: { kind: "note", ref: "One more thing in a line", title: "One more thing" },
    });
    feed.emit([proposed(30, aside)]);
    const card = await waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>(".kw-yard-card")].find((held) =>
        held.textContent?.includes("One more thing"),
      );
      if (found === undefined) throw new Error("the card is not on the rail yet");
      return found;
    });
    fireEvent.click(card);
    await waitFor(() => expect(desktop.shows).toHaveLength(4), { timeout: 4000 });
    expect(desktop.shows[3]).toMatchObject({
      title: "One more thing",
      origin: "keeper",
      focus: true,
    });
    expect(document.querySelectorAll(".kw-yard-reading")).toHaveLength(0);
    expect(document.querySelectorAll(".kw-setting")).toHaveLength(0);
    await waitFor(() => {
      const places = desktop.shows.map((show) => restingPlaceOf(desktop, show) as ScreenRect);
      expect(overlappingPairs([...places, asTheHub])).toBe(0);
    });
  });

  it("are told back as beside the conversation, with a note, where the console cannot make room for them", async () => {
    const desktop = standingDesktop();
    const { feed, reports, moves } = await steadWith(desktop, false);
    feed.emit(setOutside.slice(0, 6));
    await waitFor(
      () => {
        const told = reports.at(-1)?.placements ?? [];
        expect(told).toHaveLength(6);
        expect(told.every(isTold)).toBe(true);
      },
      { timeout: 4000 },
    );
    const told = reports.at(-1)?.placements ?? [];
    const outside = told.filter((placement) => placement.where === "outside");
    const beside = told.filter((placement) => placement.where === "beside");
    expect(moves).toEqual([]);
    expect(outside.length).toBeGreaterThan(0);
    expect(beside.length).toBeGreaterThan(0);
    expect(outside.every((placement) => placement.note === undefined)).toBe(true);
    expect(beside.map((placement) => [placement.by, placement.note])).toEqual(
      beside.map(() => ["console", "no room outside"]),
    );
    await waitFor(() => expect(desktop.shows).toHaveLength(outside.length));
    expect(document.querySelectorAll(".kw-setting")).toHaveLength(0);
  });
});

function isTold(placement: PlacementsReport["placements"][number]): boolean {
  return placement.where !== "outside" || placement.seat !== undefined;
}

function overlappingPairs(rects: readonly ScreenRect[]): number {
  return rects.flatMap((one, at) =>
    rects
      .slice(at + 1)
      .filter(
        (other) =>
          one.x < other.x + other.width &&
          other.x < one.x + one.width &&
          one.y < other.y + other.height &&
          other.y < one.y + one.height,
      ),
  ).length;
}
