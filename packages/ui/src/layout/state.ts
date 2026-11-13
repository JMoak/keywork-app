import { z } from "zod";
import {
  type Arrangement,
  type DockSide,
  type DockState,
  defaultDockRatio,
  dockRatioBounds,
} from "./arrangement.ts";
import { floatShareBounds, type UnitRect } from "./standing.ts";
import { clamp, type LayoutNode, leafIds, type PaneId, splitRatioBounds } from "./tree.ts";

export const layoutStateVersion = 1;

const nodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("leaf"), id: z.string().min(1) }),
    z.object({
      kind: z.literal("split"),
      orientation: z.enum(["row", "column"]),
      ratio: z.number().min(splitRatioBounds.min).max(splitRatioBounds.max),
      first: nodeSchema,
      second: nodeSchema,
    }),
  ]),
);

const dockSchema = z.object({
  panes: z.array(z.string().min(1)).min(1),
  ratio: z.number().min(dockRatioBounds.min).max(dockRatioBounds.max),
});

const position = z.number().min(0).max(1);
const share = z.number().min(floatShareBounds.min).max(floatShareBounds.max);
const unitRectSchema = z.object({ x: position, y: position, width: share, height: share });
const paneIds = z.array(z.string().min(1));

export const layoutStateSchema = z
  .object({
    version: z.literal(layoutStateVersion),
    tree: nodeSchema.optional(),
    focused: z.string().min(1).optional(),
    opened: z.array(z.string().min(1)).optional(),
    docks: z.object({ left: dockSchema.optional(), right: dockSchema.optional() }).optional(),
    floats: z.record(z.string().min(1), unitRectSchema).optional(),
    shelved: paneIds.optional(),
    pinned: paneIds.optional(),
  })
  .describe(
    "A workspace's pane arrangement as last seen; exists so reopening a workspace restores the tiling rather than a single pane.",
  );

export type LayoutState = z.infer<typeof layoutStateSchema>;

export function parseLayoutState(value: unknown): LayoutState | undefined {
  const parsed = layoutStateSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const ids = layoutStateIds(parsed.data);
  if (ids.length === 0 || new Set(ids).size !== ids.length) return undefined;
  if (parsed.data.focused !== undefined && !ids.includes(parsed.data.focused)) return undefined;
  return withKnownStanding(parsed.data, new Set(ids));
}

export function layoutStateIds(state: LayoutState): PaneId[] {
  return [
    ...(state.docks?.left?.panes ?? []),
    ...(state.tree === undefined ? [] : leafIds(state.tree)),
    ...(state.docks?.right?.panes ?? []),
  ];
}

export interface Standing {
  readonly floats: ReadonlyMap<PaneId, UnitRect>;
  readonly shelved: readonly PaneId[];
  readonly pinned: ReadonlySet<PaneId>;
}

export function layoutStateOf(
  arrangement: Arrangement,
  focused: PaneId | undefined,
  opened: readonly PaneId[],
  standing: Standing,
): LayoutState {
  const { tree, docks } = arrangement;
  const persisted = {
    ...(docks.left.panes.length > 0 && { left: snapshot(docks.left) }),
    ...(docks.right.panes.length > 0 && { right: snapshot(docks.right) }),
  };
  const state: LayoutState = {
    version: layoutStateVersion,
    ...(tree !== undefined && { tree }),
    ...(focused !== undefined && { focused }),
    ...(Object.keys(persisted).length > 0 && { docks: persisted }),
    ...(standing.floats.size > 0 && { floats: Object.fromEntries(standing.floats) }),
    ...(standing.shelved.length > 0 && { shelved: [...standing.shelved] }),
    ...(standing.pinned.size > 0 && { pinned: [...standing.pinned] }),
  };
  const placed = layoutStateIds(state);
  return opened.every((id, at) => placed[at] === id) ? state : { ...state, opened: [...opened] };
}

export function openingOrderOf(state: LayoutState): PaneId[] {
  const present = layoutStateIds(state);
  const remembered = (state.opened ?? []).filter((id) => present.includes(id));
  return [...new Set([...remembered, ...present])];
}

export function standingOf(state: LayoutState): Standing {
  return {
    floats: new Map(Object.entries(state.floats ?? {})),
    shelved: [...(state.shelved ?? [])],
    pinned: new Set(state.pinned ?? []),
  };
}

export function arrangementOf(state: LayoutState): Arrangement {
  const revive = (side: DockSide): DockState => ({
    panes: [...(state.docks?.[side]?.panes ?? [])],
    ratio: clamp(
      state.docks?.[side]?.ratio ?? defaultDockRatio,
      dockRatioBounds.min,
      dockRatioBounds.max,
    ),
  });
  return { tree: state.tree, docks: { left: revive("left"), right: revive("right") } };
}

function withKnownStanding(state: LayoutState, known: ReadonlySet<PaneId>): LayoutState {
  const { floats, shelved, pinned, ...seats } = state;
  const floating = Object.entries(floats ?? {}).filter(([id]) => known.has(id));
  const onShelf = [...new Set(shelved ?? [])].filter((id) => known.has(id) && id !== state.focused);
  const held = [...new Set(pinned ?? [])].filter((id) => known.has(id));
  return {
    ...seats,
    ...(floating.length > 0 && { floats: Object.fromEntries(floating) }),
    ...(onShelf.length > 0 && onShelf.length < known.size && { shelved: onShelf }),
    ...(held.length > 0 && { pinned: held }),
  };
}

function snapshot(dock: DockState): { panes: PaneId[]; ratio: number } {
  return { panes: [...dock.panes], ratio: dock.ratio };
}
