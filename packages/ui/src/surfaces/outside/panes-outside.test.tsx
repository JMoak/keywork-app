import { type MotionPrefs, mulberry32 } from "@keywork-app/habitat";
import type { SettingSignal } from "@keywork-app/protocol";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { arrivalFadesAfterMs } from "../../chrome/signals.ts";
import type { LifecycleState } from "../../chrome/stamp.ts";
import type { OutsideKind } from "../feel/arrange.ts";
import { dealsToTry } from "../feel/arrangements.ts";
import { gathering, typingHold } from "../feel/choreography.ts";
import type { Authored } from "../feel/pattern-compose.ts";
import type { Desk, Glide, ScreenRect, SurfaceId, SurfaceShow, SurfacesPort } from "../port.ts";
import { type FakeDesktopOptions, fakeDesktop, turn } from "../runtime/testing.ts";
import { createPanesOutside, type PanesOutsideOptions, type Tenant } from "./panes-outside.tsx";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

const desk: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [{ bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 }],
  cursor: { x: 640, y: 480 },
};

const asTheHub: Desk = { ...desk, console: { x: 0, y: 0, width: 504, height: 1040 } };

const makingRoom = { makeRoom: async () => asTheHub } satisfies Partial<PanesOutsideOptions>;

const gliding: MotionPrefs = { reducedMotion: false, tier: "interact" };
const calm: MotionPrefs = { reducedMotion: true, tier: "interact" };

const byHand = { origin: "keeper", focus: true, follows: true } as const;
const byACreature = { origin: "creature", focus: false, follows: true } as const;

interface Failing {
  show?: boolean;
  desk?: boolean;
  focus?: boolean;
  stack?: boolean;
}

function bench(
  options: Partial<PanesOutsideOptions> = {},
  desktopOptions: FakeDesktopOptions = {},
  failing: Failing = {},
  restacks = false,
  standsOn: () => Desk = () => desk,
) {
  const desktop = fakeDesktop(desktopOptions);
  const shows: SurfaceShow[] = [];
  const glides: Glide[] = [];
  const stacks: SurfaceId[][] = [];
  const frames: Array<[SurfaceId, string | undefined]> = [];
  const refusals: string[] = [];
  const faults: string[] = [];
  const refusing = (what: string): Promise<never> =>
    Promise.reject(new Error(`the desktop would not ${what}`));
  const port: SurfacesPort = {
    ...desktop.port,
    desk: () =>
      failing.desk === true ? refusing("say where things are") : Promise.resolve(standsOn()),
    show: (request) => {
      shows.push(request);
      return failing.show === true ? refusing("show it") : desktop.port.show(request);
    },
    glide: (glide) => {
      glides.push(glide);
      return desktop.port.glide(glide);
    },
    focus: (id) => (failing.focus === true ? refusing("focus it") : desktop.port.focus(id)),
    frame: (id, frame) => {
      frames.push([id, frame]);
      return Promise.resolve();
    },
    ...(restacks && {
      stack: (bottomToTop: readonly SurfaceId[]) => {
        stacks.push([...bottomToTop]);
        return failing.stack === true ? refusing("restack them") : Promise.resolve();
      },
    }),
  };
  const outside = createPanesOutside({
    port,
    windows: { open: desktop.open },
    motion: () => calm,
    backdrop: () => "backdrop-token",
    insideHint: () => "ctrl+k enter",
    refused: (tenant, why) => refusals.push(`${tenant.key}: ${why}`),
    desktopRefused: (why) => faults.push(why),
    ...options,
  });
  cleanups.push(outside.dispose, desktop.closeEverything);
  const idOf = (key: string): SurfaceId => shows.find((show) => show.title === key)?.id ?? key;
  return { desktop, outside, shows, glides, stacks, frames, refusals, faults, idOf };
}

function paneNamed(key: string, kind: OutsideKind = "note", state: LifecycleState = "idle") {
  const home = document.createElement("div");
  home.setAttribute("data-pane-id", key);
  const body = document.createElement("section");
  body.className = "kw-frame";
  body.textContent = `${key} body`;
  home.append(body);
  document.body.append(home);
  const log: string[] = [];
  const [title, setTitle] = createSignal(key);
  const tenant: Tenant = {
    key,
    body,
    kind,
    facts: () => ({ title: title(), hueRank: 0, state }),
    left: () => log.push("left"),
    placed: (bounds, by) => log.push(`placed ${bounds.x},${bounds.y} by ${by}`),
    cameHome: () => log.push("came home"),
    askedInside: () => log.push("asked inside"),
    tookFocus: () => log.push("took focus"),
    lostFocus: () => log.push("lost focus"),
  };
  return { tenant, body, home, log, setTitle };
}

async function warmed<Bench extends ReturnType<typeof bench>>(made: Bench): Promise<Bench> {
  await turn();
  await turn();
  return made;
}

async function settled(): Promise<void> {
  for (let turns = 0; turns < 4; turns += 1) await turn();
}

function chromeOf(body: HTMLElement): HTMLElement {
  return body.ownerDocument.querySelector(".kw-surface") as HTMLElement;
}

function isInside(pane: ReturnType<typeof paneNamed>): boolean {
  return pane.body.parentElement === pane.home && pane.body.ownerDocument === document;
}

