import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type MotionPrefs, quickMs } from "@keywork-app/habitat";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { PaneFrame } from "../../chrome/pane-frame.tsx";
import type { PaneEdge, PaneSignal } from "../../chrome/signals.ts";
import { assumedContextLevel } from "../../instruments/context.ts";
import { outsideMetrics } from "./arrange.ts";
import { bringInsideWords, SurfaceChrome } from "./surface-chrome.tsx";

afterEach(cleanup);

const moving: MotionPrefs = { reducedMotion: false, tier: "interact" };
const css = readFileSync(
  join(process.cwd(), "packages/ui/src/surfaces/feel/surface-chrome.css"),
  "utf8",
);

function ruleFor(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
}

const titleRowOutside = ".kw-surface-body .kw-frame > .kw-frame-title";

function chromeOf(container: HTMLElement): HTMLElement {
  return container.querySelector(".kw-surface") as HTMLElement;
}

describe("SurfaceChrome", () => {
  it("is a region named for its pane and for standing outside, never by the word for its window", () => {
    render(() => (
      <SurfaceChrome
        title="the run's summary"
        hueRank={4}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const region = screen.getByRole("region", {
      name: "the run's summary pane, outside the window",
    });
    expect(within(region).queryByRole("heading")).toBeNull();
    expect(region.textContent).not.toMatch(/surface/i);
    expect(region.querySelector(".kw-surface-body")?.textContent).toBe("body");
  });

  it("wears its creature's hue from the same ramp a pane frame sweeps", () => {
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={4}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    expect(chromeOf(container).style.getPropertyValue("--kw-pane-hue")).toBe("var(--kw-ramp-5)");
  });

  it("carries its edge and its signal, and keeps the last signal's ink while the outline fades", () => {
    const [signal, setSignal] = createSignal<PaneSignal | undefined>("critical");
    const [edge, setEdge] = createSignal<PaneEdge | undefined>("lead");
    const { container } = render(() => (
      <SurfaceChrome
        title="Deploy"
        hueRank={0}
        focused={false}
        shown
        edge={edge()}
        signal={signal()}
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.dataset).toMatchObject({ edge: "lead", signal: "critical", outline: "critical" });
    expect(screen.getByRole("region", { name: "Deploy pane, outside the window, critical" })).toBe(
      chrome,
    );
    expect(chrome.querySelector(".kw-surface-outline")?.getAttribute("aria-hidden")).toBe("true");
    setSignal(undefined);
    setEdge("way-back");
    expect(chrome.dataset.signal).toBeUndefined();
    expect(chrome.dataset).toMatchObject({ edge: "way-back", outline: "critical" });
    setEdge(undefined);
    expect(chrome.dataset.edge).toBeUndefined();
  });

  it("says nothing of a pane that only just arrived beyond its name", () => {
    render(() => (
      <SurfaceChrome
        title="On call"
        hueRank={0}
        focused={false}
        shown
        signal="arrived"
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    expect(screen.getByRole("region", { name: "On call pane, outside the window" })).toBeDefined();
  });

  it("marks focus and lets it go without remounting", () => {
    const [focused, setFocused] = createSignal(true);
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused={focused()}
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.hasAttribute("data-focused")).toBe(true);
    setFocused(false);
    expect(chromeOf(container)).toBe(chrome);
    expect(chrome.hasAttribute("data-focused")).toBe(false);
  });

  it("brings the pane inside from its control, by pointer or by key", () => {
    let asked = 0;
    render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused
        shown
        motion={moving}
        insideHint="ctrl+k i"
        onBringInside={() => (asked += 1)}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const control = screen.getByRole("button", { name: bringInsideWords });
    expect(control.getAttribute("title")).toBe("bring inside · ctrl+k i");
    expect(control.getAttribute("type")).toBe("button");
    control.click();
    expect(asked).toBe(1);
  });

  it("names the control plainly when no chord is bound", () => {
    render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    expect(screen.getByRole("button").getAttribute("title")).toBe("bring inside");
  });

  it("waits with its content held back until the host shows the window, then arrives once", () => {
    const [shown, setShown] = createSignal(false);
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused={false}
        shown={shown()}
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.dataset.arrival).toBe("waiting");
    setShown(true);
    expect(chrome.dataset.arrival).toBe("arrived");
    setShown(false);
    expect(chrome.dataset.arrival).toBe("waiting");
  });

  it("arrives by the motion the keeper's settings allow", () => {
    const [motion, setMotion] = createSignal<MotionPrefs>(moving);
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused
        shown
        motion={motion()}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.dataset.motion).toBe("glide");
    setMotion({ reducedMotion: true, tier: "interact" });
    expect(chrome.dataset.motion).toBe("fade");
    setMotion({ reducedMotion: false, tier: "hidden" });
    expect(chrome.dataset.motion).toBe("still");
  });

  it("carries the pane's standing for its hairline and leaves the stamp to the frame's own row", () => {
    const { container } = render(() => (
      <SurfaceChrome
        title="fix the gate"
        hueRank={1}
        focused={false}
        shown
        motion={moving}
        state="needs-you"
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.dataset.state).toBe("needs-you");
    expect(
      chrome.querySelector(".kw-surface-stamp, .kw-surface-title, .kw-surface-detail"),
    ).toBeNull();
  });

  it("rests idle when it is told nothing of the pane's standing", () => {
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    expect(chromeOf(container).dataset.state).toBe("idle");
  });

  it("lets the frame's own title row be the pane's one title, instruments and all", () => {
    render(() => (
      <SurfaceChrome
        title="fix the gate"
        hueRank={1}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        <PaneFrame
          name="fix the gate"
          state="working"
          focused
          spawnRank={1}
          telemetry="12 tokens · $0.01"
          context={assumedContextLevel(40_000)}
          modeWord="plan"
          arc="gate/fix"
          bot={{ name: "reviewer", sigil: "◆" }}
          inference="opus · high"
          ribbon="turn 3"
        >
          <p>body</p>
        </PaneFrame>
      </SurfaceChrome>
    ));
    const region = screen.getByRole("region", { name: "fix the gate pane, outside the window" });
    const headings = within(region).getAllByRole("heading");
    expect(headings.map((heading) => heading.textContent)).toEqual(["fix the gate"]);
    const row = region.querySelector(titleRowOutside) as HTMLElement;
    expect(row.querySelector(".kw-frame-stamp")?.getAttribute("data-state")).toBe("working");
    expect(row.querySelector(".kw-frame-arc")?.textContent).toBe("#gate/fix");
    expect(row.querySelector(".kw-frame-bot")?.textContent).toBe("◆ reviewer");
    expect(row.querySelector(".kw-frame-inference")?.textContent).toBe("opus · high");
    expect(row.querySelector(".kw-frame-mode")?.textContent).toBe("plan");
    expect(row.querySelector(".kw-frame-turn")?.textContent).toBe("turn 3");
    expect(row.querySelector(".kw-frame-telemetry .kw-gauge")).not.toBeNull();
    expect(row.querySelector(".kw-frame-usage")?.textContent).toBe("12 tokens · $0.01");
  });

  it("wears the pane's ordinal while ordinals are shown, and takes it off again", () => {
    const [ordinal, setOrdinal] = createSignal<string>();
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused={false}
        shown
        motion={moving}
        ordinal={ordinal()}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.querySelector(".kw-ordinal-badge")).toBeNull();
    setOrdinal("alt+3");
    expect(chrome.querySelector(".kw-ordinal-badge")?.textContent).toBe("alt+3");
    expect(chrome.querySelector(".kw-ordinal-badge")?.getAttribute("aria-hidden")).toBe("true");
    setOrdinal(undefined);
    expect(chrome.querySelector(".kw-ordinal-badge")).toBeNull();
    expect(chromeOf(container)).toBe(chrome);
  });

  it("wears the letter that jumps to it, only while one is offered", () => {
    const [hint, setHint] = createSignal<string>();
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused={false}
        shown
        motion={moving}
        hint={hint()}
        onBringInside={() => undefined}
      >
        <p>body</p>
      </SurfaceChrome>
    ));
    const chrome = chromeOf(container);
    expect(chrome.querySelector(".kw-surface-hint")).toBeNull();
    setHint("ms");
    expect(chrome.querySelector(".kw-surface-hint")?.textContent).toBe("ms");
    setHint("s");
    expect(chrome.querySelector(".kw-surface-hint")?.textContent).toBe("s");
    setHint(undefined);
    expect(chrome.querySelector(".kw-surface-hint")).toBeNull();
    expect(chrome.querySelector(".kw-surface-body")?.textContent).toBe("body");
  });

  it("frames a live node handed to it without copying it", () => {
    const pane = document.createElement("article");
    pane.textContent = "the same pane";
    const { container } = render(() => (
      <SurfaceChrome
        title="a"
        hueRank={0}
        focused
        shown
        motion={moving}
        onBringInside={() => undefined}
      >
        {pane}
      </SurfaceChrome>
    ));
    expect(container.querySelector(".kw-surface-body")?.firstElementChild).toBe(pane);
  });
});

