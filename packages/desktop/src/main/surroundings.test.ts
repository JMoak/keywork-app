import { describe, expect, it } from "vitest";
import type { Surroundings } from "../shared/channels.ts";
import { notificationStates } from "./companion/foreground.ts";
import {
  coverSlackDip,
  type DisplayArea,
  displaysCoveredBy,
  type SurroundingFacts,
  type SurroundingsWindow,
  surroundingsOf,
  surroundingsRelay,
  unknownSurroundings,
} from "./surroundings.ts";

const calm: SurroundingFacts = {
  fullscreen: false,
  notificationState: notificationStates.acceptsNotifications,
  foregroundIsOurs: false,
  displays: 1,
  display: "1",
  coveredDisplays: [],
  sharedDisplays: [],
};

const sideBySide: readonly DisplayArea[] = [
  { id: "1", bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: "2", bounds: { x: 1920, y: 0, width: 1280, height: 720 } },
];

describe("what the console's surroundings say", () => {
  it("reads its own window's fullscreen as fullscreen, never as another application's", () => {
    expect(surroundingsOf({ ...calm, fullscreen: true })).toEqual({
      fullscreen: true,
      fullscreenElsewhere: false,
      displayShared: false,
    });
    expect(
      surroundingsOf({
        ...calm,
        fullscreen: true,
        notificationState: notificationStates.busy,
        foregroundIsOurs: true,
      }).fullscreenElsewhere,
    ).toBe(false);
  });

  it("calls another application fullscreen only when the OS says so and the console is not in front", () => {
    for (const state of [notificationStates.busy, notificationStates.d3dFullScreen]) {
      expect(surroundingsOf({ ...calm, notificationState: state }).fullscreenElsewhere).toBe(true);
    }
    for (const state of [
      notificationStates.acceptsNotifications,
      notificationStates.notPresent,
      notificationStates.quietTime,
      notificationStates.app,
      undefined,
    ]) {
      expect(surroundingsOf({ ...calm, notificationState: state }).fullscreenElsewhere).toBe(false);
    }
  });

  it("never guesses which display a fullscreen application covers when there are several", () => {
    const busy = { ...calm, notificationState: notificationStates.busy };
    expect(surroundingsOf({ ...busy, displays: 2 }).fullscreenElsewhere).toBe(false);
    expect(surroundingsOf({ ...busy, foregroundIsOurs: undefined }).fullscreenElsewhere).toBe(
      false,
    );
  });

  it("calls another application fullscreen on a machine with several displays only when its window covers the console's", () => {
    const busyOnTwo = { ...calm, notificationState: notificationStates.busy, displays: 2 };
    expect(surroundingsOf({ ...busyOnTwo, coveredDisplays: ["1"] }).fullscreenElsewhere).toBe(true);
    expect(surroundingsOf({ ...busyOnTwo, coveredDisplays: ["2"] }).fullscreenElsewhere).toBe(
      false,
    );
    expect(
      surroundingsOf({ ...busyOnTwo, coveredDisplays: ["1", "2"], display: "2" })
        .fullscreenElsewhere,
    ).toBe(true);
    expect(
      surroundingsOf({ ...busyOnTwo, coveredDisplays: ["1"], display: undefined })
        .fullscreenElsewhere,
    ).toBe(false);
    expect(
      surroundingsOf({ ...busyOnTwo, coveredDisplays: ["1"], foregroundIsOurs: true })
        .fullscreenElsewhere,
    ).toBe(false);
    expect(
      surroundingsOf({
        ...busyOnTwo,
        coveredDisplays: ["1"],
        notificationState: notificationStates.acceptsNotifications,
      }).fullscreenElsewhere,
    ).toBe(false);
  });

  it("calls the display shared while presenting or while the console shares the display it is on", () => {
    expect(
      surroundingsOf({ ...calm, notificationState: notificationStates.presentationMode })
        .displayShared,
    ).toBe(true);
    expect(surroundingsOf({ ...calm, sharedDisplays: ["1"] }).displayShared).toBe(true);
    expect(surroundingsOf({ ...calm, sharedDisplays: ["2"] }).displayShared).toBe(false);
    expect(
      surroundingsOf({ ...calm, display: undefined, sharedDisplays: ["1"] }).displayShared,
    ).toBe(false);
  });
});

