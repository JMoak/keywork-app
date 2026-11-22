import type { ArrangementRelation, ArrangementShape, ArrangementSide } from "@keywork-app/protocol";
import { dealsFor } from "./pattern-catalogue.ts";
import {
  type Deal,
  dealMetrics,
  drawn,
  largestFirst,
  reflected,
  type Seat,
  sameSeats,
  shareOf,
  turned,
} from "./pattern-deals.ts";

export interface Shaping {
  readonly shape?: ArrangementShape | undefined;
  readonly relation?: ArrangementRelation | undefined;
  readonly led: boolean;
  readonly side?: ArrangementSide | undefined;
}

export const shapeWords: Readonly<Record<ArrangementShape, string>> = {
  grid: "an even grid",
  columns: "columns side by side",
  rows: "rows one above another",
  "lead-and-cards": "one large pane with the rest as cards around it",
  "lead-and-stack": "one large pane beside a column of the rest",
  split: "two large panes side by side with the rest as cards beneath",
  board: "columns of cards",
};

export const namedLikeEachShape: Readonly<Record<ArrangementShape, readonly string[]>> = {
  grid: ["ledger", "square", "dozen"],
  columns: [],
  rows: [],
  "lead-and-cards": ["marquee", "studio", "banner", "keystone", "lead"],
  "lead-and-stack": ["tower"],
  split: ["pair", "gallery"],
  board: ["ledger"],
};

export function dealsToTry(shaping: Shaping, count: number): readonly (readonly Deal[])[] {
  const groups = shapesToTry(shaping, count).flatMap((shape) => inOrderOfChoice(shape, count));
  return [...groups, [evenGrid(count)]]
    .filter((deals) => deals.length > 0)
    .map((deals) => deals.map((deal) => facing(deal, shaping.side)));
}

export function facing(deal: Deal, side: ArrangementSide | undefined): Deal {
  if (side === undefined || side === "left") return deal;
  if (side === "right") return { ...deal, seats: deal.seats.map(reflected) };
  const turnedDown = deal.seats.map(({ left, top, right, bottom }) => ({
    left: top,
    top: left,
    right: bottom,
    bottom: right,
  }));
  return { ...deal, seats: side === "top" ? turnedDown : turnedDown.map(upsideDown) };
}

function upsideDown(seat: Seat): Seat {
  const across = ({ of, at }: Seat["top"]): Seat["top"] => ({ of, at: of - at });
  return { ...seat, top: across(seat.bottom), bottom: across(seat.top) };
}

export function inOrderOfChoice(
  shape: ArrangementShape,
  count: number,
): readonly (readonly Deal[])[] {
  const deals = dealsShaped(shape, count);
  if (shape !== "lead-and-cards") return [deals];
  return [deals.filter(leadsBothWays), deals.filter((deal) => !leadsBothWays(deal))];
}

export function leadsBothWays(deal: Deal): boolean {
  const [lead, ...cards] = largestFirst(deal.seats).map(shareOf);
  if (lead === undefined || cards.length === 0) return false;
  const narrowest = Math.min(...cards.map((card) => card.width));
  const shortest = Math.min(...cards.map((card) => card.height));
  return lead.width > narrowest && lead.height > shortest;
}

export function shapesToTry(shaping: Shaping, count: number): readonly ArrangementShape[] {
  if (shaping.shape !== undefined) return [shaping.shape];
  const sideBySide = count <= dealMetrics.finestCut;
  switch (shaping.relation) {
    case "sequence":
      return sideBySide ? ["columns"] : ["grid"];
    case "alternatives":
      return sideBySide ? ["columns"] : ["split", "grid"];
    case "tasks":
      return ["board"];
    case "notes":
      return shaping.led ? ["lead-and-cards"] : ["board", "grid"];
    default:
      return shaping.led ? ["lead-and-stack", "lead-and-cards"] : ["grid"];
  }
}

export function dealsShaped(shape: ArrangementShape, count: number): readonly Deal[] {
  if (count < 1 || count > dealMetrics.most) return [];
  const drawnForIt = builders[shape](count);
  const named = dealsFor(count)
    .filter((deal) => namedLikeEachShape[shape].includes(deal.name))
    .map(largestSeatFirst);
  return distinct([...drawnForIt, ...named]);
}

