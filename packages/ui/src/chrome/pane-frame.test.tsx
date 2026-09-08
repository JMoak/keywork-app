import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { hueStop, type LifecycleState, PaneFrame, stampGlyph, tileFill } from "./pane-frame.tsx";

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
