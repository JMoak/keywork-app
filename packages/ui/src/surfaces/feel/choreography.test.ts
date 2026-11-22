import type { MotionPrefs } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { Desk, ScreenRect, SurfaceOrigin, SurfaceShow } from "../port.ts";
import { ariseStart, emergeStart, orbit, recallEnd, type Standing, spread } from "./arrange.ts";
import {
  arisePlan,
  arrivalPlan,
  arrivalTiming,
  type Cue,
  dealPlan,
  drillInPlan,
  drillOutPlan,
  gatheredBy,
  gathering,
  glideMs,
  glideTiming,
  keeperTyped,
  motionStyle,
  nextReleaseAt,
  nothingHeld,
  offered,
  type Plan,
  recallPlan,
  releasedBy,
  spreadPlan,
  typingHold,
} from "./choreography.ts";
import { inTurn, recalled, stepMs } from "./patterns.ts";

const workArea: ScreenRect = { x: 0, y: 0, width: 3840, height: 2160 };
const desk: Desk = {
  console: { x: 1000, y: 300, width: 1200, height: 900 },
  consoleMaximized: false,
  workArea,
  displays: [{ bounds: workArea, workArea, scaleFactor: 1 }],
  cursor: { x: 1, y: 2159 },
};
const moving: MotionPrefs = { reducedMotion: false, tier: "interact" };
const reduced: MotionPrefs = { reducedMotion: true, tier: "interact" };
const hidden: MotionPrefs = { reducedMotion: false, tier: "hidden" };
const size = { width: 480, height: 320 };

function standing(count: number): readonly Standing[] {
  return orbit(
    desk,
    Array.from({ length: count }, (_, index) => ({ id: `pane-${index}`, size })),
  );
}

function arrivals(count: number, origin: SurfaceOrigin = "creature"): SurfaceShow[] {
  return standing(count).map(({ id, bounds }) => ({
    id,
    bounds,
    origin,
    focus: false,
    follows: false,
    backdrop: "var(--kw-background)",
    title: id,
  }));
}

function shows(plan: Plan): Array<Extract<Cue, { kind: "show" }>> {
  return plan.cues.filter((cue) => cue.kind === "show");
}

function glides(plan: Plan): Array<Extract<Cue, { kind: "glide" }>> {
  return plan.cues.filter((cue) => cue.kind === "glide");
}

function hides(plan: Plan): Array<Extract<Cue, { kind: "hide" }>> {
  return plan.cues.filter((cue) => cue.kind === "hide");
}

function travel(from: ScreenRect, to: ScreenRect): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function mostGliding(plan: Plan): number {
  const flights = glides(plan);
  return Math.max(
    ...flights.map(
      (one) =>
        flights.filter(
          (other) => other.atMs <= one.atMs && one.atMs < other.atMs + other.glide.durationMs,
        ).length,
    ),
  );
}

describe("the motion a keeper's settings allow", () => {
  it("glides unless motion is reduced, and holds still while the console is hidden", () => {
    expect(motionStyle(moving)).toBe("glide");
    expect(motionStyle({ reducedMotion: false, tier: "rest" })).toBe("glide");
    expect(motionStyle(reduced)).toBe("fade");
    expect(motionStyle(hidden)).toBe("still");
    expect(motionStyle({ reducedMotion: true, tier: "hidden" })).toBe("still");
  });
});

