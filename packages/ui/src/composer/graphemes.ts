export interface TextSpan {
  start: number;
  end: number;
}

export function graphemesOf(text: string): string[] {
  return Array.from(clusters.segment(text), (cluster) => cluster.segment);
}

export function clusterBefore(text: string, caret: number): TextSpan {
  return caret > 0 ? clusterHolding(text, caret - 1) : at(caret);
}

export function clusterAfter(text: string, caret: number): TextSpan {
  return caret < text.length ? clusterHolding(text, caret) : at(caret);
}

const clusters = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function clusterHolding(text: string, index: number): TextSpan {
  const cluster = clusters.segment(text).containing(index);
  return cluster === undefined
    ? at(index)
    : { start: cluster.index, end: cluster.index + cluster.segment.length };
}

function at(caret: number): TextSpan {
  return { start: caret, end: caret };
}
