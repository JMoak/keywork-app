import type { HabitatState } from "@keywork-app/habitat";
import type { Hit } from "@keywork-app/habitat/block";
import { noon, sketchTown, slugOf } from "@keywork-app/habitat/block/testing";
import { describe, expect, it } from "vitest";
import { noThreadYet } from "../copy.ts";
import { directoryInWorkspace, outsideTheWorkspace, pressedOn } from "./press.ts";

const root = "C:\\work\\home";
const working = slugOf(0);
const asleep = slugOf(4);

describe("pressing a workshop's faces", () => {
  it("opens the creature's conversation at the door", () => {
    const town = withConversation(sketchTown(5), working, "talk-0");
    expect(pressedOn(face(working, "door"), town, root)).toEqual({
      kind: "session",
      session: "talk-0",
    });
    expect(pressedOn(face(asleep, "door"), sketchTown(5), root)).toEqual({
      kind: "notice",
      line: noThreadYet(asleep),
    });
  });

  it("opens the thread that runs at the bench, or the latest one when the bench is dark", () => {
    const town = sketchTown(5);
    expect(pressedOn(face(working, "bench"), town, root)).toEqual({
      kind: "session",
      session: `${working}-now`,
    });
    const latest = pressedOn(face(asleep, "bench"), town, root);
    expect(latest.kind).toBe("session");
    const empty: HabitatState = { ...town, threads: {} };
    expect(pressedOn(face(asleep, "bench"), empty, root)).toEqual({
      kind: "notice",
      line: noThreadYet(asleep),
    });
  });

  it("opens the creature's profile and its threads at the shelf, and its own chores at the board", () => {
    const town = sketchTown(5);
    expect(pressedOn(face(working, "shelf"), town, root)).toEqual({
      kind: "pane",
      spec: { kind: "creature", slug: working },
    });
    expect(pressedOn(face(working, "board"), town, root)).toEqual({
      kind: "pane",
      spec: { kind: "chores", creature: working },
    });
    expect(pressedOn(face(working, undefined), town, root)).toEqual({
      kind: "creature",
      creature: working,
    });
  });
});

describe("pressing the rest of the stead", () => {
  it("opens a project building's directory in the files pane when it lies in the workspace", () => {
    const town = sketchTown(2);
    const shed = (project: string): Hit => ({
      target: { kind: "shed", creature: working, project },
    });
    expect(pressedOn(shed("C:\\work\\home\\lamps\\src"), town, root)).toEqual({
      kind: "pane",
      spec: { kind: "file", path: "lamps/src" },
    });
    expect(pressedOn(shed("c:/work/home"), town, root)).toEqual({
      kind: "pane",
      spec: { kind: "file", path: "" },
    });
    expect(pressedOn(shed("C:\\work\\homestead"), town, root)).toEqual({
      kind: "notice",
      line: outsideTheWorkspace("C:\\work\\homestead"),
    });
  });

  it("opens the porch's asks, the sessions by the storehouse, the mills, and a creature by its figure", () => {
    const town = sketchTown(5);
    expect(pressedOn({ target: { kind: "house" } }, town, root)).toEqual({
      kind: "pane",
      spec: { kind: "needs-you" },
    });
    expect(pressedOn({ target: { kind: "storehouse" } }, town, root)).toEqual({
      kind: "pane",
      spec: { kind: "tree" },
    });
    expect(pressedOn({ target: { kind: "mill", mill: "mill" } }, town, root)).toEqual({
      kind: "pane",
      spec: { kind: "mills" },
    });
    expect(pressedOn({ target: { kind: "creature", creature: asleep } }, town, root)).toEqual({
      kind: "creature",
      creature: asleep,
    });
  });

  it("finds a directory's place inside the workspace by its path alone", () => {
    expect(directoryInWorkspace("/srv/home/a/b/", "/srv/home")).toBe("a/b");
    expect(directoryInWorkspace("/srv/home", "/srv/home/")).toBe("");
    expect(directoryInWorkspace("/srv/homely", "/srv/home")).toBeUndefined();
    expect(directoryInWorkspace("/srv/home/a", "")).toBeUndefined();
  });
});

function face(creature: string, meaning: string | undefined): Hit {
  return {
    target: { kind: "workshop", creature },
    ...(meaning === undefined ? {} : { meaning }),
  };
}

function withConversation(state: HabitatState, slug: string, conversation: string): HabitatState {
  const held = state.creatures[slug];
  if (held === undefined) throw new Error(`no ${slug} in the town at ${noon}`);
  return { ...state, creatures: { ...state.creatures, [slug]: { ...held, conversation } } };
}
