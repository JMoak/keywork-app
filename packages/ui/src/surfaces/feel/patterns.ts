import { type Extent, overlaps } from "@keywork-app/habitat";
import type { Desk, ScreenRect, SurfaceId } from "../port.ts";
import { orbit, outsideMetrics, type Standing, type Wanted } from "./arrange.ts";
import { arrivalTiming, glideTiming, type Start } from "./choreography.ts";
import { dealsFor } from "./pattern-catalogue.ts";
import {
  type Deal,
  dealMetrics,
  flipped,
  holdsOn,
  largestFirst,
  readingOrder,
  reflected,
  type Seat,
  sameSeats,
  seatOn,
  shareOf,
} from "./pattern-deals.ts";
import {
  allButTheNearEdge,
  canvases,
  consoleOn,
  dealtOn,
  farSide,
  firstFound,
  type Ground,
  groundsBeside,
  type Manner,
  roomsBeside,
  stoodOn,
  wholeDisplay,
} from "./pattern-ground.ts";
import { clamp, grownBy } from "./pattern-rects.ts";
import {
  burstShape,
  type Cell,
  cascadeShape,
  columnShape,
  fanShape,
  fills,
  gridShape,
  inWave,
  mirrored,
  pileShape,
  type Shape,
  stairShape,
  type Wave,
  waves,
} from "./pattern-shapes.ts";

export type { Start };

export type Pattern = "cascade" | "column" | "stair" | "fan" | "grid" | "burst" | "pile";

export const patterns: readonly Pattern[] = [
  "cascade",
  "column",
  "stair",
  "fan",
  "grid",
  "burst",
  "pile",
];

export const patternsStandingApart: ReadonlySet<Pattern> = new Set<Pattern>([
  "column",
  "stair",
  "grid",
]);

export interface Incoming {
  readonly desk: Desk;
  readonly arriving: readonly Wanted[];
  readonly standing?: readonly ScreenRect[] | undefined;
  readonly led?: boolean | undefined;
}

export interface Arrangement {
  readonly pattern: Pattern;
  readonly stands: "beside" | "over";
  readonly seats: readonly Standing[];
  readonly arrives: readonly Start[];
}

export interface Burst {
  readonly desk: Desk;
  readonly ladder: readonly (readonly Wanted[])[];
  readonly standing?: readonly ScreenRect[] | undefined;
  readonly led?: boolean | undefined;
}

export interface Way {
  readonly look: string;
  readonly stands: "beside" | "over";
  readonly seats: readonly Standing[];
  readonly arrives: readonly Start[];
}

export const cardMetrics = { longestColumn: 3 } as const;

export const arrivalPace = {
  slowestStepMs: 60,
  quickestStepMs: Math.ceil(glideTiming.longestMs / arrivalTiming.maxGliding),
  allStartedWithinMs: 500,
} as const;

export function tidyWays(burst: Burst): readonly Way[] {
  const { desk, ladder, standing } = burst;
  const largest = ladder[0] ?? [];
  const smallest = ladder.at(-1) ?? [];
  if (largest.length === 0) return [];
  const asCards = (): readonly Way[] => cardWays(burst);
  const asADeal = (): readonly Way[] => dealWays({ desk, arriving: largest, standing });
  const isACrowd = largest.length >= dealMetrics.fewest;
  const apart = firstFound(isACrowd ? [asADeal, asCards] : [asCards, asADeal], (ways) =>
    anyOf(ways()),
  );
  return apart ?? [overlapping({ desk, arriving: smallest, standing })];
}

export function waysAtTheirSize(burst: Burst): readonly Way[] {
  const { desk, ladder, standing } = burst;
  const [arriving = []] = ladder;
  if (arriving.length === 0) return [];
  const incoming = { desk, arriving, standing };
  const besideOrOverTheFarSide = cardWays({ desk, ladder: [arriving], standing });
  if (besideOrOverTheFarSide.length > 0) return besideOrOverTheFarSide;
  return firstFound(allButTheNearEdge(desk), (ground) => anyOf(waysOn(ground, incoming))) ?? [];
}

