import { describe, expect, it } from "vitest";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import { auditTheme } from "./contrast-audit.ts";
import { gallery, keyworkDay, keyworkNight } from "./themes.ts";

describe("T6: first-class light", () => {
  it("ships a light and a dark theme", () => {
    expect(new Set(gallery.map((theme) => theme.appearance))).toEqual(new Set(["dark", "light"]));
  });

  it.each(gallery.map((theme) => [theme.name, theme] as const))(
    "%s clears keywork's APCA floor on every composited pair at its native polarity",
    (name, theme) => {
      const audit = auditTheme(theme);
      expect(audit.failures).toEqual([]);
      expect(audit.minMarginLc).toBeGreaterThanOrEqual(ratchetValue(`T6.minMarginLc.${name}`));
      expect(audit.sectionMarginLc).toBeGreaterThanOrEqual(
        ratchetValue(`T6.sectionMarginLc.${name}`),
      );
    },
  );

  it("catches a light theme that is a tinted dark one, sections included", () => {
    const tinted = { ...keyworkNight, name: "tinted", appearance: "light" as const };
    expect(auditTheme(tinted).failures).toEqual(
      expect.arrayContaining([
        "text on background reads light-on-dark in a light theme",
        "syntax.keyword on panel reads light-on-dark in a light theme",
      ]),
    );
  });

  it("catches a light theme whose ink regressed below the floor", () => {
    const faded = {
      ...keyworkDay,
      tokens: { ...keyworkDay.tokens, textMid: keyworkDay.tokens.border },
    };
    expect(auditTheme(faded).failures).toEqual([
      expect.stringMatching(/^textMid on background measures Lc \d+\.\d, needs at least 30$/),
      expect.stringMatching(/^density medium: textMid on background measures Lc/),
    ]);
  });
});
