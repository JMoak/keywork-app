export interface TextSpan {
  start: number;
  end: number;
}

export function graphemesOf(text: string): string[] {
  return Array.from(clusters.segment(text), (cluster) => cluster.segment);
}

export function clusterBefore(text: string, caret: number): TextSpan {
  return clusterWhere(text, (span) => span.start < caret && caret <= span.end) ?? at(caret);
}

export function clusterAfter(text: string, caret: number): TextSpan {
  return clusterWhere(text, (span) => span.start <= caret && caret < span.end) ?? at(caret);
}

const clusters = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function clusterWhere(text: string, holds: (span: TextSpan) => boolean): TextSpan | undefined {
  for (const cluster of clusters.segment(text)) {
    const span = { start: cluster.index, end: cluster.index + cluster.segment.length };
    if (holds(span)) return span;
  }
  return undefined;
}

function at(caret: number): TextSpan {
  return { start: caret, end: caret };
}