describe("a pane sent outside the window", () => {
  it("moves into a warm window, is framed there, and is shown where it comes to rest", async () => {
    const { outside, shows, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    const arrived = await outside.send(pane.tenant, byHand);
    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({
      id: "kw-surface:1",
      origin: "keeper",
      focus: true,
      follows: true,
      backdrop: "backdrop-token",
      title: "notes",
    });
    expect(arrived).toMatchObject({ id: "kw-surface:1", warm: true, bounds: shows[0]?.bounds });
    expect(pane.body.ownerDocument).toBe(desktop.opened[0]?.document);
    expect(pane.body.parentElement?.className).toBe("kw-surface-body");
    expect(pane.body.closest("[data-pane-id]")?.getAttribute("data-pane-id")).toBe("notes");
    expect(chromeOf(pane.body).getAttribute("data-arrival")).toBe("arrived");
    expect(pane.log).toEqual([
      "left",
      `placed ${shows[0]?.bounds.x},${shows[0]?.bounds.y} by host`,
      "took focus",
    ]);
    expect(outside.holdingFocus()).toBe("notes");
    expect(outside.has("notes")).toBe(true);
    expect(outside.keyAt(pane.body)).toBe("notes");
  });

  it("rests beside the console, clear of it and of the panes already standing", async () => {
    const { outside, shows } = await warmed(bench());
    await outside.send(paneNamed("first").tenant, byHand);
    await outside.send(paneNamed("second").tenant, byHand);
    const [first, second] = shows.map((show) => show.bounds) as [ScreenRect, ScreenRect];
    expect(first.x).toBeGreaterThanOrEqual(desk.console.x + desk.console.width);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    expect(second.x).toBe(first.x);
  });

  it("emerges from the console's edge and glides to its place when motion is welcome", async () => {
    const { outside, shows, glides } = await warmed(bench({ motion: () => gliding }));
    const pane = paneNamed("notes");
    const arrived = await outside.send(pane.tenant, byHand);
    await settled();
    expect(glides).toHaveLength(1);
    const target = glides[0]?.moves[0]?.bounds as ScreenRect;
    expect(glides[0]?.moves[0]?.id).toBe("kw-surface:1");
    expect(arrived?.bounds).toEqual(target);
    expect(shows[0]?.bounds).toMatchObject({ width: target.width, height: target.height });
    expect(shows[0]?.bounds.x).toBeLessThan(target.x);
    expect(chromeOf(pane.body).getAttribute("data-motion")).toBe("glide");
  });

  it("returns to the rectangle it last stood in while a display still shows it", async () => {
    const { outside, shows } = await warmed(bench());
    const last = { x: 1300, y: 500, width: 520, height: 400 };
    await outside.send(paneNamed("notes").tenant, { ...byHand, focus: false, last });
    expect(shows[0]?.bounds).toEqual(last);
    expect(shows[0]?.focus).toBe(false);
  });

  it("says a window that had to be opened for it was not warm", async () => {
    const { outside } = bench();
    const arrived = await outside.send(paneNamed("notes").tenant, byHand);
    expect(arrived?.warm).toBe(false);
  });

  it("leaves together with the panes sent in the same moment, each to its own place", async () => {
    const { outside, shows } = await warmed(bench());
    const sent = [paneNamed("a"), paneNamed("b"), paneNamed("c")].map((pane) =>
      outside.send(pane.tenant, { ...byHand, focus: false }),
    );
    await Promise.all(sent);
    expect(shows.map((show) => show.id).sort()).toEqual([
      "kw-surface:1",
      "kw-surface:2",
      "kw-surface:3",
    ]);
    const corners = new Set(shows.map((show) => `${show.bounds.x},${show.bounds.y}`));
    expect(corners.size).toBe(3);
  });

  it("stays inside, and says why, when no window opens for it", async () => {
    const { outside, refusals, shows } = bench({}, { refusesToOpen: true });
    const pane = paneNamed("notes");
    expect(await outside.send(pane.tenant, byHand)).toBeUndefined();
    expect(refusals).toEqual(["notes: no window could open for this pane"]);
    expect(shows).toEqual([]);
    expect(isInside(pane)).toBe(true);
    expect(outside.has("notes")).toBe(false);
  });

  it("comes back inside, and says why, when the desktop will not show it", async () => {
    const { outside, refusals } = await warmed(bench({}, {}, { show: true }));
    const pane = paneNamed("notes");
    expect(await outside.send(pane.tenant, byHand)).toBeUndefined();
    expect(refusals).toEqual(["notes: the desktop would not show it"]);
    expect(isInside(pane)).toBe(true);
    expect(pane.log.at(-1)).toBe("came home");
    expect(outside.has("notes")).toBe(false);
  });

  it("is sent once: asking again while it stands outside changes nothing", async () => {
    const { outside, shows } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    expect(await outside.send(pane.tenant, byHand)).toBeUndefined();
    expect(shows).toHaveLength(1);
  });
});

describe("the frame a pane wears outside", () => {
  it("names the pane, follows its title, and carries the key that brings it inside", async () => {
    const { outside } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    const chrome = chromeOf(pane.body);
    expect(chrome.getAttribute("aria-label")).toBe("notes pane, outside the window");
    pane.setTitle("field notes");
    expect(chrome.getAttribute("aria-label")).toBe("field notes pane, outside the window");
    expect(chrome.querySelector(".kw-surface-inside")?.getAttribute("title")).toContain(
      "ctrl+k enter",
    );
    expect(chrome.textContent).not.toMatch(/surface/i);
  });

  it("asks the pane's owner to bring it inside when its button is pressed", async () => {
    const { outside } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    chromeOf(pane.body).querySelector<HTMLButtonElement>(".kw-surface-inside")?.click();
    expect(pane.log.at(-1)).toBe("asked inside");
  });

  it("lights while its window holds the keeper's focus, and tells the owner both ways", async () => {
    const { outside, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byACreature);
    const chrome = chromeOf(pane.body);
    expect(chrome.hasAttribute("data-focused")).toBe(false);
    expect(outside.holdingFocus()).toBeUndefined();
    desktop.emit({ kind: "focused", id: "kw-surface:1" });
    expect(chrome.hasAttribute("data-focused")).toBe(true);
    expect(outside.holdingFocus()).toBe("notes");
    desktop.emit({ kind: "blurred", id: "kw-surface:1" });
    expect(chrome.hasAttribute("data-focused")).toBe(false);
    expect(outside.holdingFocus()).toBeUndefined();
    expect(pane.log.slice(-2)).toEqual(["took focus", "lost focus"]);
  });

  it("can take focus from the ground the pane stands on", async () => {
    const { outside } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    expect(pane.body.closest<HTMLElement>("[data-pane-id]")?.tabIndex).toBe(-1);
  });
});

describe("a pane standing outside", () => {
  it("tells its owner where the keeper put it, and where the host carried it", async () => {
    const { outside, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    desktop.emit({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { x: 40, y: 60, width: 480, height: 320 },
      by: "keeper",
    });
    desktop.emit({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { x: 90, y: 60, width: 480, height: 320 },
      by: "host",
    });
    expect(pane.log.slice(-2)).toEqual(["placed 40,60 by keeper", "placed 90,60 by host"]);
  });

  it("flies home and is hidden before its body returns where it sat", async () => {
    const { outside, desktop, glides } = await warmed(bench({ motion: () => gliding }));
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    await settled();
    const before = glides.length;
    const home = await outside.recall(["notes"]);
    expect(home).toEqual(["notes"]);
    expect(glides).toHaveLength(before + 1);
    expect(desktop.calls.filter((call) => call === "hide kw-surface:1")).not.toEqual([]);
    expect(isInside(pane)).toBe(true);
    expect(outside.has("notes")).toBe(false);
    expect(pane.log).not.toContain("came home");
  });

  it("hands the keeper's focus back to the console when the pane that held it comes home", async () => {
    const { outside, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    desktop.emit({ kind: "focused", id: "kw-surface:1" });
    await outside.recall(["notes"]);
    expect(desktop.calls).toContain("focus console");
    expect(outside.holdingFocus()).toBeUndefined();
  });

  it("leaves the console's focus alone when a pane the keeper was not in comes home", async () => {
    const { outside, desktop } = await warmed(bench());
    await outside.send(paneNamed("notes").tenant, byACreature);
    await outside.recall(["notes"]);
    expect(desktop.calls).not.toContain("focus console");
  });

  it("comes home at once when its window is closed underneath it", async () => {
    const { outside, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    desktop.emit({ kind: "closed", id: "kw-surface:1" });
    expect(isInside(pane)).toBe(true);
    expect(pane.log.at(-1)).toBe("came home");
    expect(outside.has("notes")).toBe(false);
    expect(await outside.recall(["notes"])).toEqual([]);
  });

  it("goes home without a word when its pane is closed", async () => {
    const { outside, desktop } = await warmed(bench());
    const pane = paneNamed("notes");
    await outside.send(pane.tenant, byHand);
    outside.gone("notes");
    expect(isInside(pane)).toBe(true);
    expect(pane.log).not.toContain("came home");
    expect(desktop.calls.some((call) => /^(hide|close) kw-surface:1$/.test(call))).toBe(true);
  });

  it("never leaves when it is called back before a window opened for it", async () => {
    const { outside, shows } = bench({}, { announces: false });
    const pane = paneNamed("notes");
    const sending = outside.send(pane.tenant, byHand);
    await turn();
    expect(outside.has("notes")).toBe(true);
    expect(await outside.recall(["notes"])).toEqual([]);
    expect(await sending).toBeUndefined();
    expect(isInside(pane)).toBe(true);
    expect(shows).toEqual([]);
    expect(pane.log).toEqual([]);
  });

  it("takes the keeper's focus when asked, once it is showing", async () => {
    const { outside, desktop } = await warmed(bench());
    await outside.send(paneNamed("notes").tenant, byACreature);
    outside.focus("notes");
    outside.focus("nobody");
    expect(desktop.calls.filter((call) => call.startsWith("focus "))).toEqual([
      "focus kw-surface:1",
    ]);
  });
});

describe("what a creature sets outside", () => {
  it("waits for a pause in the keeper's typing, and for no longer than the longest hold", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const { outside, shows } = bench();
    await vi.advanceTimersByTimeAsync(10);
    const type = (): boolean => document.body.dispatchEvent(new KeyboardEvent("keydown"));
    type();
    void outside.send(paneNamed("note").tenant, byACreature);
    await vi.advanceTimersByTimeAsync(typingHold.quietMs - 1);
    expect(shows).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(shows.map((show) => show.origin)).toEqual(["creature"]);

    type();
    void outside.send(paneNamed("another").tenant, byACreature);
    for (let typed = 0; typed < typingHold.longestMs - 100; typed += 100) {
      await vi.advanceTimersByTimeAsync(100);
      type();
    }
    expect(shows).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(120);
    expect(shows).toHaveLength(2);
  });

  it("arrives at once while the keeper is not typing, and never asks for focus", async () => {
    const { outside, shows } = await warmed(bench());
    await outside.send(paneNamed("note").tenant, byACreature);
    expect(shows[0]).toMatchObject({ origin: "creature", focus: false, follows: true });
  });

  it("does not hold what the keeper sends by hand while typing", async () => {
    const { outside, shows } = await warmed(bench());
    document.body.dispatchEvent(new KeyboardEvent("keydown"));
    await outside.send(paneNamed("notes").tenant, byHand);
    expect(shows).toHaveLength(1);
  });
});

describe("spreading the panes outside", () => {
  const stacked = { x: 1300, y: 200, width: 520, height: 400 };

  async function twoStacked(made: ReturnType<typeof bench>) {
    const first = paneNamed("first");
    const second = paneNamed("second");
    await made.outside.send(first.tenant, { ...byHand, last: stacked });
    await made.outside.send(second.tenant, { ...byHand, last: { ...stacked, x: 1320, y: 220 } });
    await settled();
    return { first, second };
  }

  it("says so when no pane is outside", async () => {
    const { outside } = await warmed(bench());
    expect(await outside.toggleSpread()).toBe("nothing-outside");
  });

  it("moves overlapping panes apart, and puts each back where it stood on the next press", async () => {
    const made = await warmed(bench());
    await twoStacked(made);
    const before = made.glides.length;
    expect(await made.outside.toggleSpread()).toBe("spread");
    const apart = made.glides[before]?.moves ?? [];
    expect(apart.map((move) => move.id).sort()).toEqual(["kw-surface:1", "kw-surface:2"]);
    const [one, other] = apart.map((move) => move.bounds) as [ScreenRect, ScreenRect];
    expect(one.x + one.width <= other.x || other.x + other.width <= one.x).toBe(true);
    expect(await made.outside.toggleSpread()).toBe("gathered");
    const back = made.glides[before + 1]?.moves ?? [];
    expect(back).toEqual(
      expect.arrayContaining([
        { id: "kw-surface:1", bounds: stacked },
        { id: "kw-surface:2", bounds: { ...stacked, x: 1320, y: 220 } },
      ]),
    );
  });

  it("keeps the places the panes stood in while they are spread, whatever the host reports", async () => {
    const made = await warmed(bench());
    const { first } = await twoStacked(made);
    await made.outside.toggleSpread();
    const placedBefore = first.log.filter((line) => line.startsWith("placed")).length;
    made.desktop.emit({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { ...stacked, x: 20, y: 20 },
      by: "host",
    });
    expect(first.log.filter((line) => line.startsWith("placed"))).toHaveLength(placedBefore);
  });

  it("lets the keeper take a pane out of the spread by moving it", async () => {
    const made = await warmed(bench());
    const { first } = await twoStacked(made);
    await made.outside.toggleSpread();
    const moved = { ...stacked, x: 700, y: 640 };
    made.desktop.emit({ kind: "moved", id: "kw-surface:1", bounds: moved, by: "keeper" });
    expect(first.log.at(-1)).toBe("placed 700,640 by keeper");
    const before = made.glides.length;
    await made.outside.toggleSpread();
    expect(made.glides[before]?.moves.map((move) => move.id)).toEqual(["kw-surface:2"]);
  });

  it("leaves alone a pane that fills its display, as a maximised one does", async () => {
    const made = await warmed(bench());
    await twoStacked(made);
    made.desktop.emit({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { x: -7, y: -7, width: 1934, height: 1054 },
      by: "keeper",
    });
    const before = made.glides.length;
    expect(await made.outside.toggleSpread()).toBe("spread");
    expect((made.glides[before]?.moves ?? []).map((move) => move.id)).not.toContain("kw-surface:1");
  });

  it("says nothing can spread when the only pane outside fills its display", async () => {
    const made = await warmed(bench());
    await made.outside.send(paneNamed("only").tenant, byHand);
    made.desktop.emit({
      kind: "moved",
      id: "kw-surface:1",
      bounds: { x: -7, y: -7, width: 1934, height: 1054 },
      by: "keeper",
    });
    expect(await made.outside.toggleSpread()).toBe("nothing-to-spread");
  });
});

describe("the order panes outside stand in", () => {
  const quietly = { ...byHand, focus: false } as const;
  const focusCalls = (made: ReturnType<typeof bench>): string[] =>
    made.desktop.calls.filter((call) => call.startsWith("focus "));

  async function threeByHand(made: ReturnType<typeof bench>) {
    for (const key of ["first", "second", "third"]) {
      await made.outside.send(paneNamed(key).tenant, byHand);
    }
    return made;
  }

  it("raises the pane the keeper focuses above the others, then hands it the focus", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, {}, true)));
    expect(made.stacks).toEqual([]);
    made.outside.focus("first");
    expect(made.stacks).toEqual([[made.idOf("second"), made.idOf("third"), made.idOf("first")]]);
    expect(made.desktop.calls.at(-1)).toBe(`focus ${made.idOf("first")}`);
  });

  it("does not restack for the pane already on top", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, {}, true)));
    made.outside.focus("third");
    expect(made.stacks).toEqual([]);
    expect(made.desktop.calls.at(-1)).toBe(`focus ${made.idOf("third")}`);
  });

  it("remembers the pane the keeper clicked as the one on top, without restacking", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, {}, true)));
    made.desktop.emit({ kind: "focused", id: made.idOf("first") });
    expect(made.stacks).toEqual([]);
    made.outside.focus("second");
    expect(made.stacks).toEqual([[made.idOf("third"), made.idOf("first"), made.idOf("second")]]);
  });

  it("sends a pane behind the others and names the one now on top", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, {}, true)));
    expect(made.outside.sendBehind("third")).toBe("second");
    expect(made.stacks).toEqual([[made.idOf("third"), made.idOf("first"), made.idOf("second")]]);
    expect(focusCalls(made)).toEqual([]);
  });

  it("has nothing to send a lone pane behind", async () => {
    const made = await warmed(bench({}, {}, {}, true));
    await made.outside.send(paneNamed("only").tenant, byHand);
    expect(made.outside.sendBehind("only")).toBeUndefined();
    expect(made.outside.sendBehind("nobody")).toBeUndefined();
    expect(made.stacks).toEqual([]);
  });

  it("keeps the order, and still names the next pane, when the host cannot restack", async () => {
    const made = await threeByHand(await warmed(bench()));
    made.outside.focus("first");
    expect(made.outside.sendBehind("first")).toBe("third");
    expect(focusCalls(made)).toEqual([`focus ${made.idOf("first")}`]);
    await settled();
    expect(made.faults).toEqual([]);
  });

  it("slips a creature's pane under the one the keeper is in, and never restacks for it", async () => {
    const made = await warmed(bench({}, {}, {}, true));
    await made.outside.send(paneNamed("first").tenant, byHand);
    await made.outside.send(paneNamed("second").tenant, byHand);
    await made.outside.send(paneNamed("note").tenant, byACreature);
    await settled();
    expect(made.stacks).toEqual([]);
    expect(focusCalls(made)).toEqual([]);
    made.outside.focus("first");
    expect(made.stacks).toEqual([[made.idOf("note"), made.idOf("second"), made.idOf("first")]]);
  });

  it("restacks panes restored together in the order they were sent, once they have appeared", async () => {
    const made = await warmed(bench({}, {}, {}, true));
    await Promise.all(
      ["oldest", "newer", "newest"].map((key) => made.outside.send(paneNamed(key).tenant, quietly)),
    );
    await settled();
    expect(made.stacks).toEqual([[made.idOf("oldest"), made.idOf("newer"), made.idOf("newest")]]);
    expect(focusCalls(made)).toEqual([]);
  });

  it("says so when the desktop will not restack panes that are all still outside", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, { stack: true }, true)));
    made.outside.focus("first");
    await settled();
    expect(made.faults).toEqual(["the desktop would not restack them"]);
  });

  it("expects a restack to be refused when one of its panes came inside meanwhile", async () => {
    const made = await threeByHand(await warmed(bench({}, {}, { stack: true }, true)));
    made.outside.focus("first");
    made.outside.gone("second");
    await settled();
    expect(made.faults).toEqual([]);
  });
});

