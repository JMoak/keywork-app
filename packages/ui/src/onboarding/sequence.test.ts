import { describe, expect, it } from "vitest";
import { inheritEverywhere, type ModelPolicy } from "./models.ts";
import {
  back,
  begun,
  creatureRequestOf,
  decisionOf,
  finished,
  keep,
  type Proposals,
  settle,
  skip,
  skipRest,
  stepOf,
  steps,
  workshopRequestOf,
} from "./sequence.ts";
import { surpriseMe } from "./skins.ts";

const localPolicy: ModelPolicy = {
  strong: { provider: "ollama", model: "qwen3:32b" },
  loop: { provider: "ollama", model: "qwen3:32b" },
  decide: "inherit",
  vision: "inherit",
};

const proposals: Proposals = {
  names: ["Wren", "Tam", "Moss"],
  skins: ["kid"],
  workshop: { substrate: "host", limitation: "bare", installStep: "install sbx" },
  workshops: ["host"],
  policy: localPolicy,
};

describe("the sequence", () => {
  it("runs name, skin, workshop, models in that order and then is finished", () => {
    expect(steps).toEqual(["name", "skin", "workshop", "models"]);
    let sequence = begun;
    const seen: string[] = [];
    while (!finished(sequence)) {
      seen.push(stepOf(sequence) ?? "");
      sequence = skip(sequence);
    }
    expect(seen).toEqual(["name", "skin", "workshop", "models"]);
    expect(stepOf(sequence)).toBeUndefined();
    expect(skip(sequence)).toBe(sequence);
  });

  it("skips every step to a working default", () => {
    const settled = settle(skipRest(begun), proposals, "C:/src/stead");
    expect(settled).toEqual({
      name: "Wren",
      named: false,
      skin: "kid",
      workshop: "host",
      models: inheritEverywhere,
    });
    expect(creatureRequestOf(settled)).toEqual({ name: "Wren", skin: "kid" });
    expect(workshopRequestOf("wren", settled)).toEqual({ creature: "wren", substrate: "host" });
  });

  it("keeps what the keeper chose and sends only the classes that are not inherit", () => {
    const sequence = keep(
      keep(keep(keep(begun, "name", "Bram"), "skin", surpriseMe), "workshop", "sbx"),
      "models",
      localPolicy,
    );
    expect(finished(sequence)).toBe(true);
    const settled = settle(sequence, proposals, "C:/src/stead");
    expect(settled).toEqual({
      name: "Bram",
      named: true,
      skin: "kid",
      workshop: "sbx",
      models: localPolicy,
    });
    expect(creatureRequestOf(settled)).toEqual({
      name: "Bram",
      skin: "kid",
      models: {
        strong: { provider: "ollama", model: "qwen3:32b" },
        loop: { provider: "ollama", model: "qwen3:32b" },
      },
    });
    expect(workshopRequestOf("bram", settled)).toEqual({ creature: "bram", substrate: "sbx" });
  });

  it("remembers which steps were kept and which skipped, and going back forgets neither", () => {
    const sequence = skip(keep(begun, "name", "Bram"));
    expect(decisionOf(sequence, "name")).toBe("kept");
    expect(decisionOf(sequence, "skin")).toBe("skipped");
    expect(decisionOf(sequence, "workshop")).toBeUndefined();
    const returned = back(sequence);
    expect(stepOf(returned)).toBe("skin");
    expect(decisionOf(returned, "skin")).toBe("skipped");
    expect(stepOf(back(back(back(returned))))).toBe("name");
    const kept = keep(returned, "skin", "kid");
    expect(decisionOf(kept, "skin")).toBe("kept");
    expect(stepOf(kept)).toBe("workshop");
  });

  it("drops a chosen value when the keeper comes back and skips instead", () => {
    const sequence = skip(back(keep(begun, "name", "Bram")));
    expect(decisionOf(sequence, "name")).toBe("skipped");
    expect(settle(skipRest(sequence), proposals, "seed").name).toBe("Wren");
  });
});
