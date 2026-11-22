import { describe, expect, it } from "vitest";
import { slugParts } from "./slug.ts";

describe("the slug grammar", () => {
  it("lights the words and keeps the hyphens as separators", () => {
    expect(slugParts("mcp-sleep-fix")).toEqual([
      { text: "mcp", role: "word" },
      { text: "-", role: "separator" },
      { text: "sleep", role: "word" },
      { text: "-", role: "separator" },
      { text: "fix", role: "word" },
    ]);
    expect(slugParts("pricing")).toEqual([{ text: "pricing", role: "word" }]);
  });
});
