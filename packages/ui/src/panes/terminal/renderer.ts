export type RendererChoice = "webgl" | "dom";

export interface RendererProbe {
  webgl2: boolean;
  contextLost?: boolean | undefined;
}

export function chooseRenderer(probe: RendererProbe): RendererChoice {
  return probe.webgl2 && probe.contextLost !== true ? "webgl" : "dom";
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
