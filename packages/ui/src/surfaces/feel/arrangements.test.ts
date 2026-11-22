import { type ArrangementShape, arrangementShapes } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  dealsShaped,
  dealsToTry,
  facing,
  namedLikeEachShape,
  shapesToTry,
} from "./arrangements.ts";
import { type Deal, dealMetrics, type Seat, type Share, shareOf } from "./pattern-deals.ts";

const counts = Array.from({ length: 12 }, (_, at) => at + 1);

function shares(deal: Deal): Share[] {
  return deal.seats.map(shareOf);
}

function room({ width, height }: Share): number {
  return Number((width * height).toFixed(6));
}

function overlap(one: Share, other: Share): boolean {
  const across = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
  const down = Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y);
  return across > 1e-9 && down > 1e-9;
}

function finestCut(seat: Seat): number {
  return Math.max(seat.left.of, seat.top.of, seat.right.of, seat.bottom.of);
}

function first(shape: ArrangementShape, count: number): Share[] {
  return shares(dealsShaped(shape, count)[0] as Deal);
}

describe("the side the large seat takes", () => {
  const stack = dealsShaped("lead-and-stack", 3)[0] as Deal;
  const leadOf = (deal: Deal): Share => shares(deal)[0] as Share;

  it("is the left unless another is asked, and mirrors or turns the whole deal for the others", () => {
    expect(leadOf(stack)).toMatchObject({ x: 0, y: 0, height: 1 });
    expect(facing(stack, "left")).toBe(stack);
    expect(leadOf(facing(stack, "right")).x + leadOf(facing(stack, "right")).width).toBeCloseTo(1);
    expect(leadOf(facing(stack, "top"))).toMatchObject({ x: 0, y: 0, width: 1 });
    const below = leadOf(facing(stack, "bottom"));
    expect([below.width, below.y + below.height]).toEqual([1, 1]);
  });

  it("keeps every seat on the stage and apart, whichever side", () => {
    for (const side of ["right", "top", "bottom"] as const) {
      const seats = shares(facing(stack, side));
      expect(seats.reduce((sum, seat) => sum + room(seat), 0)).toBeCloseTo(1);
      expect(
        seats.some((one, at) => seats.slice(at + 1).some((other) => overlap(one, other))),
      ).toBe(false);
    }
  });
});

describe("the pictures tried for one large pane with cards around it", () => {
  it("are those whose lead is larger than a card both ways first, and never the lead beside a stack", () => {
    const names = (count: number): string[][] =>
      dealsToTry({ shape: "lead-and-cards", led: true }, count).map((deals) =>
        deals.map((deal) => deal.name),
      );
    expect(names(9)).toEqual([["marquee"], ["grid"]]);
    expect(names(8)).toEqual([["studio"], ["banner"], ["grid"]]);
    expect(names(11)).toEqual([["marquee"], ["keystone", "lead"], ["grid"]]);
    expect(names(2)).toEqual([["lead and cards"], ["grid"]]);
    expect(namedLikeEachShape["lead-and-stack"]).toEqual(["tower"]);
  });
});

describe("the arrangements a creature may name", () => {
  it("seat exactly the panes named, apart, on halves, thirds and quarters, a quarter at least", () => {
    for (const shape of arrangementShapes) {
      for (const count of counts) {
        for (const deal of dealsShaped(shape, count)) {
          const seats = shares(deal);
          const told = `${shape} for ${count} as ${deal.name}`;
          expect([told, seats.length]).toEqual([told, count]);
          const finest = Math.max(...deal.seats.map(finestCut));
          const smallest = Math.min(...seats.flatMap((seat) => [seat.width, seat.height]));
          expect([told, finest <= dealMetrics.finestCut]).toEqual([told, true]);
          expect([told, smallest >= 0.25 - 1e-9]).toEqual([told, true]);
          const lying = seats.flatMap((one, at) =>
            seats.slice(at + 1).filter((other) => overlap(one, other)),
          );
          expect([told, lying]).toEqual([told, []]);
        }
      }
    }
  });

  it("offer at least one arrangement of each character up to nine, and an even grid past any", () => {
    for (const shape of arrangementShapes) {
      for (const count of counts.filter((each) => each <= 9)) {
        expect([shape, count, dealsShaped(shape, count).length > 0]).toEqual([shape, count, true]);
      }
    }
    for (const count of [1, 5, 13, 16]) {
      expect(dealsToTry({ shape: "lead-and-cards", led: true }, count).at(-1)?.[0]?.name).toBe(
        "grid",
      );
    }
  });

  it("seat the lead first in the largest seat, with a stack beside it or cards around it", () => {
    for (const count of counts.filter((each) => each >= 2)) {
      for (const shape of ["lead-and-stack", "lead-and-cards"] as const) {
        for (const deal of dealsShaped(shape, count)) {
          const [lead, ...rest] = shares(deal).map(room);
          expect([shape, count, deal.name, Math.max(...rest) < (lead ?? 0)]).toEqual([
            shape,
            count,
            deal.name,
            true,
          ]);
        }
      }
    }
    const [lead, ...stack] = first("lead-and-stack", 4);
    expect(lead).toMatchObject({ x: 0, y: 0, height: 1 });
    expect(new Set(stack.map((seat) => seat.x)).size).toBe(1);
    expect(stack.every((seat) => seat.x >= (lead?.width ?? 1) - 1e-9)).toBe(true);
  });

  it("split two large panes side by side over the rest, and lay a board out in columns of cards", () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const [left, right, ...rest] = first("split", count);
      expect([count, left?.y, right?.y, room(left as Share)]).toEqual([
        count,
        0,
        0,
        room(right as Share),
      ]);
      expect([count, rest.every((seat) => room(seat) < room(left as Share))]).toEqual([
        count,
        true,
      ]);
    }
    expect(dealsShaped("split", 11)).toEqual([]);
    const board = first("board", 7);
    expect(new Set(board.map((card) => card.height))).toEqual(new Set([0.25]));
    expect(board.map((card) => card.x)).toEqual(board.map((card) => card.x).toSorted());
  });

  it("choose a shape of fitting character when only told how the panes relate", () => {
    expect(shapesToTry({ relation: "sequence", led: false }, 3)).toEqual(["columns"]);
    expect(shapesToTry({ relation: "sequence", led: false }, 7)).toEqual(["grid"]);
    expect(shapesToTry({ relation: "alternatives", led: false }, 2)).toEqual(["columns"]);
    expect(shapesToTry({ relation: "tasks", led: false }, 6)).toEqual(["board"]);
    expect(shapesToTry({ relation: "notes", led: true }, 6)).toEqual(["lead-and-cards"]);
    expect(shapesToTry({ led: true }, 4)).toEqual(["lead-and-stack", "lead-and-cards"]);
    expect(shapesToTry({ led: false }, 4)).toEqual(["grid"]);
    expect(shapesToTry({ shape: "split", relation: "tasks", led: false }, 4)).toEqual(["split"]);
  });
});
