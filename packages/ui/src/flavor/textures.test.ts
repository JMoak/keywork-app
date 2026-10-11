import { describe, expect, it } from "vitest";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import { auditFlavor } from "./contrast-audit.ts";
import { gallery, keyworkDay, keyworkNight } from "./flavors.ts";

describe("T6: first-class light", () => {
  it("ships a light and a dark flavor", () => {
    expect(gallery.map((flavor) => flavor.appearance).sort()).toEqual(["dark", "light"]);
  });

  it.each(gallery.map((flavor) => [flavor.name, flavor] as const))(
    "%s clears keywork's APCA floor on every composited pair at its native polarity",
    (name, flavor) => {
      const audit = auditFlavor(flavor);
      expect(audit.failures).toEqual([]);
      expect(audit.minMarginLc).toBeGreaterThanOrEqual(ratchetValue(`T6.minMarginLc.${name}`));
    },
  );

  it("catches a light flavor that is a tinted dark one", () => {
    const tinted = { ...keyworkNight, name: "tinted", appearance: "light" as const };
    expect(auditFlavor(tinted).failures).toContain(
      "text on background reads light-on-dark in a light flavor",
    );
  });

  it("catches a light flavor whose ink regressed below the floor", () => {
    const faded = {
      ...keyworkDay,
      tokens: { ...keyworkDay.tokens, textMid: keyworkDay.tokens.border },
    };
    expect(auditFlavor(faded).failures).toEqual([
      expect.stringMatching(/^textMid on background measures Lc \d+\.\d, needs at least 30$/),
      expect.stringMatching(/^density medium: textMid on background measures Lc/),
    ]);
  });
});
