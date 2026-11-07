import { describe, expect, it } from "vitest";
import {
  advanceDrag,
  type DragEffect,
  type DragInput,
  dragThreshold,
  holdMs,
  idleDrag,
} from "./drag.ts";

function run(inputs: readonly DragInput[]): DragEffect[] {
  let state = idleDrag;
  const effects: DragEffect[] = [];
  for (const input of inputs) {
    const step = advanceDrag(state, input);
    state = step.state;
    effects.push(...step.effects);
  }
  return effects;
}

describe("advanceDrag", () => {
  it("a quick press and release is a click", () => {
    expect(
      run([
        { type: "down", x: 10, y: 10, t: 0 },
        { type: "move", x: 11, y: 11, t: 50 },
        { type: "up", t: 100 },
      ]),
    ).toEqual([{ kind: "click" }]);
  });

  it("moves past the threshold before dragging, faces the way it walks, and a release after a drag is never a click", () => {
    expect(
      run([
        { type: "down", x: 10, y: 10, t: 0 },
        { type: "move", x: 10 + dragThreshold - 1, y: 10, t: 20 },
        { type: "move", x: 2, y: 10, t: 40 },
        { type: "move", x: 0, y: 12, t: 60 },
        { type: "move", x: 5, y: 12, t: 80 },
        { type: "up", t: 100 },
      ]),
    ).toEqual([
      { kind: "face", facing: "left" },
      { kind: "drag", dx: -8, dy: 0 },
      { kind: "drag", dx: -2, dy: 2 },
      { kind: "face", facing: "right" },
      { kind: "drag", dx: 5, dy: 0 },
      { kind: "dragEnd" },
    ]);
  });

  it("a hold of about 600 ms is one reaction and then nothing on release", () => {
    expect(
      run([
        { type: "down", x: 10, y: 10, t: 0 },
        { type: "tick", t: holdMs - 1 },
        { type: "tick", t: holdMs },
        { type: "tick", t: holdMs + 50 },
        { type: "up", t: holdMs + 100 },
      ]),
    ).toEqual([{ kind: "hold" }]);
  });

  it("a cancel ends a drag cleanly and a stray up is nothing", () => {
    expect(
      run([
        { type: "down", x: 0, y: 0, t: 0 },
        { type: "move", x: 20, y: 0, t: 10 },
        { type: "cancel" },
        { type: "up", t: 20 },
      ]),
    ).toEqual([
      { kind: "face", facing: "right" },
      { kind: "drag", dx: 20, dy: 0 },
      { kind: "dragEnd" },
    ]);
    expect(run([{ type: "up", t: 0 }])).toEqual([]);
  });
});