describe("handing a pane outside the keeper's focus", () => {
  it("says so when the desktop refuses a pane that still stands outside", async () => {
    const made = await warmed(bench({}, {}, { focus: true }));
    await made.outside.send(paneNamed("notes").tenant, byACreature);
    made.outside.focus("notes");
    await settled();
    expect(made.faults).toEqual(["the desktop would not focus it"]);
  });

  it("expects the refusal when the pane came inside before the desktop answered", async () => {
    const made = await warmed(bench({}, {}, { focus: true }));
    await made.outside.send(paneNamed("notes").tenant, byACreature);
    made.outside.focus("notes");
    made.outside.gone("notes");
    await settled();
    expect(made.faults).toEqual([]);
  });

  it("asks nothing of the desktop for a pane on its way home", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    await made.outside.send(paneNamed("notes").tenant, byACreature);
    await settled();
    const leaving = made.outside.recall(["notes"]);
    made.outside.focus("notes");
    await leaving;
    expect(made.desktop.calls.filter((call) => call.startsWith("focus "))).toEqual([]);
  });
});

describe("the letters that jump to a pane outside", () => {
  const left = { x: 1200, y: 100, width: 300, height: 300 };
  const right = { x: 1560, y: 120, width: 300, height: 300 };

  async function twoApart(made: ReturnType<typeof bench>) {
    const east = paneNamed("east");
    const west = paneNamed("west");
    await made.outside.send(east.tenant, { ...byHand, last: right });
    await made.outside.send(west.tenant, { ...byHand, last: left });
    return { east, west };
  }

  const letterOn = (pane: ReturnType<typeof paneNamed>): string | undefined =>
    chromeOf(pane.body).querySelector(".kw-surface-hint")?.textContent ?? undefined;

  it("says there is nothing to letter while no pane is outside", async () => {
    const { outside } = await warmed(bench());
    expect(outside.toggleHints()).toBe("nothing-outside");
    expect(outside.hinting()).toBe(false);
  });

  it("letters each pane in reading order where it stands, and takes them off when asked again", async () => {
    const made = await warmed(bench());
    const { east, west } = await twoApart(made);
    expect(made.outside.toggleHints()).toBe("shown");
    expect(made.outside.hinting()).toBe(true);
    expect([letterOn(west), letterOn(east)]).toEqual(["a", "s"]);
    expect(made.outside.toggleHints()).toBe("hidden");
    expect([letterOn(west), letterOn(east)]).toEqual([undefined, undefined]);
  });

  it("names the pane whose letter was typed and takes every letter off", async () => {
    const made = await warmed(bench());
    const { east, west } = await twoApart(made);
    made.outside.toggleHints();
    expect(made.outside.pickHint(["s"])).toBe("east");
    expect(made.outside.hinting()).toBe(false);
    expect([letterOn(west), letterOn(east)]).toEqual([undefined, undefined]);
    expect(made.desktop.calls.filter((call) => call.startsWith("focus "))).toEqual([]);
  });

  it("reads a key by what it types, then by where it sits on the keyboard", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    made.outside.toggleHints();
    expect(made.outside.pickHint(["ф", "a"])).toBe("west");
  });

  it("ends without a pane on escape, or on any key no pane wears", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    made.outside.toggleHints();
    expect(made.outside.pickHint(["escape"])).toBeUndefined();
    expect(made.outside.hinting()).toBe(false);
    made.outside.toggleHints();
    expect(made.outside.pickHint(["z"])).toBeUndefined();
    expect(made.outside.hinting()).toBe(false);
  });

  it("answers nothing to a letter once the letters are off", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    expect(made.outside.pickHint(["a"])).toBeUndefined();
  });

  it("takes the letters off when the last pane outside comes home", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    made.outside.toggleHints();
    await made.outside.recall(["east", "west"]);
    expect(made.outside.hinting()).toBe(false);
  });

  it("is disposed with its letters showing after its windows have closed, leaving their pages alone", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    made.outside.toggleHints();
    made.desktop.closeEverything();
    expect(() => made.outside.dispose()).not.toThrow();
  });

  it("letters the panes as they spread, and gathers them again when one is picked", async () => {
    const made = await warmed(bench());
    const stacked = { x: 1300, y: 200, width: 520, height: 400 };
    const under = paneNamed("under");
    const over = paneNamed("over");
    await made.outside.send(under.tenant, { ...byHand, last: stacked });
    await made.outside.send(over.tenant, { ...byHand, last: { ...stacked, x: 1320, y: 220 } });
    await settled();
    expect(await made.outside.toggleSpread()).toBe("spread");
    expect(made.outside.hinting()).toBe(true);
    expect([letterOn(under), letterOn(over)].sort()).toEqual(["a", "s"]);
    const before = made.glides.length;
    expect(made.outside.pickHint([letterOn(under) ?? ""])).toBe("under");
    expect(made.glides[before]?.moves).toEqual(
      expect.arrayContaining([
        { id: made.idOf("under"), bounds: stacked },
        { id: made.idOf("over"), bounds: { ...stacked, x: 1320, y: 220 } },
      ]),
    );
    expect(await made.outside.toggleSpread()).toBe("spread");
  });

  it("leaves the panes spread when the letters are dismissed, and takes the letters off on gathering", async () => {
    const made = await warmed(bench());
    await twoApart(made);
    await made.outside.send(paneNamed("over").tenant, { ...byHand, last: { ...left, x: 1220 } });
    await settled();
    expect(await made.outside.toggleSpread()).toBe("spread");
    const before = made.glides.length;
    made.outside.pickHint(["escape"]);
    expect(made.glides).toHaveLength(before);
    expect(made.outside.hinting()).toBe(false);
    expect(await made.outside.toggleSpread()).toBe("gathered");
    expect(made.outside.hinting()).toBe(false);
  });

  it("letters sixteen panes piled over one another as they spread, each still outside", async () => {
    const made = await warmed(bench());
    const piled = Array.from({ length: 16 }, (_, at) => paneNamed(`pane-${at}`));
    await Promise.all(
      piled.map((pane, at) =>
        made.outside.send(pane.tenant, {
          ...byACreature,
          last: { x: 700 + (at % 4) * 32, y: 72 + (at % 3) * 32, width: 480, height: 619 },
        }),
      ),
    );
    await settled();
    expect(await made.outside.toggleSpread()).toBe("spread");
    expect(piled.map(letterOn).toSorted().join("")).toBe("adefghjklqrstuwy");
    expect(piled.every((pane) => made.outside.has(pane.tenant.key))).toBe(true);
    expect(made.glides.at(-1)?.moves).toHaveLength(16);
    expect(made.faults).toEqual([]);
    expect(made.refusals).toEqual([]);
  });
});

describe("a pane outside moved and sized by key", () => {
  const stood = { x: 1300, y: 500, width: 520, height: 400 };
  const maximised = { x: -7, y: -7, width: 1934, height: 1054 };

  async function standing(made: ReturnType<typeof bench>, last: ScreenRect = stood) {
    const pane = paneNamed("notes");
    await made.outside.send(pane.tenant, { ...byHand, last });
    await settled();
    return pane;
  }

  const lastGlide = (made: ReturnType<typeof bench>): ScreenRect | undefined =>
    made.glides.at(-1)?.moves[0]?.bounds;

  it("glides to the next stop on its display's grid and tells its owner the keeper put it there", async () => {
    const made = await warmed(bench());
    const pane = await standing(made);
    const before = made.glides.length;
    expect(await made.outside.stepAcross("notes", "left")).toBe("moved");
    expect(made.glides[before]?.moves).toEqual([
      { id: made.idOf("notes"), bounds: { ...stood, x: 1284 } },
    ]);
    expect(pane.log.at(-1)).toBe("placed 1284,500 by keeper");
  });

  it("steps on from where the last step is taking it", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    const pane = await standing(made);
    await Promise.all([
      made.outside.stepAcross("notes", "up"),
      made.outside.stepAcross("notes", "up"),
    ]);
    expect(pane.log.at(-1)).toBe("placed 1300,354 by keeper");
  });

  it("stops a gap from the console's edge on its way across", async () => {
    const made = await warmed(bench());
    const pane = await standing(made);
    await made.outside.stepAcross("notes", "left");
    await made.outside.stepAcross("notes", "left");
    expect(pane.log.at(-1)).toBe("placed 1112,500 by keeper");
  });

  it("lines up a gap below another pane outside", async () => {
    const made = await warmed(bench());
    await made.outside.send(paneNamed("other").tenant, {
      ...byHand,
      last: { x: 1500, y: 100, width: 300, height: 200 },
    });
    const pane = await standing(made, { x: 1440, y: 340, width: 300, height: 300 });
    await made.outside.stepAcross("notes", "up");
    expect(pane.log.at(-1)).toBe("placed 1440,312 by keeper");
  });

  it("stays, and moves nothing, at the last stop before the edge of its display", async () => {
    const made = await warmed(bench());
    const pane = await standing(made, { ...stood, x: 1388 });
    const before = made.glides.length;
    expect(await made.outside.stepAcross("notes", "right")).toBe("stays");
    expect(made.glides).toHaveLength(before);
    expect(pane.log.at(-1)).not.toMatch(/by keeper$/);
  });

  it("grows and shrinks along the named sizes from its corner, as the keeper's own doing", async () => {
    const made = await warmed(bench());
    const pane = await standing(made, { x: 1200, y: 300, width: 520, height: 400 });
    expect(await made.outside.stepSize("notes", 1)).toBe("moved");
    expect(lastGlide(made)).toEqual({ x: 1200, y: 300, width: 624, height: 624 });
    expect(await made.outside.stepSize("notes", -1)).toBe("moved");
    expect(lastGlide(made)).toEqual({ x: 1200, y: 300, width: 624, height: 320 });
    expect(await made.outside.stepSize("notes", -1)).toBe("moved");
    expect(lastGlide(made)).toEqual({ x: 1200, y: 300, width: 624, height: 160 });
    expect(await made.outside.stepSize("notes", -1)).toBe("stays");
    expect(pane.log.at(-1)).toBe("placed 1200,300 by keeper");
  });

  it("sizes a pane of code to its eighty columns", async () => {
    const made = await warmed(bench());
    const pane = paneNamed("source", "file");
    await made.outside.send(pane.tenant, {
      ...byHand,
      last: { x: 300, y: 200, width: 720, height: 300 },
    });
    await settled();
    await made.outside.stepSize("source", 1);
    expect(lastGlide(made)).toEqual({ x: 300, y: 200, width: 942, height: 320 });
  });

  it("fills its display at the largest size, steps back down from there, and has nowhere to go across", async () => {
    const made = await warmed(bench());
    await standing(made, { x: 966, y: 12, width: 942, height: 1016 });
    expect(await made.outside.stepSize("notes", 1)).toBe("moved");
    expect(lastGlide(made)).toEqual(laptop);
    expect(await made.outside.stepSize("notes", 1)).toBe("stays");
    expect(await made.outside.stepAcross("notes", "left")).toBe("fills-its-display");
    expect(await made.outside.stepSize("notes", -1)).toBe("moved");
    expect(lastGlide(made)).toEqual({ x: 12, y: 12, width: 942, height: 1016 });
  });

  it("leaves a pane the system maximised as it is", async () => {
    const made = await warmed(bench());
    await standing(made);
    made.desktop.emit({ kind: "moved", id: made.idOf("notes"), bounds: maximised, by: "keeper" });
    const before = made.glides.length;
    expect(await made.outside.stepAcross("notes", "left")).toBe("fills-its-display");
    expect(await made.outside.stepSize("notes", -1)).toBe("fills-its-display");
    expect(made.glides).toHaveLength(before);
  });

  it("takes a pane out of the spread, where it was put by key", async () => {
    const made = await warmed(bench());
    const pane = await standing(made);
    await made.outside.send(paneNamed("other").tenant, {
      ...byHand,
      last: { ...stood, x: 1320, y: 520 },
    });
    await settled();
    await made.outside.toggleSpread();
    await made.outside.stepAcross("notes", "down");
    expect(pane.log.at(-1)).toMatch(/by keeper$/);
    const before = made.glides.length;
    await made.outside.toggleSpread();
    expect(made.glides[before]?.moves.map((move) => move.id)).toEqual([made.idOf("other")]);
  });

  it("moves nothing for a pane that is not outside", async () => {
    const made = await warmed(bench());
    expect(await made.outside.stepAcross("nobody", "left")).toBe("not-outside");
    expect(await made.outside.stepSize("nobody", 1)).toBe("not-outside");
  });
});

