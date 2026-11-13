import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { appActions } from "../../keys/actions.ts";
import { mountPane, rowTexts, settle } from "../overview/testing.tsx";
import { checkPaneDefinition } from "../testing.ts";
import {
  badModelReference,
  deleteTitle,
  doesNotUndoLine,
  goesLine,
  goneLine,
  noChoresToPause,
  noReportRoute,
  nothingEnforced,
  nothingRemembered,
  noVerbYetLine,
  pausedLine,
  renamedLine,
  resumedLine,
  staysLine,
} from "./copy.ts";
import { type CreatureSpec, creaturePane, lifecycleOf, slugFor } from "./index.tsx";
import {
  type CreatureHarness,
  type CreatureStaging,
  creatureHarness,
  envelope,
  flat,
  lastCall,
  ranchCalls,
  wrenDetail,
  wrenReport,
  wrenRoutines,
  wrenRows,
} from "./testing.ts";

afterEach(cleanup);

const spec: CreatureSpec = { kind: "creature", slug: "wren" };

describe("the creature profile", () => {
  it("paints the header: the portrait at 2x in idle, the name and handle, the state line in the voice template", async () => {
    const { container } = await open();
    const portrait = container.querySelector("canvas.kw-creature-portrait") as HTMLCanvasElement;
    expect(portrait.dataset.clip).toBe("idle");
    expect(portrait.dataset.skin).toBe("kid");
    expect(portrait.getAttribute("aria-label")).toBe("Wren, idle");
    expect(portrait.style.width).toBe("192px");
    expect(portrait.style.height).toBe("208px");
    expect(container.querySelector(".kw-creature-name")?.textContent).toBe("Wren");
    expect(container.querySelector(".kw-creature-handle")?.textContent).toBe("@wren");
    expect(container.querySelector(".kw-creature-telling")?.textContent).toMatch(
      /^Working on docs index since \d\d:\d\d\.$/,
    );
    expect(container.querySelector(".kw-creature-hints")?.textContent).toBe(
      "r rename · b body · m models · c conversation · p pause · d delete",
    );
  });

  it("lists the identity facts: body, workshop with its health and opener, every model class with inherit shown", async () => {
    const { container } = await open();
    expect(fact(container, "body")).toBe("kid · seed 7");
    expect(fact(container, "workshop")).toBe("ws-wren · sbx · up w opens it");
    expect(container.querySelector("dd[data-fact='workshop']")?.getAttribute("data-health")).toBe(
      "up",
    );
    expect(fact(container, "strong")).toBe("anthropic/claude-sonnet-4-5");
    expect(fact(container, "loop")).toBe("inherit · workspace, then user");
    expect(container.querySelector("dd[data-fact='loop']")?.hasAttribute("data-inherit")).toBe(
      true,
    );
    expect(container.querySelector("dd[data-fact='strong']")?.hasAttribute("data-inherit")).toBe(
      false,
    );
    expect(fact(container, "decide")).toBe("ollama/qwen3:8b");
    expect(fact(container, "vision")).toBe("inherit · workspace, then user");
  });

  it("names the bare host plainly instead of pretending it is sealed", async () => {
    const { container } = await open({ detail: { ...wrenDetail(), workshop: "host" } });
    expect(fact(container, "workshop")).toBe("host · the bare node, unconfined");
  });

  it("groups threads as conversation, threads and children, each with state and cost beside", async () => {
    const { container } = await open();
    expect(rowTexts(container)).toEqual([
      "░ conversation idle $0.12",
      "▓ docs index working thread · 1 child · $0.30",
      "░ nightly tests blocked routine · $0.04",
      "░ lint sweep completed $0.01",
    ]);
    expect(
      [...container.querySelectorAll(".kw-creature-group")].map((li) => li.textContent),
    ).toEqual(["conversation", "threads", "children"]);
  });

  it("tables usage today and this week, naming the sessions nobody priced", async () => {
    const { container } = await open();
    expect(cells(container, "today")).toEqual(["today", "3", "0.46"]);
    expect(cells(container, "week")).toEqual(["this week", "4", "0.46 (1 unpriced)"]);
  });

  it("sums up chores and memory in one line each, with the key that opens the pane that owns them", async () => {
    const { container, harness } = await open();
    expect(fact(container, "chores")).toMatch(
      /^2 chores · 1 off · next: nightly tests at \d\d:\d\d t opens the chore board$/,
    );
    expect(fact(container, "memory")).toBe(
      "12 notes in its layer · 1 in the inbox n opens the memory pane",
    );
    expect(harness.layers).toEqual(["bot:wren"]);
  });

  it("lists the firsts under Remembered with the landmark each became, or says nothing is remembered yet", async () => {
    const { container } = await open();
    const rows = [...container.querySelectorAll(".kw-creature-remembered li")];
    expect(rows.map((row) => row.getAttribute("data-landmark"))).toEqual(["workshop"]);
    expect(rows.map(flat)).toEqual(["2026-11-01 the workshop was raised workshop"]);
    const { container: bare } = await open({ bots: [] });
    expect(bare.textContent).toContain(nothingRemembered);
  });

  it("opens with the sentence that nothing is enforced, then the shadow summary per rule class, or the honest pointer", async () => {
    const { container } = await open();
    const openings = [...container.querySelectorAll(".kw-creature-shadow-opening")].map(
      (line) => line.textContent,
    );
    expect(openings).toContain(nothingEnforced);
    expect(openings).toContain(noReportRoute);
    const { container: reported } = await open({ report: wrenReport() });
    expect([...reported.querySelectorAll(".kw-creature-shadow li")].map(flat)).toEqual([
      "bash 38 rows · agreement 92% · would act 20 · estimated",
      "rm 12 rows · agreement 100% · would act 0 · one-way door, stays ask-only",
    ]);
  });

  it("opens things: enter the thread under the cursor, c the conversation, w the workshop, t the chores, n the memory pane, e the file", async () => {
    const { act, harness } = await open();
    act("creature.open");
    act("creature.down");
    act("creature.open");
    act("creature.conversation");
    expect(harness.opened).toEqual(["t0", "t1", "t0"]);
    act("creature.workshop");
    act("creature.chores");
    act("creature.memory");
    expect(harness.panes).toEqual([
      { kind: "workshop", creature: "wren" },
      { kind: "chores", creature: "wren" },
      { kind: "memory" },
    ]);
    act("creature.file");
    expect(harness.edited).toEqual(["C:/work/.keywork/bots/wren/creature.json"]);
  });

  it("renames through the draft line, and when the node has no route yet says so with the file and the key", async () => {
    const { container, act, harness } = await open();
    act("creature.rename");
    expect((container.querySelector(".kw-ov-draft input") as HTMLInputElement).value).toBe("Wren");
    type_(container, "Tam");
    await settle();
    expect(lastCall(harness.served, "PATCH")).toEqual({
      method: "PATCH",
      path: "/creatures/wren",
      body: { name: "Tam" },
    });
    expect(lineText(container)).toBe(
      noVerbYetLine("name", ".keywork/bots/wren/creature.json", "e"),
    );
    harness.served.serve("PATCH /creatures/wren", (body) => ({
      status: 200,
      body: { ...wrenDetail(), conversation: null, threads: 2, ...(body as object) },
    }));
    act("creature.rename");
    type_(container, "  Tam ");
    await settle();
    await settle();
    expect(lineText(container)).toBe(renamedLine("Tam"));
    expect(harness.refetched).toContain("bots");
    expect(creaturePane.title(spec, harness.shell)).toBe("Wren");
    expect(harness.shell.creatureNames?.nameOf("wren")).toBe("Wren");
  });

  it("changes the body among the registered skins and a model class through provider/model, empty meaning inherit", async () => {
    const { container, act, harness } = await open();
    harness.served.serve("PATCH /creatures/wren", () => ({
      status: 200,
      body: { ...wrenDetail(), conversation: null, threads: 2 },
    }));
    act("creature.skin");
    expect(container.querySelector("[data-tone='ask']")?.textContent).toBe(
      "body for Wren · 1 kid · 2 placeholder · any other key cancels",
    );
    choose(container, "2");
    await settle();
    expect(lastCall(harness.served, "PATCH")?.body).toEqual({ body: { skin: "placeholder" } });
    act("creature.policy");
    expect(container.querySelector("[data-tone='ask']")?.textContent).toBe(
      "which class of Wren's models · s strong · l loop · d decide · v vision · any other key cancels",
    );
    choose(container, "l");
    expect(container.querySelector(".kw-ov-draft span")?.textContent).toBe("loop provider/model");
    type_(container, "ollama/qwen3:8b");
    await settle();
    expect(lastCall(harness.served, "PATCH")?.body).toEqual({
      models: { loop: { provider: "ollama", model: "qwen3:8b" } },
    });
    act("creature.policy");
    choose(container, "d");
    expect((container.querySelector(".kw-ov-draft input") as HTMLInputElement).value).toBe(
      "ollama/qwen3:8b",
    );
    type_(container, "");
    await settle();
    expect(lastCall(harness.served, "PATCH")?.body).toEqual({ models: { decide: "inherit" } });
    act("creature.policy");
    choose(container, "v");
    type_(container, "nonsense");
    await settle();
    expect(lineText(container)).toBe(badModelReference);
  });

  it("pauses through POST /creatures/{slug}/pause, resumes a paused creature through resume, and says when there is nothing", async () => {
    const { container, act, harness } = await open();
    act("creature.pause");
    await settle();
    await settle();
    expect(lastCall(harness.served, "POST")?.path).toBe("/creatures/wren/pause");
    expect(ranchCalls(harness.ranch, "putRoutine")).toEqual([]);
    expect(lineText(container)).toBe(pausedLine(1, "p"));
    const quiet = await open({
      detail: { ...wrenDetail(), paused: "2026-11-06T08:00:00.000Z" },
      routines: wrenRoutines().map((row) => ({
        ...row,
        schedule: { ...row.schedule, enabled: false },
      })),
    });
    quiet.act("creature.pause");
    await settle();
    await settle();
    expect(lastCall(quiet.harness.served, "POST")?.path).toBe("/creatures/wren/resume");
    expect(lineText(quiet.container)).toBe(resumedLine(2));
    const none = await open({ routines: [] });
    none.act("creature.pause");
    await settle();
    expect(lineText(none.container)).toBe(noChoresToPause);
  });

  it("deletes only behind the voice guide's card: goes, stays, does not undo, keep the workshop, then the confirmed verb", async () => {
    const { container, act, harness } = await open();
    act("creature.delete");
    await settle();
    const card = container.querySelector(".kw-creature-card") as HTMLElement;
    expect(card.querySelector("legend")?.textContent).toBe(deleteTitle("Wren"));
    expect(card.querySelector("[data-part='goes']")?.textContent).toBe(
      goesLine({ name: "Wren", threads: 3, notes: 12, chores: 2, workshop: "ws-wren" }),
    );
    expect(card.querySelector("[data-part='stays']")?.textContent).toBe(staysLine);
    expect(card.querySelector("[data-part='undo']")?.textContent).toBe(doesNotUndoLine("Wren"));
    expect(buttonWords(card)).toEqual(["Delete Wren", "Cancel"]);
    fireEvent.keyDown(card, { key: "k" });
    await settle();
    expect(ranchCalls(harness.ranch, "removeCreature")).toEqual([
      ["removeCreature", "wren", { confirmed: false, keepWorkshop: false }],
      ["removeCreature", "wren", { confirmed: false, keepWorkshop: true }],
    ]);
    const kept = container.querySelector(".kw-creature-card") as HTMLElement;
    expect((kept.querySelector("input[type='checkbox']") as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(kept, { key: "y" });
    await settle();
    await settle();
    expect(ranchCalls(harness.ranch, "removeCreature").at(-1)).toEqual([
      "removeCreature",
      "wren",
      { confirmed: true, keepWorkshop: true },
    ]);
    expect(lineText(container)).toBe(
      goneLine({
        name: "Wren",
        threads: 3,
        notes: 12,
        chores: 2,
        workshopKept: "ws-wren",
        workshopGone: undefined,
      }),
    );
    expect(harness.refreshes()).toBe(1);
    expect(harness.refetched).toContain("bots");
    expect(container.querySelector(".kw-creature-card")).toBeNull();
  });

  it("lets any other key, the Cancel button or a pane key walk away from the card without deleting", async () => {
    const { container, act, harness } = await open();
    act("creature.delete");
    await settle();
    fireEvent.keyDown(container.querySelector(".kw-creature-card") as HTMLElement, {
      key: "Escape",
    });
    expect(container.querySelector(".kw-creature-card")).toBeNull();
    act("creature.delete");
    await settle();
    act("creature.open");
    expect(container.querySelector(".kw-creature-card")).toBeNull();
    expect(harness.opened).toEqual([]);
    expect(
      ranchCalls(harness.ranch, "removeCreature").some(
        (call) => (call[2] as { confirmed?: boolean }).confirmed === true,
      ),
    ).toBe(false);
  });

  it("refetches when the bus says this creature changed, and ignores another creature's change", async () => {
    const { harness } = await open();
    const reads = () => ranchCalls(harness.ranch, "creature").length;
    expect(reads()).toBe(1);
    harness.emit([envelope(9, "", "creature.changed", { slug: "tam", change: "threads" })]);
    await settle();
    expect(reads()).toBe(1);
    harness.emit([envelope(10, "", "creature.changed", { slug: "wren", change: "threads" })]);
    await settle();
    expect(reads()).toBe(2);
  });

  it("says plainly when no creature has that slug, and teaches the next key when none is chosen", async () => {
    const gone = await open({
      detail: { refused: "missing", detail: "no creature has that slug" },
    });
    expect(lineText(gone.container)).toBe("no creature has that slug");
    const harness = creatureHarness({ bots: [] });
    const { container } = mountPane(creaturePane.component, { kind: "creature" }, harness.shell);
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "No creature yet · make one with ctrl+k 1",
    );
    harness.dispose();
  });

  it("opens the home's creature when summoned from a window that does not know it", async () => {
    const harness = creatureHarness();
    const { container } = mountPane(creaturePane.component, { kind: "creature" }, harness.shell);
    await settle();
    await settle();
    expect(container.querySelector(".kw-creature-name")?.textContent).toBe("Wren");
    expect(container.querySelector(".kw-empty")).toBeNull();
    harness.dispose();
  });

  it("wears the bot's sigil in the title row, lives in main as house, and carries the thread states as lifecycle", () => {
    const harness = creatureHarness();
    expect(creaturePane.adornments?.(spec, harness.shell)).toEqual({
      bot: { sigil: "◆", name: "wren" },
    });
    expect(creaturePane.adornments?.({ kind: "creature" }, harness.shell)).toEqual({});
    expect(lifecycleOf(harness.shell, "wren")).toBe("working");
    expect(lifecycleOf(harness.shell, undefined)).toBe("idle");
    expect(creaturePane.home).toBe("main");
    expect(creaturePane.attire).toBe("house");
    expect(creaturePane.title({ kind: "creature" }, harness.shell)).toBe("creature");
    harness.dispose();
    const asking = creatureHarness({
      rows: wrenRows().map((row, index) =>
        index === 0 ? { ...row, waiting: { asks: 1, tools: ["bash"] } } : row,
      ),
    });
    expect(lifecycleOf(asking.shell, "wren")).toBe("needs-you");
    asking.dispose();
  });

  it("summons the typed slug, else the focused session's creature, else the first bot, else nobody", () => {
    const harness = creatureHarness({ currentSession: "t1" });
    expect(slugFor(harness.shell, "tam")).toEqual({ slug: "tam" });
    expect(slugFor(harness.shell, undefined)).toEqual({ slug: "wren" });
    harness.setCurrentSession(undefined);
    expect(slugFor(harness.shell, " ")).toEqual({ slug: "wren" });
    harness.dispose();
    const bare = creatureHarness({ bots: [], rows: [] });
    expect(slugFor(bare.shell, undefined)).toEqual({});
    bare.dispose();
  });

  it("claims palette names nobody else does and keeps its letters inside the pane", () => {
    const own = new Set([
      ...Object.keys(creaturePane.localActions ?? {}),
      creaturePane.summon?.action ?? "",
    ]);
    for (const name of own) expect(appActions[name], name).toBeDefined();
    const theirs = new Set(
      Object.entries(appActions).flatMap(([name, action]) =>
        action.command === undefined || own.has(name)
          ? []
          : [action.command.name, ...(action.command.aliases ?? [])],
      ),
    );
    const mine = [
      ...Object.values(creaturePane.localActions ?? {}).flatMap((action) =>
        action.command === undefined ? [] : [action.command.name],
      ),
      creaturePane.summon?.command.name,
      ...(creaturePane.summon?.command.aliases ?? []),
    ];
    expect(mine.filter((name) => name !== undefined && theirs.has(name))).toEqual([]);
    expect(
      Object.fromEntries(
        Object.entries(creaturePane.localActions ?? {}).map(([id, action]) => [id, action.chords]),
      ),
    ).toEqual({
      "creature.down": ["j", "down"],
      "creature.up": ["k", "up"],
      "creature.open": "enter",
      "creature.conversation": "c",
      "creature.rename": "r",
      "creature.skin": "b",
      "creature.policy": "m",
      "creature.pause": "p",
      "creature.workshop": "w",
      "creature.chores": "t",
      "creature.memory": "n",
      "creature.craft": "l",
      "creature.craft-edit": "o",
      "creature.craft-forget": "x",
      "creature.file": "e",
      "creature.delete": "d",
    });
    expect(creaturePane.summon?.chords).toBe("leader shift+i");
  });
});

async function open(staging: CreatureStaging = {}): Promise<{
  container: HTMLElement;
  act: (action: string, argument?: string) => void;
  harness: CreatureHarness;
}> {
  const harness = creatureHarness(staging);
  const mounted = mountPane(creaturePane.component, spec, harness.shell);
  await settle();
  await settle();
  await settle();
  return { ...mounted, harness };
}

function fact(container: HTMLElement, name: string): string {
  const value = container.querySelector(`dd[data-fact='${name}']`);
  return value === null ? "" : flat(value);
}

function cells(container: HTMLElement, period: string): string[] {
  return [...container.querySelectorAll(`tr[data-period='${period}'] td`)].map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

function lineText(container: HTMLElement): string | undefined {
  const lines = container.querySelectorAll(".kw-ov-line:not([data-tone='ask'])");
  return lines[lines.length - 1]?.textContent ?? undefined;
}

function type_(container: HTMLElement, value: string): void {
  const input = container.querySelector(".kw-ov-draft input") as HTMLInputElement;
  fireEvent.input(input, { target: { value } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
}

function choose(container: HTMLElement, key: string): void {
  fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key });
}

function buttonWords(card: HTMLElement): string[] {
  return [...card.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

describe("the creature pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(creaturePane);
  });
});
