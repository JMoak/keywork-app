import { describe, expect, it } from "vitest";
import type { Skin } from "../pose/skin.ts";
import { loadSkin, skinIds, skins } from "./index.ts";
import type { LoadedSkin, LoadedSkinOk, SkinSource } from "./loader.ts";
import { placeholderSkin } from "./placeholder.ts";

describe("built-in skin retention", () => {
  it("shares each validated built-in skin and atlas backing across one thousand residents", () => {
    for (const id of skinIds()) {
      const first = accepted(loadSkin(id));
      for (let resident = 0; resident < 1000; resident += 1) {
        const loaded = accepted(loadSkin(id));
        expect(loaded === first, id).toBe(true);
        expect(loaded.skin === first.skin, id).toBe(true);
        expect(loaded.skin.atlas.indices.buffer === first.skin.atlas.indices.buffer, id).toBe(true);
      }
    }
  });

  it("revalidates arbitrary sources even when their registry and factory identities stay the same", () => {
    const sound = { ...placeholderSkin(), id: "custom" };
    let current: Skin = sound;
    let builds = 0;
    const sources = {
      custom: () => {
        builds += 1;
        return current;
      },
    };
    expect(loadSkin("custom", sources).ok).toBe(true);
    current = { ...sound, rows: { ...sound.rows, idle: { frames: 1, ms: [], loop: true } } };
    expect(loadSkin("custom", sources).ok).toBe(false);
    current = { ...sound, displayName: "Repaired custom creature" };
    expect(accepted(loadSkin("custom", sources)).skin.displayName).toBe("Repaired custom creature");
    expect(builds).toBe(3);
  });

  it("does not retain caller registries even when they contain the shipped factories", () => {
    const sources = { ...skins };
    const first = accepted(loadSkin("placeholder", sources));
    const second = accepted(loadSkin("placeholder", sources));
    expect(first === second).toBe(false);
    expect(first.skin === second.skin).toBe(false);
    expect(first.skin.atlas.indices.buffer === second.skin.atlas.indices.buffer).toBe(false);
  });

  it("invalidates a replaced built-in source and never caches the mutable replacement", () => {
    const original = skins.placeholder;
    if (original === undefined) throw new Error("missing placeholder factory");
    const registry = skins as Record<string, SkinSource>;
    const before = accepted(loadSkin("placeholder"));
    let current: Skin = { ...placeholderSkin(), displayName: "Replacement creature" };
    registry.placeholder = () => current;
    try {
      expect(accepted(loadSkin("placeholder")).skin.displayName).toBe("Replacement creature");
      current = { ...current, rows: { ...current.rows, idle: { frames: 1, ms: [], loop: true } } };
      expect(loadSkin("placeholder").ok).toBe(false);
    } finally {
      registry.placeholder = original;
    }
    const restored = accepted(loadSkin("placeholder"));
    expect(restored === before).toBe(false);
    expect(loadSkin("placeholder") === restored).toBe(true);
  });

  it("does not retain unknown names or dynamically added sources", () => {
    for (let index = 0; index < 1000; index += 1) {
      const id = `unregistered-${index}`;
      const first = loadSkin(id);
      expect(first.ok).toBe(false);
      expect(loadSkin(id) === first).toBe(false);
    }
    const registry = skins as Record<string, SkinSource>;
    let current: Skin = { ...placeholderSkin(), id: "unregistered-0" };
    registry["unregistered-0"] = () => current;
    try {
      expect(loadSkin("unregistered-0").ok).toBe(true);
      current = { ...current, rows: { ...current.rows, idle: { frames: 1, ms: [], loop: true } } };
      expect(loadSkin("unregistered-0").ok).toBe(false);
    } finally {
      delete registry["unregistered-0"];
    }
    expect(loadSkin("unregistered-0").ok).toBe(false);
  });
});

function accepted(loaded: LoadedSkin): LoadedSkinOk {
  if (!loaded.ok) throw new Error(loaded.faults.join("; "));
  return loaded;
}
