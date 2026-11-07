import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptyStateLine,
  missingLine,
  noInventoryLine,
  probedLine,
  tallyLine,
  vacantParcelLine,
} from "./copy.ts";

describe("the mills words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    const source = readFileSync(join(process.cwd(), "packages/ui/src/panes/mills/copy.ts"), "utf8");
    const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
      ([, plain, template]) => plain ?? template ?? "",
    );
    expect(literals.length).toBeGreaterThan(40);
    for (const literal of literals) {
      expect(literal, literal).not.toMatch(/!/);
      expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("teach in two parts, state then action, with the one chord in the action", () => {
    for (const line of [emptyStateLine("ctrl+k p"), noInventoryLine("down.", "ctrl+k p")]) {
      const parts = line.split(" · ");
      expect(parts, line).toHaveLength(2);
      expect(parts[0], line).not.toContain("ctrl+k p");
      expect(parts[1]?.split("ctrl+k p"), line).toHaveLength(2);
    }
    expect(emptyStateLine("p")).toContain("install Ollama on port 11434 or llama.cpp on port 9931");
    expect(vacantParcelLine).toContain("install Ollama on port 11434");
  });

  it("fit the narrowest pane: no unbreakable run past nine characters", () => {
    const longestRun = (line: string) => Math.max(...line.split(/\s+/).map((run) => run.length));
    expect(longestRun(emptyStateLine("p"))).toBeLessThanOrEqual(9);
  });

  it("names the exact capability a class misses and counts only what happened", () => {
    expect(missingLine("loop", ["tools", "decodeTokensPerSecond"])).toBe(
      "not loop: needs tool calls and decode measured on this node",
    );
    expect(missingLine("decide", ["somethingNew"])).toBe("not decide: needs somethingNew");
    expect(tallyLine({ parcels: 1, mills: 1, down: 0, loaded: 0, market: 0 })).toBe(
      "1 parcel · 1 mill · 0 loaded",
    );
    expect(probedLine("spark-ad4d", [])).toBe("spark-ad4d looked at again · no mill to probe");
  });
});
