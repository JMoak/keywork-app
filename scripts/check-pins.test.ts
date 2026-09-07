import { describe, expect, it } from "vitest";
import { findRangedDependencies, findUnpinnedActions } from "./check-pins.ts";

describe("check:pins", () => {
  it("accepts exact versions, prereleases and workspace links", () => {
    expect(
      findRangedDependencies({
        dependencies: { "solid-js": "1.9.15", "@keywork-app/protocol": "workspace:*" },
        devDependencies: { vitest: "5.0.0-beta.1" },
      }),
    ).toEqual([]);
  });

  it("names every ranged dependency", () => {
    expect(
      findRangedDependencies({
        dependencies: { electron: "^44.2.0", zod: "~4.5.4" },
        devDependencies: { typescript: "latest" },
      }),
    ).toEqual(["electron@^44.2.0", "zod@~4.5.4", "typescript@latest"]);
  });

  it("requires full-SHA action pins and allows local actions", () => {
    const workflow = [
      "steps:",
      "  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
      "  - uses: actions/setup-node@v4",
      "  - uses: ./.github/actions/local",
    ].join("\n");
    expect(findUnpinnedActions(workflow)).toEqual(["actions/setup-node@v4"]);
  });
});
