import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { assumedContextLevel } from "../instruments/context.ts";
import { hueStop, type LifecycleState, PaneFrame, stampGlyph, tileFill } from "./pane-frame.tsx";
import { chromeWeights } from "./root-attributes.ts";

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
    expect(slot.querySelector(".kw-gauge")?.textContent).toBe("░▒··90k");
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
          <PaneFrame name="focused" state="needs-you" focused spawnRank={0} modeWord="plan">
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

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
