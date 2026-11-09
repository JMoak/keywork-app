import { cleanup, render } from "@solidjs/testing-library";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { YardStage, yardScenes } from "../../screenshots/yard-stage.tsx";

const captured = { clientWidth: 1440, clientHeight: 900 } as const;
const measured = Object.keys(captured) as (keyof typeof captured)[];
const originals = measured.map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
);

beforeAll(() => {
  for (const name of measured) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("kw-yard") ? captured[name] : 0;
      },
    });
  }
});

afterAll(() => {
  for (const [name, original] of originals) {
    if (original === undefined) Reflect.deleteProperty(HTMLElement.prototype, name);
    else Object.defineProperty(HTMLElement.prototype, name, original);
  }
});

afterEach(cleanup);

describe("the yard's captured scenes, held as goldens", () => {
  for (const scene of yardScenes) {
    it(`${scene} at the 1440 by 900 capture matches its committed golden`, async () => {
      const { container } = render(() => (
        <YardStage scene={scene} hub={<p class="kw-golden-hub">hub</p>} />
      ));
      await expect(goldenText(container)).toMatchFileSnapshot(`./goldens/${scene}.txt`);
    });
  }
});

function goldenText(container: HTMLElement): string {
  const yard = container.querySelector<HTMLElement>(".kw-yard");
  const lines = [
    `yard ${yard?.dataset.mode ?? "absent"}`,
    `hub ${rectOf(container.querySelector(".kw-yard-hub"))}`,
    ...crumbLines(container),
    ...[...container.querySelectorAll<HTMLElement>(".kw-yard-satellite")].flatMap(satelliteLines),
    ...railLines(container),
  ];
  return `${lines.join("\n")}\n`;
}

function satelliteLines(satellite: HTMLElement): string[] {
  return [
    `${satellite.dataset.rung} ${satellite.dataset.size} ${satellite.dataset.layer} ${rectOf(satellite)}`,
    `  ${textOf(satellite.querySelector(".kw-frame-name"))} · ${textOf(satellite.querySelector(".kw-frame-turn"))}`,
  ];
}

function railLines(container: HTMLElement): string[] {
  const slot = container.querySelector<HTMLElement>(".kw-yard-rail-slot");
  if (slot === null) return [];
  const rail = slot.querySelector<HTMLElement>(".kw-yard-rail");
  const head = slot.querySelector<HTMLElement>(".kw-yard-rail-head");
  const fold = slot.querySelector<HTMLElement>(".kw-yard-folded");
  const cards = [...slot.querySelectorAll<HTMLElement>(".kw-yard-card")].toSorted(
    (a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top),
  );
  return [
    `rail ${rectOf(slot)}${rail?.dataset.active === undefined ? "" : " · in hand"}`,
    `  head ${rectOf(head)} ${textOf(head)}`,
    ...cards.flatMap(cardLines),
    ...(fold === null ? [] : [`  fold ${rectOf(fold)} ${textOf(fold)}`]),
  ];
}

function cardLines(card: HTMLElement): string[] {
  const marks = [
    card.dataset.cursor === undefined ? [] : ["cursor"],
    card.dataset.group === undefined ? [] : [`group of ${card.dataset.group}`],
    card.dataset.pinned === undefined ? [] : ["pinned"],
    card.dataset.plot === undefined ? [] : [`plot of ${card.dataset.plot}`],
    card.dataset.level === undefined ? [] : [`level ${card.dataset.level}`],
    card.dataset.rung === "card" ? [] : [`shown ${card.dataset.rung}`],
  ].flat();
  return [
    `  card ${rectOf(card)}${marks.length === 0 ? "" : ` · ${marks.join(" · ")}`}`,
    `    ${textOf(card.querySelector(".kw-yard-card-title"))}`,
    `    ${textOf(card.querySelector(".kw-yard-card-by"))}`,
    ...whyLines(card),
  ];
}

function whyLines(card: HTMLElement): string[] {
  const why = card.querySelector(".kw-yard-card-why");
  return why === null ? [] : [`    ${textOf(why)}`];
}

function crumbLines(container: HTMLElement): string[] {
  const crumb = container.querySelector(".kw-yard-crumb");
  return crumb === null ? [] : [`crumb ${rectOf(crumb)} ${textOf(crumb)}`];
}

function rectOf(element: Element | null): string {
  if (!(element instanceof HTMLElement)) return "unplaced";
  const { left, top, width, height } = element.style;
  return `${pixels(left)},${pixels(top)} ${pixels(width)}×${pixels(height)}`;
}

function pixels(value: string): string {
  return value === "" ? "?" : String(Math.round(Number.parseFloat(value)));
}

function textOf(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