describe("a burst of arrivals", () => {
  const burst = arrivals(16);
  const farthestFirst = inTurn(burst.map((show) => show.id).toReversed());
  const plan = arrivalPlan(desk, burst, farthestFirst, moving);
  const askedOf = (id: string): SurfaceShow => burst.find((show) => show.id === id) as SurfaceShow;

  it("shows each pane at its size on the console's edge and glides it to its place", () => {
    expect(shows(plan)).toHaveLength(16);
    for (const cue of shows(plan)) {
      const asked = burst.find((show) => show.id === cue.show.id) as SurfaceShow;
      expect(cue.show).toEqual({ ...asked, bounds: emergeStart(desk, asked.bounds) });
      const flight = glides(plan).find((glide) => glide.glide.moves[0]?.id === asked.id);
      expect(flight?.atMs).toBe(cue.atMs);
      expect(flight?.glide.moves).toEqual([{ id: asked.id, bounds: asked.bounds }]);
      expect(plan.cues.indexOf(cue)).toBeLessThan(plan.cues.indexOf(flight as Cue));
    }
  });

  it("starts each pane on the turn it is given, a slight step apart, whatever its distance", () => {
    const takeoffs = shows(plan).map((cue) => cue.atMs);
    expect(takeoffs).toEqual(burst.map((_, turn) => turn * stepMs(16)));
    expect(takeoffs.at(-1)).toBe(510);
    expect(shows(plan).map((cue) => cue.show.id)).toEqual(farthestFirst.map((start) => start.id));
    const travels = shows(plan).map((cue) => travel(cue.show.bounds, askedOf(cue.show.id).bounds));
    expect(travels).not.toEqual(travels.toSorted((a, b) => a - b));
    expect(new Set(travels).size).toBeGreaterThan(1);
  });

  it("keeps every glide between 140 and 200 ms, longer for the farther", () => {
    const durations = glides(plan).map((cue) => cue.glide.durationMs);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(140);
    expect(Math.max(...durations)).toBeLessThanOrEqual(200);
    const nearestFirst = shows(plan)
      .map((cue) => ({
        travelled: travel(cue.show.bounds, askedOf(cue.show.id).bounds),
        durationMs: glides(plan).find((glide) => glide.glide.moves[0]?.id === cue.show.id)?.glide
          .durationMs as number,
      }))
      .toSorted((a, b) => a.travelled - b.travelled)
      .map((flight) => flight.durationMs);
    expect(nearestFirst).toEqual(nearestFirst.toSorted((a, b) => a - b));
    expect(glideMs(0)).toBe(glideTiming.shortestMs);
    expect(glideMs(glideTiming.nearPx)).toBe(140);
    expect(glideMs((glideTiming.nearPx + glideTiming.farPx) / 2)).toBe(170);
    expect(glideMs(10_000)).toBe(200);
  });

  it("lists its cues in the order they play and ends when the last pane lands", () => {
    const times = plan.cues.map((cue) => cue.atMs);
    expect(times).toEqual(times.toSorted((a, b) => a - b));
    const landings = glides(plan).map((cue) => cue.atMs + cue.glide.durationMs);
    expect(plan.endsAtMs).toBe(Math.max(...landings));
    expect(plan.style).toBe("glide");
  });

  it("never has more gliding at once than the cap, at the pace a burst of any size is given", () => {
    expect(mostGliding(plan)).toBeLessThanOrEqual(arrivalTiming.maxGliding);
    for (const count of [8, 12, 16, 40]) {
      const crowd = arrivals(count);
      const paced = arrivalPlan(desk, crowd, inTurn(crowd.map((show) => show.id)), moving);
      expect(mostGliding(paced), `${count}`).toBeLessThanOrEqual(arrivalTiming.maxGliding);
    }
  });

  it("never lets a creature's pane take focus, and leaves a keeper's as asked", () => {
    const [creature, keeper] = arrivals(2).map((show, index) => ({
      ...show,
      origin: index === 0 ? ("creature" as const) : ("keeper" as const),
      focus: true,
    }));
    const planned = arrivalPlan(desk, [creature, keeper] as SurfaceShow[], [], moving);
    const focusOf = (id: string): boolean | undefined =>
      shows(planned).find((cue) => cue.show.id === id)?.show.focus;
    expect(focusOf(creature?.id ?? "")).toBe(false);
    expect(focusOf(keeper?.id ?? "")).toBe(true);
    const still = arrivalPlan(desk, [creature] as SurfaceShow[], [], reduced);
    expect(shows(still)[0]?.show.focus).toBe(false);
  });

  it("keeps the turns and drops the travel when motion is reduced, for the chrome to fade in", () => {
    const calm = arrivalPlan(desk, burst, farthestFirst, reduced);
    expect(calm.style).toBe("fade");
    expect(glides(calm)).toEqual([]);
    expect(shows(calm).map((cue) => cue.atMs)).toEqual(farthestFirst.map((start) => start.atMs));
    expect(shows(calm).map((cue) => cue.show)).toEqual(burst.toReversed());
    expect(calm.endsAtMs).toBe(510);
  });

  it("shows every pane in its place at once while the console is hidden", () => {
    const unseen = arrivalPlan(desk, burst, farthestFirst, hidden);
    expect(unseen.style).toBe("still");
    expect(glides(unseen)).toEqual([]);
    expect(shows(unseen).map((cue) => cue.atMs)).toEqual(burst.map(() => 0));
    expect(shows(unseen).map((cue) => cue.show)).toEqual(burst);
    expect(unseen.endsAtMs).toBe(0);
  });

  it("starts a pane it was given no turn for at once", () => {
    const [first, second] = burst as [SurfaceShow, SurfaceShow];
    const planned = arrivalPlan(desk, [first, second], [{ id: first.id, atMs: 60 }], moving);
    expect(shows(planned).map((cue) => [cue.show.id, cue.atMs])).toEqual([
      [second.id, 0],
      [first.id, 60],
    ]);
  });
});

