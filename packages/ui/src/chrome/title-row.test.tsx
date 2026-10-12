import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { assumedContextLevel } from "../instruments/context.ts";
import type { WidthTier } from "../page/tiers.ts";
import type { ChromeWeight } from "./root-attributes.ts";
import { focusMark, TitleRow, titleZones } from "./title-row.tsx";

afterEach(cleanup);

const busyTitle = {
  name: "fix the flaky tiler test",
  state: "working" as const,
  step: 0,
  bot: "◆ reviewer",
  inference: "opus · high",
  modeWord: "plan",
  telemetry: "380 tokens · $0.0031",
};

function renderRow(tier: WidthTier, focused: boolean, weight: ChromeWeight = "seams") {
  return render(() => <TitleRow {...busyTitle} tier={tier} focused={focused} weight={weight} />);
}

function zonesShown(container: HTMLElement): string[] {
  return ["stamp", "name", "bot", "inference", "mode", "telemetry"].filter(
    (zone) => container.querySelector(`.kw-frame-${zone}`) !== null,
  );
}

describe("titleZones", () => {
  it("sheds detail first and keeps the stamp and the name at every width", () => {
    expect([...titleZones("broadsheet", false)]).toEqual([
      "stamp",
      "name",
      "bot",
      "inference",
      "mode",
      "telemetry",
    ]);
    expect([...titleZones("column", false)]).toEqual(["stamp", "name", "bot", "mode", "telemetry"]);
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
      "bot",
      "inference",
      "mode",
      "telemetry",
    ]);
    expect(container.querySelector(".kw-frame-detail")?.textContent).toBe(
      "◆ revieweropus · highplan",
    );
  });

  it("drops the inference words at the column tier", () => {
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
});
