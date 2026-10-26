import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { assumedContextLevel } from "../instruments/context.ts";
import type { Outfit } from "../theme/attire.ts";
import { keyworkDay, keyworkNight } from "../theme/themes.ts";
import { hueStop, type LifecycleState, PaneFrame, stampGlyph, tileFill } from "./pane-frame.tsx";
import { chromeWeights } from "./root-attributes.ts";
import { paneMark, quietMark, TitleRow } from "./title-row.tsx";

afterEach(cleanup);

const states: LifecycleState[] = ["idle", "working", "needs-you", "finished-unseen", "failed"];

describe("stampGlyph", () => {
  it("gives every lifecycle state a mark that reads in monochrome", () => {
    const marks = states.map((state) => stampGlyph(state));
    expect(marks).toEqual([" ", "▌", "█", "█", "▛"]);
    expect(stampGlyph("working", 3)).toBe("█");
    expect(tileFill.at(-1)).toBe("█");
  });

  it("sweeps the ramp by spawn rank and wraps", () => {
    expect([0, 1, 2, 3, 4].map(hueStop)).toEqual([1, 2, 3, 1, 2]);
  });
});

describe("PaneFrame", () => {
  it("renders the title row with stamp, name, telemetry, and mode, and marks focus", () => {
    const { container } = render(() => (
      <PaneFrame
        name="fix the tests"
        state="needs-you"
        focused
        spawnRank={4}
        telemetry="12 tokens"
        modeWord="plan"
      >
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.state).toBe("needs-you");
    expect(frame.hasAttribute("data-focused")).toBe(true);
    expect(frame.style.getPropertyValue("--kw-pane-hue")).toBe("var(--kw-ramp-2)");
    expect(container.querySelector(".kw-frame-stamp")?.textContent).toBe("█");
    expect(container.querySelector(".kw-frame-name")?.textContent).toBe("fix the tests");
    expect(container.querySelector(".kw-frame-telemetry")?.textContent).toBe("12 tokens");
    expect(container.querySelector(".kw-frame-mode")?.textContent).toBe("plan");
  });

  it("omits the mode word and telemetry when absent and blanks the idle stamp", () => {
    const { container } = render(() => (
      <PaneFrame name="quiet" state="idle" focused={false} spawnRank={0}>
        <p>body</p>
      </PaneFrame>
    ));
    expect(container.querySelector(".kw-frame-mode")).toBeNull();
    expect(container.querySelector(".kw-frame-telemetry")).toBeNull();
    expect(container.querySelector(".kw-frame-stamp")?.textContent).toBe(" ");
  });

  it("calls onFocus when the frame is pressed", () => {
    let focused = 0;
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused={false} spawnRank={0} onFocus={() => (focused += 1)}>
        <p>body</p>
      </PaneFrame>
    ));
    (container.querySelector(".kw-frame") as HTMLElement).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    expect(focused).toBe(1);
  });
});

describe("PaneFrame instruments", () => {
  it("draws the context gauge in the telemetry slot beside the usage text", () => {
    const { container } = render(() => (
      <PaneFrame
        name="fix the tests"
        state="idle"
        focused={false}
        spawnRank={0}
        telemetry="380 tokens · $0.0031"
        context={assumedContextLevel(90_000)}
      >
        <p>body</p>
      </PaneFrame>
    ));
    const slot = container.querySelector(".kw-frame-telemetry") as HTMLElement;
    const gauge = slot.querySelector(".kw-gauge") as HTMLElement;
    expect(gauge.querySelector(".kw-gauge-cells")?.textContent).toBe("░▒··");
    expect(gauge.querySelector(".kw-gauge-count")?.textContent).toBe("90k");
    expect(gauge.querySelector(".kw-gauge-unit")?.textContent).toBe("in context");
    expect(slot.textContent).toContain("380 tokens · $0.0031");
  });

  it("keeps the telemetry slot for the gauge alone when there is no usage text", () => {
    const { container } = render(() => (
      <PaneFrame
        name="quiet"
        state="idle"
        focused={false}
        spawnRank={0}
        context={assumedContextLevel(1)}
      >
        <p>body</p>
      </PaneFrame>
    ));
    expect(container.querySelector(".kw-frame-telemetry .kw-gauge")).toBeTruthy();
  });
});

describe("PaneFrame chrome weights", () => {
  afterEach(async () => {
    document.documentElement.removeAttribute("data-chrome");
    await settled();
  });

  for (const weight of chromeWeights) {
    it(`renders the ${weight} weight the root asks for`, async () => {
      document.documentElement.setAttribute("data-chrome", weight);
      await settled();
      const { container } = render(() => (
        <>
          <PaneFrame
            name="focused"
            state="needs-you"
            focused
            spawnRank={0}
            modeWord="plan"
            arc="pricing-v2"
            bot={{ sigil: "◆", name: "reviewer" }}
          >
            <p>body</p>
          </PaneFrame>
          <PaneFrame name="resting" state="finished-unseen" focused={false} spawnRank={1}>
            <p>body</p>
          </PaneFrame>
        </>
      ));
      const frames = [...container.querySelectorAll<HTMLElement>(".kw-frame")];
      expect(frames.map((frame) => frame.dataset.chrome)).toEqual([weight, weight]);
      expect(container.innerHTML).toMatchSnapshot();
    });
  }

  it("follows a weight change without remounting", async () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused spawnRank={0}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.chrome).toBe("seams");
    document.documentElement.setAttribute("data-chrome", "borderless");
    await settled();
    expect(frame.dataset.chrome).toBe("borderless");
    expect(frame.querySelector(".kw-frame-lead")?.textContent).toBe("▎");
  });
});

