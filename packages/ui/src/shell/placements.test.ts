import { describe, expect, it } from "vitest";
import { arrangeNotices } from "../surfaces/outside/panes-outside.tsx";
import type { Desk, ScreenRect } from "../surfaces/port.ts";
import { arrangementSaid, placementsReport } from "./placements.ts";

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

const desk: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [{ bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 }],
  cursor: { x: 640, y: 480 },
};

const leftHalf: ScreenRect = { x: 1112, y: 12, width: 392, height: 1016 };
const topRight: ScreenRect = { x: 1516, y: 12, width: 392, height: 502 };

describe("the placements the console reports", () => {
  it("tell where each setting stands, its seat snapped to the stage's lattice, and who put it there", () => {
    const answer = { id: "arr-1", said: "2 panes now stand beside the console." };
    const report = placementsReport(
      desk,
      [
        { id: "plan", where: "outside", by: "creature", bounds: leftHalf },
        { id: "notes", where: "outside", by: "keeper", bounds: { ...topRight, x: 1520, y: 20 } },
        { id: "change", where: "beside", by: "console" },
        { id: "log", where: "inside", by: "keeper", bounds: topRight },
        { id: "arriving", where: "outside", by: "console" },
      ],
      answer,
    );
    expect(report).toEqual({
      stage: { room: "beside", cardsAcross: 2, cardsDown: 4, consoleMaximised: false },
      placements: [
        { id: "plan", where: "outside", by: "creature", seat: { x: 0, y: 0, w: 6, h: 12 } },
        { id: "notes", where: "outside", by: "keeper", seat: { x: 6, y: 0, w: 6, h: 6 } },
        { id: "change", where: "beside", by: "console" },
        { id: "log", where: "inside", by: "keeper" },
        { id: "arriving", where: "outside", by: "console" },
      ],
      arrangement: answer,
    });
  });

  it("measure every seat on the stage that holds them all once the keeper carries one over the console", () => {
    const carried: ScreenRect = { x: 400, y: 200, width: 480, height: 320 };
    const report = placementsReport(desk, [
      { id: "plan", where: "outside", by: "creature", bounds: leftHalf },
      { id: "notes", where: "outside", by: "keeper", bounds: carried },
    ]);
    expect(report.stage.room).toBe("over");
    expect(report.placements.map((placement) => placement.seat?.x)).toEqual([6, 1]);
    expect(report.arrangement).toBeUndefined();
  });
});

describe("what the console says an arrangement did", () => {
  it("says how many panes stand where and as what, without listing their seats", () => {
    expect(
      arrangementSaid({
        shape: "lead-and-stack",
        look: "lead and stack",
        room: "beside",
        seated: [
          { title: "Plan", seat: { x: 0, y: 0, w: 8, h: 12 } },
          { title: "Notes", seat: { x: 8, y: 0, w: 4, h: 6 } },
          { title: "Log", seat: { x: 8, y: 6, w: 4, h: 6 } },
        ],
        authored: [],
        corrected: [],
        keepers: ["Change"],
        inside: [],
      }),
    ).toBe(
      '3 panes now stand beside the console as one large pane beside a column of the rest. "Change" stayed where the keeper put it.',
    );
  });
});

describe("what the console tells of settings that are not where they were asked to be", () => {
  it("names up to four panes that share one outcome and counts the rest, inside what the engine keeps", () => {
    const titles = ["Plan", "Parts", "Morning", "Afternoon", "Sunday", "Risks", "Storage"];
    const said = arrangementSaid({
      shape: undefined,
      look: "composed",
      room: "beside",
      seated: titles.slice(0, 3).map((title) => ({ title, seat: undefined })),
      authored: titles,
      corrected: [1, 2, 3].map((seat) => arrangeNotices.cutBack(seat)),
      keepers: [],
      inside: [],
      aside: [],
      backBeside: titles.slice(1),
      letGo: true,
    });
    expect(said).toBe(
      '3 panes now stand beside the console as you composed them. The layout from before the drill was let go. "Plan", "Parts" and "Morning" were cut back to clear a pane that is not yours to move. "Parts", "Morning", "Afternoon", "Sunday" and 2 more went back beside the conversation as cards: no room was left on the stage. Name them in arrange to set them out again.',
    );
    expect(said.length).toBeLessThanOrEqual(400);
  });
});
