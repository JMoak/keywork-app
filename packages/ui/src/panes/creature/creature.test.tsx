import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { mountPane, settle } from "../overview/testing.tsx";
import { skinIds } from "../stead/habitat-render.ts";
import {
  badModelReference,
  deleteTitle,
  doesNotUndoLine,
  goesLine,
  goneLine,
  noChoresToPause,
  noVerbYetLine,
  pausedLine,
  renamedLine,
  resumedLine,
  staysLine,
} from "./copy.ts";
import { type CreatureSpec, creaturePane, slugFor } from "./index.tsx";
import {
  type CreatureHarness,
  type CreatureStaging,
  creatureHarness,
  envelope,
  flat,
  lastCall,
  ranchCalls,
  wrenDetail,
  wrenRoutines,
} from "./testing.ts";

afterEach(cleanup);

const spec: CreatureSpec = { kind: "creature", slug: "wren" };

describe("the creature profile", () => {
  it("names the bare host plainly instead of pretending it is sealed", async () => {
    const { container } = await open({ detail: { ...wrenDetail(), workshop: "host" } });
    expect(fact(container, "workshop")).toBe("host · the bare node, unconfined");
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
      `body for Wren · ${skinIds()
        .map((id, index) => `${index + 1} ${id}`)
        .join(" · ")} · any other key cancels`,
    );
    choose(container, "2");
    await settle();
    expect(lastCall(harness.served, "PATCH")?.body).toEqual({ body: { skin: skinIds()[1] } });
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

  it("opens the home's creature when summoned from a window that does not know it", async () => {
    const harness = creatureHarness();
    const { container } = mountPane(creaturePane.component, { kind: "creature" }, harness.shell);
    await settle();
    await settle();
    expect(container.querySelector(".kw-creature-name")?.textContent).toBe("Wren");
    expect(container.querySelector(".kw-empty")).toBeNull();
    harness.dispose();
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
  mounted.act("creature.profile");
  return { ...mounted, harness };
}

function fact(container: HTMLElement, name: string): string {
  const value = container.querySelector(`dd[data-fact='${name}']`);
  return value === null ? "" : flat(value);
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
