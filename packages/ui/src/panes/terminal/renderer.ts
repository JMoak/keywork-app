export type RendererChoice = "webgl" | "dom";

export interface RendererProbe {
  webgl2: boolean;
  atlasFont: boolean;
  contextLost?: boolean | undefined;
}

export function chooseRenderer(probe: RendererProbe): RendererChoice {
  return probe.webgl2 && probe.atlasFont && probe.contextLost !== true ? "webgl" : "dom";
}

export function probeRenderer(): RendererProbe {
  return { webgl2: probeWebgl2(), atlasFont: probeAtlasFont() };
}

export function probeWebgl2(
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): boolean {
  try {
    const canvas = makeCanvas();
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

// @xterm/addon-webgl 0.19.0 rasterizes glyphs with `${style} ${weight} ${size}px ${family}` and an
// empty style for upright text. Chromium 156 rejects a canvas font with a leading space, so the
// atlas silently draws every glyph in 10px sans-serif; WebGL is trusted only where that shape holds.
export function probeAtlasFont(
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): boolean {
  try {
    const context = makeCanvas().getContext("2d");
    if (context === null) return false;
    context.font = atlasFontShape;
    return context.font.includes(atlasProbeSize);
  } catch {
    return false;
  }
}

const atlasProbeSize = "17px";
const atlasFontShape = ` normal ${atlasProbeSize} monospace`;
