import type { YardCard, YardSetting } from "@keywork-app/habitat";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import { aYardSetting } from "./testing.ts";
import { Yard } from "./yard.tsx";

afterEach(cleanup);

describe("a setting withdrawn while the keeper is inside it", () => {
  it("stays on the rail, labelled withdrawn, while the cursor is on it, and folds when the cursor leaves", () => {
    const yard = renderYard([card("first", 5), card("second", 3)]);
    yard.withdraw("first");
    const kept = cardTitled("first");
    expect(kept?.dataset.withdrawn).toBe("");
    expect(kept?.querySelector(".kw-yard-card-by")?.textContent).toBe(
      "withdrawn · Wren set out a note",
    );
    keyOnRail("j");
    expect(cardTitled("first")).toBeUndefined();
    expect(cardTitled("second")?.dataset.cursor).toBe("");
  });

  it("is kept whichever arrives first, the withdrawal or the fold", () => {
    const yard = renderYard([card("first", 5), card("second", 3)]);
    yard.settle("first");
    yard.markWithdrawn("first");
    expect(cardTitled("first")?.dataset.withdrawn).toBe("");
  });

  it("folds at once when the keeper's own answer settled it", () => {
    const yard = renderYard([card("first", 5), card("second", 3)]);
    yard.settle("first");
    expect(cardTitled("first")).toBeUndefined();
  });

  it("stays as a pane while the keeper's focus is inside the panel, and folds when focus leaves", () => {
    const yard = renderYard([card("panel", 9, "unfold")], { railActive: false });
    const satellite = satelliteOf("panel");
    const inside = satellite.querySelector(".kw-yard-note") as HTMLElement;
    fireEvent.focusIn(inside);
    yard.withdraw("panel");
    expect(satelliteOf("panel").dataset.withdrawn).toBe("");
    expect(
      satelliteOf("panel").querySelector(".kw-frame-ribbon, .kw-frame")?.textContent,
    ).toContain("withdrawn");
    fireEvent.focusOut(inside, { relatedTarget: null });
    expect(document.querySelector('[data-setting="panel"]')).toBeNull();
  });

  it("never draws a withdrawal the keeper was not inside", () => {
    const yard = renderYard([card("first", 5), card("second", 3)]);
    yard.withdraw("second");
    expect(cardTitled("second")).toBeUndefined();
  });
});

describe("the rail while the keeper is in it", () => {
  it("keeps its order still as depths move, and takes the new order once the keeper leaves", () => {
    const yard = renderYard([card("a", 5), card("b", 3), card("c", 1)]);
    expect(railOrder()).toEqual(["a", "b", "c"]);
    yard.replace([card("a", 5), card("b", 3), card("c", 9)]);
    expect(railOrder()).toEqual(["a", "b", "c"]);
    keyOnRail("j");
    keyOnRail("j");
    expect(cardTitled("c")?.dataset.cursor).toBe("");
    yard.replace([card("a", 5), card("b", 3), card("c", 9), card("d", 7)]);
    expect(railOrder()).toEqual(["a", "b", "c", "d"]);
    yard.leaveRail();
    expect(railOrder()).toEqual(["c", "d", "a", "b"]);
  });
});

describe("the yard's own card", () => {
  it("heads the rail with the unfold budget and when the next unfold is free", () => {
    renderYard([card("a", 5)], { railActive: false, card: spentCard });
    expect(railHead().textContent).toBe("6 of 6 unfolds · next free at 09:10");
    cleanup();
    renderYard([card("a", 5)], { railActive: false, card: { ...spentCard, used: 2 } });
    expect(railHead().textContent).toBe("2 of 6 unfolds · the next is free");
  });

  it("is selectable above the first card and opens its last decisions with Enter, newest first", () => {
    renderYard([card("a", 5)], { card: spentCard });
    keyOnRail("k");
    expect(railHead().dataset.cursor).toBe("");
    expect(railHead().textContent).toBe("6 of 6 unfolds · next free at 09:10");
    keyOnRail("Enter");
    expect(railHead().textContent).toBe("the yard's last decisions · enter closes");
    expect(decisionLines()).toEqual([
      "09:02 · a · card · unfold budget",
      "09:01 · a note · unfold · a delivery in your thread",
    ]);
    expect(cardTitled("a")).toBeUndefined();
    keyOnRail("Enter");
    expect(decisionLines()).toEqual([]);
    expect(cardTitled("a")).toBeTruthy();
  });
});

