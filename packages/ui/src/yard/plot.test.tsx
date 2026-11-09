import type { ConsoleClient } from "@keywork-app/client";
import { steadProfile } from "@keywork-app/product";
import type { FileSlice, Setting, ShowOpening } from "@keywork-app/protocol";
import { cleanup, fireEvent, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import {
  conversationId,
  key,
  openYard,
  pressLeader,
  satelliteOf,
  typing,
  type YardHarness,
} from "./app-testing.tsx";
import { aSetting, proposed, settled } from "./testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const chain = "the sum and its test → sum.ts → sum.test.ts";

const diff = aSetting({
  id: "diff",
  sessionId: conversationId,
  what: { kind: "diff", ref: "change-1", title: "the sum and its test" },
  rung: "unfold",
  why: "the sum and its test are written",
  from: conversationId,
  origin: "creature",
});
const file = opening("file", "diff", "src/sum.ts", "2026-11-08T09:01:00.000Z");
const test = opening("test", "file", "src/sum.test.ts", "2026-11-08T09:02:00.000Z");

describe("a plot growing from what the creature set out", () => {
  it("opens a file from the diff by key and a test from the file, each a keeper opening with its parent", async () => {
    const run = await openPlot();
    focusInside("diff", ".kw-diff");
    key("j");
    key("f");
    await waitFor(() => expect(run.opened).toHaveLength(1));
    run.emit([proposed(2, file)]);
    await waitFor(() => satelliteOf("file"));
    expect(satelliteOf("file").querySelector(".kw-frame-turn")?.textContent).toBe(
      "you opened it from the sum and its test",
    );

    focusInside("file", ".kw-file");
    openFromPalette("/open src/sum.test.ts");
    await waitFor(() => expect(run.opened).toHaveLength(2));
    expect(run.opened).toEqual([
      { what: { kind: "file", ref: "src/sum.ts" }, from: "diff", rung: "unfold" },
      { what: { kind: "file", ref: "src/sum.test.ts" }, from: "file", rung: "unfold" },
    ]);
    expect(panelHolding()).toBe("file");
    run.emit([proposed(3, test)]);
    await waitFor(() => expect(drawnAnywhere(["test"])).toBe(true));
    expect(document.querySelector(".kw-yard-crumb")?.textContent).toBe(
      "the sum and its test → sum.ts",
    );
  });

  it("keeps a panel's pane steady while the keeper's attention moves its setting, so a press lands", async () => {
    const run = await openPlot();
    const row = await waitFor(() => {
      const found = [
        ...satelliteOf("diff").querySelectorAll<HTMLElement>(".kw-diff-file-row"),
      ].find((button) => button.textContent?.includes("src/sum.ts"));
      if (found === undefined) throw new Error("no row for src/sum.ts");
      return found;
    });
    row.focus();
    fireEvent.focusIn(row);
    await waitFor(() => expect(satelliteOf("diff").dataset.size).toBeDefined());
    expect(row.isConnected).toBe(true);
    fireEvent.click(row);
    const show = await waitFor(() => {
      const found = satelliteOf("diff").querySelector<HTMLElement>("button.kw-diff-show");
      if (found === null) throw new Error("the panel never opened the file's diff");
      return found;
    });
    fireEvent.click(show);
    await waitFor(() =>
      expect(run.opened).toEqual([
        { what: { kind: "file", ref: "src/sum.ts" }, from: "diff", rung: "unfold" },
      ]),
    );
  });

  it("walks the chain with leader ] and leader [, to a panel or its card, back to the conversation", async () => {
    const run = await openPlot();
    focusInside("diff", ".kw-diff");
    run.emit([proposed(2, file), proposed(3, test)]);
    await waitFor(() => expect(drawnAnywhere(["diff", "file", "test"])).toBe(true));
    focusOn("test");
    pressLeader("[");
    expect(landedOn("file")).toBe(true);
    await screen.findByText(/at src\/sum.ts$/);
    pressLeader("[");
    expect(landedOn("diff")).toBe(true);
    pressLeader("]");
    expect(landedOn("file")).toBe(true);
    pressLeader("]");
    expect(landedOn("test")).toBe(true);
    pressLeader("]");
    expect(landedOn("test")).toBe(true);
    await screen.findByText("the end of this chain");
  });

  it("walks rootward from the seed back to the conversation it grew from", async () => {
    await openPlot();
    focusInside("diff", ".kw-diff");
    pressLeader("[");
    await waitFor(() => expect(panelHolding()).toBeUndefined());
    expect(document.activeElement?.closest(".kw-yard-hub")).toBeTruthy();
  });

  it("folds into one card named by its chain when the seed is dismissed, and restores it on Enter", async () => {
    const run = await openPlot();
    run.emit([proposed(2, file), proposed(3, test)]);
    await waitFor(() => expect(drawnAnywhere(["file", "test"])).toBe(true));
    run.emit([settled(4, diff, "dismissed")]);
    const plot = await waitFor(() => plotCard());
    expect(plot.querySelector(".kw-yard-card-title")?.textContent).toBe(chain);
    await waitFor(
      () => {
        expect(document.querySelector('.kw-yard-satellite[data-setting="file"]')).toBeNull();
        expect(document.querySelector('.kw-yard-satellite[data-setting="test"]')).toBeNull();
      },
      { timeout: 4000 },
    );

    pressLeader("y");
    railTo(plot);
    key("Enter");
    await waitFor(() => satelliteOf("file"));
    await waitFor(() => satelliteOf("test"));
    expect(run.answered).toEqual([]);
  });

  it("dismisses a folded plot whole with x", async () => {
    const run = await openPlot();
    run.emit([proposed(2, file), proposed(3, test), settled(4, diff, "dismissed")]);
    const plot = await waitFor(() => plotCard());
    pressLeader("y");
    railTo(plot);
    key("x");
    await waitFor(() =>
      expect(run.answered.toSorted()).toEqual([
        ["file", "dismissed"],
        ["test", "dismissed"],
      ]),
    );
  });

  it("never takes the keeper's focus as the plot grows, folds and restores", async () => {
    const run = await openPlot();
    const composer = typing();
    run.emit([proposed(2, file), proposed(3, test)]);
    await waitFor(() => expect(drawnAnywhere(["file", "test"])).toBe(true));
    run.emit([settled(4, diff, "dismissed")]);
    await waitFor(() => plotCard());
    expect(document.activeElement).toBe(composer);
  });
});

interface PlotRun extends YardHarness {
  readonly opened: ShowOpening[];
}

async function openPlot(): Promise<PlotRun> {
  const opened: ShowOpening[] = [];
  const served: Partial<ConsoleClient> = {
    changes: async () => ({
      baseline: "session start",
      files: [
        { path: "src/sum.ts", added: 1, deleted: 0, turn: 1 },
        { path: "src/sum.test.ts", added: 3, deleted: 0, turn: 1 },
      ],
    }),
    file: async (path) => sliceOf(path),
    openSetting: async (body) => {
      opened.push(body);
      return aSetting({ id: `opened-${opened.length}`, what: body.what, from: body.from });
    },
  };
  const run = await openYard(steadProfile, undefined, served);
  typing();
  run.emit([proposed(1, diff)]);
  await waitFor(() => satelliteOf("diff"));
  return { ...run, opened };
}

function opening(id: string, from: string, path: string, at: string): Setting {
  return aSetting({
    id,
    sessionId: conversationId,
    what: { kind: "file", ref: path },
    rung: "unfold",
    why: "",
    at,
    from,
    origin: "keeper",
  });
}

function sliceOf(path: string): FileSlice {
  const text = `export const sum = (a, b) => a + b; // ${path}\n`;
  return {
    path,
    bytes: text.length,
    from: 0,
    to: text.length,
    text,
    truncated: false,
    encoding: "utf-8",
  };
}

function focusInside(id: string, selector: string): void {
  const root = satelliteOf(id).querySelector<HTMLElement>(selector);
  if (root === null) throw new Error(`no ${selector} inside ${id}`);
  root.focus();
  fireEvent.focusIn(root);
}

function openFromPalette(command: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "p", ctrlKey: true });
  const input = screen.getByLabelText("palette");
  fireEvent.input(input, { target: { value: command } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function drawnAnywhere(ids: readonly string[]): boolean {
  return ids.every((id) => document.getElementById(`kw-yard-entry-${id}`) !== null);
}

function focusOn(id: string): void {
  const satellite = document.querySelector(`.kw-yard-satellite[data-setting="${id}"]`);
  if (satellite !== null) {
    focusInside(id, ".kw-frame-body [tabindex]");
    return;
  }
  pressLeader("y");
  for (let step = 0; step < 8 && !landedOn(id); step += 1) key("j");
}

function landedOn(id: string): boolean {
  const rail = document.querySelector(".kw-yard-rail");
  const onRail =
    document.activeElement === rail &&
    rail?.getAttribute("aria-activedescendant") === `kw-yard-entry-${id}`;
  return onRail || panelHolding() === id;
}

function panelHolding(): string | undefined {
  return document.activeElement?.closest<HTMLElement>(".kw-yard-satellite")?.dataset.setting;
}

function plotCard(): HTMLElement {
  const found = document.querySelector<HTMLElement>(".kw-yard-card[data-plot]");
  if (found === null) throw new Error("no plot card on the rail");
  return found;
}

function railTo(card: HTMLElement): void {
  for (let step = 0; step < 8 && card.dataset.cursor === undefined; step += 1) key("j");
}
