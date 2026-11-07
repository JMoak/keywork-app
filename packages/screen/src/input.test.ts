import { describe, expect, it } from "vitest";
import {
  channelOf,
  inputChannels,
  inputOrder,
  inputSequencer,
  isInside,
  normalizedOnVideo,
  parseRemoteInput,
  pointOn,
} from "./input.ts";

describe("remote input on ctl and ptr", () => {
  it("opens ctl ordered and reliable, ptr unordered and lossy", () => {
    expect(inputChannels.ctl).toEqual({ label: "ctl", id: 1, ordered: true });
    expect(inputChannels.ptr).toEqual({ label: "ptr", id: 2, ordered: false, maxRetransmits: 0 });
  });

  it("sends moves and wheels on ptr, buttons, keys and release-all on ctl, each channel numbered from 1", () => {
    const sequence = inputSequencer();
    expect(sequence.stamp({ kind: "move", x: 0.5, y: 0.5 })).toEqual({
      channel: "ptr",
      input: { kind: "move", x: 0.5, y: 0.5, seq: 1 },
    });
    expect(sequence.stamp({ kind: "key", code: "KeyA", down: true }).input.seq).toBe(1);
    expect(sequence.stamp({ kind: "wheel", x: 0, y: 0, dx: 0, dy: 3 }).input.seq).toBe(2);
    expect(channelOf({ kind: "button", x: 0, y: 0, button: "left", down: true })).toBe("ctl");
    expect(channelOf({ kind: "release-all" })).toBe("ctl");
  });

  it("drops a stale or repeated input on either channel", () => {
    const order = inputOrder();
    const move = (seq: number) => ({ kind: "move" as const, seq, x: 0, y: 0 });
    expect(order.admit("ptr", move(2))).toBe(true);
    expect(order.admit("ptr", move(1))).toBe(false);
    expect(order.admit("ptr", move(2))).toBe(false);
    expect(order.admit("ptr", move(5))).toBe(true);
    expect(order.admit("ctl", { kind: "release-all", seq: 1 })).toBe(true);
  });

  it("parses only normalized, sequenced input of the channel it came on", () => {
    expect(parseRemoteInput("ptr", '{"kind":"move","seq":1,"x":0.25,"y":1}')).toEqual({
      kind: "move",
      seq: 1,
      x: 0.25,
      y: 1,
    });
    expect(parseRemoteInput("ptr", { kind: "move", seq: 1, x: 1.5, y: 0 })).toBeUndefined();
    expect(parseRemoteInput("ptr", { kind: "move", x: 0, y: 0 })).toBeUndefined();
    expect(parseRemoteInput("ptr", { kind: "key", seq: 1, code: "KeyA", down: true })).toBe(
      undefined,
    );
    expect(parseRemoteInput("ctl", { kind: "key", seq: 1, code: "Key A", down: true })).toBe(
      undefined,
    );
    expect(parseRemoteInput("ctl", "not json")).toBeUndefined();
  });

  it("maps a normalized point onto a display and tests it against a rect", () => {
    const display = { x: -1920, y: 0, width: 1920, height: 1080 };
    expect(pointOn(display, { x: 0.5, y: 0.5 })).toEqual({ x: -960, y: 540 });
    expect(pointOn(display, { x: 2, y: -1 })).toEqual({ x: 0, y: 0 });
    expect(isInside({ x: 10, y: 10 }, { x: 0, y: 0, width: 10, height: 20 })).toBe(false);
    expect(isInside({ x: 9, y: 19 }, { x: 0, y: 0, width: 10, height: 20 })).toBe(true);
  });

  it("normalizes a click on a letterboxed video and ignores the bars", () => {
    const box = { x: 0, y: 0, width: 1000, height: 1000 };
    const video = { width: 1920, height: 1080 };
    expect(normalizedOnVideo({ x: 500, y: 500 }, box, video)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizedOnVideo({ x: 500, y: 100 }, box, video)).toBeUndefined();
    expect(normalizedOnVideo({ x: 0, y: 500 }, box, { width: 0, height: 0 })).toBeUndefined();
  });
});
