import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as copy from "./copy.ts";
import { introductionFrame } from "./introduction.ts";

const here = import.meta.dirname;

describe("the onboarding copy speaks in the creature's voice", () => {
  it.each(["copy.ts", "introduction.ts"])("%s has no exclamation mark and no emoji", (file) => {
    const source = readFileSync(join(here, file), "utf8");
    expect(source).not.toMatch(/!/);
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("renders every line as a plain string without an exclamation mark", () => {
    const rendered = Object.values(copy).flatMap((entry) => renderedOf(entry));
    expect(rendered.length).toBeGreaterThan(20);
    for (const line of rendered) {
      expect(typeof line).toBe("string");
      expect(line).not.toMatch(/!/);
    }
    expect(introductionFrame(facts)).not.toMatch(/!/);
  });

  it("keeps the ranch idiom in the chrome and says plainly what a bare host lacks", () => {
    expect(copy.hostLimitation).toBe(
      "commands run unconfined on this machine and nothing is sealed",
    );
    expect(copy.noWorkshopsServed("no port")).toBe(
      "this node serves no workshops yet (no port); threads run on the bare node",
    );
    expect(copy.madeLine("Wren")).toBe("Wren is made · its workshop rises on the stead");
    expect(
      copy.reachableModelLine({
        model: "qwen3:32b",
        node: "moak-main",
        server: "ollama",
        classes: ["strong", "loop"],
        loaded: true,
      }),
    ).toBe("qwen3:32b on moak-main (ollama) · strong loop · loaded");
  });
});

const facts = { name: "Wren", workspace: "C:/src/stead", named: true, names: ["Wren"] };

function renderedOf(entry: unknown): string[] {
  if (typeof entry === "string") return [entry];
  if (typeof entry === "function")
    return [String(sample(entry as (...args: unknown[]) => unknown))];
  if (Array.isArray(entry)) return entry.map(String);
  if (entry !== null && typeof entry === "object") return Object.values(entry).map(String);
  return [];
}

function sample(render: (...args: unknown[]) => unknown): unknown {
  const attempts: unknown[][] = [
    ["Wren"],
    [["Wren", "Tam", "Moss"]],
    [true],
    ["host"],
    [{ model: "m", node: "n", server: "s", classes: ["strong"], loaded: false }],
    [undefined],
  ];
  for (const args of attempts) {
    try {
      const out = render(...args);
      if (typeof out === "string") return out;
    } catch {}
  }
  return "";
}