describe("which displays the foreground window covers", () => {
  it("names a display the window covers edge to edge, and none it only overlaps", () => {
    expect(displaysCoveredBy({ x: 0, y: 0, width: 1920, height: 1080 }, sideBySide)).toEqual(["1"]);
    expect(displaysCoveredBy({ x: 1920, y: 0, width: 1280, height: 720 }, sideBySide)).toEqual([
      "2",
    ]);
    expect(displaysCoveredBy({ x: 0, y: 0, width: 1920, height: 1040 }, sideBySide)).toEqual([]);
    expect(displaysCoveredBy({ x: 100, y: 100, width: 800, height: 600 }, sideBySide)).toEqual([]);
    expect(displaysCoveredBy(undefined, sideBySide)).toEqual([]);
  });

  it("takes a window spanning both displays as covering each", () => {
    expect(displaysCoveredBy({ x: 0, y: 0, width: 3200, height: 1080 }, sideBySide)).toEqual([
      "1",
      "2",
    ]);
  });

  it(`forgives ${coverSlackDip} DIP of rounding from the physical rectangle, and no more`, () => {
    const slack = coverSlackDip;
    const rounded = { x: slack, y: slack, width: 1920 - 2 * slack, height: 1080 - 2 * slack };
    expect(displaysCoveredBy(rounded, sideBySide)).toEqual(["1"]);
    const short = { x: slack + 1, y: 0, width: 1920 - slack - 1, height: 1080 };
    expect(displaysCoveredBy(short, sideBySide)).toEqual([]);
  });
});

describe("the surroundings relay", () => {
  it("sends each window its own reading, and only when it changed", () => {
    let state: number | undefined = notificationStates.acceptsNotifications;
    const sent: Array<[number, Surroundings]> = [];
    const windowOn = (id: number, display: string, fullscreen = false): SurroundingsWindow => ({
      id,
      isDestroyed: () => false,
      isFullScreen: () => fullscreen,
      display: () => display,
      send: (surroundings) => sent.push([id, surroundings]),
    });
    const relay = surroundingsRelay({
      windows: () => [windowOn(1, "1"), windowOn(2, "2", true)],
      displays: () => 1,
      notificationState: () => state,
      foregroundIsOurs: () => false,
      coveredDisplays: () => [],
      sharedDisplays: () => ["2"],
    });
    relay.push();
    relay.push();
    expect(sent).toEqual([
      [1, unknownSurroundings],
      [2, { fullscreen: true, fullscreenElsewhere: false, displayShared: true }],
    ]);
    state = notificationStates.busy;
    relay.push();
    expect(sent.slice(2).map(([id, said]) => [id, said.fullscreenElsewhere])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(relay.read(undefined)).toEqual(unknownSurroundings);
  });

  it("tells only the window on the covered display that another application is fullscreen", () => {
    const sent: Array<[number, boolean]> = [];
    const windowOn = (id: number, display: string): SurroundingsWindow => ({
      id,
      isDestroyed: () => false,
      isFullScreen: () => false,
      display: () => display,
      send: (surroundings) => sent.push([id, surroundings.fullscreenElsewhere]),
    });
    surroundingsRelay({
      windows: () => [windowOn(1, "1"), windowOn(2, "2")],
      displays: () => 2,
      notificationState: () => notificationStates.d3dFullScreen,
      foregroundIsOurs: () => false,
      coveredDisplays: () =>
        displaysCoveredBy({ x: 1920, y: 0, width: 1280, height: 720 }, sideBySide),
      sharedDisplays: () => [],
    }).push();
    expect(sent).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});
