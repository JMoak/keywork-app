import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { type UpdateOffer, updateCommands } from "./update-offer.ts";

describe("the console's own name", () => {
  it("keeps a manual-review offer out of the install palette", () => {
    const offer: UpdateOffer = {
      waiting: () => ({ version: "0.2.1", reviewRequired: true }),
      accepted: () => false,
      accept: () => undefined,
    };
    expect(updateCommands(offer, keyworkProfile)).toEqual([]);
    expect(updateCommands(offer, steadProfile)).toEqual([]);
  });

  it.each([keyworkProfile, steadProfile])("uses $name in the update command", (profile) => {
    const offer: UpdateOffer = {
      waiting: () => ({ version: "0.2.0" }),
      accepted: () => false,
      accept: () => undefined,
    };
    expect(updateCommands(offer, profile).map((command) => command.description)).toEqual([
      `install ${profile.name} 0.2.0 when you quit`,
    ]);
  });
});
