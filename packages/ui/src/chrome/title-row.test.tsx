import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { assumedContextLevel } from "../instruments/context.ts";
import { voiceGlyph } from "../page/pane.tsx";
import type { WidthTier } from "../page/tiers.ts";
import type { ChromeWeight } from "./root-attributes.ts";
import { tileFill } from "./stamp.ts";
import { focusMark, paneMark, quietMark, TitleRow, titleZones } from "./title-row.tsx";

afterEach(cleanup);

const busyTitle = {
  name: "fix the flaky tiler test",
  state: "working" as const,
  step: 0,
  arc: "pricing-v2",
  bot: { sigil: "◆", name: "reviewer" },
  inference: "opus · high",
  modeWord: "plan",
  telemetry: "380 tokens · $0.0031",
};

function renderRow(tier: WidthTier, focused: boolean, weight: ChromeWeight = "seams") {
  return render(() => <TitleRow {...busyTitle} tier={tier} focused={focused} weight={weight} />);
}

function zonesShown(container: HTMLElement): string[] {
  return ["stamp", "name", "arc", "bot", "inference", "mode", "telemetry"].filter(
    (zone) => container.querySelector(`.kw-frame-${zone}`) !== null,
  );
}

describe("paneMark", () => {
  it("is a glyph no stamp, voice, focus mark or sample bot sigil already wears", () => {
    const taken = [...tileFill, ...Object.values(voiceGlyph), focusMark, "▛", "◆", "▸", "▾"];
    expect(taken).not.toContain(paneMark);
  });

  it("stands apart from the bot sigil in the same title row", () => {
    const { container } = render(() => (
      <TitleRow {...busyTitle} tier="broadsheet" focused={false} weight="seams" marked />
    ));
    const mark = container.querySelector(".kw-frame-mark")?.textContent;
    expect(mark).toBe(paneMark);
    expect(container.querySelector(".kw-frame-sigil")?.textContent).not.toBe(mark);
  });
});

describe("quietMark", () => {
  it("is a glyph no stamp, voice, focus mark, pane mark, theme row or sample bot sigil wears", () => {
    const taken = [
      ...tileFill,
      ...Object.values(voiceGlyph),
      focusMark,
      paneMark,
      "▛",
      "◆",
      "▸",
      "▾",
      "·",
      "❯",
    ];
    expect(taken).not.toContain(quietMark);
  });

  it("stays in the title row at every width, ahead of the pane mark", () => {
    for (const tier of ["broadsheet", "column", "clipping", "masthead"] as const) {
      const { container, unmount } = render(() => (
        <TitleRow {...busyTitle} tier={tier} focused={false} weight="seams" marked quiet />
      ));
      const quiet = container.querySelector(".kw-frame-quiet");
      expect(quiet?.textContent, tier).toBe(quietMark);
      expect(quiet?.getAttribute("aria-label")).toBe("quiet");
      expect(quiet?.nextElementSibling?.className).toBe("kw-frame-mark");
      unmount();
    }
  });

  it("is absent while the session listens", () => {
    const { container } = renderRow("broadsheet", true);
    expect(container.querySelector(".kw-frame-quiet")).toBeNull();
  });
});

describe("titleZones", () => {
  it("sheds detail first and keeps the stamp and the name at every width", () => {
    expect([...titleZones("broadsheet", false)]).toEqual([
      "stamp",
      "name",
      "arc",
      "bot",
      "inference",
      "mode",
      "theme",
      "turn",
      "telemetry",
    ]);
    expect([...titleZones("column", false)]).toEqual([
      "stamp",
      "name",
      "bot",
      "mode",
      "theme",
      "telemetry",
    ]);
    expect([...titleZones("masthead", true)]).toEqual(["stamp", "name"]);
  });

  it("keeps telemetry below the column tier only on the focused pane", () => {
    expect(titleZones("clipping", true).has("telemetry")).toBe(true);
    expect(titleZones("clipping", false).has("telemetry")).toBe(false);
  });
});

