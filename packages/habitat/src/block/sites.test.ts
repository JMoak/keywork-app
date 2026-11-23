import type { CreatureWorksite } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { floorsFor, projectSitesOf } from "./sites.ts";
import { noon } from "./testing.ts";

describe("project buildings from the directories a creature has worked in", () => {
  it("grows floors on a doubling scale: one for one or two conversations, one more per doubling, at most twenty", () => {
    expect([1, 2, 3, 4, 7, 8, 15, 16, 31, 32].map(floorsFor)).toEqual([
      1, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    expect(floorsFor(2 ** 20 - 1)).toBe(19);
    expect(floorsFor(2 ** 20)).toBe(20);
    expect(floorsFor(2 ** 30)).toBe(20);
  });

  it("gives two creatures that worked in one directory a building each with the same id, and each child of one parent its own building carrying the parent", () => {
    const sites = projectSitesOf([
      row("ada", "C:/src/keywork", "C:/src"),
      row("ada", "C:/src/stead", "C:/src"),
      row("ada", "C:/work/lamps", "C:/work/lamps"),
      row("bea", "C:/src/keywork", "C:/src"),
    ]);
    const told = (slug: string) =>
      sites[slug]?.map(({ id, root, family }) => ({ id, root, family }));
    expect(told("ada")).toEqual([
      { id: "C:/src/keywork", root: "C:/src", family: 0 },
      { id: "C:/src/stead", root: "C:/src", family: 0 },
      { id: "C:/work/lamps", root: undefined, family: undefined },
    ]);
    expect(told("bea")).toEqual([{ id: "C:/src/keywork", root: "C:/src", family: 0 }]);
  });
});

function row(creature: string, directory: string, root: string): CreatureWorksite {
  const at = new Date(noon).toISOString();
  return {
    creature,
    directory,
    root,
    project: null,
    conversations: 1,
    since: at,
    latest: at,
    active: false,
  };
}
