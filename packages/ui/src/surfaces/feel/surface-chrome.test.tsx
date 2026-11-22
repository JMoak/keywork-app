import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MotionPrefs } from "@keywork-app/habitat";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { PaneEdge, PaneSignal } from "../../chrome/signals.ts";
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

  it("marks focus in forced colours as the pane frame does", () => {
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/\.kw-surface\[data-focused\]::before \{[^}]*background: Highlight;/);
  });
});