describe("TitleRow", () => {
  it("renders every zone at the broadsheet tier, the detail zone in reading order", () => {
    const { container } = renderRow("broadsheet", true);
    expect(zonesShown(container)).toEqual([
      "stamp",
      "name",
      "arc",
      "bot",
      "inference",
      "mode",
      "telemetry",
    ]);
    expect(container.querySelector(".kw-frame-arc")?.previousElementSibling?.className).toBe(
      "kw-frame-name",
    );
    expect(container.querySelector(".kw-frame-detail")?.textContent).toBe(
      "◆ revieweropus · highplan",
    );
  });

  it("tags the arc as a slug whose marks sit a rung below its words", () => {
    const { container } = renderRow("broadsheet", false);
    const parts = [...container.querySelectorAll<HTMLElement>(".kw-frame-arc > span")];
    expect(parts.map((part) => [part.textContent, part.dataset.role])).toEqual([
      ["#", "separator"],
      ["pricing", "word"],
      ["-", "separator"],
      ["v2", "word"],
    ]);
  });

  it("gives the bot's sigil its own glyph and falls back to the bare name without one", () => {
    const signed = renderRow("broadsheet", false).container;
    expect(signed.querySelector(".kw-frame-bot .kw-frame-sigil")?.textContent).toBe("◆");
    expect(signed.querySelector(".kw-frame-bot")?.textContent).toBe("◆ reviewer");
    const bare = render(() => (
      <TitleRow {...busyTitle} bot={{ name: "scribe" }} tier="column" focused weight="seams" />
    )).container;
    expect(bare.querySelector(".kw-frame-sigil")).toBeNull();
    expect(bare.querySelector(".kw-frame-bot")?.textContent).toBe("scribe");
  });

  it("drops the inference words and the arc tag at the column tier", () => {
    const { container } = renderRow("column", false);
    expect(zonesShown(container)).toEqual(["stamp", "name", "bot", "mode", "telemetry"]);
  });

  it("keeps the mode word and sheds the bot at the clipping tier", () => {
    const { container } = renderRow("clipping", false);
    expect(zonesShown(container)).toEqual(["stamp", "name", "mode"]);
  });

  it("is only the stamp and the fitted name at the masthead tier", () => {
    const { container } = renderRow("masthead", true);
    expect(zonesShown(container)).toEqual(["stamp", "name"]);
    expect(container.querySelector(".kw-frame-stamp")?.textContent).toBe("▌");
  });

  it("leads with a density focus mark only in the borderless weight", () => {
    const focused = renderRow("column", true, "borderless").container;
    expect(focused.querySelector(".kw-frame-lead")?.textContent).toBe(focusMark);
    const resting = renderRow("column", false, "borderless").container;
    expect(resting.querySelector(".kw-frame-lead")?.textContent).toBe(" ");
    expect(renderRow("column", true, "seams").container.querySelector(".kw-frame-lead")).toBeNull();
  });

  it("ends the facts with the turn ribbon at the broadsheet tier and nowhere narrower", () => {
    const ribboned = (tier: WidthTier) =>
      render(() => (
        <TitleRow
          {...busyTitle}
          ribbon="turn 12 · 3 files · $0.41"
          themeMark={{ name: "whiplash", source: "pane" }}
          tier={tier}
          focused
          weight="seams"
        />
      )).container;
    const wide = ribboned("broadsheet");
    const detail = [...(wide.querySelector(".kw-frame-detail")?.children ?? [])];
    expect(detail.map((zone) => [zone.className, zone.textContent])).toEqual([
      ["kw-frame-bot", "◆ reviewer"],
      ["kw-frame-inference", "opus · high"],
      ["kw-frame-mode", "plan"],
      ["kw-frame-theme", "whiplash"],
      ["kw-frame-turn", "turn 12 · 3 files · $0.41"],
    ]);
    for (const tier of ["column", "clipping", "masthead"] as const) {
      expect(ribboned(tier).querySelector(".kw-frame-turn")).toBeNull();
    }
  });

  it("keeps the telemetry slot for a lone gauge", () => {
    const { container } = render(() => (
      <TitleRow
        name="quiet"
        state="idle"
        step={0}
        focused={false}
        tier="column"
        weight="regular"
        context={assumedContextLevel(1)}
      />
    ));
    expect(container.querySelector(".kw-frame-telemetry .kw-gauge")).toBeTruthy();
    expect(container.querySelector(".kw-frame-detail")?.textContent).toBe("");
  });

  it("makes the gauge a button that opens the context map only when given an opener", () => {
    const opened: string[] = [];
    const row = (onGauge?: () => void) =>
      render(() => (
        <TitleRow
          name="lights"
          state="idle"
          step={0}
          focused
          tier="broadsheet"
          weight="seams"
          context={assumedContextLevel(90_000)}
          onGauge={onGauge}
        />
      ));
    const plain = row();
    expect(plain.container.querySelector(".kw-frame-gauge")).toBeNull();
    cleanup();
    const { container } = row(() => opened.push("context"));
    const button = container.querySelector("button.kw-frame-gauge") as HTMLButtonElement;
    expect(button.querySelector(".kw-gauge")).toBeTruthy();
    fireEvent.click(button);
    expect(opened).toEqual(["context"]);
  });
});

describe("the faint rung", () => {
  const frameCss = readFileSync(
    join(process.cwd(), "packages/ui/src/chrome/pane-frame.css"),
    "utf8",
  );

  it("is worn only by the arc tag's marks and the broadsheet joints", () => {
    const wearers = [...frameCss.matchAll(/([^{}]+)\{[^}]*var\(--kw-text-faint\)[^}]*\}/g)].map(
      ([, selector]) => selector?.trim(),
    );
    expect(wearers).toEqual([
      '.kw-frame-arc > [data-role="separator"]',
      '.kw-frame-title[data-tier="broadsheet"] .kw-frame-detail > * + *::before',
    ]);
    const tiersTagging = (["broadsheet", "column", "clipping", "masthead"] as const).filter(
      (tier) => titleZones(tier, true).has("arc"),
    );
    expect(tiersTagging).toEqual(["broadsheet"]);
  });
});