export function evenGrid(count: number): Deal {
  const columns = Math.min(dealMetrics.finestCut, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const seats = Array.from({ length: count }, (_, at) =>
    cell(columns, at % columns, rows, Math.floor(at / columns)),
  );
  return { name: "grid", seats };
}

const builders: Record<ArrangementShape, (count: number) => readonly Deal[]> = {
  grid: (count) => [evenGrid(count)],
  columns: (count) => [sideBySide(count)],
  rows: (count) => [turned(sideBySide(count), "rows")],
  "lead-and-cards": (count) => pictured("lead and cards", leadAndCards[count]),
  "lead-and-stack": (count) => leadBesideAStack(count),
  split: (count) => pictured("split", splits[count]),
  board: (count) => [board(count)],
};

const leadAndCards: Readonly<Record<number, readonly string[]>> = {
  1: ["a"],
  2: ["aab"],
  3: ["aab", "aac"],
  4: ["aab", "aac", "ddd"],
  5: ["aab", "aac", "dde"],
  6: ["aab", "aac", "def"],
  7: ["aabc", "aade", "ffgg"],
};

const splits: Readonly<Record<number, readonly string[]>> = {
  1: ["a"],
  2: ["ab"],
  3: ["ab", "ab", "ab", "cc"],
  4: ["aabb", "aabb", "ccdd"],
  5: ["aabb", "aabb", "cdde"],
  6: ["aabb", "aabb", "cdef"],
  7: ["aabb", "aabb", "ccdd", "eefg"],
  8: ["aabb", "aabb", "cdef", "gghh"],
};

const stackBesideTheLead = { rows: dealMetrics.finestCut, columns: 2 } as const;

function pictured(name: string, picture: readonly string[] | undefined): Deal[] {
  return picture === undefined ? [] : [largestSeatFirst(drawn(name, ...picture))];
}

function largestSeatFirst(deal: Deal): Deal {
  return { ...deal, seats: largestFirst(deal.seats) };
}

function sideBySide(count: number): Deal {
  const columns = Math.min(count, dealMetrics.finestCut);
  const seats = dealtOut(count, columns).flatMap((stacked, column) =>
    Array.from({ length: stacked }, (_, row) => cell(columns, column, stacked, row)),
  );
  return { name: "columns", seats };
}

function board(count: number): Deal {
  const perColumn = count <= 3 ? 1 : Math.min(dealMetrics.finestCut, Math.ceil(Math.sqrt(count)));
  const columns = Math.ceil(count / perColumn);
  const seats = Array.from({ length: count }, (_, at) =>
    cell(columns, Math.floor(at / perColumn), dealMetrics.finestCut, at % perColumn),
  );
  return { name: "board", seats };
}

function leadBesideAStack(count: number): Deal[] {
  const rest = count - 1;
  const { rows, columns } = stackBesideTheLead;
  if (rest === 0) return pictured("lead and stack", ["a"]);
  if (rest <= rows) {
    const lead = cell(3, 0, 1, 0, 2);
    const stack = Array.from({ length: rest }, (_, row) => cell(3, 2, rest, row));
    return [{ name: "lead and stack", seats: [lead, ...stack] }];
  }
  if (rest > rows * columns) return [];
  const deep = Math.ceil(rest / columns);
  const lead = cell(2, 0, 1, 0);
  const stack = Array.from({ length: rest }, (_, at) =>
    cell(2 * columns, columns + (at % columns), deep, Math.floor(at / columns)),
  );
  return [{ name: "lead and stack", seats: [lead, ...stack] }];
}

function cell(columns: number, column: number, rows: number, row: number, across = 1): Seat {
  return {
    left: { of: columns, at: column },
    top: { of: rows, at: row },
    right: { of: columns, at: column + across },
    bottom: { of: rows, at: row + 1 },
  };
}

function dealtOut(whole: number, parts: number): number[] {
  const each = Math.floor(whole / parts);
  return Array.from({ length: parts }, (_, at) => each + (at < whole % parts ? 1 : 0));
}

function distinct(deals: readonly Deal[]): Deal[] {
  return deals.filter((deal, at) => deals.findIndex((other) => sameSeats(other, deal)) === at);
}