describe("what the desktop will not tell or do", () => {
  it("answers with no desk, and says why", async () => {
    const made = await warmed(bench({}, {}, { desk: true }));
    expect(await made.outside.desk()).toBeUndefined();
    expect(made.faults).toEqual(["the desktop would not say where things are"]);
  });

  it("leaves the panes where they are, and says why, when it cannot learn where to move them", async () => {
    const failing: Failing = {};
    const made = await warmed(bench({}, {}, failing));
    await made.outside.send(paneNamed("notes").tenant, byHand);
    await made.outside.send(paneNamed("other").tenant, byHand);
    await settled();
    failing.desk = true;
    const before = made.glides.length;
    expect(await made.outside.toggleSpread()).toBe("desktop-refused");
    expect(await made.outside.stepAcross("notes", "left")).toBe("desktop-refused");
    expect(made.glides).toHaveLength(before);
    expect(made.faults).toEqual([
      "the desktop would not say where things are",
      "the desktop would not say where things are",
    ]);
  });

  it("still brings a pane home, and says why it could not fly there", async () => {
    const failing: Failing = {};
    const made = await warmed(bench({ motion: () => gliding }, {}, failing));
    const pane = paneNamed("notes");
    await made.outside.send(pane.tenant, byACreature);
    await settled();
    failing.desk = true;
    expect(await made.outside.recall(["notes"])).toEqual(["notes"]);
    expect(isInside(pane)).toBe(true);
    expect(made.faults).toEqual(["the desktop would not say where things are"]);
  });
});

describe("where the panes outside stand, for whoever steers between them", () => {
  it("lists each resting pane by its key, and none that is on its way home", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    const last = { x: 1300, y: 500, width: 520, height: 400 };
    await made.outside.send(paneNamed("notes").tenant, { ...byHand, last });
    await settled();
    expect([...made.outside.places()]).toEqual([["notes", last]]);
    const leaving = made.outside.recall(["notes"]);
    expect(made.outside.places().size).toBe(0);
    await leaving;
  });
});

const quietly = { ...byHand, focus: false } as const;

const stackedAt = { x: 1300, y: 200, width: 520, height: 400 };

function roomOf(rect: ScreenRect): number {
  return rect.width * rect.height;
}

function overlapping(rects: readonly ScreenRect[]): Array<[ScreenRect, ScreenRect]> {
  return rects.flatMap((one, at) =>
    rects
      .slice(at + 1)
      .filter(
        (other) =>
          one.x < other.x + other.width &&
          other.x < one.x + one.width &&
          one.y < other.y + other.height &&
          other.y < one.y + one.height,
      )
      .map((other): [ScreenRect, ScreenRect] => [one, other]),
  );
}

async function sentTogether(
  made: ReturnType<typeof bench>,
  count: number,
  sending: Parameters<ReturnType<typeof bench>["outside"]["send"]>[1] = quietly,
  called = "pane",
) {
  const panes = Array.from({ length: count }, (_, at) => paneNamed(`${called}-${at}`));
  await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, sending)));
  await settled();
  return panes;
}

describe("a burst of panes arriving together", () => {
  it("lands three as a column of the same named size beside the console, top to bottom", async () => {
    const made = await warmed(bench());
    await sentTogether(made, 3);
    const places = made.shows.map((show) => show.bounds);
    expect(made.shows.map((show) => show.title)).toEqual(["pane-0", "pane-1", "pane-2"]);
    expect(places.map((place) => [place.x, place.width, place.height])).toEqual(
      Array(3).fill([desk.console.x + desk.console.width + 12, 624, 320]),
    );
    expect(places.map((place) => place.y)).toEqual([44, 376, 708]);
    expect(overlapping(places)).toEqual([]);
  });

  it("deals eight into a named arrangement where none overlaps, and tells each its seat", async () => {
    const made = await warmed(bench());
    const panes = await sentTogether(made, 8);
    const places = [...made.outside.places().values()];
    expect(places).toHaveLength(8);
    expect(overlapping(places)).toEqual([]);
    expect(places.filter((place) => place.height === laptop.height - 24)).toHaveLength(1);
    expect(Math.min(...places.map((place) => place.x))).toBe(desk.console.x + 128);
    for (const pane of panes) {
      expect(pane.log.filter((line) => /^placed \d+,\d+ by host$/.test(line))).toHaveLength(1);
    }
    expect(await made.outside.deal()).toEqual({ name: "ledger", turn: 2, of: 4 });
  });

  it("starts each a slight step after the last, in the arrangement's order, without the travel when calm", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench();
    await vi.advanceTimersByTimeAsync(10);
    for (const key of ["a", "b", "c", "d"]) void made.outside.send(paneNamed(key).tenant, quietly);
    await vi.advanceTimersByTimeAsync(1);
    expect(made.shows.map((show) => show.title)).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(58);
    expect(made.shows).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(made.shows.map((show) => show.title)).toEqual(["a", "b"]);
    await vi.advanceTimersByTimeAsync(120);
    expect(made.shows.map((show) => show.title)).toEqual(["a", "b", "c", "d"]);
    expect(made.glides).toEqual([]);
  });

  it("glides each from the console's edge on its own turn when motion is welcome", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench({ motion: () => gliding });
    await vi.advanceTimersByTimeAsync(10);
    for (const key of ["a", "b", "c"]) void made.outside.send(paneNamed(key).tenant, quietly);
    await vi.advanceTimersByTimeAsync(1);
    expect(made.glides.map((glide) => glide.moves.length)).toEqual([1]);
    await vi.advanceTimersByTimeAsync(60);
    expect(made.glides).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60);
    expect(made.glides.map((glide) => glide.moves[0]?.id)).toEqual(
      made.shows.map((show) => show.id),
    );
    expect(made.shows.map((show) => show.title)).toEqual(["a", "b", "c"]);
  });

  it("restacks a creature's burst in the order it arrived, under the pane the keeper is in", async () => {
    const made = await warmed(bench({}, {}, {}, true));
    await made.outside.send(paneNamed("mine").tenant, byHand);
    await sentTogether(made, 3, byACreature, "note");
    expect(made.stacks).toEqual([
      [made.idOf("note-0"), made.idOf("note-1"), made.idOf("note-2"), made.idOf("mine")],
    ]);
    expect(made.desktop.calls.filter((call) => call.startsWith("focus "))).toEqual([]);
    expect(made.outside.holdingFocus()).toBe("mine");
    expect(made.shows.slice(1).every((show) => show.focus === false)).toBe(true);
  });

  it("stacks a dealt burst in the order its wave arrives", async () => {
    const made = await warmed(bench({}, {}, {}, true));
    await sentTogether(made, 8);
    expect(made.stacks).toEqual([made.shows.map((show) => show.id)]);
    expect(new Set(made.stacks[0]).size).toBe(8);
  });

  it("gives the largest seat to the pane that waits on the keeper, wherever it comes in the burst", async () => {
    const made = await warmed(bench());
    const panes = Array.from({ length: 9 }, (_, at) =>
      paneNamed(`pane-${at}`, "note", at === 6 ? "needs-you" : "idle"),
    );
    await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, quietly)));
    await settled();
    const places = made.outside.places();
    const largest = Math.max(...[...places.values()].map(roomOf));
    expect(roomOf(places.get("pane-6") as ScreenRect)).toBe(largest);
    expect([...places.values()].filter((place) => roomOf(place) === largest)).toHaveLength(1);
  });

  it("keeps the places panes return to, and deals the rest around none of them", async () => {
    const made = await warmed(bench());
    const kept = { x: 20, y: 400, width: 90, height: 200 };
    const returning = paneNamed("returning");
    const sent = [
      made.outside.send(returning.tenant, { ...quietly, last: kept }),
      ...Array.from({ length: 8 }, (_, at) =>
        made.outside.send(paneNamed(`pane-${at}`).tenant, quietly),
      ),
    ];
    await Promise.all(sent);
    await settled();
    expect(made.outside.places().get("returning")).toEqual(kept);
    expect(made.shows[0]?.title).toBe("returning");
    expect(overlapping([...made.outside.places().values()])).toEqual([]);
  });
});

