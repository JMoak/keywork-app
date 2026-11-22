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

  it("leads with a density focus mark only in the borderless weight", () => {
    const focused = renderRow("column", true, "borderless").container;
    expect(focused.querySelector(".kw-frame-lead")?.textContent).toBe(focusMark);
    const resting = renderRow("column", false, "borderless").container;
    expect(resting.querySelector(".kw-frame-lead")?.textContent).toBe(" ");
    expect(renderRow("column", true, "seams").container.querySelector(".kw-frame-lead")).toBeNull();
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

describe("a signal in the title row", () => {
  const row = (onClearSignal?: () => void) =>
    render(() => (
      <TitleRow
        name="Deploy"
        state="idle"
        step={0}
        focused={false}
        tier="broadsheet"
        weight="seams"
        signal="critical"
        signalWhy="the release is half applied"
        onClearSignal={onClearSignal}
      />
    ));

  it("clears the signal when pressed, by pointer or by key, given a way to clear it", () => {
    const cleared: string[] = [];
    const { container } = row(() => cleared.push("cleared"));
    const button = container.querySelector("button.kw-frame-signal") as HTMLButtonElement;
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("title")).toBe(
      "critical · the release is half applied · press to clear",
    );
    button.click();
    expect(cleared).toEqual(["cleared"]);
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
