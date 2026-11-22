import { type CreatureOnTheStead, emptyHabitat, type HabitatState } from "@keywork-app/habitat";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourtyardOverview } from "./index.tsx";

const at = "2026-11-05T12:00:00.000Z";
const now = Date.parse(at);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("courtyard overview", () => {
  it("offers named native buttons with readable states and opens the chosen creature", async () => {
    const onOpen = vi.fn();
    const habitat: HabitatState = {
      ...world(creature("a", "Tess"), creature("b", "Cairn")),
      porch: {
        inbox: undefined,
        decided: {},
        chores: {
          morning: {
            creature: "a",
            routineId: "morning",
            need: "grants",
            reason: "Review grants",
            runId: null,
            since: at,
            digest: undefined,
          },
        },
      },
    };
    const view = render(() => (
      <CourtyardOverview world={habitat} order={["a", "b"]} now={now} onOpen={onOpen} />
    ));
    const button = view.getByRole("button", {
      name: "Open Tess's courtyard · at the porch · Court 1",
    }) as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.tabIndex).toBe(0);
    expect(button.dataset.courtyard).toBe("a");
    expect(button.textContent).toContain("at the porch");
    button.focus();
    expect(document.activeElement).toBe(button);
    await fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("a");
    expect(view.getAllByRole("button")).toHaveLength(2);
    expect(view.getByRole("list", { name: "Creature courtyards" })).toBeTruthy();
  });

  it("keeps a focused tile mounted while identity, coat, selection and status refresh", () => {
    const [habitat, setHabitat] = createSignal(world(creature("a", "Before")));
    const [time, setTime] = createSignal(now);
    const [selected, setSelected] = createSignal<string>();
    const view = render(() => (
      <CourtyardOverview
        world={habitat()}
        order={["a"]}
        now={time()}
        selected={selected()}
        onOpen={() => undefined}
      />
    ));
    const button = view.getByRole("button") as HTMLButtonElement;
    button.focus();
    expect(button.querySelector("canvas")?.dataset.skin).toBe("kid");
    setHabitat(world({ ...creature("a", "After"), skin: "carter", seed: 2, paused: at }));
    setTime(now + 1);
    setSelected("a");
    expect(view.getByRole("button")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-label")).toBe("Open After's courtyard · paused · Court 1");
    expect(button.getAttribute("aria-current")).toBe("location");
    expect(button.querySelector("canvas")?.dataset.skin).toBe("carter");
    expect(button.querySelector(".kw-courtyard-name")?.textContent).toBe("After");
  });

  it("keeps a creature reachable when its artwork is missing and recovers on a new skin", () => {
    const [habitat, setHabitat] = createSignal(
      world({ ...creature("a", "Aster"), skin: "missing-courtyard-test-skin" }),
    );
    const onOpen = vi.fn();
    const view = render(() => (
      <CourtyardOverview world={habitat()} order={[]} now={now} onOpen={onOpen} />
    ));
    expect(view.getByText("Artwork unavailable")).toBeTruthy();
    const button = view.getByRole("button") as HTMLButtonElement;
    button.click();
    expect(onOpen).toHaveBeenCalledWith("a");
    setHabitat(world(creature("a", "Aster")));
    expect(view.queryByText("Artwork unavailable")).toBeNull();
    expect(button.querySelector("canvas")?.dataset.skin).toBe("kid");
  });
});

function world(...creatures: CreatureOnTheStead[]): HabitatState {
  return {
    ...emptyHabitat(),
    creatures: Object.fromEntries(creatures.map((each) => [each.slug, each])),
  };
}

function creature(slug: string, name = slug): CreatureOnTheStead {
  return {
    slug,
    name,
    skin: "kid",
    seed: 0,
    workshop: {
      raisedAt: at,
      parcel: undefined,
      substrate: undefined,
      health: "up",
      boardedAt: undefined,
    },
    conversation: undefined,
    chores: [],
  };
}