describe("calling everything back", () => {
  const outside = standing(16);
  const arrived = inTurn(outside.map((pane) => pane.id));
  const leaves = recalled(arrived);
  const plan = recallPlan(desk, outside, leaves, moving);
  const homeOf = (id: string): Extract<Cue, { kind: "glide" }> | undefined =>
    glides(plan).find((cue) => cue.glide.moves[0]?.id === id);

  it("glides each of the sixteen home on its turn, the last to arrive first", () => {
    expect(glides(plan)).toHaveLength(16);
    expect(glides(plan).map((cue) => cue.glide.moves[0]?.id)).toEqual(
      outside.map((pane) => pane.id).toReversed(),
    );
    expect(glides(plan).map((cue) => cue.atMs)).toEqual(outside.map((_, turn) => turn * 34));
    for (const { id, bounds } of outside) {
      expect(homeOf(id)?.glide.moves).toEqual([{ id, bounds: recallEnd(desk, bounds) }]);
      expect(homeOf(id)?.glide.durationMs).toBeGreaterThanOrEqual(140);
      expect(homeOf(id)?.glide.durationMs).toBeLessThanOrEqual(200);
    }
  });

  it("hides each pane as it lands, and ends when the last one has", () => {
    expect(
      hides(plan)
        .map((cue) => cue.id)
        .toSorted(),
    ).toEqual(outside.map((pane) => pane.id).toSorted());
    for (const cue of hides(plan)) {
      const home = homeOf(cue.id);
      expect(cue.atMs).toBe((home?.atMs ?? 0) + (home?.glide.durationMs ?? 0));
    }
    expect(plan.endsAtMs).toBe(Math.max(...hides(plan).map((cue) => cue.atMs)));
    const times = plan.cues.map((cue) => cue.atMs);
    expect(times).toEqual(times.toSorted((a, b) => a - b));
  });

  it("hides them on the same turns without the travel when motion is reduced", () => {
    const calm = recallPlan(desk, outside, leaves, reduced);
    expect(glides(calm)).toEqual([]);
    expect(hides(calm).map((cue) => cue.id)).toEqual(leaves.map((start) => start.id));
    expect(hides(calm).map((cue) => cue.atMs)).toEqual(leaves.map((start) => start.atMs));
  });
});

