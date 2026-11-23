import { describe, expect, it } from "vitest";
import { defaultSkinId } from "../panes/stead/habitat-render.ts";
import { offeredSkins } from "./skins.ts";

describe("the skins on offer", () => {
  it("offers every registered skin but the placeholder, and the default when nothing else is registered", () => {
    expect(offeredSkins()).not.toContain("placeholder");
    expect(offeredSkins(["kid", "placeholder", "owl"])).toEqual(["kid", "owl"]);
    expect(offeredSkins(["placeholder"])).toEqual([defaultSkinId]);
  });
});
