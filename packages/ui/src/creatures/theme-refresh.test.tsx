import { emptyHabitat, withCreatures } from "@keywork-app/habitat";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { CourtyardOverview } from "../panes/stead/courtyards/index.tsx";
import { keyworkDay, keyworkNight, themeVariables } from "../theme/index.ts";
import { CreaturePortrait } from "./portrait.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("repaints still portraits and folded landscapes for a pane-only theme change, not pane geometry", async () => {
  const fills = new Map<HTMLCanvasElement, string[]>();
  let paintCount = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const context = {
      fillStyle: "",
      imageSmoothingEnabled: false,
      clearRect: () => fills.set(this, []),
      fillRect: () => {
        paintCount += 1;
        fills.set(this, [...(fills.get(this) ?? []), context.fillStyle]);
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  });
  const readStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const holder = element.closest<HTMLElement>("[data-pane-theme]");
    return holder?.style ?? readStyle(element);
  });
  const world = withCreatures(
    emptyHabitat(),
    [{ slug: "moss", name: "Moss", skin: "folio" }],
    "2026-11-19T00:00:00Z",
  );
  const view = render(() => (
    <div data-pane-theme>
      <CreaturePortrait skin="tessera" hueStop={1} playing={false} />
      <CourtyardOverview world={world} order={["moss"]} now={0} onOpen={() => undefined} />
    </div>
  ));
  const holder = view.container.querySelector<HTMLElement>("[data-pane-theme]");
  if (holder === null) throw new Error("Missing theme holder");
  const wear = (theme: typeof keyworkDay) => {
    for (const [name, value] of Object.entries(themeVariables(theme)))
      holder.style.setProperty(name, value);
  };
  wear(keyworkDay);
  await waitFor(() => expect(fills.size).toBe(3));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const day = new Map([...fills].map(([canvas, colors]) => [canvas, [...new Set(colors)]]));
  const before = paintCount;
  holder.style.width = "370px";
  holder.style.gridColumn = "2";
  holder.classList.add("being-arranged");
  window.dispatchEvent(new Event("resize"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(paintCount).toBe(before);
  fills.clear();
  wear(keyworkNight);
  await waitFor(() => {
    expect(fills.size).toBe(3);
    for (const [canvas, colors] of fills) expect([...new Set(colors)]).not.toEqual(day.get(canvas));
  });
  view.unmount();
  const stopped = paintCount;
  holder.style.setProperty("--kw-art-teal", "#8baacd");
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(paintCount).toBe(stopped);
});
