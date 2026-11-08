import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rail, type RailEntry } from "./rail.tsx";

afterEach(cleanup);

const entries: RailEntry[] = [
  entry("open", "unfold", false),
  entry("first", "card", false),
  entry("second", "card", true),
];
const cards = [
  { id: "first", rect: { x: 0, y: 52, width: 272, height: 64 } },
  { id: "second", rect: { x: 0, y: 128, width: 272, height: 64 } },
];
const head = { x: 0, y: 0, width: 272, height: 40 };
const fold = { x: 0, y: 204, width: 272, height: 32 };

describe("the rail", () => {
  it("never takes focus on its own and takes it when the keeper calls it", () => {
    const run = rail(false);
    const composer = document.createElement("textarea");
    document.body.append(composer);
    composer.focus();
    expect(document.activeElement).toBe(composer);
    run.setActive(true);
    expect(document.activeElement).toBe(run.list());
    composer.remove();
  });

  it("moves with j and k across the unfolded panels and the cards, in depth order", () => {
    const run = rail(true);
    expect(run.cursor()).toBe("open");
    key(run.list(), "j");
    expect(run.cursor()).toBe("first");
    key(run.list(), "j");
    key(run.list(), "j");
    expect(run.cursor()).toBe("second");
    key(run.list(), "k");
    expect(run.cursor()).toBe("first");
    key(run.list(), "ArrowUp");
    expect(run.cursor()).toBe("open");
  });

  it("enters with Enter, dismisses with x, pins and unpins with p, and returns with Escape", () => {
    const run = rail(true);
    key(run.list(), "Enter");
    key(run.list(), "x");
    key(run.list(), "p");
    key(run.list(), "j");
    key(run.list(), "j");
    key(run.list(), "p");
    key(run.list(), "Escape");
    expect(run.entered).toEqual(["open"]);
    expect(run.answered).toEqual([
      ["open", "dismissed"],
      ["open", "pinned"],
      ["second", "unpinned"],
    ]);
    expect(run.returned).toHaveBeenCalledTimes(1);
  });

  it("claims its keys and leaves chorded or foreign ones to the shell", () => {
    const run = rail(true);
    expect(run.list().hasAttribute("data-keys-owned")).toBe(true);
    expect(fireEvent.keyDown(run.list(), { key: "j" })).toBe(false);
    expect(fireEvent.keyDown(run.list(), { key: "j", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(run.list(), { key: "q" })).toBe(true);
    expect(run.cursor()).toBe("first");
  });

  it("draws the cards at their placements and says how many folded", () => {
    const run = rail(true);
    const drawn = [...run.container.querySelectorAll<HTMLElement>(".kw-yard-card")];
    expect(drawn.map((card) => card.querySelector(".kw-yard-card-title")?.textContent)).toEqual([
      "first",
      "second",
    ]);
    expect(drawn[1]?.style.top).toBe("128px");
    expect(drawn[1]?.dataset.pinned).toBe("");
    expect(run.container.querySelector(".kw-yard-folded")?.textContent).toBe("3 more folded");
  });

  it("heads the rail with what the unfold budget held back while the keeper was away", () => {
    const run = rail(false, 2);
    expect(run.container.querySelector(".kw-yard-rail-head")?.textContent).toBe(
      "while you were away · 2 held back as cards",
    );
  });

  it("picks a card by pointer as Enter would", () => {
    const run = rail(false);
    const second = run.container.querySelectorAll<HTMLElement>(".kw-yard-card")[1];
    if (second !== undefined) fireEvent.click(second);
    expect(run.cursor()).toBe("second");
    expect(run.entered).toEqual(["second"]);
  });
});

function rail(initiallyActive: boolean, heldBack = 0) {
  const [active, setActive] = createSignal(initiallyActive);
  const [cursor, setCursor] = createSignal<string>();
  const entered: string[] = [];
  const answered: Array<[string, string]> = [];
  const returned = vi.fn();
  const { container } = render(() => (
    <Rail
      entries={entries}
      cards={cards}
      head={head}
      fold={fold}
      folded={3}
      heldBack={heldBack}
      active={active()}
      cursor={cursor()}
      onCursor={setCursor}
      onEnter={(chosen) => entered.push(chosen.id)}
      onAnswer={(chosen, outcome) => answered.push([chosen.id, outcome])}
      onReturn={returned}
    />
  ));
  return {
    container,
    setActive,
    cursor: () => cursor() ?? entries[0]?.id,
    list: () => container.querySelector(".kw-yard-rail") as HTMLElement,
    entered,
    answered,
    returned,
  };
}

function entry(id: string, shown: RailEntry["shown"], pinned: boolean): RailEntry {
  return { id, title: id, by: "Wren set out a note", why: "worth a look", shown, pinned };
}

function key(target: HTMLElement, name: string): void {
  fireEvent.keyDown(target, { key: name });
}
