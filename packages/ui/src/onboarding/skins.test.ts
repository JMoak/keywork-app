import { describe, expect, it } from "vitest";
import { chosenSkin, offeredSkins, skinChoices, surprise, surpriseMe } from "./skins.ts";

describe("the skins on offer", () => {
  it("offers every registered skin but the placeholder, and the tinkerer when nothing else is registered", () => {
    expect(offeredSkins()).toEqual(["kid"]);
    expect(offeredSkins(["kid", "placeholder", "owl"])).toEqual(["kid", "owl"]);
    expect(offeredSkins(["placeholder"])).toEqual(["kid"]);
  });

  it("adds surprise me after the registered choices", () => {
    expect(skinChoices(["kid", "owl"])).toEqual(["kid", "owl", surpriseMe]);
  });

  it("resolves surprise me to a registered skin, the same one for the same workspace", () => {
    const offered = ["kid", "owl", "fox"];
    const picked = surprise("C:/src/stead", offered);
    expect(offered).toContain(picked);
    expect(surprise("C:/src/stead", offered)).toBe(picked);
    expect(chosenSkin(surpriseMe, "C:/src/stead", offered)).toBe(picked);
    expect(chosenSkin("owl", "C:/src/stead", offered)).toBe("owl");
    expect(chosenSkin(surpriseMe, "anywhere", ["kid"])).toBe("kid");
  });
});
