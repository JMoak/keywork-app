import { emptyProjection } from "@keywork-app/client";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { statusItems } from "./status-line.tsx";
import { type UpdateOffer, updateCommands } from "./update-offer.ts";

describe("the console's own name", () => {
  it("is keywork in the status line's mark", () => {
    const [mark] = statusItems({
      serverLabel: "127.0.0.1:4770",
      projection: emptyProjection,
      usage: "",
      preset: undefined,
      trust: undefined,
      leader: undefined,
      notice: undefined,
      gap: undefined,
      lost: undefined,
    });
    expect(mark).toEqual({ tone: "mark", text: "keywork" });
  });

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