describe("dealing the panes outside to new seats", () => {
  const outside = standing(8);
  const seats = outside.map(({ id, bounds }, at) => ({
    id,
    bounds: { ...bounds, x: bounds.x + 400 + at * 40, width: bounds.width + 120 },
  }));
  const turns = inTurn(outside.map((pane) => pane.id).toReversed());

  it("glides each pane to its seat on its own turn, at its new size", () => {
    const plan = dealPlan(outside, seats, turns, moving);
    expect(glides(plan).map((cue) => cue.glide.moves)).toEqual(
      seats.toReversed().map((seat) => [seat]),
    );
    expect(glides(plan).map((cue) => cue.atMs)).toEqual(seats.map((_, turn) => turn * 60));
    for (const cue of glides(plan)) {
      expect(cue.glide.durationMs).toBeGreaterThanOrEqual(140);
      expect(cue.glide.durationMs).toBeLessThanOrEqual(200);
    }
    expect(mostGliding(plan)).toBeLessThanOrEqual(arrivalTiming.maxGliding);
  });

  it("keeps the turns and jumps when motion is reduced, and jumps all at once when hidden", () => {
    const calm = dealPlan(outside, seats, turns, reduced);
    expect(glides(calm).map((cue) => cue.atMs)).toEqual(seats.map((_, turn) => turn * 60));
    expect(glides(calm).every((cue) => cue.glide.durationMs === 0)).toBe(true);
    const unseen = dealPlan(outside, seats, turns, hidden);
    expect(glides(unseen)).toHaveLength(1);
    expect(glides(unseen)[0]?.glide).toEqual({ moves: seats, durationMs: 0 });
  });
});

describe("spreading everything out", () => {
  const outside = standing(16);

  it("glides every pane to its spread place in one move", () => {
    const plan = spreadPlan(desk, outside, moving);
    const wanted = spread(desk, outside);
    const [only] = glides(plan);
    const moves = only?.glide.moves ?? [];
    expect(plan.cues).toHaveLength(1);
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move).toEqual(wanted.find((pane) => pane.id === move.id));
    }
    expect(only?.glide.durationMs).toBeGreaterThanOrEqual(140);
    expect(only?.glide.durationMs).toBeLessThanOrEqual(200);
  });

  it("jumps when motion is reduced", () => {
    const [only] = glides(spreadPlan(desk, outside, reduced));
    expect(only?.glide.durationMs).toBe(0);
  });
});

describe("gathering a creature's panes that leave a moment apart", () => {
  const { quietMs, longestMs } = gathering;

  it("seats a lone pane one frame after it left", () => {
    expect(gatheredBy(1_000, 1_000)).toBe(1_000 + quietMs);
    expect(quietMs).toBeLessThanOrEqual(1000 / 60);
  });

  it("never keeps the first of a trickle waiting longer than a blink", () => {
    expect(gatheredBy(1_000, 1_040)).toBe(1_000 + longestMs);
    expect(gatheredBy(1_000, 1_900)).toBe(1_000 + longestMs);
    expect(longestMs).toBeLessThan(50);
  });
});

