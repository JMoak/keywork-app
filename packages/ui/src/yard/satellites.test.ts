import { describe, expect, it } from "vitest";
import { namesAPath, panelTitleOf, satelliteOf } from "./satellites.ts";
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