describe("a flood from one owner", () => {
  it("gathers four or more cards into one, opens it with Enter and dismisses it whole with x", () => {
    const answered: Array<[string, string]> = [];
    renderYard(
      ["one", "two", "three", "four"].map((id, index) =>
        aYardSetting({
          id,
          depth: 4 - index,
          what: { kind: "note", ref: `about ${id}`, title: id },
        }),
      ),
      { answered },
    );
    const gathered = [...document.querySelectorAll<HTMLElement>(".kw-yard-card")];
    expect(gathered).toHaveLength(1);
    expect(gathered[0]?.dataset.group).toBe("4");
    expect(gathered[0]?.querySelector(".kw-yard-card-by")?.textContent).toBe(
      "Wren set out 4 things",
    );
    keyOnRail("x");
    expect(answered).toEqual([
      ["one", "dismissed"],
      ["two", "dismissed"],
      ["three", "dismissed"],
      ["four", "dismissed"],
    ]);
    keyOnRail("Enter");
    expect(railOrder()).toEqual(["one", "two", "three", "four"]);
  });
});

const spentCard: YardCard = {
  id: "yard:card",
  used: 6,
  limit: 6,
  windowMs: 600_000,
  nextFreeAt: Date.UTC(2026, 10, 8, 9, 10),
  cooldowns: [],
  decisions: [
    {
      at: Date.UTC(2026, 10, 8, 9, 1),
      id: "gone",
      creature: "wren",
      kind: "note",
      proposed: "unfold",
      rung: "unfold",
      verdict: "play",
      reason: "a delivery in your thread",
    },
    {
      at: Date.UTC(2026, 10, 8, 9, 2),
      id: "a",
      creature: "wren",
      kind: "note",
      proposed: "unfold",
      rung: "card",
      verdict: "hold",
      reason: "unfold budget",
    },
  ],
};

function railHead(): HTMLElement {
  return document.querySelector(".kw-yard-rail-head") as HTMLElement;
}

function decisionLines(): string[] {
  return [...document.querySelectorAll(".kw-yard-decisions > li")].map(
    (line) => line.textContent ?? "",
  );
}

function card(id: string, depth: number, shown: YardSetting["shown"] = "card"): YardSetting {
  return aYardSetting({
    id,
    creature: `creature-${id}`,
    depth,
    shown,
    rung: shown === "unfold" ? "unfold" : "card",
    what: { kind: "note", ref: `about ${id}`, title: id },
  });
}

function renderYard(
  initial: readonly YardSetting[],
  options: {
    railActive?: boolean;
    card?: YardCard;
    answered?: Array<[string, string]>;
  } = {},
) {
  const [settings, setSettings] = createSignal(initial);
  const [withdrawn, setWithdrawn] = createSignal<readonly string[]>([]);
  const [railActive, setRailActive] = createSignal(options.railActive ?? true);
  render(() => (
    <Yard
      on={true}
      settings={settings()}
      withdrawn={(id) => withdrawn().includes(id)}
      card={options.card}
      offsetMinutes={0}
      railActive={railActive()}
      reducedMotion={true}
      shell={{} as ShellSeams}
      ownerOf={() => "Wren"}
      onEnter={() => undefined}
      onAnswer={(setting, outcome) => options.answered?.push([setting.id, outcome])}
      onReturn={() => setRailActive(false)}
    >
      <div class="kw-stage" />
    </Yard>
  ));
  const settle = (id: string): void => {
    setSettings((held) => held.filter((setting) => setting.id !== id));
  };
  const markWithdrawn = (id: string): void => {
    setWithdrawn((held) => [...held, id]);
  };
  return {
    settle,
    markWithdrawn,
    withdraw: (id: string): void => {
      markWithdrawn(id);
      settle(id);
    },
    replace: (next: readonly YardSetting[]): void => {
      setSettings(next);
    },
    leaveRail: (): void => {
      setRailActive(false);
    },
  };
}

function keyOnRail(key: string): void {
  fireEvent.keyDown(document.querySelector(".kw-yard-rail") as HTMLElement, { key });
}

function cardTitled(title: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".kw-yard-card")].find(
    (card) => card.querySelector(".kw-yard-card-title")?.textContent === title,
  );
}

function satelliteOf(id: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.kw-yard-satellite[data-setting="${id}"]`);
  if (found === null) throw new Error(`no satellite for ${id}`);
  return found;
}

function railOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".kw-yard-card")]
    .toSorted((a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top))
    .map((card) => card.querySelector(".kw-yard-card-title")?.textContent ?? "");
}