export function cardWays(burst: Burst): readonly Way[] {
  const { desk, ladder, standing } = burst;
  const atEachSize = ladder.map((arriving): Incoming => ({ desk, arriving, standing }));
  const places = atEachSize.some(standsInALine)
    ? [waysAtTheSides, waysOverTheFarSide]
    : [waysAtTheSides, waysPastTheEnds, waysOverTheFarSide];
  const attempts = places.flatMap((ways) => atEachSize.map((size) => () => ways(size)));
  return firstFound(attempts, (attempt) => anyOf(attempt())) ?? [];
}

export function dealWays(incoming: Incoming): readonly Way[] {
  const onTheFirstCanvas = (deal: Deal): readonly Way[] =>
    firstFound(canvases(incoming.desk), (canvas) => anyOf(dealtAcross(canvas, deal, incoming))) ??
    [];
  return dealsFor(incoming.arriving.length).flatMap(onTheFirstCanvas);
}

export function waysBeside(
  burst: Burst,
  rooms: readonly Ground[],
  clear: readonly Ground[] = rooms,
): readonly Way[] {
  const { desk, ladder, standing, led } = burst;
  const largest = ladder[0] ?? [];
  if (largest.length === 0) return [];
  const asCards = (): readonly Way[] => cardWaysBeside(burst, rooms);
  const asADeal = (): readonly Way[] =>
    dealWaysOn(clear, dealsFor(largest.length), { desk, arriving: largest, standing, led });
  const isACrowd = largest.length >= dealMetrics.fewest;
  return (
    firstFound(isACrowd ? [asADeal, asCards] : [asCards, asADeal], (ways) => anyOf(ways())) ?? []
  );
}

export function dealWaysOn(
  grounds: readonly Ground[],
  deals: readonly Deal[],
  incoming: Incoming,
): readonly Way[] {
  const onTheFirstGround = (deal: Deal): readonly Way[] =>
    firstFound(grounds, (ground) => anyOf(dealtAcross(ground, deal, incoming))) ?? [];
  return deals.flatMap(onTheFirstGround);
}

export function composed(deal: Deal, incoming: Incoming): Way | undefined {
  if (incoming.arriving.length > deal.seats.length) return undefined;
  return firstFound(canvases(incoming.desk), (canvas) =>
    asDrawn(canvas, deal, "outward", incoming),
  );
}

export function seatedAsWritten(
  deal: Deal,
  incoming: Incoming,
  grounds: readonly Ground[] = canvases(incoming.desk),
): Way | undefined {
  if (incoming.arriving.length > deal.seats.length) return undefined;
  const pictured = (canvas: Ground): Deal =>
    incoming.led === true ? largestSeatFirst(leadNearestTheConsole(canvas, deal)) : deal;
  return firstFound(grounds, (canvas) =>
    asDrawn(canvas, pictured(canvas), "outward", incoming, asWritten),
  );
}

export function arranged(pattern: Pattern, incoming: Incoming): Arrangement {
  return layouts[pattern](incoming) ?? cascade(incoming);
}

export function eligible(incoming: Incoming): readonly Arrangement[] {
  const held = patterns.flatMap((pattern) => layouts[pattern](incoming) ?? []);
  const beside = held.filter((arrangement) => arrangement.stands === "beside");
  return beside.length > 0 ? beside : held;
}

export function cascade(incoming: Incoming): Arrangement {
  return laid("cascade", incoming) ?? dealtOverTheConsole(incoming) ?? seatedByTheOrbit(incoming);
}

export function column(incoming: Incoming): Arrangement | undefined {
  const { desk, arriving, standing = [] } = incoming;
  const seated = arrangementOf("column", desk, orbit(desk, arriving, standing), asAsked(arriving));
  return seated.stands === "beside" ? seated : undefined;
}

export function stair(incoming: Incoming): Arrangement | undefined {
  return laid("stair", incoming);
}

