import { emptyHabitat, withCreatures } from "@keywork-app/habitat";
import { courtyardLayout } from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourtyardOverview } from "./index.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a composed courtyard", () => {
  it("bounds all sixteen courts' canvas storage even at very high display density", () => {
    vi.stubGlobal("devicePixelRatio", 8);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const residents = Array.from({ length: 16 }, (_, index) => ({
      slug: `resident-${index}`,
      name: `Resident ${index}`,
    }));
    const world = withCreatures(emptyHabitat(), residents, "2026-11-19T12:00:00Z");
    const view = render(() => (
      <CourtyardOverview
        world={world}
        order={residents.map((resident) => resident.slug)}
        now={0}
        onOpen={() => {}}
      />
    ));
    const canvases = [...view.container.querySelectorAll("canvas")];
    expect(canvases).toHaveLength(32);
    expect(
      canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0),
    ).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it.each([1, 1.25, 2, 3])(
    "anchors its resident to the same ground independently of density %s",
    (dpr) => {
      vi.stubGlobal("devicePixelRatio", dpr);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      const world = withCreatures(
        emptyHabitat(),
        [{ slug: "stone", name: "Stone", skin: "cairn" }],
        "2026-11-19T12:00:00Z",
      );
      const view = render(() => (
        <CourtyardOverview world={world} order={["stone"]} now={0} onOpen={() => {}} />
      ));
      const portrait = view.container.querySelector<HTMLCanvasElement>(".kw-courtyard-portrait");
      const scene = view.container.querySelector<HTMLCanvasElement>(".kw-courtyard-workshop");
      const loaded = loadSkin("cairn");
      if (!loaded.ok || portrait === null || scene === null)
        throw new Error("Missing courtyard artwork");
      expect(scene.style.width).toBe("100%");
      expect(scene.style.height).toBe("100%");
      expect(scene.width / scene.height).toBe(courtyardLayout.width / courtyardLayout.height);
      expect(
        Number.parseFloat(portrait.style.left) + Number.parseFloat(portrait.style.width) / 2,
      ).toBeCloseTo((100 * courtyardLayout.resident.x) / courtyardLayout.width);
      expect(
        Number.parseFloat(portrait.style.top) +
          (Number.parseFloat(portrait.style.height) * loaded.skin.groundLine) /
            loaded.skin.cell.height,
      ).toBeCloseTo((100 * courtyardLayout.resident.y) / courtyardLayout.height);
      expect(portrait.style.width).toMatch(/%$/);
      expect(portrait.style.height).toMatch(/%$/);
    },
  );

  it("keeps the landscape tied to the permanent court across neighborhood visits and vacancies", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const world = withCreatures(
      emptyHabitat(),
      [{ slug: "stone", name: "Stone" }],
      "2026-11-19T12:00:00Z",
    );
    const order = [...Array.from({ length: 16 }, (_, index) => `reserved-${index}`), "stone"];
    const view = render(() => (
      <CourtyardOverview
        world={world}
        order={order}
        range={{ start: 16, end: 17 }}
        now={0}
        onOpen={() => {}}
      />
    ));
    expect(view.container.querySelector("[data-setting]")?.getAttribute("data-setting")).toBe(
      "quarry",
    );
    expect(view.getByRole("button").getAttribute("aria-label")).toContain("Court 17");
    expect(view.getByText("Stone garden")).toBeTruthy();
  });
});
