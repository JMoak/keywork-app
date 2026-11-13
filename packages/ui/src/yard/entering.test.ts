import { describe, expect, it } from "vitest";
import { asCard, type EnterSight, wayInto } from "./entering.ts";
import { aYardSetting } from "./testing.ts";

describe("where Enter on the rail takes the keeper", () => {
  const diff = aYardSetting({ id: "diff", what: { kind: "diff", ref: "src/math.ts" } });
  const note = aYardSetting({ id: "note", what: { kind: "note", ref: "two stale branches" } });

  it("into a panel already open beside the conversation, in the yard", () => {
    expect(wayInto(diff, sight({ drawn: ["diff"] }))).toBe("focus");
  });

  it("opens a card beside the conversation when the yard has room for it", () => {
    expect(wayInto(diff, sight({ room: true }))).toBe("unfold");
  });

  it("opens it as a tile when the yard has no room, or the window is in tiles", () => {
    expect(wayInto(diff, sight({}))).toBe("tile");
    expect(wayInto(diff, sight({ tiles: true, drawn: ["diff"], room: true }))).toBe("tile");
  });

  it("reads a note in place where no panel can hold it", () => {
    expect(wayInto(note, sight({ tiles: true }))).toBe("read");
    expect(wayInto(note, sight({}))).toBe("read");
  });
});

describe("tiles keep what is set out as cards", () => {
  it("lowers anything that would open beside the conversation, and leaves a card or a mark alone", () => {
    expect(asCard(aYardSetting({ shown: "unfold" })).shown).toBe("card");
    expect(asCard(aYardSetting({ shown: "stage" })).shown).toBe("card");
    expect(asCard(aYardSetting({ shown: "lantern" })).shown).toBe("lantern");
  });
});

function sight(seen: {
  readonly tiles?: boolean;
  readonly drawn?: readonly string[];
  readonly room?: boolean;
}): EnterSight {
  return {
    yardOn: seen.tiles !== true,
    drawnAsPanel: (id) => seen.drawn?.includes(id) === true,
    roomBeside: () => seen.room === true,
  };
}
