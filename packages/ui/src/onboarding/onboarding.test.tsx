import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostPort } from "../host/port.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { reducedMotionQuery } from "../panes/stead/painter.ts";
import { inertFeed, inertTrust } from "../shell/trust-testing.ts";
import { createOnboardingController } from "./controller.ts";
import { nextCoat, nextLook } from "./copy.ts";
import { at, creatureMade, creatureOpened, localModels, noWorkshops } from "./fixtures.ts";
import { OnboardingOnTheStead } from "./index.tsx";
import { proposeNames } from "./names.ts";
import { freeCoat, type OnboardingSeams, seedForCoat } from "./onboarding.ts";
import type { CreatureRequest, OnboardingClient } from "./requests.ts";
import { offeredSkins } from "./skins.ts";
import type { ServerReading } from "./workshop.ts";

const workspace = "C:/src/stead";
const proposedName = proposeNames(workspace)[0] ?? "";
const lastOffered = offeredSkins().at(-1) ?? "";
const hatchFrames = ["crack", "split", "glow", "open"];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the hatching stage", () => {
  it("on a fresh stage, hatching and then enter makes exactly one creature with the proposed name, the hatched look, the coat, and the proposed workshop and model policy", async () => {
    const stage = await staged();
    press(stage.root, "Enter");
    await settle();
    const name = nameFieldOf(stage.root);
    expect(name.value).toBe(proposedName);
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, proposedName.length]);
    press(name, "Enter");
    await settle();
    expect(stage.created).toEqual([{ name: proposedName, skin: lastOffered, substrate: "host" }]);
    expect(stage.patched).toEqual([[proposedName.toLowerCase(), seedForCoat(freeCoat([]))]]);
  });

  it("enter pressed before the proposals are ready makes nothing until they are, and exactly one creature after", async () => {
    const models = deferred<ServerReading>();
    const stage = await staged({ models: models.promise });
    press(stage.root, "Enter");
    press(stage.root, "Enter");
    await settle();
    expect(frameOf(stage.root)).toBe("glow");
    expect(stage.created).toEqual([]);
    models.resolve(localModels);
    await settle();
    expect(showsOf(stage.root)).toBe("creature");
    expect(stage.created).toEqual([]);
    press(nameFieldOf(stage.root), "Enter");
    press(nameFieldOf(stage.root), "Enter");
    await settle();
    expect(stage.created).toHaveLength(1);
  });

  it("with reduced motion goes from the egg to the creature without the crack frames", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === reducedMotionQuery,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const stage = await staged({ after: undefined });
    const frames = framesSeenOn(stage.root);
    expect(showsOf(stage.root)).toBe("egg");
    press(stage.root, "Enter");
    await settle();
    expect(showsOf(stage.root)).toBe("creature");
    expect(nameFieldOf(stage.root).value).toBe(proposedName);
    expect(frames().filter((frame) => hatchFrames.includes(frame))).toEqual([]);
  });

  it("by pointer alone, hatching, changing who and the colour, and keeping asks for the same creature the keys would", async () => {
    const byKeys = await staged();
    press(byKeys.root, "Enter");
    await settle();
    for (const key of ["ArrowRight", "ArrowUp", "Enter"]) press(nameFieldOf(byKeys.root), key);
    await settle();
    cleanup();

    const byPointer = await staged();
    fireEvent.click(byPointer.root.querySelector(".kw-hatch-egg") as Element);
    await settle();
    for (const control of [nextLook, nextCoat, "enter keeps"]) pressOn(byPointer.root, control);
    await settle();

    expect(byPointer.created).toEqual(byKeys.created);
    expect(byPointer.patched).toEqual(byKeys.patched);
    expect(byPointer.created).toHaveLength(1);
    expect(byPointer.created[0]?.skin).not.toBe(lastOffered);
    expect(byPointer.patched[0]?.[1]).not.toBe(seedForCoat(freeCoat([])));
  });
});

