import { describe, expect, it } from "vitest";
import type { Surroundings } from "../shared/channels.ts";
import { notificationStates } from "./companion/foreground.ts";
import {
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
  sharedDisplays: [],
};

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
});
