import { readFileSync } from "node:fs";
import { gallery, keyworkDay, keyworkNight } from "@keywork-app/ui/theme";
import { describe, expect, it } from "vitest";
import {
  bannerLine,
  bannerPage,
  edgePage,
  isResumeNavigation,
  keeperIndicatorPalettes,
  overlayWindowPlan,
  paletteFor,
  resumeUrl,
  stopUrl,
  themedIndicatorPalettes,
  wornThemeSlot,
} from "./indicator.ts";

const night = themedIndicatorPalettes(keyworkNight);

const viewing = {
  who: "Jordan on spark-ad4d",
  mode: "view" as const,
  shortcut: "Ctrl+Alt+Shift+X",
};

describe("one overlay for view and control", () => {
  it("is excluded from capture, above everything and never focusable, with click-through edges", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      for (const part of ["edge", "banner"] as const) {
        expect(overlayWindowPlan(part, platform)).toMatchObject({
          level: "screen-saver",
          excludedFromCapture: true,
          focusable: false,
          clickThrough: part === "edge",
        });
      }
    }
  });

  it("is the theme's amber for view and its error red for control, inked in its background", () => {
    for (const theme of gallery) {
      const palettes = themedIndicatorPalettes(theme);
      expect(paletteFor(viewing, palettes)).toEqual({
        ground: theme.terminal.yellow,
        ink: theme.tokens.background,
      });
      expect(paletteFor({ ...viewing, mode: "control" }, palettes)).toEqual({
        ground: theme.tokens.error,
        ink: theme.tokens.background,
      });
    }
  });

  it("wears the theme the console pushed, else the given fallback, else the system pair", () => {
    const dark = () => true;
    const slot = wornThemeSlot();
    expect(keeperIndicatorPalettes({ worn: slot.worn, prefersDark: dark, fallback: night })).toBe(
      night,
    );
    slot.wear("keywork-day");
    expect(keeperIndicatorPalettes({ worn: slot.worn, prefersDark: dark })).toEqual(
      themedIndicatorPalettes(keyworkDay),
    );
    slot.wear(42);
    slot.wear("");
    expect(slot.worn()).toBe("keywork-day");
    slot.wear("a-theme-only-the-node-serves");
    expect(keeperIndicatorPalettes({ worn: slot.worn, prefersDark: () => false })).toEqual(
      themedIndicatorPalettes(keyworkDay),
    );
    expect(keeperIndicatorPalettes({ worn: () => undefined, prefersDark: dark })).toEqual(night);
  });

  it("carries no colour literal anywhere in the indicator path", () => {
    const literal =
      /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(|["'`](?:red|white|black|yellow|orange|amber|Mark|MarkText|Canvas|CanvasText|Highlight|HighlightText)["'`]/i;
    for (const file of ["indicator.ts", "electron.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect({ file, literal: source.match(literal)?.[0] }).toEqual({ file, literal: undefined });
    }
  });

  it("says who controls, marks an agent apart, and stripes an agent's edges", () => {
    expect(bannerLine({ ...viewing, mode: "control" })).toBe(
      "Jordan on spark-ad4d is controlling this screen · Stop or Ctrl+Alt+Shift+X ends it",
    );
    expect(bannerLine({ ...viewing, mode: "control", controller: "agent" })).toContain(
      "agent Jordan on spark-ad4d is controlling",
    );
    const palette = night.control;
    expect(edgePage(palette, true)).toContain("repeating-linear-gradient");
    expect(edgePage(palette)).not.toContain("repeating-linear-gradient");
  });

  it("offers Resume beside Stop only while control is paused by local input", () => {
    const paused = { ...viewing, mode: "control" as const, paused: true };
    expect(bannerLine(paused)).toContain("control is paused while you use this machine");
    const page = bannerPage(paused, night.control);
    expect(page).toContain(`href="${resumeUrl}"`);
    expect(page).toContain(`href="${stopUrl}"`);
    expect(bannerPage({ ...paused, paused: false }, night.control)).not.toContain(resumeUrl);
    expect(isResumeNavigation(resumeUrl)).toBe(true);
  });
});

describe("the control input channel from a sender window", () => {
  it("reaches the sharer only from a sender main opened, on ctl or ptr, and unregisters", async () => {
    const { registerControlHandlers } = await import("./ipc.ts");
    const listeners = new Map<
      string,
      (event: { sender: { id: number } }, ...args: unknown[]) => void
    >();
    const received: unknown[][] = [];
    const host = {
      sharer: { senderInput: (...args: unknown[]) => received.push(args) },
    } as unknown as Parameters<typeof registerControlHandlers>[1];
    const unregister = registerControlHandlers(
      {
        handle: () => undefined,
        removeHandler: () => undefined,
        on: (channel, listener) => listeners.set(channel, listener),
        removeListener: (channel) => listeners.delete(channel),
      },
      host,
      { sessionOf: (id) => (id === 3 ? "session-1" : undefined), ready: () => undefined },
    );
    const send = listeners.get("screen:sender-input");
    send?.({ sender: { id: 3 } }, "ctl", { kind: "release-all", seq: 1 });
    send?.({ sender: { id: 9 } }, "ctl", { kind: "release-all", seq: 2 });
    send?.({ sender: { id: 3 } }, "files", {});
    expect(received).toEqual([["session-1", "ctl", { kind: "release-all", seq: 1 }]]);
    unregister();
    expect(listeners.size).toBe(0);
  });
});
