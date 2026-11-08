import { describe, expect, it } from "vitest";
import { keyworkProfile, steadProfile } from "./index.ts";

describe("the product profiles", () => {
  it("open stead on the yard and keywork on tiles, one chord from each other", () => {
    expect(steadProfile.firstFrame).toBe("yard");
    expect(keyworkProfile.firstFrame).toBe("tiles");
  });

  it("start stead at the creature and keywork at the ide", () => {
    expect(steadProfile.startup).toBe("creature");
    expect(keyworkProfile.startup).toBe("ide");
  });
});
