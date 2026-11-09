import { emptyYard, type YardSetting } from "@keywork-app/habitat";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import { aYardSetting } from "./testing.ts";
import { yardLineageOf } from "./trail.ts";
import { Yard } from "./yard.tsx";

afterEach(cleanup);

describe("a plot folding and restoring on the springs", () => {
  it("glides its panels into the plot card and lets them go once they rest there", () => {
    const run = renderPlot({ reducedMotion: false });
    run.frames(90);
    expect(panel("file")?.hasAttribute("inert")).toBe(false);
    run.settle();
    expect(panel("file")?.dataset.folding).toBe("");
    expect(panel("file")?.hasAttribute("inert")).toBe(true);
    run.frame(30);
    const card = plotCardRect();
    expect(Number.parseFloat(panel("file")?.style.width ?? "0")).toBeGreaterThan(card.width);
    run.frames(90);
    expect(panel("file")).toBeUndefined();
    expect(panel("test")).toBeUndefined();
  });

  it("grows restored panels back out of the plot card", () => {
    const run = renderPlot({ reducedMotion: false });
    run.frames(90);
    run.settle();
    run.frames(90);
    const card = plotCardRect();
    run.restore();
    const grown = rectOf(panel("file"));
    expect(grown.y).toBe(card.y);
    expect(grown.width).toBe(card.width);
    run.frames(90);
    expect(rectOf(panel("file")).width).toBeGreaterThan(card.width);
  });

  it("snaps under reduced motion: the panels go at once and come back at once", () => {
    const run = renderPlot({ reducedMotion: true });
    run.settle();
    expect(panel("file")).toBeUndefined();
    run.restore();
    expect(rectOf(panel("file")).width).toBeGreaterThan(plotCardWidth);
    expect(run.pending()).toBe(0);
  });
});

const plotCardWidth = 272;

function renderPlot(options: { reducedMotion: boolean }) {
  let now = 0;
  const queue: Array<() => void> = [];
  const diff = unfolded("diff", null, 0, "the sum change");
  const file = unfolded("file", "diff", 1, "sum.ts");
  const test = unfolded("test", "file", 2, "sum.test.ts");
  const [settings, setSettings] = createSignal<readonly YardSetting[]>([diff, file, test]);
  const yard = () => ({
    ...emptyYard,
    settings: Object.fromEntries(settings().map((setting) => [setting.id, setting])),
  });
  render(() => (
    <Yard
      on={true}
      settings={settings()}
      offsetMinutes={0}
      railActive={false}
      reducedMotion={options.reducedMotion}
      shell={{} as ShellSeams}
      lineage={yardLineageOf(yard)}
      ownerOf={() => "Wren"}
      tick={(flush) => void queue.push(flush)}
      now={() => now}
      onEnter={() => undefined}
      onAnswer={() => undefined}
      onReturn={() => undefined}
    >
      <div class="kw-stage" />
    </Yard>
  ));
  const frame = (ms: number): void => {
    now += ms;
    for (const flush of queue.splice(0)) flush();
  };
  return {
    settle: () => setSettings([folded(file), folded(test)]),
    restore: () =>
      setSettings([
        { ...file, folded: undefined },
        { ...test, folded: undefined },
      ]),
    frame,
    frames: (count: number) => {
      for (let step = 0; step < count; step += 1) frame(16);
    },
    pending: () => queue.length,
  };
}

function unfolded(id: string, from: string | null, minute: number, title: string): YardSetting {
  return aYardSetting({
    id,
    from,
    origin: from === null ? "creature" : "keeper",
    shown: "unfold",
    depth: 9 - minute,
    at: new Date(Date.UTC(2026, 10, 8, 9, minute)).toISOString(),
    what: { kind: "note", ref: title, title },
  });
}

function folded(setting: YardSetting): YardSetting {
  return { ...setting, folded: "plot:diff" };
}

function panel(id: string): HTMLElement | undefined {
  return (
    document.querySelector<HTMLElement>(`.kw-yard-satellite[data-setting="${id}"]`) ?? undefined
  );
}

function rectOf(element: HTMLElement | undefined) {
  const style = element?.style;
  return {
    x: Number.parseFloat(style?.left ?? "0"),
    y: Number.parseFloat(style?.top ?? "0"),
    width: Number.parseFloat(style?.width ?? "0"),
    height: Number.parseFloat(style?.height ?? "0"),
  };
}

function plotCardRect() {
  const card = document.querySelector<HTMLElement>(".kw-yard-card[data-plot]");
  const slot = document.querySelector<HTMLElement>(".kw-yard-rail-slot");
  const inner = rectOf(card ?? undefined);
  const outer = rectOf(slot ?? undefined);
  return { ...inner, x: inner.x + outer.x, y: inner.y + outer.y };
}
