import { describe, expect, it } from "vitest";
import { companionMenu, sizeStops } from "./menu.ts";

describe("companionMenu", () => {
  it("always offers Open, Hide, Still, Quiet, Size and Settings, in that order", () => {
    const items = companionMenu({
      still: true,
      quiet: false,
      size: 125,
      creatures: [{ slug: "pip", name: "Pip" }],
      current: "pip",
    });
    expect(items.map((item) => ("label" in item ? item.label : "—"))).toEqual([
      "Open the console",
      "—",
      "Hide",
      "Still",
      "Quiet",
      "Size",
      "—",
      "Settings…",
    ]);
    expect(items[3]).toEqual({ kind: "toggle", label: "Still", action: "still", checked: true });
    const size = items[5];
    if (size?.kind !== "submenu") throw new Error("no size submenu");
    expect(size.items.filter((item) => item.kind === "choice").map((item) => item.label)).toEqual(
      sizeStops.map((stop) => `${stop}%`),
    );
    expect(size.items.find((item) => item.kind === "choice" && item.chosen)).toMatchObject({
      payload: "125",
    });
    expect(size.items.at(-1)).toEqual({
      kind: "action",
      label: "Reset",
      action: "size",
      payload: "100",
    });
  });

  it("offers Switch creature only when there is more than one", () => {
    const items = companionMenu({
      still: false,
      quiet: false,
      size: 100,
      creatures: [
        { slug: "pip", name: "Pip" },
        { slug: "moss", name: "Moss" },
      ],
      current: "moss",
    });
    const switcher = items.find(
      (item) => item.kind === "submenu" && item.label === "Switch creature",
    );
    if (switcher?.kind !== "submenu") throw new Error("no switcher");
    expect(switcher.items).toEqual([
      { kind: "choice", label: "Pip", action: "switch-creature", payload: "pip", chosen: false },
      { kind: "choice", label: "Moss", action: "switch-creature", payload: "moss", chosen: true },
    ]);
  });
});