describe("what a creature sets outside in the same moment", () => {
  it("is gathered into one burst and arranged together, after a wait too short to notice", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench();
    await vi.advanceTimersByTimeAsync(10);
    void made.outside.send(paneNamed("first").tenant, byACreature);
    await vi.advanceTimersByTimeAsync(10);
    void made.outside.send(paneNamed("second").tenant, byACreature);
    await vi.advanceTimersByTimeAsync(gathering.quietMs - 1);
    expect(made.shows).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(made.shows.map((show) => show.title)).toEqual(["first"]);
    await vi.advanceTimersByTimeAsync(60);
    expect(made.shows.map((show) => show.title)).toEqual(["first", "second"]);
    const [first, second] = made.shows.map((show) => show.bounds) as [ScreenRect, ScreenRect];
    expect(second).toEqual({ ...first, y: first.y + first.height + 12 });
    expect(gathering.longestMs).toBeLessThan(50);
  });

  it("shows a lone arrival once the short wait for company is over", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench();
    await vi.advanceTimersByTimeAsync(10);
    void made.outside.send(paneNamed("alone").tenant, byACreature);
    await vi.advanceTimersByTimeAsync(gathering.quietMs - 1);
    expect(made.shows).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(made.shows.map((show) => show.title)).toEqual(["alone"]);
  });

  it("never makes the keeper's own pane wait with it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench();
    await vi.advanceTimersByTimeAsync(10);
    void made.outside.send(paneNamed("theirs").tenant, byACreature);
    void made.outside.send(paneNamed("mine").tenant, byHand);
    await vi.advanceTimersByTimeAsync(1);
    expect(made.shows.map((show) => show.title)).toEqual(["mine"]);
    await vi.advanceTimersByTimeAsync(gathering.quietMs);
    expect(made.shows.map((show) => show.title)).toEqual(["mine", "theirs"]);
  });

  it("varies one burst of eight from the next, by the dice it is given, and never repeats the last", async () => {
    const made = await warmed(bench({ random: mulberry32(11), ...makingRoom }));
    const seatsOf = (): string =>
      [...made.outside.places().values()]
        .map((place) => `${place.x},${place.y},${place.width},${place.height}`)
        .toSorted()
        .join(" ");
    const dealt: string[] = [];
    for (const round of ["first", "second", "third"]) {
      const panes = await sentTogether(made, 8, byACreature, round);
      dealt.push(seatsOf());
      await made.outside.recall(panes.map((pane) => pane.tenant.key));
    }
    expect(dealt[1]).not.toBe(dealt[0]);
    expect(dealt[2]).not.toBe(dealt[1]);
    expect(made.desktop.calls.filter((call) => call.startsWith("focus "))).toEqual([]);
  });

  it("lands a keeper's own burst the same way every time", async () => {
    const landed: string[] = [];
    for (const seed of [1, 2]) {
      const made = await warmed(bench({ random: mulberry32(seed) }));
      await sentTogether(made, 8);
      landed.push(JSON.stringify([...made.outside.places().values()]));
      made.outside.dispose();
      made.desktop.closeEverything();
    }
    expect(landed[0]).toBe(landed[1]);
  });
});

describe("calling a burst back", () => {
  it("flies them home in the reverse of the order they arrived, the top one first", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    const panes = await sentTogether(made, 3);
    await vi.waitFor(() => expect(made.glides).toHaveLength(3));
    const before = made.glides.length;
    const home = await made.outside.recall(panes.map((pane) => pane.tenant.key));
    expect(home.toSorted()).toEqual(["pane-0", "pane-1", "pane-2"]);
    expect(made.glides.slice(before).map((glide) => glide.moves[0]?.id)).toEqual(
      ["pane-2", "pane-1", "pane-0"].map(made.idOf),
    );
    expect(panes.every(isInside)).toBe(true);
  });

  it("hides them in that order without the travel when motion is reduced", async () => {
    const made = await warmed(bench());
    const panes = await sentTogether(made, 3);
    await made.outside.recall(panes.map((pane) => pane.tenant.key));
    expect(made.desktop.calls.filter((call) => call.startsWith("hide "))).toEqual(
      ["pane-2", "pane-1", "pane-0"].map((key) => `hide ${made.idOf(key)}`),
    );
    expect(made.glides).toEqual([]);
  });
});

describe("dealing the panes outside again", () => {
  const namesDealt = async (made: ReturnType<typeof bench>, times: number): Promise<string[]> => {
    const names: string[] = [];
    for (let turn = 0; turn < times; turn += 1) {
      const verdict = await made.outside.deal();
      names.push(typeof verdict === "string" ? verdict : `${verdict.name} ${verdict.turn}`);
    }
    return names;
  };

  it("says so when no pane is outside", async () => {
    const made = await warmed(bench());
    expect(await made.outside.deal()).toBe("nothing-outside");
  });

  it("deals eight into each arrangement in turn and round to the first", async () => {
    const made = await warmed(bench());
    await sentTogether(made, 8);
    const first = JSON.stringify([...made.outside.places()]);
    expect(await namesDealt(made, 4)).toEqual(["ledger 2", "studio 3", "banner 4", "tower 1"]);
    await vi.waitFor(() => expect(JSON.stringify([...made.outside.places()])).toBe(first));
    expect(overlapping([...made.outside.places().values()])).toEqual([]);
  });

  it("glides each pane to its new seat on its own turn, as the keeper's own doing", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    const panes = await sentTogether(made, 8);
    await vi.waitFor(() => expect(made.glides).toHaveLength(8));
    const before = made.glides.length;
    expect(await made.outside.deal()).toEqual({ name: "ledger", turn: 2, of: 4 });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 8));
    expect(made.glides.slice(before).every((glide) => glide.moves.length === 1)).toBe(true);
    const seats = made.glides.slice(before).map((glide) => glide.moves[0]?.bounds as ScreenRect);
    expect(overlapping(seats)).toEqual([]);
    expect(new Set(seats.map((seat) => `${seat.width}x${seat.height}`))).toEqual(
      new Set(["392x245"]),
    );
    for (const pane of panes) expect(pane.log.at(-1)).toMatch(/^placed \d+,\d+ by keeper$/);
    expect(made.faults).toEqual([]);
  });

  it("gives the largest seat to the pane the keeper is in, and the next to what waits on him", async () => {
    const made = await warmed(bench());
    const panes = Array.from({ length: 9 }, (_, at) =>
      paneNamed(`pane-${at}`, "note", at === 2 ? "needs-you" : "idle"),
    );
    await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, quietly)));
    await settled();
    made.desktop.emit({ kind: "focused", id: made.idOf("pane-7") });
    expect(await namesDealt(made, 2)).toEqual(["square 2", "tower 3"]);
    const places = made.outside.places();
    const bySize = [...places.entries()].toSorted(([, a], [, b]) => roomOf(b) - roomOf(a));
    expect(bySize[0]?.[0]).toBe("pane-7");
  });

  it("leaves a pane that fills its display where it is, and deals the others", async () => {
    const made = await warmed(bench());
    await sentTogether(made, 3);
    const filling = { x: -7, y: -7, width: 1934, height: 1054 };
    made.desktop.emit({ kind: "moved", id: made.idOf("pane-0"), bounds: filling, by: "keeper" });
    const before = made.glides.length;
    expect(await made.outside.deal()).toEqual({ name: "rows", turn: 1, of: 2 });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 2));
    const moved = made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id));
    expect(moved).not.toContain(made.idOf("pane-0"));
    expect(made.outside.places().get("pane-0")).toEqual(filling);
  });

  it("has nothing to deal when every pane outside fills its display", async () => {
    const made = await warmed(bench());
    await made.outside.send(paneNamed("only").tenant, byHand);
    made.desktop.emit({
      kind: "moved",
      id: made.idOf("only"),
      bounds: { x: -7, y: -7, width: 1934, height: 1054 },
      by: "keeper",
    });
    expect(await made.outside.deal()).toBe("nothing-to-deal");
  });

  it("ends a spread and takes its letters off, the deal standing as the panes' places", async () => {
    const made = await warmed(bench());
    await made.outside.send(paneNamed("under").tenant, { ...byHand, last: stackedAt });
    await made.outside.send(paneNamed("over").tenant, {
      ...byHand,
      last: { ...stackedAt, x: 1320, y: 220 },
    });
    await settled();
    expect(await made.outside.toggleSpread()).toBe("spread");
    expect(made.outside.hinting()).toBe(true);
    expect(await made.outside.deal()).toMatchObject({ name: "rows" });
    expect(made.outside.hinting()).toBe(false);
    expect(await made.outside.toggleSpread()).toBe("spread");
  });

  it("leaves a pane where the keeper puts it afterwards, until he deals again", async () => {
    const made = await warmed(bench());
    await sentTogether(made, 2);
    await made.outside.deal();
    const put = { x: 40, y: 60, width: 500, height: 300 };
    made.desktop.emit({ kind: "moved", id: made.idOf("pane-0"), bounds: put, by: "keeper" });
    await sentTogether(made, 1, byACreature, "note");
    expect(made.outside.places().get("pane-0")).toEqual(put);
    await made.outside.deal();
    await vi.waitFor(() => expect(made.outside.places().get("pane-0")).not.toEqual(put));
    expect(overlapping([...made.outside.places().values()])).toEqual([]);
  });

  it("ends every pane in the latest deal's seat when the key is pressed again mid-glide", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    await sentTogether(made, 8);
    await vi.waitFor(() => expect(made.glides).toHaveLength(8));
    const before = made.glides.length;
    expect(await namesDealt(made, 3)).toEqual(["ledger 2", "studio 3", "banner 4"]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const lastMoveOf = (id: string): ScreenRect | undefined =>
      made.glides
        .slice(before)
        .flatMap((glide) => glide.moves)
        .findLast((move) => move.id === id)?.bounds;
    for (const [key, place] of made.outside.places()) {
      expect(lastMoveOf(made.idOf(key)), key).toEqual(place);
    }
    expect(overlapping([...made.outside.places().values()])).toEqual([]);
    expect(made.glides.length).toBeLessThan(before + 24);
  });

  it("leaves a pane the keeper drags during the deal where he put it", async () => {
    const made = await warmed(bench({ motion: () => gliding }));
    await sentTogether(made, 8);
    await vi.waitFor(() => expect(made.glides).toHaveLength(8));
    const before = made.glides.length;
    await made.outside.deal();
    const started = new Set(
      made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id)),
    );
    const waiting = [...made.outside.places().keys()].find((key) => !started.has(made.idOf(key)));
    const put = { x: 60, y: 80, width: 500, height: 300 };
    made.desktop.emit({
      kind: "moved",
      id: made.idOf(waiting as string),
      bounds: put,
      by: "keeper",
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    const moved = made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id));
    expect(moved).not.toContain(made.idOf(waiting as string));
    expect(made.outside.places().get(waiting as string)).toEqual(put);
    expect(moved).toHaveLength(7);
  });

  it("deals nothing, and says why, when the desktop will not say where things are", async () => {
    const failing: Failing = {};
    const made = await warmed(bench({}, {}, failing));
    await sentTogether(made, 2);
    failing.desk = true;
    const before = made.glides.length;
    expect(await made.outside.deal()).toBe("desktop-refused");
    expect(made.glides).toHaveLength(before);
    expect(made.faults).toEqual(["the desktop would not say where things are"]);
  });
});

