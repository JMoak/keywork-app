export const cardScenes = ["yard-cards", "yard-unfold", "yard-rail", "yard-stage"] as const;

export const plotScenes = [
  "yard-plot-seed",
  "yard-plot-file",
  "yard-plot-test",
  "yard-plot-folded",
  "yard-plot-restored",
  "yard-trail",
] as const;

export type CardScene = (typeof cardScenes)[number];

export type PlotScene = (typeof plotScenes)[number];

export type YardScene = CardScene | PlotScene;

export const yardScenes: readonly YardScene[] = [...cardScenes, ...plotScenes];

export function isYardScene(scene: string): scene is YardScene {
  return (yardScenes as readonly string[]).includes(scene);
}

export function isPlotScene(scene: string): scene is PlotScene {
  return (plotScenes as readonly string[]).includes(scene);
}