export function fan(incoming: Incoming): Arrangement | undefined {
  return laid("fan", incoming);
}

export function grid(incoming: Incoming): Arrangement | undefined {
  return laid("grid", incoming);
}

export function burst(incoming: Incoming): Arrangement | undefined {
  return laid("burst", incoming);
}

export function pile(incoming: Incoming): Arrangement | undefined {
  return laid("pile", incoming);
}

export function stepMs(count: number): number {
  const { slowestStepMs, quickestStepMs, allStartedWithinMs } = arrivalPace;
  const steps = Math.max(1, count - 1);
  return clamp(Math.floor(allStartedWithinMs / steps), quickestStepMs, slowestStepMs);
}

export function inTurn(order: readonly SurfaceId[]): readonly Start[] {
  const step = stepMs(order.length);
  return order.map((id, turn) => ({ id, atMs: turn * step }));
}

export function recalled(arrives: readonly Start[]): readonly Start[] {
  const last = arrives.at(-1)?.atMs ?? 0;
  return arrives.toReversed().map(({ id, atMs }) => ({ id, atMs: last - atMs }));
}

const standingApart: Manner = { from: "corner", apart: true };

function standsInALine(incoming: Incoming): boolean {
  return incoming.arriving.length <= cardMetrics.longestColumn;
}

function waysAtTheSides(incoming: Incoming): readonly Way[] {
  return waysOnEvery(roomsBeside(incoming.desk).filter(isASide), incoming);
}

function waysPastTheEnds(incoming: Incoming): readonly Way[] {
  const pastTheEnds = roomsBeside(incoming.desk).filter((ground) => !isASide(ground));
  return waysOnEvery(pastTheEnds, incoming);
}

export function cardWaysBeside(burst: Burst, grounds: readonly Ground[]): readonly Way[] {
  const { desk, ladder, standing } = burst;
  const atEachSize = ladder.map((arriving): Incoming => ({ desk, arriving, standing }));
  const sides = grounds.filter(isASide);
  const ends = grounds.filter((ground) => !isASide(ground));
  const places = atEachSize.some(standsInALine) ? [sides] : [sides, ends];
  const attempts = places.flatMap((rooms) =>
    atEachSize.map((size) => () => waysOnEvery(rooms, size)),
  );
  return firstFound(attempts, (attempt) => anyOf(attempt())) ?? [];
}

function waysOnEvery(grounds: readonly Ground[], incoming: Incoming): readonly Way[] {
  return distinct(grounds.flatMap((ground) => waysOn(ground, incoming)));
}

function isASide({ side }: Ground): boolean {
  return side === "right" || side === "left";
}

function waysOverTheFarSide(incoming: Incoming): readonly Way[] {
  return firstFound(farSide(incoming.desk), (ground) => anyOf(waysOn(ground, incoming))) ?? [];
}

function waysOn(ground: Ground, incoming: Incoming): Way[] {
  if (standsInALine(incoming)) {
    return stoodAs(`column ${ground.side}`, columnShape(incoming.arriving), ground, incoming);
  }
  return distinct(
    fills.flatMap((fill) =>
      waves.flatMap((wave) => {
        const shape = gridShape(incoming.arriving, ground.room, fill, wave);
        return stoodAs(`grid ${ground.side}, ${fill} first, ${wave}`, shape, ground, incoming);
      }),
    ),
  );
}

function stoodAs(look: string, shape: Shape, ground: Ground, incoming: Incoming): Way[] {
  const { desk, standing = [] } = incoming;
  const facingTheConsole = ground.side === "left" ? mirrored(shape) : shape;
  const seats = stoodOn(ground, desk, facingTheConsole, standing, standingApart);
  return seats === undefined ? [] : [wayOf(look, desk, seats, shape.arrival)];
}

function overlapping(incoming: Incoming): Way {
  const { stands, seats, arrives } = cascade(incoming);
  return { look: "cascade", stands, seats, arrives };
}

