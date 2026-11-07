import { describe, expect, it } from "vitest";
import { screenChannels } from "../main/screen/channels.ts";
import { followWornTheme, pushWornTheme, type WornThemePage } from "./worn-theme.ts";

describe("the worn theme pushed to main", () => {
  it("pushes the worn theme at once and again only when the console wears another", () => {
    const root = { dataset: { theme: "keywork-night" } as DOMStringMap };
    let changed: () => void = () => {};
    const pushed: string[] = [];
    followWornTheme(
      root,
      (listener) => {
        changed = listener;
      },
      (name) => pushed.push(name),
    );
    changed();
    root.dataset.theme = "keywork-day";
    changed();
    changed();
    expect(pushed).toEqual(["keywork-night", "keywork-day"]);
  });

  it("waits for a page still loading, and pushes nothing without a page or a theme", () => {
    const sent: unknown[][] = [];
    const ipc = { send: (...args: unknown[]) => void sent.push(args) };
    pushWornTheme(ipc, undefined);
    let loaded: (() => void) | undefined;
    const page: WornThemePage = {
      documentElement: null,
      readyState: "loading",
      addEventListener: (_type, listener) => {
        loaded = listener;
      },
    };
    pushWornTheme(ipc, page, () => {});
    expect(loaded).toBeDefined();
    loaded?.();
    expect(sent).toEqual([]);
    expect(screenChannels.wornTheme).toBe("screen:worn-theme");
  });
});
