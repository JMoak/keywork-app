import { describe, expect, it } from "vitest";
import { arcTagParts, slugParts } from "./slug.ts";

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

  it("tags an arc with a leading mark that reads as a separator, as keywork's arc tag does", () => {
    expect(arcTagParts("pricing").map((part) => part.text)).toEqual(["#", "pricing"]);
    expect(arcTagParts("pricing")[0]?.role).toBe("separator");
  });
});
