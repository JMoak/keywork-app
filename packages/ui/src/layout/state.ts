import { z } from "zod";
import {
  type Arrangement,
  type DockSide,
  type DockState,
  defaultDockRatio,
  dockRatioBounds,
} from "./arrangement.ts";
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

export const layoutStateSchema = z
  .object({
    version: z.literal(layoutStateVersion),
    tree: nodeSchema.optional(),
    focused: z.string().min(1).optional(),
    docks: z.object({ left: dockSchema.optional(), right: dockSchema.optional() }).optional(),
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
  return parsed.data;
}

export function layoutStateIds(state: LayoutState): PaneId[] {
  return [
    ...(state.docks?.left?.panes ?? []),
    ...(state.tree === undefined ? [] : leafIds(state.tree)),
    ...(state.docks?.right?.panes ?? []),
  ];
}

export function layoutStateOf(arrangement: Arrangement, focused: PaneId | undefined): LayoutState {
  const { tree, docks } = arrangement;
  const persisted = {
    ...(docks.left.panes.length > 0 && { left: snapshot(docks.left) }),
    ...(docks.right.panes.length > 0 && { right: snapshot(docks.right) }),
  };
  return {
    version: layoutStateVersion,
    ...(tree !== undefined && { tree }),
    ...(focused !== undefined && { focused }),
    ...(Object.keys(persisted).length > 0 && { docks: persisted }),
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

function snapshot(dock: DockState): { panes: PaneId[]; ratio: number } {
  return { panes: [...dock.panes], ratio: dock.ratio };
}