function dealtAcross(canvas: Ground, deal: Deal, incoming: Incoming): Way[] {
  const facingTheConsole = canvas.side === "left" ? flipped(deal) : deal;
  const turnedAway = flipped(facingTheConsole);
  const pictures =
    incoming.led === true
      ? [leadNearestTheConsole(canvas, deal)]
      : sameSeats(facingTheConsole, turnedAway)
        ? [facingTheConsole]
        : [facingTheConsole, turnedAway];
  return pictures.flatMap((picture) =>
    waves.flatMap((wave) => asDrawn(canvas, picture, wave, incoming) ?? []),
  );
}

function leadNearestTheConsole(canvas: Ground, deal: Deal): Deal {
  const facingTheConsole = canvas.side === "left" ? flipped(deal) : deal;
  const turnedAway = flipped(facingTheConsole);
  const fromTheConsole = (picture: Deal): number => {
    const [lead] = largestFirst(picture.seats);
    const middle = lead === undefined ? 0 : shareOf(lead).x + shareOf(lead).width / 2;
    return canvas.side === "left" ? 1 - middle : middle;
  };
  return fromTheConsole(turnedAway) < fromTheConsole(facingTheConsole)
    ? turnedAway
    : facingTheConsole;
}

function largestSeatFirst(deal: Deal): Deal {
  return { ...deal, seats: largestFirst(deal.seats) };
}

function asDrawn(
  canvas: Ground,
  picture: Deal,
  wave: Wave,
  incoming: Incoming,
  seating: Seating = seatedByWeight,
): Way | undefined {
  if (!holdsOn(canvas.room, picture)) return undefined;
  const { standing = [] } = incoming;
  const way = dealtOnto(canvas, picture, wave, incoming, seating);
  return way.seats.some((seat) => crowdsAny(seat.bounds, standing)) ? undefined : way;
}

type Seating = (picture: Deal, arriving: readonly Wanted[]) => Seated[];

interface Seated {
  readonly id: SurfaceId;
  readonly seat: Seat;
}

function dealtOnto(
  canvas: Ground,
  picture: Deal,
  wave: Wave,
  incoming: Incoming,
  seating: Seating,
): Way {
  const { desk, arriving } = incoming;
  const seated = seating(picture, arriving);
  const fromTheConsole = (seat: Seat): Cell => {
    const { x, y } = shareOf(canvas.side === "left" ? reflected(seat) : seat);
    return { column: x, row: y };
  };
  const order = inWave(
    wave,
    seated.map(({ seat }) => fromTheConsole(seat)),
  );
  const boundsOf = (pane: Wanted): Standing[] =>
    seated
      .filter(({ id }) => id === pane.id)
      .map(({ id, seat }) => ({ id, bounds: seatOn(canvas.room, seat) }));
  return wayOf(
    picture.name,
    desk,
    arriving.flatMap(boundsOf),
    order.flatMap((at) => seated[at]?.id ?? []),
  );
}

function seatedByWeight(picture: Deal, arriving: readonly Wanted[]): Seated[] {
  const heaviestFirst = arriving.toSorted((one, other) => (other.weight ?? 0) - (one.weight ?? 0));
  return largestFirst(picture.seats)
    .flatMap((seat, turn): Seated[] => {
      const pane = heaviestFirst[turn];
      return pane === undefined ? [] : [{ id: pane.id, seat }];
    })
    .toSorted((one, other) => readingOrder(one.seat, other.seat));
}

function asWritten(picture: Deal, arriving: readonly Wanted[]): Seated[] {
  return arriving.flatMap((pane, turn) => {
    const seat = picture.seats[turn];
    return seat === undefined ? [] : [{ id: pane.id, seat }];
  });
}

function crowdsAny(seat: ScreenRect, standing: readonly ScreenRect[]): boolean {
  const reach = grownBy(seat, outsideMetrics.gap);
  return standing.some((pane) => overlaps(reach, pane));
}

function wayOf(
  look: string,
  desk: Desk,
  seats: readonly Standing[],
  arrival: readonly SurfaceId[],
): Way {
  return { look, stands: whereTheyStand(desk, seats), seats, arrives: inTurn(arrival) };
}

