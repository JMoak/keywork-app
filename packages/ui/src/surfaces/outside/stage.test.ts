import { describe, expect, it } from "vitest";
import { madeSafe } from "../feel/pattern-compose.ts";
import { type Seat, seatOn } from "../feel/pattern-deals.ts";
import { maximised, windowed, workAreas } from "../feel/pattern-testing.ts";
import type { Desk, ScreenRect } from "../port.ts";
import {
  type LatticeSeat,
  namedSeats,
  placeWords,
  seatOnTheLattice,
  shareOnTheStage,
  stageFacts,
  stageHolding,
} from "./stage.ts";

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

const beside: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [{ bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 }],
  cursor: { x: 640, y: 480 },
};

function madeARectangle(
  desk: Desk,
  seat: LatticeSeat,
): { said: readonly string[]; back: LatticeSeat } {
  const { room } = stageHolding(desk);
  const { deal, said } = madeSafe({ name: "one", seats: [shareOnTheStage(seat)] });
  return { said, back: seatOnTheLattice(room, seatOn(room, deal.seats[0] as Seat)) };
}

describe("a seat on the stage's lattice", () => {
  it("is read back as it was named once it has been made a rectangle, on every stage", () => {
    for (const area of workAreas) {
      for (const desk of [windowed(area), maximised(area)]) {
        for (const [name, seat] of Object.entries(namedSeats)) {
          const { said, back } = madeARectangle(desk, seat);
          expect([name, said, back]).toEqual([name, [], seat]);
        }
      }
    }
  });

  it("moves a seat off the lines of halves, thirds and quarters onto them, and says so", () => {
    const { said, back } = madeARectangle(beside, { x: 1, y: 0, w: 5, h: 12 });
    expect(said).toEqual(["seat 1 was off the grid's lines and was moved onto them"]);
    expect(back).toEqual(namedSeats["left-half"]);
  });

  it("widens a seat narrower than a quarter until it can be read", () => {
    const { said, back } = madeARectangle(beside, { x: 0, y: 0, w: 1, h: 12 });
    expect(said).toContain("seat 1 was too narrow to read and was widened");
    expect(back).toEqual({ x: 0, y: 0, w: 3, h: 12 });
  });

  it("is spoken of by its name, or by the lattice lines it lies between", () => {
    expect(placeWords(namedSeats.full as LatticeSeat)).toBe("full");
    expect(placeWords(namedSeats["right-two-thirds"] as LatticeSeat)).toBe("right-two-thirds");
    expect(placeWords({ x: 4, y: 0, w: 4, h: 6 })).toBe("columns 4 to 8, rows 0 to 6");
    expect(placeWords({ x: 9, y: 9, w: 3, h: 3 })).toBe("columns 9 to 12, rows 9 to 12");
  });
});

describe("the stage", () => {
  it("is the room beside the console while that holds four panes, and says how many cards fit", () => {
    const stage = stageHolding(beside);
    expect(stage.room).toEqual({ x: 1112, y: 12, width: 796, height: 1016 });
    expect(stageFacts(beside, stage)).toEqual({
      room: "beside",
      cardsAcross: 2,
      cardsDown: 4,
      consoleMaximised: false,
    });
  });

  it("is over the console's far side when it is maximised, and the display once a pane stands across it", () => {
    const full = maximised(laptop);
    expect(stageFacts(full, stageHolding(full))).toMatchObject({
      room: "over",
      consoleMaximised: true,
    });
    const acrossIt: ScreenRect = { x: 12, y: 12, width: 1896, height: 1016 };
    expect(stageFacts(full, stageHolding(full, [acrossIt])).room).toBe("display");
  });

  it("widens to hold a pane the keeper carried off it, so every seat is told on one lattice", () => {
    const overTheConsole: ScreenRect = { x: 400, y: 200, width: 480, height: 320 };
    expect(stageFacts(beside, stageHolding(beside, [overTheConsole])).room).not.toBe("beside");
  });
});
