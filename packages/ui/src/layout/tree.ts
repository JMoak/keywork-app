import type { Direction, Rect } from "./geometry.ts";

export type PaneId = string;
export type Orientation = "row" | "column";

export type LayoutNode =
  | { readonly kind: "leaf"; readonly id: PaneId }
  | {
      readonly kind: "split";
      readonly orientation: Orientation;
      readonly ratio: number;
      readonly first: LayoutNode;
      readonly second: LayoutNode;
    };

export type SplitNode = Extract<LayoutNode, { kind: "split" }>;

export const minPaneSize = { width: 320, height: 200 } as const;
export const splitRatioBounds = { min: 0.1, max: 0.9 } as const;
export const splitRatioStep = 0.05;

export function steppedRatio(preferred: number): number {
  const steps = 1 / splitRatioStep;
  const stepped = Math.round(preferred * steps) / steps;
  return clamp(stepped, splitRatioBounds.min, splitRatioBounds.max);
}

export function leaf(id: PaneId): LayoutNode {
  return { kind: "leaf", id };
}

export function leafIds(node: LayoutNode): PaneId[] {
  return node.kind === "leaf" ? [node.id] : [...leafIds(node.first), ...leafIds(node.second)];
}

export function splitLeaf(
  node: LayoutNode,
  target: PaneId,
  incoming: LayoutNode,
  orientation: Orientation,
): LayoutNode {
  if (node.kind === "leaf") {
    if (node.id !== target) return node;
    return { kind: "split", orientation, ratio: 0.5, first: node, second: incoming };
  }
  return {
    ...node,
    first: splitLeaf(node.first, target, incoming, orientation),
    second: splitLeaf(node.second, target, incoming, orientation),
  };
}

export function removeLeaf(node: LayoutNode, id: PaneId): LayoutNode | undefined {
  if (node.kind === "leaf") return node.id === id ? undefined : node;
  const first = removeLeaf(node.first, id);
  const second = removeLeaf(node.second, id);
  if (first === undefined) return second;
  if (second === undefined) return first;
  return { ...node, first, second };
}

export function swapLeaves(node: LayoutNode, left: PaneId, right: PaneId): LayoutNode {
  if (node.kind === "leaf") {
    if (node.id === left) return leaf(right);
    if (node.id === right) return leaf(left);
    return node;
  }
  return {
    ...node,
    first: swapLeaves(node.first, left, right),
    second: swapLeaves(node.second, left, right),
  };
}

export function attachAtEdge(
  tree: LayoutNode | undefined,
  id: PaneId,
  edge: Direction,
): LayoutNode {
  const incoming = leaf(id);
  if (tree === undefined) return incoming;
  const orientation: Orientation = edge === "left" || edge === "right" ? "row" : "column";
  const incomingFirst = edge === "left" || edge === "up";
  return {
    kind: "split",
    orientation,
    ratio: 0.5,
    first: incomingFirst ? incoming : tree,
    second: incomingFirst ? tree : incoming,
  };
}

export function resizeAroundLeaf(node: LayoutNode, id: PaneId, delta: number): LayoutNode {
  if (node.kind === "leaf") return node;
  if (isLeaf(node.first, id)) return { ...node, ratio: steppedRatio(node.ratio + delta) };
  if (isLeaf(node.second, id)) return { ...node, ratio: steppedRatio(node.ratio - delta) };
  return {
    ...node,
    first: resizeAroundLeaf(node.first, id, delta),
    second: resizeAroundLeaf(node.second, id, delta),
  };
}

export function rotateAroundLeaf(node: LayoutNode, id: PaneId): LayoutNode {
  if (node.kind === "leaf") return node;
  if (isLeaf(node.first, id) || isLeaf(node.second, id)) {
    return { ...node, orientation: node.orientation === "row" ? "column" : "row" };
  }
  return {
    ...node,
    first: rotateAroundLeaf(node.first, id),
    second: rotateAroundLeaf(node.second, id),
  };
}

export function minWidth(node: LayoutNode): number {
  if (node.kind === "leaf") return minPaneSize.width;
  const first = minWidth(node.first);
  const second = minWidth(node.second);
  return node.orientation === "row" ? first + second : Math.max(first, second);
}

export function minHeight(node: LayoutNode): number {
  if (node.kind === "leaf") return minPaneSize.height;
  const first = minHeight(node.first);
  const second = minHeight(node.second);
  return node.orientation === "column" ? first + second : Math.max(first, second);
}

export function collectRects(node: LayoutNode, rect: Rect, into: Map<PaneId, Rect>): void {
  if (node.kind === "leaf") {
    into.set(node.id, rect);
    return;
  }
  const [first, second] = splitRects(rect, node);
  collectRects(node.first, first, into);
  collectRects(node.second, second, into);
}

export function splitRects(rect: Rect, split: SplitNode): [Rect, Rect] {
  if (split.orientation === "row") {
    const width = divide(rect.width, split.ratio, minWidth(split.first), minWidth(split.second));
    return [
      { ...rect, width },
      { ...rect, x: rect.x + width, width: rect.width - width },
    ];
  }
  const height = divide(rect.height, split.ratio, minHeight(split.first), minHeight(split.second));
  return [
    { ...rect, height },
    { ...rect, y: rect.y + height, height: rect.height - height },
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isLeaf(node: LayoutNode, id: PaneId): boolean {
  return node.kind === "leaf" && node.id === id;
}

function divide(total: number, ratio: number, minFirst: number, minSecond: number): number {
  const preferred = Math.round(total * ratio);
  const upper = Math.max(0, total - minSecond);
  return clamp(Math.min(Math.max(preferred, minFirst), upper), 0, total);
}
