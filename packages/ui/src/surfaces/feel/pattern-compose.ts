import {
  type Deal,
  dealMetrics,
  type Line,
  placeOf,
  type Seat,
  type Share,
  shareOf,
} from "./pattern-deals.ts";

export interface Authored {
  readonly name: string;
  readonly seats: readonly Share[];
}

export interface Safe {
  readonly deal: Deal;
  readonly kept: readonly number[];
  readonly said: readonly string[];
}

export const composeMetrics = {
  smallestShare: 1 / dealMetrics.finestCut,
  onTheLineWithin: 0.01,
} as const;

export const gridLines: readonly Line[] = everyCut()
  .filter((line, at, lines) => lines.findIndex((other) => sameLine(other, line)) === at)
  .toSorted((one, other) => placeOf(one) - placeOf(other));

export function madeSafe(authored: Authored): Safe {
  const nothingYet: Safe = { deal: { name: authored.name, seats: [] }, kept: [], said: [] };
  return authored.seats.reduce(withSeat, nothingYet);
}

interface Seating {
  readonly seat: Seat | undefined;
  readonly said: readonly string[];
}

function withSeat(safe: Safe, share: Share, at: number): Safe {
  const { seat, said } = seatedSafely(share, `seat ${at + 1}`, safe);
  return {
    deal: {
      ...safe.deal,
      seats: seat === undefined ? safe.deal.seats : [...safe.deal.seats, seat],
    },
    kept: seat === undefined ? safe.kept : [...safe.kept, at],
    said: [...safe.said, ...said],
  };
}

function seatedSafely(share: Share, called: string, safe: Safe): Seating {
  const inside = broughtInside(share);
  if (inside === undefined) {
    return { seat: undefined, said: [`${called} has no size on the display and was left out`] };
  }
  const snapped = onTheLines(inside);
  const readable = wideAndTallEnough(snapped);
  const corrected = [
    ...when(
      reachesPastTheEdge(share),
      `${called} reached past the display's edge and was brought inside`,
    ),
    ...when(!isOnTheLines(inside), `${called} was off the grid's lines and was moved onto them`),
    ...when(
      widthOf(readable) !== widthOf(snapped),
      `${called} was too narrow to read and was widened`,
    ),
    ...when(
      heightOf(readable) !== heightOf(snapped),
      `${called} was too short to read and was made taller`,
    ),
  ];
  const apart = standingApart(readable, called, safe);
  return { seat: apart.seat, said: [...corrected, ...apart.said] };
}

function standingApart(seat: Seat, called: string, safe: Safe): Seating {
  const blockers = safe.deal.seats.filter((other) => overlap(other, seat));
  const [first] = blockers;
  if (first === undefined) return { seat, said: [] };
  const over = `seat ${(safe.kept[safe.deal.seats.indexOf(first)] ?? 0) + 1}`;
  const beside = cutBackBeside(seat, blockers, safe.deal.seats);
  return beside === undefined
    ? {
        seat: undefined,
        said: [`${called} lay over ${over} with no room beside it and was left out`],
      }
    : { seat: beside, said: [`${called} lay over ${over} and was cut back to stand beside it`] };
}

function broughtInside(share: Share): Share | undefined {
  const within = (place: number): number => Math.min(1, Math.max(0, place));
  const [left, top] = [within(share.x), within(share.y)];
  const [right, bottom] = [within(share.x + share.width), within(share.y + share.height)];
  const sized = [left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top;
  return sized ? { x: left, y: top, width: right - left, height: bottom - top } : undefined;
}

function onTheLines(share: Share): Seat {
  return {
    left: nearestLine(share.x),
    top: nearestLine(share.y),
    right: nearestLine(share.x + share.width),
    bottom: nearestLine(share.y + share.height),
  };
}

function isOnTheLines(share: Share): boolean {
  const edges = [share.x, share.y, share.x + share.width, share.y + share.height];
  return edges.every(
    (edge) => Math.abs(placeOf(nearestLine(edge)) - edge) <= composeMetrics.onTheLineWithin,
  );
}

function wideAndTallEnough(seat: Seat): Seat {
  const [left, right] = spanningEnough(seat.left, seat.right);
  const [top, bottom] = spanningEnough(seat.top, seat.bottom);
  return { left, top, right, bottom };
}

function spanningEnough(near: Line, far: Line): readonly [Line, Line] {
  if (isEnough(placeOf(far) - placeOf(near))) return [near, far];
  const farther = gridLines.find((line) => isEnough(placeOf(line) - placeOf(near)));
  if (farther !== undefined) return [near, farther];
  const nearer = gridLines.findLast((line) => isEnough(placeOf(far) - placeOf(line)));
  return [nearer ?? near, far];
}

function cutBackBeside(
  seat: Seat,
  blockers: readonly Seat[],
  seated: readonly Seat[],
): Seat | undefined {
  const farthest = (lines: readonly Line[]): Line =>
    lines.reduce((far, line) => (placeOf(line) > placeOf(far) ? line : far));
  const nearest = (lines: readonly Line[]): Line =>
    lines.reduce((near, line) => (placeOf(line) < placeOf(near) ? line : near));
  const cuts: Seat[] = [
    { ...seat, left: farthest(blockers.map((blocker) => blocker.right)) },
    { ...seat, right: nearest(blockers.map((blocker) => blocker.left)) },
    { ...seat, top: farthest(blockers.map((blocker) => blocker.bottom)) },
    { ...seat, bottom: nearest(blockers.map((blocker) => blocker.top)) },
  ];
  const stands = (cut: Seat): boolean =>
    isEnough(widthOf(cut)) &&
    isEnough(heightOf(cut)) &&
    !seated.some((other) => overlap(other, cut));
  return cuts.filter(stands).toSorted((one, other) => roomOf(other) - roomOf(one))[0];
}

function isEnough(share: number): boolean {
  return share >= composeMetrics.smallestShare - tolerance;
}

function overlap(one: Seat, other: Seat): boolean {
  const [a, b] = [shareOf(one), shareOf(other)];
  const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return across > tolerance && down > tolerance;
}

function nearestLine(place: number): Line {
  const off = (line: Line): number => Math.abs(placeOf(line) - place);
  return gridLines.reduce((near, line) => (off(line) < off(near) - tolerance ? line : near));
}

function everyCut(): Line[] {
  return Array.from({ length: dealMetrics.finestCut }, (_, cut) => cut + 1).flatMap((of) =>
    Array.from({ length: of + 1 }, (_, at) => ({ of, at })),
  );
}

function sameLine(one: Line, other: Line): boolean {
  return one.at * other.of === other.at * one.of;
}

function reachesPastTheEdge(share: Share): boolean {
  const edges = [share.x, share.y, share.x + share.width, share.y + share.height];
  return edges.some((edge) => edge < -tolerance || edge > 1 + tolerance);
}

function when(holds: boolean, said: string): string[] {
  return holds ? [said] : [];
}

function widthOf(seat: Seat): number {
  return shareOf(seat).width;
}

function heightOf(seat: Seat): number {
  return shareOf(seat).height;
}

function roomOf(seat: Seat): number {
  return widthOf(seat) * heightOf(seat);
}

const tolerance = 1e-9;
