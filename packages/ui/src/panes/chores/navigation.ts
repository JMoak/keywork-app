import { createMemo, createSignal } from "solid-js";
import { type Cursor, createCursor } from "../overview/rows.tsx";
import {
  type ChoresListRow,
  choresListRows,
  choresOf,
  creaturesInScope,
  refusalsOf,
  sameChore,
} from "./rows.ts";
import type { ChoresStore } from "./store.ts";
import { type ChoreRow, type CreatureRow, type RunRow, runsKey } from "./wire.ts";

export interface ChoresNavigation {
  creatures(): readonly CreatureRow[];
  listRows(): readonly ChoresListRow[];
  allChores(): readonly ChoreRow[];
  refusals(): readonly string[];
  readonly listCursor: Cursor;
  readonly runCursor: Cursor;
  cursor(): Cursor;
  opened(): ChoreRow | undefined;
  runs(): readonly RunRow[];
  runAtCursor(): RunRow | undefined;
  current(): ChoreRow | undefined;
  currentCreature(): CreatureRow | undefined;
  showing(row: ChoreRow): boolean;
  dive(row: ChoreRow): void;
  back(): void;
  open(): void;
}

export interface NavigationSeams {
  only(): string | undefined;
  floating?(): string | undefined;
  openThread(): void;
}

type View = { readonly kind: "list" } | { readonly kind: "chore"; creature: string; id: string };

export function createChoresNavigation(
  store: ChoresStore,
  seams: NavigationSeams,
): ChoresNavigation {
  const [view, setView] = createSignal<View>({ kind: "list" });
  const [folded, setFolded] = createSignal<ReadonlySet<string>>(new Set());
  const creatures = createMemo(() =>
    creaturesInScope(store.state.creatures, seams.only() ?? seams.floating?.()),
  );
  const listRows = createMemo(() => choresListRows(creatures(), store.state, folded()));
  const listCursor = createCursor(() => listRows().length);

  const opened = (): ChoreRow | undefined => {
    const shown = view();
    return shown.kind === "chore" ? store.chore(shown.creature, shown.id) : undefined;
  };
  const runs = (): readonly RunRow[] => {
    const row = opened();
    return row === undefined ? [] : (store.state.runs[runsKey(row.creature, row.id)] ?? []);
  };
  const runCursor = createCursor(() => runs().length);
  const atCursor = (): ChoresListRow | undefined => listRows()[listCursor.index()];

  const dive = (row: ChoreRow): void => {
    setView({ kind: "chore", creature: row.creature, id: row.id });
    runCursor.set(0);
    void store.loadRuns(row.creature, row.id);
  };

  const back = (): void => {
    const row = opened();
    setView({ kind: "list" });
    if (row === undefined) return;
    const at = listRows().findIndex(
      (entry) => entry.kind === "chore" && sameChore(entry.row, row.creature, row.id),
    );
    if (at !== -1) listCursor.set(at);
  };

  const fold = (slug: string): void => {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return {
    creatures,
    listRows,
    allChores: createMemo(() => choresOf(creatures(), store.state.chores)),
    refusals: createMemo(() => refusalsOf(creatures(), store.state)),
    listCursor,
    runCursor,
    cursor: () => (opened() === undefined ? listCursor : runCursor),
    opened,
    runs,
    runAtCursor: () => runs()[runCursor.index()],
    current: () => {
      const row = atCursor();
      return opened() ?? (row?.kind === "chore" ? row.row : undefined);
    },
    currentCreature: () => {
      const slug = opened()?.creature ?? atCursor()?.creature.slug;
      return creatures().find((creature) => creature.slug === slug) ?? creatures()[0];
    },
    showing: (row) => {
      const shown = opened();
      return shown !== undefined && sameChore(shown, row.creature, row.id);
    },
    dive,
    back,
    open: () => {
      const row = atCursor();
      if (opened() !== undefined) seams.openThread();
      else if (row?.kind === "creature") fold(row.creature.slug);
      else if (row?.kind === "chore") dive(row.row);
    },
  };
}
