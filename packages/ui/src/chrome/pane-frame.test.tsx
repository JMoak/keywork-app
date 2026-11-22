import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { Outfit } from "../theme/attire.ts";
import { keyworkDay, keyworkNight } from "../theme/themes.ts";
import { hueStop, PaneFrame } from "./pane-frame.tsx";

afterEach(cleanup);

describe("stampGlyph", () => {
  it("sweeps the ramp by spawn rank and wraps", () => {
    expect([0, 1, 2, 3, 4, 7, 8, 9].map(hueStop)).toEqual([1, 2, 3, 4, 5, 8, 1, 2]);
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
        telemetry="12 tokens · $0.01"
        modeWord="plan"
      >
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.state).toBe("needs-you");
    expect(frame.hasAttribute("data-focused")).toBe(true);
    expect(frame.style.getPropertyValue("--kw-pane-hue")).toBe("var(--kw-ramp-5)");
    expect(container.querySelector(".kw-frame-stamp")?.textContent).toBe("█");
    expect(container.querySelector(".kw-frame-name")?.textContent).toBe("fix the tests");
    expect(container.querySelector(".kw-frame-usage")?.textContent).toBe("12 tokens · $0.01");
    expect(container.querySelector(".kw-frame-usage-compact")?.textContent).toBe("$0.01");
    expect(container.querySelector(".kw-frame-mode")?.textContent).toBe("plan");
  });

  it("marks the focused pane the same way in every chrome weight, forced colours included", () => {
    const css = readFileSync(join(process.cwd(), "packages/ui/src/chrome/pane-frame.css"), "utf8");
    expect(css).toMatch(
      /\.kw-frame\[data-focused\] \.kw-frame-title \{\s*box-shadow: inset 0 -2px 0 var\(--kw-pane-hue\);/,
    );
    expect(css).toMatch(/\.kw-frame\[data-focused\] \.kw-frame-name \{\s*color: var\(--kw-text\);/);
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(
      /\.kw-frame\[data-focused\]::before \{[^}]*border: 2px solid Highlight;/,
    );
    expect(forced).toMatch(
      /\.kw-frame\[data-focused\] \.kw-frame-name \{[^}]*background: Highlight;/,
    );
  });

  it("is a region named after its title, which a heading carries in full", () => {
    render(() => (
      <PaneFrame name="a long session name" state="idle" focused={false} spawnRank={0}>
        <p>body</p>
      </PaneFrame>
    ));
    const region = screen.getByRole("region", { name: "a long session name pane" });
    const heading = within(region).getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("a long session name");
    expect(heading.getAttribute("title")).toBe("a long session name");
  });

  it("outlines a signalled setting in the signal's colour, and draws nothing extra at rest", () => {
    const [signal, setSignal] = createSignal<"needs-you" | "critical" | undefined>("needs-you");
    const { container } = render(() => (
      <PaneFrame name="Tests" state="idle" focused={false} spawnRank={0} signal={signal()}>
        <p>body</p>
      </PaneFrame>
    ));
    const frame = container.querySelector(".kw-frame") as HTMLElement;
    expect(frame.dataset.signal).toBe("needs-you");
    expect(frame.querySelector(":scope > .kw-frame-outline")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(frame.querySelector(".kw-frame-signal")?.textContent).toBe("needs you");
    setSignal(undefined);
    expect(frame.dataset.signal).toBeUndefined();
    expect(frame.querySelector(".kw-frame-outline")).toBeNull();
    expect(frame.querySelector(".kw-frame-signal")).toBeNull();
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

describe("PaneFrame chrome weights", () => {
  afterEach(async () => {
    document.documentElement.removeAttribute("data-chrome");
    await settled();
  });

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
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