describe("holding a creature's arrivals while the keeper types", () => {
  const creature = (id: string) => ({ id, origin: "creature" as const });
  const keeper = (id: string) => ({ id, origin: "keeper" as const });
  type Arrival = ReturnType<typeof creature> | ReturnType<typeof keeper>;
  const { quietMs, longestMs } = typingHold;

  it("lets an arrival straight through when the keeper is not typing", () => {
    const { hold, release } = offered(nothingHeld<Arrival>(), creature("a"), 1_000);
    expect(release).toEqual([creature("a")]);
    expect(hold.held).toEqual([]);
    const longAgo = keeperTyped(nothingHeld<Arrival>(), 0);
    expect(offered(longAgo, creature("b"), quietMs).release).toEqual([creature("b")]);
  });

  it("holds a creature's arrival mid-typing and releases it after a short quiet", () => {
    const typing = keeperTyped(nothingHeld<Arrival>(), 1_000);
    const { hold, release } = offered(typing, creature("a"), 1_100);
    expect(release).toEqual([]);
    expect(nextReleaseAt(hold)).toBe(1_000 + quietMs);
    expect(releasedBy(hold, 1_000 + quietMs - 1).release).toEqual([]);
    const quiet = releasedBy(hold, 1_000 + quietMs);
    expect(quiet.release).toEqual([creature("a")]);
    expect(nextReleaseAt(quiet.hold)).toBeUndefined();
  });

  it("starts the quiet again at every key", () => {
    const typing = keeperTyped(nothingHeld<Arrival>(), 1_000);
    const held = offered(typing, creature("a"), 1_100).hold;
    const stillTyping = keeperTyped(held, 1_300);
    expect(nextReleaseAt(stillTyping)).toBe(1_300 + quietMs);
    expect(releasedBy(stillTyping, 1_000 + quietMs).release).toEqual([]);
  });

  it("never passes a keeper's own arrival through the hold", () => {
    const typing = keeperTyped(nothingHeld<Arrival>(), 1_000);
    const held = offered(typing, creature("a"), 1_050).hold;
    const asked = offered(held, keeper("mine"), 1_060);
    expect(asked.release).toEqual([keeper("mine")]);
    expect(asked.hold.held.map((entry) => entry.arrival)).toEqual([creature("a")]);
  });

  it("releases everything held, in order, once the oldest has waited as long as it may", () => {
    let hold = keeperTyped(nothingHeld<Arrival>(), 0);
    hold = offered(hold, creature("a"), 100).hold;
    for (let at = 200; at < 100 + longestMs; at += 200) hold = keeperTyped(hold, at);
    hold = offered(hold, creature("b"), 1_900).hold;
    expect(nextReleaseAt(hold)).toBe(100 + longestMs);
    expect(releasedBy(hold, 100 + longestMs - 1).release).toEqual([]);
    const overdue = releasedBy(hold, 100 + longestMs);
    expect(overdue.release).toEqual([creature("a"), creature("b")]);
    expect(overdue.hold.held).toEqual([]);
    expect(longestMs).toBeLessThanOrEqual(2_000);
  });
});

function touching(one: ScreenRect, other: ScreenRect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}

function arriving(id: string, bounds: ScreenRect, origin: SurfaceOrigin = "creature"): SurfaceShow {
  return {
    id,
    bounds,
    origin,
    focus: true,
    follows: false,
    backdrop: "var(--kw-background)",
    title: id,
  };
}

describe("a pane arising out of another", () => {
  const parent: ScreenRect = { x: 2600, y: 400, width: 600, height: 500 };
  const seat: ScreenRect = { x: 3212, y: 400, width: 600, height: 320 };
  const child = arriving("child", seat);

  it("shows it at its size tucked into its parent's edge, not the console's, and glides it to its seat", () => {
    const plan = arisePlan(desk, parent, child, moving);
    const [shown] = shows(plan);
    const [flight] = glides(plan);
    expect(plan.cues).toHaveLength(2);
    expect(shown?.show.bounds).toEqual(ariseStart(desk, parent, seat));
    expect(shown?.show.bounds).toMatchObject({ width: seat.width, height: seat.height });
    expect(touching(shown?.show.bounds as ScreenRect, parent)).toBe(true);
    expect(touching(shown?.show.bounds as ScreenRect, desk.console)).toBe(false);
    expect(shown?.show.bounds).not.toEqual(emergeStart(desk, seat));
    expect([shown?.atMs, flight?.atMs]).toEqual([0, 0]);
    expect(flight?.glide.moves).toEqual([{ id: "child", bounds: seat }]);
    expect(flight?.glide.durationMs).toBeGreaterThanOrEqual(140);
    expect(flight?.glide.durationMs).toBeLessThanOrEqual(200);
  });

  it("never gives a creature's new pane the focus, and gives the keeper's as asked", () => {
    expect(shows(arisePlan(desk, parent, child, moving))[0]?.show.focus).toBe(false);
    const mine = arriving("mine", seat, "keeper");
    expect(shows(arisePlan(desk, parent, mine, moving))[0]?.show.focus).toBe(true);
  });

  it("shows it in its seat without the travel when motion is reduced or the console hidden", () => {
    for (const prefs of [reduced, hidden]) {
      const plan = arisePlan(desk, parent, child, prefs);
      expect(glides(plan)).toEqual([]);
      expect(shows(plan).map((cue) => [cue.atMs, cue.show.bounds])).toEqual([[0, seat]]);
    }
  });
});

