import type { SteadPlace } from "@keywork-app/protocol";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { OutsideKind } from "../feel/arrange.ts";
import type { Desk, ScreenRect, SurfaceShow, SurfacesPort } from "../port.ts";
import { fakeDesktop, turn } from "../runtime/testing.ts";
import { presetSize } from "./grid.ts";
import { createPanesOutside, type Tenant } from "./panes-outside.tsx";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.replaceChildren();
});

describe("a conversation opened from a row of a creature's ledger", () => {
  it("is given a conversation's size beside the creature pane it was opened from", async () => {
    const workshop: SteadPlace = { kind: "workshop", creature: "wren" };
    const conversationSize = presetSize("working", laptop, "conversation");
    for (const consoleAt of [
      { x: 200, y: 100, width: 900, height: 700 },
      { x: 0, y: 0, width: 1280, height: 800 },
      { x: 200, y: 380, width: 900, height: 640 },
    ]) {
      const desk = { current: deskWith(consoleAt) };
      const { outside, shows } = bench(desk);
      await outside.send(pane("creature", "note"), {
        origin: "keeper",
        focus: true,
        follows: true,
        place: workshop,
      });
      await settled();
      desk.current = { ...desk.current, cursor: middleOf(shows[0]?.bounds) };
      await outside.send(pane("ledger row conversation", "conversation"), {
        origin: "keeper",
        focus: true,
        follows: true,
        place: workshop,
      });
      await settled();

      const [creature, conversation] = shows.map((show) => show.bounds);
      expect(creature?.width).toBeGreaterThan(0);
      expect(
        conversation && { width: conversation.width, height: conversation.height },
        `beside a console at ${JSON.stringify(consoleAt)}, the creature pane at ${JSON.stringify(creature)}, the conversation at ${JSON.stringify(conversation)}`,
      ).toEqual(conversationSize);
    }
  });
});

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

function deskWith(consoleAt: ScreenRect): Desk {
  return {
    console: consoleAt,
    consoleMaximized: false,
    workArea: laptop,
    displays: [{ bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 }],
    cursor: { x: 640, y: 480 },
  };
}

function bench(desk: { current: Desk }) {
  const desktop = fakeDesktop();
  const shows: SurfaceShow[] = [];
  const port: SurfacesPort = {
    ...desktop.port,
    desk: () => Promise.resolve(desk.current),
    show: (request) => {
      shows.push(request);
      return desktop.port.show(request);
    },
  };
  const outside = createPanesOutside({
    port,
    windows: { open: desktop.open },
    motion: () => ({ reducedMotion: true, tier: "interact" }),
    backdrop: () => "backdrop-token",
    insideHint: () => "ctrl+k enter",
    refused: () => undefined,
    desktopRefused: () => undefined,
    placeOnDesk: () => ({
      x: desk.current.console.x + 40,
      y: desk.current.console.y + 300,
      width: 38,
      height: 44,
    }),
  });
  cleanups.push(outside.dispose, desktop.closeEverything);
  return { outside, shows };
}

function middleOf(rect: ScreenRect | undefined): Desk["cursor"] {
  return rect === undefined
    ? { x: 0, y: 0 }
    : { x: rect.x + Math.round(rect.width / 2), y: rect.y + Math.round(rect.height / 2) };
}

function pane(key: string, kind: OutsideKind): Tenant {
  const home = document.createElement("div");
  const body = document.createElement("section");
  body.className = "kw-frame";
  home.append(body);
  document.body.append(home);
  const [title] = createSignal(key);
  return {
    key,
    body,
    kind,
    facts: () => ({ title: title(), hueRank: 0, state: "idle" }),
    left: () => undefined,
    placed: () => undefined,
    cameHome: () => undefined,
    askedInside: () => undefined,
    tookFocus: () => undefined,
    lostFocus: () => undefined,
  };
}

async function settled(): Promise<void> {
  for (let turns = 0; turns < 4; turns += 1) await turn();
}
