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

  it("outlines a card that needs the keeper and names its signal with its reason", () => {
    const signalled = { ...entry("deploy", "card", false), signal: "critical" as const };
    const { container } = render(() => (
      <Rail
        entries={[signalled]}
        cards={[{ id: "deploy", rect: { x: 0, y: 52, width: 272, height: 64 } }]}
        head={head}
        fold={undefined}
        folded={0}
        heldBack={0}
        active={false}
        cursor={undefined}
        onCursor={() => undefined}
        onEnter={() => undefined}
        onAnswer={() => undefined}
        onReturn={() => undefined}
      />
    ));
    const card = container.querySelector(".kw-yard-card") as HTMLElement;
    expect(card.dataset.signal).toBe("critical");
    const named = card.querySelector(".kw-yard-card-signal") as HTMLElement;
    expect(named.textContent).toBe("critical");
    expect(named.getAttribute("title")).toBe("critical · worth a look");
  });

  it("picks a card by pointer as Enter would", () => {
    const run = rail(false);
    const second = run.container.querySelectorAll<HTMLElement>(".kw-yard-card")[1];
    if (second !== undefined) fireEvent.click(second);
    expect(run.cursor()).toBe("second");
    expect(run.entered).toEqual(["second"]);
  });
});

describe("the rail lying along the top as a band", () => {
  it("steps with left and right as well as j and k, and counts what is folded", () => {
    const run = rail(true, 0, true);
    expect(run.list().hasAttribute("data-band")).toBe(true);
    key(run.list(), "ArrowRight");
    expect(run.cursor()).toBe("first");
    key(run.list(), "j");
    expect(run.cursor()).toBe("second");
    key(run.list(), "ArrowLeft");
    key(run.list(), "k");
    expect(run.cursor()).toBe("open");
    expect(run.container.querySelector(".kw-yard-folded")?.textContent).toBe("+3");
    expect(run.container.querySelector(".kw-yard-rail-head")?.textContent).toBe(
      "← → · enter · esc",
    );
  });
});

function rail(initiallyActive: boolean, heldBack = 0, band = false) {
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
      band={band}
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
