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
export type SplitSide = "first" | "second";
export type SplitPath = readonly SplitSide[];
export type Shown = (id: PaneId) => boolean;

export interface SplitSeam {
  readonly path: SplitPath;
  readonly orientation: Orientation;
  readonly at: number;
  readonly start: number;
  readonly end: number;
  readonly origin: number;
  readonly length: number;
}

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

export function resizeAroundLeaf(
  node: LayoutNode,
  id: PaneId,
  delta: number,
  shown: Shown = everyLeaf,
): LayoutNode {
  return aroundLeaf(node, id, shown, (split, side) => ({
    ...split,
    ratio: steppedRatio(split.ratio + (side === "first" ? delta : -delta)),
  }));
}

export function withRatioAt(node: LayoutNode, path: SplitPath, ratio: number): LayoutNode {
  if (node.kind === "leaf") return node;
  const [step, ...rest] = path;
  if (step === undefined) return { ...node, ratio: steppedRatio(ratio) };
  return { ...node, [step]: withRatioAt(node[step], rest, ratio) };
}

export function ratioAt(node: LayoutNode, path: SplitPath): number | undefined {
  if (node.kind === "leaf") return undefined;
  const [step, ...rest] = path;
  return step === undefined ? node.ratio : ratioAt(node[step], rest);
}

export function collectSeams(
  node: LayoutNode,
  rect: Rect,
  path: SplitPath = [],
  into: SplitSeam[] = [],
): SplitSeam[] {
  if (node.kind === "leaf") return into;
  const [first, second] = splitRects(rect, node);
  into.push(seamBetween(node, rect, first, path));
  collectSeams(node.first, first, [...path, "first"], into);
  collectSeams(node.second, second, [...path, "second"], into);
  return into;
}

export function rotateAroundLeaf(
  node: LayoutNode,
  id: PaneId,
  shown: Shown = everyLeaf,
): LayoutNode {
  return aroundLeaf(node, id, shown, (split) => ({
    ...split,
    orientation: split.orientation === "row" ? "column" : "row",
  }));
}

export function survivingSplitPaths(
  node: LayoutNode,
  shown: Shown,
  path: SplitPath = [],
  into: SplitPath[] = [],
): SplitPath[] {
  if (node.kind === "leaf") return into;
  if (anyShown(node.first, shown) && anyShown(node.second, shown)) into.push(path);
  survivingSplitPaths(node.first, shown, [...path, "first"], into);
  survivingSplitPaths(node.second, shown, [...path, "second"], into);
  return into;
}

export function withoutLeaves(
  node: LayoutNode | undefined,
  gone: (id: PaneId) => boolean,
): LayoutNode | undefined {
  if (node === undefined) return undefined;
  if (node.kind === "leaf") return gone(node.id) ? undefined : node;
  const first = withoutLeaves(node.first, gone);
  const second = withoutLeaves(node.second, gone);
  if (first === undefined) return second;
  if (second === undefined) return first;
  return first === node.first && second === node.second ? node : { ...node, first, second };
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

function seamBetween(split: SplitNode, rect: Rect, first: Rect, path: SplitPath): SplitSeam {
  if (split.orientation === "row") {
    return {
      path,
      orientation: "row",
      at: first.x + first.width,
      start: rect.y,
      end: rect.y + rect.height,
      origin: rect.x,
      length: rect.width,
    };
  }
  return {
    path,
    orientation: "column",
    at: first.y + first.height,
    start: rect.x,
    end: rect.x + rect.width,
    origin: rect.y,
    length: rect.height,
  };
}

const everyLeaf: Shown = () => true;

function aroundLeaf(
  node: LayoutNode,
  id: PaneId,
  shown: Shown,
  change: (split: SplitNode, side: SplitSide) => SplitNode,
): LayoutNode {
  if (node.kind === "leaf") return node;
  const side = sideHolding(node, id);
  if (side === undefined) return node;
  const deeper = aroundLeaf(node[side], id, shown, change);
  if (deeper !== node[side]) return { ...node, [side]: deeper };
  const across = side === "first" ? node.second : node.first;
  return anyShown(across, shown) ? change(node, side) : node;
}

function sideHolding(split: SplitNode, id: PaneId): SplitSide | undefined {
  if (holdsLeaf(split.first, id)) return "first";
  return holdsLeaf(split.second, id) ? "second" : undefined;
}

function holdsLeaf(node: LayoutNode, id: PaneId): boolean {
  return node.kind === "leaf"
    ? node.id === id
    : holdsLeaf(node.first, id) || holdsLeaf(node.second, id);
}

function anyShown(node: LayoutNode, shown: Shown): boolean {
  return node.kind === "leaf"
    ? shown(node.id)
    : anyShown(node.first, shown) || anyShown(node.second, shown);
}

function divide(total: number, ratio: number, minFirst: number, minSecond: number): number {
  const preferred = Math.round(total * ratio);
  const upper = Math.max(0, total - minSecond);
  return clamp(Math.min(Math.max(preferred, minFirst), upper), 0, total);
}