describe("the look", () => {
  it("makes the frame's title row the native drag region and keeps its controls pressable", () => {
    expect(ruleFor(titleRowOutside)).toMatch(/-webkit-app-region: drag;/);
    expect(ruleFor(titleRowOutside)).toMatch(/user-select: none;/);
    expect(ruleFor(".kw-surface-inside")).toMatch(/-webkit-app-region: no-drag;/);
    expect(ruleFor(".kw-surface-body .kw-frame-gauge")).toMatch(/-webkit-app-region: no-drag;/);
    expect(ruleFor(".kw-surface-body .kw-frame-signal")).toMatch(/-webkit-app-region: no-drag;/);
  });

  it("keeps what it lays over the title row as slim as the row, in the machine's mono voice", () => {
    for (const laidOver of [".kw-surface-inside", ".kw-surface-hint"]) {
      expect(ruleFor(laidOver)).toMatch(/height: 2rem;/);
      expect(ruleFor(laidOver)).toMatch(/font-family: var\(--kw-font-mono\);/);
    }
    expect(outsideMetrics.strip).toBe(2 * 14);
  });

  it("clears room at the row's end for the control that brings the pane inside", () => {
    expect(ruleFor(titleRowOutside)).toMatch(/padding-right: var\(--kw-surface-reach\);/);
    expect(ruleFor(".kw-surface-inside")).toMatch(/max-width: var\(--kw-surface-reach\);/);
  });

  it("draws no border at rest, in its own chrome or in the frame it holds", () => {
    expect(ruleFor(".kw-surface")).not.toMatch(/^\s*(border|box-shadow|outline):/m);
    expect(ruleFor(".kw-surface::before")).toMatch(/visibility: hidden;/);
    expect(ruleFor(".kw-surface-outline")).toMatch(/opacity: 0;/);
    expect(ruleFor(".kw-surface-body .kw-frame")).toMatch(/border: 0;/);
    expect(ruleFor(".kw-surface-body .kw-frame::after")).toMatch(/content: none;/);
    expect(ruleFor(".kw-surface-body .kw-frame-outline")).toMatch(/visibility: hidden;/);
    expect(ruleFor('.kw-surface[data-arrival="waiting"]::after')).toMatch(/opacity: 1;/);
  });

  it("marks the lead with a violet top edge and the way back with a violet left edge, never a whole outline", () => {
    expect(ruleFor(".kw-surface")).toMatch(/--kw-surface-edge: var\(--kw-accent\);/);
    expect(ruleFor(".kw-surface::before")).toMatch(
      /height: 2px;\s*background: var\(--kw-surface-edge\);/,
    );
    expect(ruleFor(".kw-surface[data-edge]::before")).toMatch(/visibility: visible;/);
    expect(ruleFor('.kw-surface[data-edge="way-back"]::before')).toMatch(
      /inset: 0 auto 0 0;\s*width: 2px;\s*height: auto;/,
    );
  });

  it("outlines a signal in amber, thin on arrival and heavier when it needs the keeper, and only critical in red", () => {
    expect(ruleFor(".kw-surface")).toMatch(/--kw-surface-amber: var\(--kw-terminal-yellow\);/);
    expect(ruleFor(".kw-surface")).toMatch(/--kw-surface-red: var\(--kw-error\);/);
    expect(ruleFor(".kw-surface")).toMatch(
      /--kw-surface-outline-ink: var\(--kw-surface-amber\);\s*--kw-surface-outline-width: 1px;/,
    );
    expect(ruleFor(".kw-surface-outline")).toMatch(
      /box-shadow: inset 0 0 0 var\(--kw-surface-outline-width\) var\(--kw-surface-outline-ink\);/,
    );
    expect(ruleFor(".kw-surface[data-signal] .kw-surface-outline")).toMatch(/opacity: 1;/);
    expect(css).toMatch(
      /\.kw-surface\[data-outline="needs-you"\],\s*\.kw-surface\[data-outline="critical"\] \{\s*--kw-surface-outline-width: 2px;/,
    );
    expect(css).toMatch(
      /\.kw-surface\[data-outline="critical"\] \{\s*--kw-surface-outline-ink: var\(--kw-surface-red\);/,
    );
    expect(css.match(/--kw-surface-red/g)).toHaveLength(2);
  });

  it("fades an outline as it goes, and drops the fade when motion is reduced", () => {
    expect(ruleFor(".kw-surface-outline")).toMatch(/transition: opacity var\(--kw-surface-fade\);/);
    const system = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(system).toMatch(
      /\.kw-surface-outline,\s*\.kw-surface\[data-signal\] \.kw-surface-outline \{\s*transition: none;/,
    );
    expect(css).toMatch(
      /\.kw-surface\[data-motion="still"\] \.kw-surface-outline \{\s*transition: none;/,
    );
  });

  it("lights the focused pane's title row, and draws no edge for focus alone", () => {
    const unforced = css.slice(0, css.indexOf("@media (forced-colors: active)"));
    expect(unforced).not.toContain(".kw-surface[data-focused] {");
    expect(unforced).not.toContain(".kw-surface[data-focused]::before");
    expect(ruleFor(`.kw-surface[data-focused] ${titleRowOutside}`)).toMatch(
      /--kw-surface-lit: color-mix\(in oklch, var\(--kw-pane-hue\) 10%, var\(--kw-panel-lift\)\);/,
    );
  });

  it("quiets every pane but the focused one under a veil, at once and without moving", () => {
    const veil = ruleFor(".kw-surface-body::after");
    expect(veil).toMatch(/background: var\(--kw-background\);\s*opacity: 0\.38;/);
    expect(veil).toMatch(/pointer-events: none;/);
    expect(veil).toMatch(/transition: opacity var\(--kw-tempo-quick\);/);
    expect(ruleFor(".kw-surface[data-focused] .kw-surface-body::after")).toMatch(/opacity: 0;/);
    expect(ruleFor('.kw-surface[data-motion="still"] .kw-surface-body::after')).toMatch(
      /transition: none;/,
    );
  });

  it("plays the content's arrival once, in about 160 ms, moving only transform and opacity", () => {
    expect(css).toContain(`--kw-surface-arrive: ${quickMs}ms `);
    expect(ruleFor(".kw-surface-body")).toMatch(
      /transition:\s*opacity var\(--kw-surface-arrive\),\s*transform var\(--kw-surface-arrive\);/,
    );
    expect(ruleFor('.kw-surface[data-arrival="waiting"] .kw-surface-body')).toMatch(
      /opacity: 0;\s*transform: translateY/,
    );
  });

  it("animates nothing forever", () => {
    expect(css).not.toMatch(/animation|@keyframes|infinite/);
    const transitioned = [...css.matchAll(/transition:([^;]+);/g)].flatMap(([, list]) =>
      (list ?? "").split(",").map((part) => part.trim().split(/\s+/)[0]),
    );
    expect(new Set(transitioned)).toEqual(new Set(["transform", "opacity", "color", "none"]));
  });

  it("drops the movement when motion is reduced, by setting or by the system", () => {
    expect(css).toMatch(
      /\.kw-surface\[data-motion="fade"\]::before,\s*\.kw-surface\[data-motion="fade"\] \.kw-surface-body \{\s*transform: none;/,
    );
    const system = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(system).toMatch(
      /\.kw-surface\[data-arrival\]::before,\s*\.kw-surface\[data-arrival\] \.kw-surface-body \{\s*transform: none;/,
    );
    expect(css).toMatch(
      /\.kw-surface\[data-motion="still"\] \.kw-surface-body \{\s*transition: none;\s*transform: none;/,
    );
    expect(css).toMatch(/\.kw-surface\[data-motion="still"\] \.kw-surface-body \{\s*opacity: 1;/);
  });

  it("shows a moved frame's own title row as the pane's one title, never hiding it", () => {
    expect(ruleFor(titleRowOutside)).not.toBe("");
    expect(css).not.toMatch(/display: none/);
  });

  it("seats the ordinal at the row's end and the jump letter at its start, over the stamp", () => {
    expect(ruleFor(".kw-surface .kw-ordinal-badge")).toMatch(/top: 0\.375rem;\s*right: 0\.5rem;/);
    expect(ruleFor(".kw-surface-hint")).toMatch(/top: 0;\s*left: 0;/);
    expect(ruleFor(".kw-surface-hint")).toMatch(
      /color: var\(--kw-background\);\s*background: var\(--kw-accent\);/,
    );
    expect(ruleFor(".kw-surface-hint")).toMatch(/pointer-events: none;/);
  });

  it("steps the control that brings the pane inside out of the ordinal's way while it shows", () => {
    expect(ruleFor(".kw-surface:has(> .kw-ordinal-badge) .kw-surface-inside")).toMatch(
      /visibility: hidden;/,
    );
  });

  it("seats what it frames under the strip, however that was placed in its own window", () => {
    expect(ruleFor(".kw-surface .kw-surface-body > *")).toMatch(
      /position: relative;\s*inset: auto;\s*flex: 1;\s*min-height: 0;/,
    );
  });

  it("marks focus in forced colours as the pane frame does", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.kw-surface\[data-focused\]::before \{[^}]*background: Highlight;/);
  });
});
