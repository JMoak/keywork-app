import { resolvePalette } from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokensFromStyle } from "../companion/renderer.ts";
import { skinnedRenderer } from "../companion/skinned-renderer.ts";
import { Portrait } from "../onboarding/portrait.tsx";
import { PortraitView } from "../panes/creature/portrait.tsx";
import { CourtyardPortrait } from "../panes/stead/courtyards/portrait.tsx";
import { sourceOfTheme } from "../panes/stead/theme-source.ts";
import { keyworkDay, keyworkNight, themeVariables } from "../theme/index.ts";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("material parity across native creature surfaces", () => {
  it.each(["folio", "tessera", "cairn"])(
    "paints %s with the same pigments in the picker, profile, courtyard and companion",
    (id) => {
      const loaded = loadSkin(id);
      if (!loaded.ok) throw new Error(`Missing ${id}`);
      const contexts = new Map<HTMLCanvasElement, ReturnType<typeof ink>>();
      vi.spyOn(window, "getComputedStyle").mockImplementation(() => document.documentElement.style);
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        const context = contexts.get(this) ?? ink();
        contexts.set(this, context);
        return context.context;
      });
      for (const theme of [keyworkDay, keyworkNight]) {
        const source = sourceOfTheme(theme);
        for (const [key, value] of Object.entries(themeVariables(theme)))
          document.documentElement.style.setProperty(key, value);
        const view = render(() => (
          <>
            <Portrait skin={id} hueStop={1} />
            <PortraitView skin={id} hueStop={1} name="Preview" />
            <CourtyardPortrait skin={id} hueStop={1} appearance={0} inScene />
          </>
        ));
        const palette = resolvePalette(source, { material: loaded.skin.material, hueStop: 1 });
        const frame = loaded.sliced.frame("idle", 0);
        const expected = new Set(
          [...frame.indices].filter((index) => index !== 0).map((index) => palette[index]),
        );
        const canvases = [...view.container.querySelectorAll("canvas")];
        expect(canvases).toHaveLength(3);
        for (const canvas of canvases)
          expect(contexts.get(canvas)?.colors, `${id} ${theme.name} ${canvas.className}`).toEqual(
            expected,
          );
        const companion = ink();
        skinnedRenderer(loaded.skin, () => source)(
          { clip: "idle", frame: 0, facing: "right" },
          tokensFromStyle(source.read, 1, false),
          { deviceScale: 2, hueStop: 1 },
        ).paint(companion.context);
        expect(companion.colors).toEqual(expected);
        view.unmount();
      }
    },
  );
});

function ink() {
  const colors = new Set<string>();
  const drawing = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    clearRect: () => colors.clear(),
    fillRect: () => colors.add(drawing.fillStyle),
  };
  return { colors, context: drawing as unknown as CanvasRenderingContext2D };
}