describe("PaneFrame outfits", () => {
  const own: Outfit = { theme: keyworkDay, source: "pane" };
  const shared: Outfit = { theme: keyworkDay, source: "arc", arc: "pricing" };
  const house: Outfit = { theme: keyworkNight, source: "window" };

  it("dresses the frame in its own theme and names it in the title row", () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused={false} spawnRank={0} outfit={own}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.attire).toBe("pane");
    expect(frame.dataset.theme).toBe(keyworkDay.name);
    expect(frame.dataset.appearance).toBe("light");
    expect(frame.dataset.chrome).toBe(keyworkDay.chromeWeight);
    expect(frame.style.getPropertyValue("--kw-panel")).toBe(keyworkDay.tokens.panel);
    const mark = container.querySelector(".kw-frame-theme") as HTMLElement;
    expect(mark.textContent).toBe(keyworkDay.name);
    expect(mark.dataset.source).toBe("pane");
  });

  it("wears the house theme from the root and shows no theme mark", () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused={false} spawnRank={0} outfit={house}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.hasAttribute("data-attire")).toBe(false);
    expect(frame.hasAttribute("data-theme")).toBe(false);
    expect(frame.style.getPropertyValue("--kw-panel")).toBe("");
    expect(container.querySelector(".kw-frame-theme")).toBeNull();
  });

  it("undresses when the pane returns to the house theme and keeps its hue", () => {
    const [outfit, setOutfit] = createSignal<Outfit>(shared);
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused={false} spawnRank={1} outfit={outfit()}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.attire).toBe("arc");
    expect(container.querySelector(".kw-frame-theme")?.getAttribute("data-source")).toBe("arc");
    setOutfit(house);
    expect(frame.hasAttribute("data-attire")).toBe(false);
    expect(frame.hasAttribute("data-theme")).toBe(false);
    expect(frame.dataset.chrome).toBe("seams");
    expect(frame.style.getPropertyValue("--kw-panel")).toBe("");
    expect(frame.style.getPropertyValue("--kw-pane-hue")).toBe("var(--kw-ramp-2)");
  });

  it("draws its inside in its own weight and its edge in the house's", async () => {
    document.documentElement.setAttribute("data-chrome", "regular");
    await settled();
    const borderless: Outfit = {
      theme: { ...keyworkDay, chromeWeight: "borderless" },
      source: "pane",
    };
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused spawnRank={0} outfit={borderless}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.chrome).toBe("borderless");
    expect(frame.dataset.house).toBe("regular");
    expect(frame.querySelector(".kw-frame-lead")?.textContent).toBe("▎");
    expect(frame.style.getPropertyValue("--kw-house-border")).toBe("");
    document.documentElement.removeAttribute("data-chrome");
    await settled();
  });

  it("hides the theme mark below the column tier", () => {
    const { container } = render(() => (
      <TitleRow
        name="a"
        state="idle"
        step={0}
        focused
        tier="clipping"
        weight="seams"
        themeMark={{ name: "nord", source: "pane" }}
      />
    ));
    expect(container.querySelector(".kw-frame-theme")).toBeNull();
  });

  it("marks a marked pane before its name", () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused={false} spawnRank={0} marked>
        <p>body</p>
      </PaneFrame>
    ));
    const mark = container.querySelector(".kw-frame-mark") as HTMLElement;
    expect(mark.getAttribute("aria-label")).toBe("marked");
    expect(mark.textContent).toBe(paneMark);
    expect(mark.nextElementSibling?.className).toBe("kw-frame-name");
  });

  it("carries the quiet mark in its title row when its session is quiet", () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="needs-you" focused spawnRank={0} quiet>
        <p>body</p>
      </PaneFrame>
    ));
    const quiet = container.querySelector(".kw-frame-quiet") as HTMLElement;
    expect(quiet.textContent).toBe(quietMark);
    expect(quiet.nextElementSibling?.className).toBe("kw-frame-name");
  });

  it("carries its conversation's turn ribbon to the end of its title row's facts", () => {
    const { container } = render(() => (
      <PaneFrame name="a" state="idle" focused spawnRank={0} ribbon="turn 2 · $0.01">
        <p>body</p>
      </PaneFrame>
    ));
    const detail = container.querySelector(".kw-frame-detail") as HTMLElement;
    expect(detail.lastElementChild?.className).toBe("kw-frame-turn");
    expect(detail.lastElementChild?.textContent).toBe("turn 2 · $0.01");
  });
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
