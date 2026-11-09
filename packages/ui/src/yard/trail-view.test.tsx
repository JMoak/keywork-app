import type { TrailRow, YardSetting } from "@keywork-app/habitat";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import type { TrailStep } from "./actions.ts";
import type { RailView } from "./control.ts";
import { createYardPanels } from "./panels.ts";
import { aYardSetting } from "./testing.ts";
import type { YardLineage } from "./trail.ts";
import { Yard } from "./yard.tsx";

afterEach(cleanup);

describe("the rail's trail view", () => {
  it("lists every node on the rail in trail order, each one level under its parent", () => {
    renderTrail({ view: "trail" });
    expect(railCards()).toEqual(["a stale branch 0", "the sum change 0", "sum.ts 1"]);
    expect(railRungs()).toEqual(["card", "unfold", "unfold"]);
  });

  it("keeps only cards on the rail by depth now, and takes the trail when toggled while the rail holds still", () => {
    const yard = renderTrail({ view: "now" });
    expect(railCards()).toEqual(["a stale branch -"]);
    keyOnRail("j");
    yard.setView("trail");
    expect(railCards()).toEqual(["a stale branch 0", "the sum change 0", "sum.ts 1"]);
    expect(cursorOn()).toBe("sum.ts");
    yard.setView("now");
    expect(railCards()).toEqual(["a stale branch -"]);
  });

  it("answers t, [ and ] on the rail, and shows the trail keys in its head", () => {
    const yard = renderTrail({ view: "trail" });
    expect(railHead()).toBe("j k move · [ ] walk the chain · enter opens · t now · esc returns");
    keyOnRail("j");
    keyOnRail("[");
    keyOnRail("]");
    keyOnRail("t");
    expect(yard.walked).toEqual([
      ["diff", "rootward"],
      ["diff", "leafward"],
    ]);
    expect(yard.toggled).toHaveBeenCalledOnce();
  });

  it("heads the hub with the chain of the node under the cursor, and only when it grew from one", () => {
    const yard = renderTrail({ view: "now" });
    expect(crumb()).toBeNull();
    keyOnRail("j");
    expect(crumb()?.textContent).toBe("the sum change → sum.ts");
    yard.moveRail("note");
    expect(crumb()).toBeNull();
  });

  it("calls the keeper's own opening theirs, from the panel it grew out of", () => {
    renderTrail({ view: "now" });
    expect(byLineOf("file")).toBe("you opened it from the sum change");
    expect(byLineOf("diff")).toBe("Wren set out a note");
  });
});

describe("a panel in the yard", () => {
  it("sets out a link the keeper follows inside it, from that panel", () => {
    const yard = renderTrail({ view: "now", railActive: false });
    const link = document.createElement("a");
    link.href = "https://example.com/spec";
    bodyOf("diff").append(link);
    fireEvent.click(link);
    expect(yard.opened).toEqual([["diff", { kind: "url", ref: "https://example.com/spec" }]]);
  });

  it("reports a scroll, an edit and a keypress inside it as interactions with it", () => {
    const yard = renderTrail({ view: "now", railActive: false });
    const inside = bodyOf("file");
    inside.dispatchEvent(new Event("scroll"));
    fireEvent.input(inside);
    fireEvent.keyDown(inside, { key: "a" });
    expect(yard.interacted).toEqual(["file", "file", "file"]);
  });

  it("is focusable and tells the yard when the keeper is inside it", () => {
    const yard = renderTrail({ view: "now", railActive: false });
    expect(yard.panels.focus("file")).toBe(true);
    fireEvent.focusIn(document.activeElement as HTMLElement);
    expect(yard.panels.inside()).toBe("file");
    expect(crumb()?.textContent).toBe("the sum change → sum.ts");
  });
});

const diff = aYardSetting({
  id: "diff",
  shown: "unfold",
  depth: 9,
  at: "2026-11-08T09:00:00.000Z",
  what: { kind: "note", ref: "the change", title: "the sum change" },
});
const file = aYardSetting({
  id: "file",
  shown: "unfold",
  depth: 8,
  from: "diff",
  origin: "keeper",
  why: "",
  at: "2026-11-08T09:01:00.000Z",
  what: { kind: "note", ref: "the file", title: "sum.ts" },
});
const note = aYardSetting({
  id: "note",
  shown: "card",
  depth: 1,
  creature: "tam",
  at: "2026-11-08T09:02:00.000Z",
  what: { kind: "note", ref: "a stale branch", title: "a stale branch" },
});

const trailRows: readonly TrailRow[] = [
  { id: "note", level: 0, parent: null },
  { id: "diff", level: 0, parent: null },
  { id: "file", level: 1, parent: "diff" },
];

const lineage: YardLineage = {
  parentOf: (id) => (id === "file" ? "diff" : undefined),
  childrenOf: (id) => (id === "diff" ? ["file"] : []),
  chainOf: (id) => (id === "file" ? "the sum change → sum.ts" : "the sum change"),
  trailOrder: () => trailRows,
};

function renderTrail(options: { view: RailView; railActive?: boolean }) {
  const [view, setView] = createSignal(options.view);
  const [railAt, setRailAt] = createSignal<string>();
  const walked: Array<[string, TrailStep]> = [];
  const opened: Array<[string, unknown]> = [];
  const interacted: string[] = [];
  const toggled = vi.fn();
  const panels = createYardPanels();
  const settings: readonly YardSetting[] = [diff, file, note];
  render(() => (
    <Yard
      on={true}
      settings={settings}
      offsetMinutes={0}
      railActive={options.railActive ?? true}
      railAt={railAt()}
      view={view()}
      reducedMotion={true}
      shell={{} as ShellSeams}
      panels={panels}
      lineage={lineage}
      ownerOf={() => "Wren"}
      onEnter={() => undefined}
      onAnswer={() => undefined}
      onOpen={(from, what) => opened.push([from.id, what])}
      onInteract={(setting) => interacted.push(setting.id)}
      onToggleView={toggled}
      onWalk={(from, step) => walked.push([from, step])}
      onReturn={() => undefined}
    >
      <div class="kw-stage" />
    </Yard>
  ));
  return {
    walked,
    opened,
    interacted,
    toggled,
    panels,
    setView,
    moveRail: (id: string) => setRailAt(id),
  };
}

function keyOnRail(key: string): void {
  fireEvent.keyDown(document.querySelector(".kw-yard-rail") as HTMLElement, { key });
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".kw-yard-card")].toSorted(
    (a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top),
  );
}

function railCards(): string[] {
  return cards().map(
    (card) =>
      `${card.querySelector(".kw-yard-card-title")?.textContent ?? ""} ${card.dataset.level ?? "-"}`,
  );
}

function railRungs(): Array<string | undefined> {
  return cards().map((card) => card.dataset.rung);
}

function cursorOn(): string | undefined {
  return (
    document.querySelector(".kw-yard-card[data-cursor] .kw-yard-card-title")?.textContent ??
    undefined
  );
}

function railHead(): string {
  return document.querySelector(".kw-yard-rail-head")?.textContent ?? "";
}

function crumb(): HTMLElement | null {
  return document.querySelector(".kw-yard-crumb");
}

function byLineOf(id: string): string {
  const satellite = document.querySelector(`.kw-yard-satellite[data-setting="${id}"]`);
  return satellite?.querySelector(".kw-frame-turn")?.textContent ?? "";
}

function bodyOf(id: string): HTMLElement {
  const satellite = document.querySelector(`.kw-yard-satellite[data-setting="${id}"]`);
  return satellite?.querySelector(".kw-yard-note") as HTMLElement;
}
