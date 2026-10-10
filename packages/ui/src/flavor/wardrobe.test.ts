import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FlavorsView } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { keyworkDay, keyworkNight } from "./flavors.ts";
import type { Flavor } from "./schema.ts";
import { createWardrobe, flavorChoices, resolveFlavor, wornFlavorKey } from "./wardrobe.ts";

const served = (
  JSON.parse(
    readFileSync(join(process.cwd(), "packages/client/src/fixtures/flavors.json"), "utf8"),
  ) as FlavorsView
).flavors;

function memoryStorage(
  initial: Record<string, string> = {},
): Pick<Storage, "getItem" | "setItem"> & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
  };
}

describe("flavorChoices", () => {
  it("lists system, then the shipped gallery, then server flavors not already shipped", () => {
    expect(flavorChoices(served)).toEqual([
      { name: "system", source: "system" },
      { name: "keywork-night", source: "gallery" },
      { name: "keywork-day", source: "gallery" },
      { name: "closet-mist", source: "server" },
    ]);
  });
});

describe("resolveFlavor", () => {
  it("fills system from the OS appearance", () => {
    expect(resolveFlavor("system", served, true)).toBe(keyworkNight);
    expect(resolveFlavor("system", served, false)).toBe(keyworkDay);
  });

  it("validates a server flavor through the same APCA floor and refuses with keywork's words", () => {
    expect(() => resolveFlavor("closet-mist", served, true)).toThrow(
      /^flavor "closet-mist" fails the contrast floor:\n {2}text on background measures Lc \d+\.\d, needs at least 60/,
    );
    expect(() => resolveFlavor("closet-mist", served, true)).toThrow(
      /raise the ink or deepen the ground, then reload it\.$/,
    );
    expect(() => resolveFlavor("nope", served, true)).toThrow('no flavor is named "nope"');
  });
});

describe("createWardrobe", () => {
  it("wears system by default, follows the OS appearance, and remembers a choice", () => {
    const applied: Flavor[] = [];
    let dark = true;
    let flip: () => void = () => undefined;
    const storage = memoryStorage();
    const [wardrobe, dispose] = createRoot((dispose) => [
      createWardrobe({
        serverFlavors: () => served,
        storage,
        apply: (flavor) => applied.push(flavor),
        prefersDark: () => dark,
        watchAppearance: (listener) => {
          flip = listener;
          return () => undefined;
        },
      }),
      dispose,
    ]);
    expect(wardrobe.worn()).toBe("system");
    expect(applied.at(-1)).toBe(keyworkNight);
    dark = false;
    flip();
    expect(applied.at(-1)).toBe(keyworkDay);
    expect(wardrobe.wear("keywork-night")).toBeUndefined();
    expect(applied.at(-1)).toBe(keyworkNight);
    expect(storage.items[wornFlavorKey]).toBe("keywork-night");
    dispose();
  });

  it("refuses a failing server flavor with the exact message and keeps what is worn", () => {
    const applied: Flavor[] = [];
    const [wardrobe, dispose] = createRoot((dispose) => [
      createWardrobe({
        serverFlavors: () => served,
        storage: memoryStorage({ [wornFlavorKey]: "keywork-day" }),
        apply: (flavor) => applied.push(flavor),
        prefersDark: () => true,
        watchAppearance: () => () => undefined,
      }),
      dispose,
    ]);
    expect(wardrobe.worn()).toBe("keywork-day");
    const refusal = wardrobe.wear("closet-mist");
    expect(refusal).toMatch(/^flavor "closet-mist" fails the contrast floor:/);
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(applied).toEqual([keyworkDay]);
    dispose();
  });
});
