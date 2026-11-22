import { settingPanes } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { definitionOf } from "../panes/index.ts";
import { namesAPath, panelTitleOf, satelliteOf, unknownPaneWords } from "./satellites.ts";
import { aSetting } from "./testing.ts";

describe("a diff set out for the keeper", () => {
  it("opens on the one file its ref names", () => {
    const math = aSetting({ what: { kind: "diff", ref: "src/math.ts", title: "the math change" } });
    expect(satelliteOf(math)).toEqual({
      kind: "pane",
      spec: { kind: "diff", sessionId: "home-conversation", path: "src/math.ts" },
    });
    expect(panelTitleOf(math)).toBe("the math change");
  });

  it("shows the session's whole change when its ref names no file, and its title says so", () => {
    const change = aSetting({ what: { kind: "diff", ref: "the math change" } });
    expect(satelliteOf(change)).toEqual({
      kind: "pane",
      spec: { kind: "diff", sessionId: "home-conversation" },
    });
    expect(panelTitleOf(change)).toBe("the math change · every change in the session");
  });

  it("takes a ref as a path only when it reads like one", () => {
    expect(["src/math.ts", "README.md", "packages/ui"].map(namesAPath)).toEqual([true, true, true]);
    expect(["the math change", "change-1", "https://example.com/a.ts"].map(namesAPath)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("one of the console's own panes set out for the keeper", () => {
  const paneOf = (ref: string) => satelliteOf(aSetting({ what: { kind: "pane", ref } }));

  it("opens a pane this console really has, for every name the engine may send", () => {
    for (const name of settingPanes) {
      const shown = paneOf(name);
      expect(shown.kind, name).toBe("pane");
      if (shown.kind !== "pane") continue;
      const definition = definitionOf(shown.spec.kind);
      expect(definition.spec.safeParse(shown.spec).success, name).toBe(true);
    }
  });

  it("says so in words when a newer engine names a pane this console does not have", () => {
    expect(paneOf("timeline")).toEqual({ kind: "note", text: unknownPaneWords("timeline") });
    expect(panelTitleOf(aSetting({ what: { kind: "pane", ref: "sessions" } }))).toBe("sessions");
    expect(panelTitleOf(aSetting({ what: { kind: "pane", ref: "needs-you" } }))).toBe("needs you");
    const named = aSetting({ what: { kind: "pane", ref: "needs-you", title: "Waiting on you" } });
    expect(panelTitleOf(named)).toBe("Waiting on you");
  });
});