describe("drilling into a pane", () => {
  const lead: ScreenRect = { x: 2600, y: 400, width: 900, height: 700 };
  const aside: ScreenRect = { x: 2600, y: 1112, width: 600, height: 160 };
  const parent: Standing = { id: "parent", bounds: lead };
  const child = arriving("child", lead);
  const turns = inTurn(["parent", "child"]);

  it("steps the parent aside to its smaller seat, then brings the new pane out of it into the lead seat", () => {
    const plan = drillInPlan(desk, { parent, aside, arrival: child }, turns, moving);
    const [stepsAside, takesTheLead] = glides(plan);
    const [shown] = shows(plan);
    expect(plan.cues.map((cue) => [cue.kind, cue.atMs])).toEqual([
      ["glide", 0],
      ["show", 60],
      ["glide", 60],
    ]);
    expect(stepsAside?.glide.moves).toEqual([{ id: "parent", bounds: aside }]);
    expect(shown?.show.bounds).toEqual(ariseStart(desk, aside, lead));
    expect(shown?.show.bounds).toMatchObject({ width: lead.width, height: lead.height });
    expect(touching(shown?.show.bounds as ScreenRect, aside)).toBe(true);
    expect(takesTheLead?.glide.moves).toEqual([{ id: "child", bounds: lead }]);
    expect(shown?.show.focus).toBe(false);
    for (const flight of glides(plan)) {
      expect(flight.glide.durationMs).toBeGreaterThanOrEqual(140);
      expect(flight.glide.durationMs).toBeLessThanOrEqual(200);
    }
  });

  it("keeps the turns and drops the travel when motion is reduced, and does it all at once when hidden", () => {
    const calm = drillInPlan(desk, { parent, aside, arrival: child }, turns, reduced);
    expect(glides(calm).map((cue) => [cue.atMs, cue.glide.durationMs])).toEqual([[0, 0]]);
    expect(shows(calm).map((cue) => [cue.atMs, cue.show.bounds])).toEqual([[60, lead]]);
    const unseen = drillInPlan(desk, { parent, aside, arrival: child }, turns, hidden);
    expect(unseen.cues.map((cue) => cue.atMs)).toEqual([0, 0]);
    expect(unseen.endsAtMs).toBe(0);
  });

  it("reverses when the new pane is withdrawn: it slips back into its parent, and the parent takes the lead seat back", () => {
    const stepped: Standing = { id: "parent", bounds: aside };
    const leading: Standing = { id: "child", bounds: lead };
    const leaving = inTurn(["child", "parent"]);
    const plan = drillOutPlan(desk, { child: leading, parent: stepped, lead }, leaving, moving);
    const [slipsBack, returns] = glides(plan);
    const [gone] = hides(plan);
    expect(slipsBack?.atMs).toBe(0);
    expect(slipsBack?.glide.moves).toEqual([
      { id: "child", bounds: ariseStart(desk, aside, lead) },
    ]);
    expect(gone).toEqual({ atMs: slipsBack?.glide.durationMs, kind: "hide", id: "child" });
    expect(returns?.atMs).toBe(60);
    expect(returns?.glide.moves).toEqual([{ id: "parent", bounds: lead }]);
    expect(shows(plan)).toEqual([]);
  });

  it("hides the withdrawn pane and returns the parent on their turns without the travel when reduced", () => {
    const stepped: Standing = { id: "parent", bounds: aside };
    const leading: Standing = { id: "child", bounds: lead };
    const leaving = inTurn(["child", "parent"]);
    const calm = drillOutPlan(desk, { child: leading, parent: stepped, lead }, leaving, reduced);
    expect(hides(calm)).toEqual([{ atMs: 0, kind: "hide", id: "child" }]);
    expect(glides(calm).map((cue) => [cue.atMs, cue.glide.durationMs, cue.glide.moves])).toEqual([
      [60, 0, [{ id: "parent", bounds: lead }]],
    ]);
  });
});