describe("an arrangement a creature composes for the panes outside", () => {
  const briefing: Authored = {
    name: "briefing",
    seats: [
      { x: 0, y: 0, width: 0.5, height: 1 },
      { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ],
  };
  const outOfTheWay = { x: 20, y: 400, width: 90, height: 200 };
  const focusCalls = (made: ReturnType<typeof bench>): string[] =>
    made.desktop.calls.filter((call) => call.startsWith("focus "));

  async function threeFromACreature(made: ReturnType<typeof bench>) {
    const panes = ["idle", "needs-you", "idle"].map((state, at) =>
      paneNamed(`pane-${at}`, "note", state as LifecycleState),
    );
    await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, byACreature)));
    await settled();
    return panes;
  }

  it("says so when no pane is outside", async () => {
    const made = await warmed(bench());
    expect(await made.outside.compose(briefing)).toBe("nothing-outside");
  });

  it("seats them as it was written, the weightiest in its largest seat, without taking focus", async () => {
    const made = await warmed(bench());
    const panes = await threeFromACreature(made);
    const before = made.glides.length;
    expect(await made.outside.compose(briefing)).toEqual({ name: "briefing", said: [] });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 3));
    const places = made.outside.places();
    expect(overlapping([...places.values()])).toEqual([]);
    expect(places.get("pane-1")).toEqual({ x: 1112, y: 12, width: 392, height: 1016 });
    expect([places.get("pane-0")?.x, places.get("pane-2")?.x]).toEqual([1516, 1516]);
    for (const pane of panes) expect(pane.log.at(-1)).toMatch(/^placed \d+,\d+ by host$/);
    expect(focusCalls(made)).toEqual([]);
  });

  it("says in plain words what it had to put right", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    const rough: Authored = {
      name: "rough",
      seats: [
        { x: -0.1, y: 0, width: 0.62, height: 1 },
        { x: 0.3, y: 0, width: 0.7, height: 0.5 },
        { x: 0.5, y: 0.52, width: 0.5, height: 0.48 },
        { x: 0.6, y: 0.6, width: 0.3, height: 0.3 },
      ],
    };
    expect(await made.outside.compose(rough)).toEqual({
      name: "rough",
      said: [
        "seat 1 reached past the display's edge and was brought inside",
        "seat 1 was off the grid's lines and was moved onto them",
        "seat 2 was off the grid's lines and was moved onto them",
        "seat 2 lay over seat 1 and was cut back to stand beside it",
        "seat 3 was off the grid's lines and was moved onto them",
        "seat 4 was off the grid's lines and was moved onto them",
        "seat 4 lay over seat 3 with no room beside it and was left out",
      ],
    });
    await vi.waitFor(() => expect(overlapping([...made.outside.places().values()])).toEqual([]));
  });

  it("leaves a pane the keeper dragged where he put it, and seats the others around it", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    made.desktop.emit({
      kind: "moved",
      id: made.idOf("pane-0"),
      bounds: outOfTheWay,
      by: "keeper",
    });
    const before = made.glides.length;
    expect(await made.outside.compose(briefing)).toEqual({ name: "briefing", said: [] });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 2));
    const moved = made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id));
    expect(moved).not.toContain(made.idOf("pane-0"));
    expect(made.outside.places().get("pane-0")).toEqual(outOfTheWay);
    expect(overlapping([...made.outside.places().values()])).toEqual([]);
  });

  it("leaves a pane the keeper stepped or sized by key where that left it", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    expect(await made.outside.stepSize("pane-2", -1)).toBe("moved");
    const stepped = made.outside.places().get("pane-2");
    const before = made.glides.length;
    await made.outside.compose(briefing);
    await vi.waitFor(() => expect(made.glides.length).toBeGreaterThan(before));
    const moved = made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id));
    expect(moved).not.toContain(made.idOf("pane-2"));
    expect(made.outside.places().get("pane-2")).toEqual(stepped);
  });

  it("leaves the pane the keeper is in where it stands, and a pane that fills its display out of it", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    const mine = { x: 20, y: 500, width: 90, height: 300 };
    await made.outside.send(paneNamed("mine").tenant, { ...byHand, last: mine });
    const filling = { x: -7, y: -7, width: 1934, height: 1054 };
    await made.outside.send(paneNamed("filling").tenant, { ...quietly, last: filling });
    await settled();
    made.desktop.emit({ kind: "focused", id: made.idOf("mine") });
    const before = made.glides.length;
    expect(await made.outside.compose(briefing)).toEqual({ name: "briefing", said: [] });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 3));
    const moved = made.glides.slice(before).flatMap((glide) => glide.moves.map((move) => move.id));
    expect(moved).not.toContain(made.idOf("mine"));
    expect(moved).not.toContain(made.idOf("filling"));
    expect(made.outside.places().get("mine")).toEqual(mine);
    expect(made.outside.places().get("filling")).toEqual(filling);
    expect(made.outside.holdingFocus()).toBe("mine");
  });

  it("is refused, with nothing moved, when it has fewer seats than the panes it may move", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    const before = made.glides.length;
    const pair: Authored = { name: "pair", seats: briefing.seats.slice(0, 2) };
    expect(await made.outside.compose(pair)).toEqual({ refused: "too-few-seats", said: [] });
    expect(made.glides).toHaveLength(before);
  });

  it("is refused when every pane outside is where the keeper put it, or no room is clear of his", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    made.desktop.emit({
      kind: "moved",
      id: made.idOf("pane-0"),
      bounds: { x: 1300, y: 300, width: 300, height: 200 },
      by: "keeper",
    });
    expect(await made.outside.compose(briefing)).toEqual({ refused: "no-room", said: [] });
    for (const key of ["pane-1", "pane-2"]) {
      made.desktop.emit({ kind: "moved", id: made.idOf(key), bounds: outOfTheWay, by: "keeper" });
    }
    expect(await made.outside.compose(briefing)).toEqual({ refused: "nothing-free", said: [] });
  });

  it("still comes inside on the one key, every pane of it", async () => {
    const made = await warmed(bench());
    const panes = await threeFromACreature(made);
    await made.outside.compose(briefing);
    const home = await made.outside.recall(panes.map((pane) => pane.tenant.key));
    expect(home.toSorted()).toEqual(["pane-0", "pane-1", "pane-2"]);
    expect(panes.every(isInside)).toBe(true);
    expect(made.outside.places().size).toBe(0);
  });

  it("gives way to the keeper's deal, which returns to an arrangement he knows and takes back every pane", async () => {
    const made = await warmed(bench());
    await threeFromACreature(made);
    made.desktop.emit({
      kind: "moved",
      id: made.idOf("pane-0"),
      bounds: outOfTheWay,
      by: "keeper",
    });
    await made.outside.compose(briefing);
    expect(await made.outside.deal()).toEqual({ name: "rows", turn: 1, of: 2 });
    await vi.waitFor(() => expect(made.outside.places().get("pane-0")).not.toEqual(outOfTheWay));
    const before = made.glides.length;
    expect(await made.outside.compose(briefing)).toEqual({ name: "briefing", said: [] });
    await vi.waitFor(() => expect(made.glides.length).toBe(before + 3));
    expect(await made.outside.deal()).toEqual({ name: "rows", turn: 1, of: 2 });
  });

  it("moves nothing, and says why, when the desktop will not say where things are", async () => {
    const failing: Failing = {};
    const made = await warmed(bench({}, {}, failing));
    await threeFromACreature(made);
    failing.desk = true;
    expect(await made.outside.compose(briefing)).toBe("desktop-refused");
    expect(made.faults).toEqual(["the desktop would not say where things are"]);
  });
});

type Sent = Parameters<ReturnType<typeof bench>["outside"]["send"]>[1];

const ofOneThread = { ...byACreature, company: "thread-1" } as const;

describe("a creature's own choreography", () => {
  const leftHalf = { x: 0, y: 0, width: 0.5, height: 1 };
  const topRight = { x: 0.5, y: 0, width: 0.5, height: 0.5 };
  const bottomRight = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
  const carriedOff: ScreenRect = { x: 20, y: 400, width: 90, height: 200 };
  const roomIn = (rect: ScreenRect | undefined): number => (rect?.width ?? 0) * (rect?.height ?? 0);
  const focused = (made: ReturnType<typeof bench>): string[] =>
    made.desktop.calls.filter((call) => call.startsWith("focus "));

  async function sentByTheCreature(
    made: ReturnType<typeof bench>,
    key: string,
    sending: Partial<Parameters<typeof made.outside.send>[1]> = {},
  ) {
    const pane = paneNamed(key);
    await made.outside.send(pane.tenant, { ...byACreature, ...sending });
    await settled();
    return pane;
  }

  async function threeOut(made: ReturnType<typeof bench>): Promise<string[]> {
    const keys = ["pane-0", "pane-1", "pane-2"];
    const panes = keys.map((key) => paneNamed(key));
    await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, byACreature)));
    await settled();
    return keys;
  }

  it("seats an arrival where the creature asked, on the stage beside the console, unfocused", async () => {
    const made = await warmed(bench());
    await sentByTheCreature(made, "plan", { seat: leftHalf });
    expect(made.outside.places().get("plan")).toEqual({ x: 1112, y: 12, width: 392, height: 1016 });
    expect(made.outside.standings().get("plan")?.by).toBe("creature");
    expect(focused(made)).toEqual([]);
  });

  it("composes the panes named onto their seats, and leaves one the keeper placed since", async () => {
    const made = await warmed(bench());
    const keys = await threeOut(made);
    made.desktop.emit({ kind: "moved", id: made.idOf("pane-2"), bounds: carriedOff, by: "keeper" });
    const arranged = await made.outside.arrange({
      keys,
      instruction: {
        kind: "written",
        seats: [
          { key: "pane-0", share: leftHalf },
          { key: "pane-1", share: topRight },
          { key: "pane-2", share: bottomRight },
        ],
      },
    });
    expect(arranged).toMatchObject({
      look: "composed",
      stands: "beside",
      seated: ["pane-0", "pane-1"],
      keepers: ["pane-2"],
      said: [],
    });
    const places = made.outside.places();
    expect(places.get("pane-0")).toEqual({ x: 1112, y: 12, width: 392, height: 1016 });
    expect(places.get("pane-1")).toEqual({ x: 1516, y: 12, width: 392, height: 502 });
    expect(places.get("pane-2")).toEqual(carriedOff);
    const standings = made.outside.standings();
    expect(keys.map((key) => standings.get(key)?.by)).toEqual(["creature", "creature", "keeper"]);
    expect(focused(made)).toEqual([]);
  });

  it("gives the lead the largest seat of a named shape, on the first stage that holds it", async () => {
    const made = await warmed(bench(makingRoom));
    const keys = await threeOut(made);
    const arranged = await made.outside.arrange({
      keys,
      lead: "pane-2",
      instruction: {
        kind: "dealt",
        deals: (count) => dealsToTry({ shape: "lead-and-stack", led: true }, count),
      },
    });
    expect(arranged).toMatchObject({ look: "lead and stack", stands: "beside", keepers: [] });
    const places = made.outside.places();
    expect(roomIn(places.get("pane-2"))).toBeGreaterThan(2 * roomIn(places.get("pane-0")));
    expect(places.get("pane-0")?.x).toBe(places.get("pane-1")?.x);
    expect(overlapping([...places.values()])).toEqual([]);
  });

  it("drills in three deep, the newest leading beside the console over the trail of its ancestors, and back out to where everything stood", async () => {
    let stands = desk;
    const steppingAside = async (): Promise<Desk> => {
      stands = asTheHub;
      return stands;
    };
    const made = await warmed(bench({ makeRoom: steppingAside }, {}, {}, false, () => stands));
    const leading = { leads: true, weight: 4 } as const;
    const out = async (key: string, sending: Partial<Sent> = {}): Promise<void> => {
      void made.outside.send(paneNamed(key).tenant, { ...ofOneThread, ...sending });
      await vi.waitFor(() => expect(made.outside.standings().has(key)).toBe(true));
      await made.outside.settle();
      await vi.waitFor(() => expect(made.outside.places().has(key)).toBe(true));
    };
    await out("list");
    const stood = made.outside.places().get("list");
    await out("item", { from: "list", ...leading });
    const drilled = made.outside.places();
    const lead = drilled.get("item") as ScreenRect;
    const beneath = drilled.get("list") as ScreenRect;
    expect(lead).toEqual({ x: 516, y: 12, width: 690, height: 759 });
    expect(beneath).toEqual({ x: 516, y: 783, width: 690, height: 245 });
    await out("detail", { from: "item", ...leading });
    const deeper = made.outside.places();
    expect(deeper.get("detail")).toEqual(lead);
    expect(deeper.get("item")).toEqual({ x: 516, y: 783, width: 339, height: 245 });
    expect(deeper.get("list")).toEqual({ x: 867, y: 783, width: 339, height: 245 });
    expect(overlapping([...deeper.values()])).toEqual([]);
    await made.outside.recall(["detail"]);
    const shallower = made.outside.places();
    expect(shallower.has("detail")).toBe(false);
    expect(shallower.get("item")).toEqual(lead);
    expect(shallower.get("list")).toEqual(beneath);
    await made.outside.recall(["item"]);
    expect(made.outside.places().get("list")).toEqual(stood);
    expect(made.shows.map((show) => show.title)).toEqual(["list", "item", "detail"]);
    expect(focused(made)).toEqual([]);
  });

  it("arises beside its parent, and leaves a parent the keeper placed where it stands", async () => {
    const made = await warmed(bench());
    await sentByTheCreature(made, "list");
    const stood = made.outside.places().get("list") as ScreenRect;
    made.desktop.emit({ kind: "moved", id: made.idOf("list"), bounds: stood, by: "keeper" });
    await sentByTheCreature(made, "item", { from: "list", leads: true });
    const places = made.outside.places();
    expect(places.get("list")).toEqual(stood);
    expect(overlapping([...places.values()])).toEqual([]);
  });
});