interface Answers {
  readonly models?: Promise<ServerReading>;
  readonly after?: OnboardingSeams["after"];
}

interface Staged {
  readonly root: HTMLElement;
  readonly created: CreatureRequest[];
  readonly patched: [string, number][];
}

async function staged(answers: Answers = {}): Promise<Staged> {
  const created: CreatureRequest[] = [];
  const patched: [string, number][] = [];
  const client: OnboardingClient = {
    workshops: async () => noWorkshops,
    models: () => answers.models ?? Promise.resolve(localModels),
    creatures: async () => ({ status: 200, body: { creatures: [] } }),
    createCreature: async (request) => {
      created.push(request);
      return creatureMade(request.name, request.name.toLowerCase());
    },
    patchCreature: async (slug, patch) => {
      patched.push([slug, patch.body.seed]);
      return creatureMade(slug, slug);
    },
    createWorkshop: async () => {
      throw new Error("the stage raises the workshop through POST /creatures, never apart");
    },
    readCreature: async (slug) => creatureOpened("s-conv", slug),
  };
  const seams: Partial<OnboardingSeams> = {
    client,
    workspace,
    cloud: () => ({ kind: "unknown" }),
    seat: async () => undefined,
    inject: async () => "started",
    openThread: () => undefined,
    openConnect: () => undefined,
    now: () => Date.parse(at),
    random: () => 0.99,
    after: "after" in answers ? answers.after : atOnce,
  };
  const { container } = render(() => (
    <OnboardingOnTheStead automatic shell={emptyStead()} storage={memoryStorage()} seams={seams} />
  ));
  await settle();
  const root = container.querySelector<HTMLElement>(".kw-hatch");
  if (root === null) throw new Error("the stage did not open on an empty stead");
  return { root, created, patched };
}

function atOnce(_ms: number, run: () => void): () => void {
  run();
  return () => undefined;
}

function emptyStead(): ShellSeams {
  return {
    onboarding: createOnboardingController(),
    trust: inertTrust(),
    feed: inertFeed(),
    store: {
      state: { summaries: [] },
      surfaces: { state: { bots: [], loaded: { bots: true } }, refetch: async () => undefined },
    },
    workspace,
    host: {} as HostPort,
    client: { creatures: async () => [] },
    sessions: { openSession: () => undefined },
    openPane: () => undefined,
  } as unknown as ShellSeams;
}

function memoryStorage(): NonNullable<OnboardingSeams["storage"]> {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
  };
}

function deferred<Value>(): { promise: Promise<Value>; resolve(value: Value): void } {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function press(target: Element, key: string): void {
  fireEvent.keyDown(target, { key });
}

function pressOn(root: HTMLElement, named: string): void {
  const control = [...root.querySelectorAll("button")].find(
    (button) => (button.getAttribute("aria-label") ?? button.textContent) === named,
  );
  if (control === undefined) throw new Error(`nothing to press on the stage: ${named}`);
  fireEvent.click(control);
}

function nameFieldOf(root: HTMLElement): HTMLInputElement {
  const field = root.querySelector<HTMLInputElement>(".kw-hatch-name-field");
  if (field === null) throw new Error("no name field on the stage");
  return field;
}

function canvasOf(root: HTMLElement): HTMLCanvasElement {
  const canvas = root.querySelector("canvas");
  if (canvas === null) throw new Error("no picture on the stage");
  return canvas;
}

function showsOf(root: HTMLElement): string | undefined {
  return canvasOf(root).dataset.shows;
}

function frameOf(root: HTMLElement): string | undefined {
  return canvasOf(root).dataset.frame;
}

function framesSeenOn(root: HTMLElement): () => string[] {
  const canvas = canvasOf(root);
  const before: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) before.push(record.oldValue ?? "");
  });
  observer.observe(canvas, {
    attributes: true,
    attributeFilter: ["data-frame"],
    attributeOldValue: true,
  });
  return () => [...before, canvas.dataset.frame ?? ""];
}