function distinct(ways: readonly Way[]): Way[] {
  const pictures = ways.map((way) => JSON.stringify([way.seats, way.arrives]));
  return ways.filter((_, index) => pictures.indexOf(pictures[index] ?? "") === index);
}

function anyOf<Item>(items: readonly Item[]): readonly Item[] | undefined {
  return items.length > 0 ? items : undefined;
}

type Slid = Exclude<Pattern, "column">;

interface Recipe extends Manner {
  readonly shape: (panes: readonly Wanted[], room: Extent) => Shape;
  readonly grounds: (desk: Desk) => readonly Ground[];
  readonly handed: boolean;
}

const layouts: Record<Pattern, (incoming: Incoming) => Arrangement | undefined> = {
  cascade,
  column,
  stair,
  fan,
  grid,
  burst,
  pile,
};

const recipes: Record<Slid, Recipe> = {
  cascade: {
    shape: cascadeShape,
    grounds: groundsBeside,
    from: "corner",
    apart: false,
    handed: false,
  },
  pile: {
    shape: pileShape,
    grounds: besideOrOverTheFarSide,
    from: "corner",
    apart: false,
    handed: false,
  },
  fan: {
    shape: fanShape,
    grounds: besideOrOverTheFarSide,
    from: "corner",
    apart: false,
    handed: false,
  },
  stair: { shape: stairShape, grounds: atEitherSide, from: "corner", apart: true, handed: true },
  grid: { shape: gridShape, grounds: groundsBeside, from: "corner", apart: true, handed: true },
  burst: { shape: burstShape, grounds: atEitherSide, from: "middle", apart: false, handed: true },
};

function laid(pattern: Slid, incoming: Incoming): Arrangement | undefined {
  const { desk, arriving, standing = [] } = incoming;
  const recipe = recipes[pattern];
  return firstFound(recipe.grounds(desk), (ground) => {
    const shape = facing(ground, recipe, recipe.shape(arriving, ground.room));
    const seats = stoodOn(ground, desk, shape, standing, recipe);
    return seats && arrangementOf(pattern, desk, seats, shape.arrival);
  });
}

function facing(ground: Ground, recipe: Recipe, shape: Shape): Shape {
  return recipe.handed && ground.side === "left" ? mirrored(shape) : shape;
}

function besideOrOverTheFarSide(desk: Desk): readonly Ground[] {
  return [...groundsBeside(desk), ...farSide(desk)];
}

function atEitherSide(desk: Desk): readonly Ground[] {
  return groundsBeside(desk).filter(({ side }) => side === "right" || side === "left");
}

function dealtOverTheConsole(incoming: Incoming): Arrangement | undefined {
  const { desk, arriving, standing = [] } = incoming;
  const overTheConsole = [...farSide(desk), ...allButTheNearEdge(desk), wholeDisplay(desk)];
  const seats = firstFound(overTheConsole, (ground) => dealtOn(ground, desk, arriving, standing));
  return seats && arrangementOf("cascade", desk, seats, asAsked(arriving));
}

function seatedByTheOrbit(incoming: Incoming): Arrangement {
  const { desk, arriving, standing = [] } = incoming;
  return arrangementOf("cascade", desk, orbit(desk, arriving, standing), asAsked(arriving));
}

function arrangementOf(
  pattern: Pattern,
  desk: Desk,
  seats: readonly Standing[],
  arrival: readonly SurfaceId[],
): Arrangement {
  return { pattern, stands: whereTheyStand(desk, seats), seats, arrives: inTurn(arrival) };
}

function whereTheyStand(desk: Desk, seats: readonly Standing[]): "beside" | "over" {
  const home = consoleOn(desk);
  return seats.some((seat) => overlaps(seat.bounds, home)) ? "over" : "beside";
}

function asAsked(arriving: readonly Wanted[]): SurfaceId[] {
  return arriving.map((pane) => pane.id);
}