describe("a thread's panes set outside over a turn", () => {
  const ofTheThread = { ...byACreature, company: "thread-1" } as const;
  const overTheConsole = (place: ScreenRect): boolean => place.x < asTheHub.console.width;

  async function seatedOf(made: ReturnType<typeof bench>, keys: readonly string[], inAll: number) {
    const panes = keys.map((key) => paneNamed(key));
    for (const pane of panes) void made.outside.send(pane.tenant, ofTheThread);
    await vi.waitFor(() => expect(made.outside.standings().size).toBe(inAll));
    return panes;
  }

  async function shown(made: ReturnType<typeof bench>, count: number): Promise<void> {
    await vi.waitFor(() => expect(made.outside.places().size).toBe(count));
  }

  it("are dealt as one arrangement again as they grow, the console making room once it is needed", async () => {
    const asked: string[] = [];
    const made = await warmed(
      bench({
        makeRoom: async ({ company }) => {
          asked.push(company ?? "");
          return asTheHub;
        },
      }),
    );
    await seatedOf(made, ["a", "b", "c"], 3);
    await shown(made, 3);
    expect(asked).toEqual([]);
    const stood = new Map(made.outside.places());
    await seatedOf(made, ["d", "e", "f", "g", "h", "i"], 9);
    expect(asked).toEqual(["thread-1"]);
    expect(made.shows.map((show) => show.title)).toEqual(["a", "b", "c"]);
    await made.outside.settle("thread-1");
    await shown(made, 9);
    const places = [...made.outside.places().values()];
    expect(overlapping(places)).toEqual([]);
    expect(places.filter(overTheConsole)).toEqual([]);
    expect(made.shows.map((show) => show.title).toSorted()).toEqual([..."abcdefghi"]);
    expect(made.outside.places().get("a")).not.toEqual(stood.get("a"));
    expect([...made.outside.standings().values()].map((placed) => placed.by)).toEqual(
      Array(9).fill("console"),
    );
  });

  it("leaves where the keeper put it a pane he has placed, and deals the rest around it", async () => {
    const made = await warmed(bench(makingRoom));
    await seatedOf(made, ["a", "b"], 2);
    await shown(made, 2);
    const his: ScreenRect = { x: 1400, y: 600, width: 480, height: 320 };
    made.desktop.emit({ kind: "moved", id: made.idOf("a"), bounds: his, by: "keeper" });
    await seatedOf(made, ["c", "d", "e"], 5);
    await made.outside.settle();
    await shown(made, 5);
    const places = made.outside.places();
    expect(places.get("a")).toEqual(his);
    expect(overlapping([...places.values()])).toEqual([]);
    expect(made.outside.standings().get("a")?.by).toBe("keeper");
  });

  it("keeps as many as the stage holds at card size and sends the rest back, saying which", async () => {
    const turnedAway: string[] = [];
    const made = await warmed(
      bench({ noRoom: (tenants) => turnedAway.push(...tenants.map((tenant) => tenant.key)) }),
    );
    const keys = Array.from({ length: 12 }, (_, at) => `pane-${at}`);
    const panes = await seatedOf(made, keys, 8);
    await shown(made, 8);
    expect(turnedAway).toEqual(keys.slice(8));
    expect(panes.slice(8).every((pane) => pane.log.includes("came home") && isInside(pane))).toBe(
      true,
    );
    expect([...made.outside.places().values()].filter((place) => place.x < 1112)).toEqual([]);
  });
});

describe("a thread's panes drilled into, arranged in part, and never shown without a seat", () => {
  const holdsACard = (place: ScreenRect): boolean => place.width >= 320 && place.height >= 160;

  async function eightOut(made: ReturnType<typeof bench>): Promise<string[]> {
    const keys = Array.from({ length: 8 }, (_, at) => `pane-${at}`);
    for (const key of keys) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(8));
    return keys;
  }

  async function joined(made: ReturnType<typeof bench>, key: string, sending: Partial<Sent>) {
    const pane = paneNamed(key);
    const arrived = made.outside.send(pane.tenant, { ...ofOneThread, ...sending });
    await settled();
    await made.outside.settle();
    return { pane, arrived };
  }

  it("sends the lightest to the rail when a drill passes what the stage holds, and has them back when it ends", async () => {
    const turnedAway: string[] = [];
    const cameBack: Array<ReadonlyMap<string, ScreenRect>> = [];
    const made = await warmed(
      bench({
        noRoom: (tenants) => turnedAway.push(...tenants.map((tenant) => tenant.key)),
        setOutAgain: (seats) => cameBack.push(seats),
      }),
    );
    await eightOut(made);
    const stood = new Map(made.outside.places());
    await joined(made, "child", { from: "pane-0", leads: true, weight: 4 });
    await vi.waitFor(() => expect(made.outside.places().has("child")).toBe(true));
    expect(turnedAway).toEqual(["pane-7"]);
    const drilled = made.outside.places();
    expect(drilled.size).toBe(8);
    expect(overlapping([...drilled.values()])).toEqual([]);
    await made.outside.recall(["child"]);
    expect(cameBack).toEqual([new Map([["pane-7", stood.get("pane-7")]])]);
    const after = made.outside.places();
    expect([...after.keys()].toSorted()).toEqual(
      [...stood.keys()].filter((key) => key !== "pane-7"),
    );
    for (const [key, place] of after) expect(place, key).toEqual(stood.get(key));
  });

  it("leaves where the keeper put it a pane he moved during a drill, and forgets where it stood", async () => {
    const made = await warmed(bench(makingRoom));
    for (const key of ["a", "b"]) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(2));
    const stood = new Map(made.outside.places());
    await joined(made, "child", { from: "a", leads: true, weight: 4 });
    await vi.waitFor(() => expect(made.outside.places().has("child")).toBe(true));
    const his: ScreenRect = { x: 1500, y: 620, width: 380, height: 380 };
    made.desktop.emit({ kind: "moved", id: made.idOf("b"), bounds: his, by: "keeper" });
    await made.outside.recall(["child"]);
    expect(made.outside.places().get("b")).toEqual(his);
    expect(made.outside.places().get("a")).toEqual(stood.get("a"));
  });

  it("seats a pane that only arises next to its parent, emerging from it, and moves nobody", async () => {
    const made = await warmed(bench());
    for (const key of ["a", "b"]) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(2));
    const stood = new Map(made.outside.places());
    const { arrived } = await joined(made, "aside", { from: "b" });
    await arrived;
    const places = made.outside.places();
    expect(places.get("a")).toEqual(stood.get("a"));
    expect(places.get("b")).toEqual(stood.get("b"));
    expect(overlapping([...places.values()])).toEqual([]);
    expect(holdsACard(places.get("aside") as ScreenRect)).toBe(true);
  });

  it("never shows a pane without a seat of card size: one arising into a full stage goes back instead", async () => {
    const turnedAway: string[] = [];
    const made = await warmed(
      bench({ noRoom: (tenants) => turnedAway.push(...tenants.map((tenant) => tenant.key)) }),
    );
    await eightOut(made);
    const { pane, arrived } = await joined(made, "extra", { from: "pane-3" });
    expect(await arrived).toBeUndefined();
    expect(turnedAway).toEqual(["extra"]);
    expect(isInside(pane)).toBe(true);
    expect(made.shows.every((show) => holdsACard(show.bounds))).toBe(true);
    expect(made.shows.map((show) => show.title)).not.toContain("extra");
  });

  it("seats afresh a pane that returns with a saved rectangle smaller than a card", async () => {
    const made = await warmed(bench());
    const nonsense: ScreenRect = { x: 765, y: 0, width: 199, height: 121 };
    void made.outside.send(paneNamed("back").tenant, { ...ofOneThread, last: nonsense });
    await vi.waitFor(() => expect(made.outside.places().has("back")).toBe(true));
    const place = made.outside.places().get("back") as ScreenRect;
    expect(holdsACard(place)).toBe(true);
    expect(place.x).toBeGreaterThanOrEqual(desk.console.x + desk.console.width);
  });

  it("has what an arrangement covers step aside as cards into the room it leaves, or go back, never overlapping", async () => {
    const turnedAway: string[] = [];
    const steppedAside: string[] = [];
    const made = await warmed(
      bench({
        noRoom: (tenants) => turnedAway.push(...tenants.map((tenant) => tenant.key)),
        steppedAside: (tenants) => steppedAside.push(...tenants.map((tenant) => tenant.key)),
      }),
    );
    const keys = ["a", "b", "c", "d", "e"];
    for (const key of keys) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(5));
    const arranged = await made.outside.arrange({
      keys: ["a", "b"],
      instruction: {
        kind: "written",
        seats: [
          { key: "a", share: { x: 0, y: 0, width: 0.5, height: 1 } },
          { key: "b", share: { x: 0.5, y: 0, width: 0.5, height: 0.5 } },
        ],
      },
    });
    if (arranged === "desktop-refused") throw new Error("the desktop refused");
    await settled();
    expect(arranged.seated).toEqual(["a", "b"]);
    expect([...arranged.aside, ...arranged.backBeside].toSorted()).toEqual(["c", "d", "e"]);
    expect(arranged.aside.length).toBeGreaterThan(0);
    expect(steppedAside).toEqual(arranged.backBeside);
    expect(turnedAway).toEqual([]);
    const places = made.outside.places();
    expect([...places.keys()].toSorted()).toEqual(["a", "b", ...arranged.aside].toSorted());
    expect(places.get("a")).toEqual({ x: 1112, y: 12, width: 392, height: 1016 });
    expect(places.get("b")).toEqual({ x: 1516, y: 12, width: 392, height: 502 });
    expect(overlapping([...places.values()])).toEqual([]);
    expect(arranged.aside.every((key) => holdsACard(places.get(key) as ScreenRect))).toBe(true);
    const standings = made.outside.standings();
    expect(arranged.aside.map((key) => standings.get(key)?.by)).toEqual(
      arranged.aside.map(() => "console"),
    );
  });

  it("puts the lead of a named shape beside the console, whichever side the console is on", async () => {
    const atTheRight: Desk = { ...desk, console: { x: 1404, y: 12, width: 504, height: 1016 } };
    const made = await warmed(bench({ makeRoom: async () => atTheRight }));
    const keys = Array.from({ length: 9 }, (_, at) => `pane-${at}`);
    for (const key of keys) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(9));
    const arranged = await made.outside.arrange({
      keys,
      lead: "pane-4",
      instruction: {
        kind: "dealt",
        deals: (count) => dealsToTry({ shape: "lead-and-cards", led: true }, count),
      },
    });
    await settled();
    expect(arranged).toMatchObject({ look: "marquee", stands: "beside" });
    const places = made.outside.places();
    const lead = places.get("pane-4") as ScreenRect;
    const cards = keys
      .filter((key) => key !== "pane-4")
      .map((key) => places.get(key) as ScreenRect);
    expect(cards.every((card) => lead.width > card.width && lead.height > card.height)).toBe(true);
    expect(lead.x + lead.width).toBe(Math.max(...cards.map((card) => card.x + card.width)));
    expect(overlapping([...places.values()])).toEqual([]);
  });
});

