import { cleanup, render } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { airlockItem, askItem } from "../shell/needs-you-testing.ts";
import {
  createStripPreference,
  NeedsYouStrip,
  type StripInputs,
  stripLine,
  stripStorageKey,
} from "./needs-you-strip.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const inputs: StripInputs = {
  shown: true,
  count: 3,
  head: askItem("c1"),
  paneOpen: false,
  hint: "ctrl+k n",
  where: () => "refactor-permissions",
};

describe("the strip line", () => {
  it("reads as the count, the next item's gloss and session, and the chord that goes there", () => {
    expect(stripLine(inputs)).toEqual({
      count: "3 need you",
      next: { gloss: "ask: rm -rf dist", where: "refactor-permissions", hint: "ctrl+k n" },
    });
  });

  it("collapses to the count while the pane is open, since the pane is the detail", () => {
    expect(stripLine({ ...inputs, paneOpen: true })).toEqual({ count: "3 need you" });
  });

  it("is absent when nothing waits or the person hid it", () => {
    expect(stripLine({ ...inputs, count: 0, head: undefined })).toBeUndefined();
    expect(stripLine({ ...inputs, shown: false })).toBeUndefined();
  });

  it("names an airlock by its arc", () => {
    const line = stripLine({
      ...inputs,
      count: 1,
      head: airlockItem("pricing"),
      where: () => "pricing",
    });
    expect(line?.count).toBe("1 needs you");
    expect(line?.next?.gloss).toBe("airlock: 2 candidates, 1 question");
  });
});

describe("the strip", () => {
  it("renders one glanceable line with the needs-you stamp and nothing to focus", () => {
    const { container } = render(() => <NeedsYouStrip line={stripLine(inputs)} />);
    const strip = container.querySelector(".kw-needs-you") as HTMLElement;
    expect(strip.getAttribute("role")).toBe("status");
    expect(strip.dataset.detail).toBe("next");
    expect(strip.textContent).toBe("█3 need youask: rm -rf dist(refactor-permissions)ctrl+k n");
    expect(strip.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("shows the count alone when the pane holds the detail, and nothing when empty", () => {
    const { container } = render(() => (
      <>
        <NeedsYouStrip line={stripLine({ ...inputs, paneOpen: true })} />
        <NeedsYouStrip line={undefined} />
      </>
    ));
    const strips = container.querySelectorAll<HTMLElement>(".kw-needs-you");
    expect(strips).toHaveLength(1);
    expect(strips[0]?.dataset.detail).toBe("count");
    expect(strips[0]?.textContent).toBe("█3 need you");
  });
});

describe("the strip preference", () => {
  it("is shown by default and remembers a toggle in app storage", () => {
    const first = createRoot(() => createStripPreference(localStorage));
    expect(first.shown()).toBe(true);
    expect(first.toggle()).toBe(false);
    expect(localStorage.getItem(stripStorageKey)).toBe("hidden");
    const next = createRoot(() => createStripPreference(localStorage));
    expect(next.shown()).toBe(false);
    expect(next.toggle()).toBe(true);
    expect(localStorage.getItem(stripStorageKey)).toBe("shown");
  });

  it("works without storage at all", () => {
    const preference = createStripPreference(undefined);
    expect(preference.toggle()).toBe(false);
    expect(preference.shown()).toBe(false);
  });
});
