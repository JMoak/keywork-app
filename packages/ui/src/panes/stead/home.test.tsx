import { emptyHabitat, type HabitatState, withCreatures } from "@keywork-app/habitat";
import { cleanup, fireEvent, render, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NeedsYouItem } from "../../shell/needs-you.ts";
import { SteadHome } from "./home.tsx";

const at = "2026-11-19T12:00:00Z";
const now = Date.parse(at);
const baseItem = { workspace: "home", since: at };
const inbox: NeedsYouItem = {
  ...baseItem,
  kind: "inbox",
  key: "inbox",
  itemId: "letter",
  title: "A letter",
};
const ask: NeedsYouItem = {
  ...baseItem,
  kind: "ask",
  key: "question",
  sessionId: "wren-talk",
  callId: "call",
  tool: "read",
  subject: "note",
};
const chore: NeedsYouItem = {
  ...baseItem,
  kind: "chore",
  key: "water",
  creature: "moss",
  routineId: "water",
  need: "grants",
  reason: "Review grants",
  runId: null,
  digest: null,
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the illustrated home", () => {
  it("features the first attributable request and connects each action to the named resident or the global queue", async () => {
    const props = homeProps();
    const [waiting, setWaiting] = createSignal<readonly NeedsYouItem[]>([inbox, ask, chore]);
    const view = render(() => (
      <SteadHome {...props} selected="fern" waiting={waiting()} needsYou={waiting().length} />
    ));
    expect(view.getByRole("heading", { name: "Wren" })).toBeTruthy();
    await fireEvent.click(view.getByRole("button", { name: "Review 3 requests" }));
    expect(props.onRequests).toHaveBeenCalledTimes(1);
    await fireEvent.click(view.getByRole("button", { name: "Talk to Wren" }));
    expect(props.onTalk).toHaveBeenCalledExactlyOnceWith("wren");
    await fireEvent.click(view.getByRole("button", { name: "Visit courtyard" }));
    await fireEvent.click(view.getByRole("button", { name: /Moss.*Court 3/i }));
    expect(props.onCourt.mock.calls).toEqual([["wren"], ["moss"]]);
    await fireEvent.click(view.getByRole("button", { name: /Explore the stead/ }));
    await fireEvent.click(view.getByRole("button", { name: /Meet another creature/ }));
    expect(props.onExplore).toHaveBeenCalledTimes(1);
    expect(props.onCreate).toHaveBeenCalledTimes(1);

    setWaiting([chore, inbox]);
    expect(view.getByRole("heading", { name: "Moss" })).toBeTruthy();
    setWaiting([inbox]);
    expect(view.getByRole("heading", { name: "Fern" })).toBeTruthy();
    await fireEvent.click(view.getByRole("button", { name: "Review request" }));
    expect(props.onRequests).toHaveBeenCalledTimes(2);
    setWaiting([]);
    expect(view.queryByRole("button", { name: /Review .*request/ })).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: "Talk to Fern" }));
    expect(props.onTalk).toHaveBeenLastCalledWith("fern");
  });

  it("attributes a decision without a creature field value through its session", () => {
    const props = homeProps();
    const decided: NeedsYouItem = {
      ...baseItem,
      kind: "decided",
      key: "decision",
      sessionId: "wren-talk",
      creature: undefined,
      recordId: "record",
      ruleClass: "read",
      tool: "read",
    };
    const view = render(() => (
      <SteadHome {...props} selected="fern" waiting={[decided]} needsYou={1} />
    ));
    expect(view.getByRole("heading", { name: "Wren" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Talk to Wren" })).toBeTruthy();
  });

  it("describes a held chore consistently in the featured greeting and the neighbor's accessible name", () => {
    const props = homeProps();
    const held = {
      ...props.world,
      porch: {
        ...props.world.porch,
        chores: {
          water: {
            creature: "moss",
            routineId: "water",
            need: "grants" as const,
            reason: "Review grants",
            runId: null,
            since: at,
            digest: undefined,
          },
        },
      },
    };
    const view = render(() => (
      <SteadHome {...props} world={held} selected="moss" waiting={[chore]} needsYou={1} />
    ));
    const neighbor = view.getByRole("button", { name: /Moss.*at the porch.*Court 3/i });
    expect(within(neighbor).getByText("at the porch")).toBeTruthy();
    expect(view.getAllByText("at the porch")).toHaveLength(2);
    expect(view.getByText(/Moss has something for you to look at/i)).toBeTruthy();
  });

  it("keeps a resident with missing artwork reachable under their own identity", async () => {
    const props = homeProps();
    const world = withCreatures(
      props.world,
      [{ slug: "fern", name: "Fern", skin: "unregistered-skin" }],
      at,
    );
    const view = render(() => <SteadHome {...props} world={world} selected="fern" />);
    const figure = view.getByRole("figure", { name: "Fern at home" });
    expect(within(figure).getByText(/artwork unavailable/i)).toBeTruthy();
    expect(figure.querySelector("canvas")).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: "Talk to Fern" }));
    await fireEvent.click(view.getByRole("button", { name: /Fern.*idle.*Court 1/i }));
    expect(props.onTalk).toHaveBeenCalledExactlyOnceWith("fern");
    expect(props.onCourt).toHaveBeenCalledExactlyOnceWith("fern");
  });

  it("preserves focus on a neighbor as a real reading ages out and their name and state refresh", async () => {
    const props = homeProps();
    const thread = props.world.threads["wren-talk"];
    if (!thread) throw new Error("Missing resident conversation");
    const [world, setWorld] = createSignal<HabitatState>({
      ...props.world,
      threads: {
        ...props.world.threads,
        "wren-talk": {
          ...thread,
          turn: { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined },
        },
      },
    });
    const [clock, setClock] = createSignal(now);
    const view = render(() => (
      <SteadHome {...props} world={world()} now={clock()} selected="fern" />
    ));
    const button = view.getByRole("button", { name: /Wren.*working.*Court 2/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    setClock(now + 31 * 60_000);
    expect(view.getByRole("button", { name: /Wren.*idle.*Court 2/i })).toBe(button);
    expect(document.activeElement).toBe(button);
    setWorld(
      withCreatures(world(), [{ slug: "wren", name: "New Wren", skin: "carter", paused: at }], at),
    );
    expect(view.getByRole("button", { name: /New Wren.*paused.*Court 2/i })).toBe(button);
    expect(document.activeElement).toBe(button);
    await fireEvent.click(button);
    expect(props.onCourt).toHaveBeenCalledExactlyOnceWith("wren");
  });

  it("renders only the supplied district beyond 4,096 residents, keeping vacant and occupied addresses", async () => {
    const props = homeProps();
    const model = props.world.creatures.fern;
    if (!model) throw new Error("Missing resident");
    const order = Array.from({ length: 4112 }, (_, i) => `resident-${i}`);
    const world: HabitatState = {
      ...emptyHabitat(),
      creatures: Object.fromEntries(
        order.map((slug, i) => [slug, { ...model, slug, name: `Resident ${i}` }]),
      ),
    };
    const slugs = ["reserved-address", ...order.slice(4097)];
    const range = { start: 4096, end: 4112, slugs };
    const view = render(() => (
      <SteadHome {...props} world={world} selected="resident-0" order={[]} range={range} />
    ));
    const neighbors = view.getByRole("list", { name: "Your neighbors" });
    expect(neighbors.getAttribute("start")).toBe("4097");
    const district = within(neighbors);
    expect(district.getAllByRole("listitem")).toHaveLength(16);
    expect(district.getAllByRole("button")).toHaveLength(15);
    expect(district.getByText("Court 4097")).toBeTruthy();
    expect(district.getByText("A place kept for later")).toBeTruthy();
    expect(district.queryByRole("button", { name: /Resident 0\b/ })).toBeNull();
    await fireEvent.click(district.getByRole("button", { name: /Resident 4111.*Court 4112/i }));
    expect(props.onCourt).toHaveBeenCalledExactlyOnceWith("resident-4111");
  });

  it("uses the saved address order when a range omits its slugs and caps the view at sixteen", () => {
    const props = homeProps();
    const order = [
      "before",
      "wren",
      ...Array.from({ length: 14 }, (_, i) => `vacancy-${i}`),
      "fern",
      "moss",
    ];
    const view = render(() => (
      <SteadHome {...props} order={order} range={{ start: 1, end: order.length }} />
    ));
    const district = within(view.getByRole("list", { name: "Your neighbors" }));
    expect(district.getAllByRole("listitem")).toHaveLength(16);
    expect(district.getByRole("button", { name: /Wren.*Court 2/i })).toBeTruthy();
    expect(district.getByRole("button", { name: /Fern.*Court 17/i })).toBeTruthy();
    expect(district.queryByRole("button", { name: /Moss/ })).toBeNull();
  });
});

function homeProps() {
  const world = withCreatures(
    emptyHabitat(),
    [
      { slug: "fern", name: "Fern", skin: "kid" },
      { slug: "wren", name: "Wren", skin: "carter", conversation: "wren-talk" },
      { slug: "moss", name: "Moss", skin: "joiner" },
    ],
    at,
  );
  return {
    world,
    order: ["fern", "wren", "moss"],
    now,
    waiting: [],
    needsYou: 0,
    onTalk: vi.fn(),
    onCourt: vi.fn(),
    onExplore: vi.fn(),
    onRequests: vi.fn(),
    onCreate: vi.fn(),
  };
}
