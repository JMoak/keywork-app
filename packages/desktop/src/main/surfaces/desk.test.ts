import { describe, expect, it } from "vitest";
import { deskLayoutKey, deskOf, translationBetween, visibleOutline, wholeRect } from "./desk.ts";
import { consoleBounds, consoleSeen, framed, laptop, sideMonitor } from "./testing.ts";

const screen = {
  displays: () => [laptop, sideMonitor],
  displayMatching: () => laptop,
  cursor: () => ({ x: 640, y: 480 }),
};

const consoleFrame = {
  bounds: () => framed(consoleBounds),
  contentBounds: () => consoleBounds,
  isMaximized: () => false,
};

describe("deskOf", () => {
  it("reads the console as the keeper sees it, its display's work area, every display and the cursor", () => {
    expect(deskOf(consoleFrame, screen)).toEqual({
      console: consoleSeen,
      consoleMaximized: false,
      workArea: laptop.workArea,
      displays: [laptop, sideMonitor],
      cursor: { x: 640, y: 480 },
    });
  });

  it("stands the cursor in the middle of the console where the desktop will not say", () => {
    const blind = { ...screen, cursor: () => undefined };
    expect(deskOf(consoleFrame, blind).cursor).toEqual({ x: 800, y: 485 });
  });
});

describe("visibleOutline", () => {
  it("runs from the top of the title bar to the page's other three edges", () => {
    expect(visibleOutline(consoleFrame, laptop.workArea)).toEqual({
      x: 200,
      y: 69,
      width: 1200,
      height: 831,
    });
  });

  it("stops at the top of the work area when a maximised window overhangs its display", () => {
    const maximized = {
      bounds: () => ({ x: -8, y: -8, width: 1936, height: 1056 }),
      contentBounds: () => ({ x: 0, y: 23, width: 1920, height: 1017 }),
      isMaximized: () => true,
    };
    expect(visibleOutline(maximized, laptop.workArea)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1040,
    });
  });

  it("is the window's own bounds where a frame has no unseen border", () => {
    const outer = { x: 300, y: 200, width: 900, height: 628 };
    const plain = {
      bounds: () => outer,
      contentBounds: () => ({ x: 300, y: 228, width: 900, height: 600 }),
      isMaximized: () => false,
    };
    expect(visibleOutline(plain, laptop.workArea)).toEqual(outer);
  });

  it("is the page area of a window with no frame at all", () => {
    const bare = {
      bounds: () => consoleBounds,
      contentBounds: () => consoleBounds,
      isMaximized: () => false,
    };
    expect(visibleOutline(bare, laptop.workArea)).toEqual(consoleBounds);
  });
});

describe("deskLayoutKey", () => {
  it("is the same for two desks that differ only in where the cursor is", () => {
    const desk = deskOf(consoleFrame, screen);
    expect(deskLayoutKey({ ...desk, cursor: { x: 1, y: 2 } })).toBe(deskLayoutKey(desk));
    expect(deskLayoutKey({ ...desk, consoleMaximized: true })).not.toBe(deskLayoutKey(desk));
  });
});

describe("translationBetween", () => {
  it("is how far a console moved when it kept its size", () => {
    expect(translationBetween(consoleBounds, { ...consoleBounds, x: 260, y: 70 })).toEqual({
      x: 60,
      y: -30,
    });
  });

  it("is nothing when the console stood still or changed size", () => {
    expect(translationBetween(consoleBounds, consoleBounds)).toBeUndefined();
    expect(
      translationBetween(consoleBounds, { x: 0, y: 0, width: 1920, height: 1040 }),
    ).toBeUndefined();
    expect(
      translationBetween(consoleBounds, { ...consoleBounds, x: 150, width: 1250 }),
    ).toBeUndefined();
  });
});

describe("wholeRect", () => {
  it("rounds what a zoomed page measured to whole screen points", () => {
    expect(wholeRect({ x: 10.4, y: 19.5, width: 480.6, height: 359.2 })).toEqual({
      x: 10,
      y: 20,
      width: 481,
      height: 359,
    });
  });
});