describe("an arrangement that names things not yet out", () => {
  const asCards = (count: number) => dealsToTry({ shape: "grid", led: false }, count);

  it("has all nine arrive in its seats in one performance, the console making room once", async () => {
    const asked: string[] = [];
    let stands = desk;
    const made = await warmed(
      bench(
        {
          makeRoom: async ({ company }) => {
            asked.push(company ?? "");
            stands = asTheHub;
            return stands;
          },
        },
        {},
        {},
        false,
        () => stands,
      ),
    );
    const keys = Array.from({ length: 9 }, (_, at) => `pane-${at}`);
    for (const key of keys) {
      void made.outside.send(paneNamed(key).tenant, { ...ofOneThread, arranging: true });
    }
    const arranged = await made.outside.arrange({
      keys,
      instruction: { kind: "dealt", deals: asCards },
    });
    if (arranged === "desktop-refused") throw new Error("the desktop refused");
    expect(arranged.seated).toEqual(keys);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(9));
    await settled();
    expect(asked).toEqual(["thread-1"]);
    expect(made.shows.map((show) => show.title).toSorted()).toEqual(keys);
    expect(made.desktop.calls.filter((call) => call.startsWith("move "))).toEqual([]);
    const places = made.outside.places();
    expect(made.shows.map((show) => show.bounds)).toEqual(
      made.shows.map((show) => places.get(show.title)),
    );
    expect(overlapping([...places.values()])).toEqual([]);
    expect([...places.values()].filter((place) => place.x < 516)).toEqual([]);
  });

  it("seats the newcomers with the panes already out, and sends back what has no seat", async () => {
    const turnedAway: string[] = [];
    const made = await warmed(
      bench({
        ...makingRoom,
        noRoom: (tenants) => turnedAway.push(...tenants.map((tenant) => tenant.key)),
      }),
    );
    for (const key of ["a", "b"]) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(2));
    const shownBefore = made.shows.length;
    for (const key of ["c", "d"]) {
      void made.outside.send(paneNamed(key).tenant, { ...ofOneThread, arranging: true });
    }
    const arranged = await made.outside.arrange({
      keys: ["a", "c", "d"],
      instruction: {
        kind: "written",
        seats: [
          { key: "a", share: { x: 0, y: 0, width: 0.5, height: 1 } },
          { key: "c", share: { x: 0.5, y: 0, width: 0.5, height: 0.5 } },
        ],
      },
    });
    if (arranged === "desktop-refused") throw new Error("the desktop refused");
    await vi.waitFor(() => expect(made.outside.places().has("c")).toBe(true));
    await settled();
    expect(arranged.seated).toEqual(["a", "c"]);
    expect(arranged.unseated).toEqual(["d"]);
    expect(turnedAway).toContain("d");
    expect(made.shows.slice(shownBefore).map((show) => show.title)).toEqual(["c"]);
    const places = made.outside.places();
    expect(places.get("c")).toEqual(made.shows.at(-1)?.bounds);
    expect(places.has("d")).toBe(false);
    expect(overlapping([...places.values()])).toEqual([]);
  });

  it("applies to a troupe mid-drill as it stands and says the earlier layout was let go", async () => {
    const made = await warmed(bench(makingRoom));
    for (const key of ["a", "b", "c"]) void made.outside.send(paneNamed(key).tenant, ofOneThread);
    await vi.waitFor(() => expect(made.outside.places().size).toBe(3));
    void made.outside.send(paneNamed("child").tenant, {
      ...ofOneThread,
      from: "a",
      leads: true,
      weight: 4,
    });
    await vi.waitFor(() => expect(made.outside.standings().has("child")).toBe(true));
    await made.outside.settle();
    await vi.waitFor(() => expect(made.outside.places().has("child")).toBe(true));
    const arranged = await made.outside.arrange({
      keys: ["a", "b", "c", "child"],
      instruction: { kind: "dealt", deals: asCards },
    });
    if (arranged === "desktop-refused") throw new Error("the desktop refused");
    await settled();
    expect(arranged.letGo).toBe(true);
    const stood = new Map(made.outside.places());
    await made.outside.recall(["child"]);
    for (const key of ["a", "b", "c"])
      expect(made.outside.places().get(key)).toEqual(stood.get(key));
    const again = await made.outside.arrange({
      keys: ["a", "b", "c"],
      instruction: { kind: "dealt", deals: asCards },
    });
    expect(again).toMatchObject({ letGo: false });
  });
});

describe("what a pane outside says by its border", () => {
  const ofThread = { ...byACreature, company: "thread-1" } as const;
  const returning = { ...byACreature, last: desk.console } as const;
  const inks = { arrived: "#e0af68", "needs-you": "#e0af68", critical: "#f7768e" } as const;
  const inked = { frameInk: (signal: keyof typeof inks) => inks[signal] };

  function signalled(key: string, signal: () => SettingSignal | undefined) {
    const pane = paneNamed(key);
    const facts = pane.tenant.facts;
    const tenant: Tenant = { ...pane.tenant, facts: () => ({ ...facts(), signal: signal() }) };
    return { ...pane, tenant };
  }

  async function standing(made: ReturnType<typeof bench>, key: string, sending: Sent) {
    const pane = paneNamed(key);
    void made.outside.send(pane.tenant, sending);
    await vi.waitFor(() => expect(made.outside.places().has(key)).toBe(true));
    await settled();
    return pane;
  }

  it("draws no outline and asks the desktop for no frame for the keeper's own pane", async () => {
    const made = await warmed(bench(inked));
    const pane = paneNamed("notes");
    await made.outside.send(pane.tenant, byHand);
    const chrome = chromeOf(pane.body);
    expect(chrome.dataset.signal).toBeUndefined();
    expect(chrome.dataset.edge).toBeUndefined();
    expect(made.shows[0]?.frame).toBeUndefined();
    expect(made.frames).toEqual([]);
  });

  it("outlines a creature's arrival in amber, on the page and the frame, for six seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const made = bench(inked);
    await vi.advanceTimersByTimeAsync(10);
    const pane = paneNamed("on call");
    void made.outside.send(pane.tenant, byACreature);
    await vi.advanceTimersByTimeAsync(100);
    const chrome = chromeOf(pane.body);
    expect(chrome.dataset.signal).toBe("arrived");
    expect(made.shows[0]?.frame).toBe("#e0af68");
    await vi.advanceTimersByTimeAsync(arrivalFadesAfterMs - 200);
    expect(chrome.dataset.signal).toBe("arrived");
    expect(made.frames).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(chrome.dataset.signal).toBeUndefined();
    expect(chrome.dataset.outline).toBe("arrived");
    expect(made.frames).toEqual([[made.shows[0]?.id, undefined]]);
  });

  it("lets an arrival go at once when the keeper focuses the pane", async () => {
    const made = await warmed(bench(inked));
    const pane = paneNamed("on call");
    await made.outside.send(pane.tenant, byACreature);
    const chrome = chromeOf(pane.body);
    expect(chrome.dataset.signal).toBe("arrived");
    made.desktop.emit({ kind: "focused", id: "kw-surface:1" });
    expect(chrome.dataset.signal).toBeUndefined();
  });

  it("holds amber while the pane waits on the keeper, red only for critical, and no arrival on a return", async () => {
    const made = await warmed(bench(inked));
    const [signal, setSignal] = createSignal<SettingSignal | undefined>("needs-you");
    const pane = signalled("tests", signal);
    await made.outside.send(pane.tenant, returning);
    const chrome = chromeOf(pane.body);
    expect(chrome.dataset.signal).toBe("needs-you");
    expect(made.shows[0]?.frame).toBe("#e0af68");
    setSignal("critical");
    expect(chrome.dataset.signal).toBe("critical");
    setSignal(undefined);
    expect(chrome.dataset.signal).toBeUndefined();
    const waiting = paneNamed("asks", "conversation", "needs-you");
    await made.outside.send(waiting.tenant, byHand);
    expect(chromeOf(waiting.body).dataset.signal).toBe("needs-you");
  });

  it("repaints the frame as the signal changes, once for each change", async () => {
    const made = await warmed(bench(inked));
    const [signal, setSignal] = createSignal<SettingSignal | undefined>();
    const pane = signalled("deploy", signal);
    await made.outside.send(pane.tenant, returning);
    const id = made.shows[0]?.id;
    expect(made.shows[0]?.frame).toBeUndefined();
    setSignal("critical");
    setSignal("needs-you");
    setSignal(undefined);
    expect(made.frames).toEqual([
      [id, "#f7768e"],
      [id, "#e0af68"],
      [id, undefined],
    ]);
  });

  it("marks the lead of an arrangement with its top edge, and no lead once it stands alone", async () => {
    const made = await warmed(bench({ ...makingRoom, ...inked }));
    const keys = ["pane-0", "pane-1", "pane-2"];
    const panes = keys.map((key) => paneNamed(key));
    await Promise.all(panes.map((pane) => made.outside.send(pane.tenant, ofThread)));
    await settled();
    await made.outside.arrange({
      keys,
      lead: "pane-2",
      instruction: {
        kind: "dealt",
        deals: (count) => dealsToTry({ shape: "lead-and-stack", led: true }, count),
      },
    });
    const edges = () => panes.map((pane) => chromeOf(pane.body).dataset.edge);
    expect(edges()).toEqual([undefined, undefined, "lead"]);
    expect(made.frames.every(([, frame]) => frame === undefined)).toBe(true);
    await made.outside.recall(["pane-0", "pane-1"]);
    expect(chromeOf(panes[2]?.body as HTMLElement).dataset.edge).toBeUndefined();
  });

  it("marks the pane a drill came out of with its left edge while the drilled-in pane is out", async () => {
    let stands = desk;
    const steppingAside = async (): Promise<Desk> => {
      stands = asTheHub;
      return stands;
    };
    const made = await warmed(bench({ makeRoom: steppingAside }, {}, {}, false, () => stands));
    const list = await standing(made, "list", ofThread);
    expect(chromeOf(list.body).dataset.edge).toBeUndefined();
    const item = await standing(made, "item", {
      ...ofThread,
      from: "list",
      leads: true,
      weight: 4,
    });
    expect(chromeOf(list.body).dataset.edge).toBe("way-back");
    expect(chromeOf(item.body).dataset.edge).toBe("lead");
    await made.outside.recall(["item"]);
    expect(chromeOf(list.body).dataset.edge).toBeUndefined();
  });
});
