import type {
  BotSummary,
  BusEnvelope,
  CreatureSummary,
  SessionSummary,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { hueStop } from "../chrome/pane-frame.tsx";
import { Composer } from "../composer/composer.tsx";
import type { HostPort } from "../host/port.ts";
import { keymapFromConfig } from "../keys/config.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { createKeyboardScope, KeyboardScopeProvider } from "../shell/keyboard-claim.ts";
import { inertFeed, inertTrust } from "../shell/trust.test.ts";
import { createOnboardingController, type OnboardingController } from "./controller.ts";
import {
  connectKey,
  inheritWord,
  installStep,
  localFirstWord,
  madeLine,
  nameRefused,
  nothingReachableLine,
  notMadeLine,
  noWorkshopsServed,
  substrateWords,
  surpriseWord,
  threadLine,
  threadWaitsLine,
  workshopRaisedLine,
  workshopRefusedLine,
} from "./copy.ts";
import {
  at,
  cloudConnected,
  creatureMade,
  creatureOpened,
  creaturesListed,
  inheritsKeyworksDefault,
  inheritsRefused,
  inheritsResolved,
  localModels,
  nameTakenOnNode,
  noModels,
  nothingConnected,
  noWorkshops,
  sbxWorkshops,
  slugTaken,
  workshopsHeldBy,
  workshopsUnserved,
} from "./fixtures.ts";
import {
  cloudStandingOf,
  OnboardingCard,
  OnboardingOnTheStead,
  onboardingAction,
  onboardingSeamsOf,
} from "./index.tsx";
import { introductionFrame } from "./introduction.ts";
import { type CloudStanding, nothingLocal } from "./models.ts";
import { proposeNames } from "./names.ts";
import {
  firstRunWanted,
  namesLeft,
  type Onboarding,
  type OnboardingSeams,
  type OnboardingStorage,
  onboardingStorageKey,
  rememberedOnboarding,
  seedForCoat,
  startOnboarding,
} from "./onboarding.ts";
import {
  type CreatureRequest,
  creaturesOnTheStead,
  type OnboardingClient,
  refusalOf,
} from "./requests.ts";
import type { ServerReading } from "./workshop.ts";

const workspace = "C:/src/stead";
const t0 = Date.parse(at);
const names = proposeNames(workspace);
const localPolicy = {
  strong: { provider: "ollama", model: "qwen3:32b" },
  loop: { provider: "ollama", model: "qwen3:32b" },
  vision: { provider: "ollama", model: "moondream" },
};

afterEach(cleanup);

describe("first-run onboarding on the stead", () => {
  it("walks name, skin, workshop and models on the keyboard, a text golden per step, and makes the creature from what was kept", async () => {
    const run = harness();
    await flush();
    expect(textOf(run.container)).toMatchSnapshot("1 name");
    typeName(run.container, "Wren");
    await flush();
    expect(textOf(run.container)).toMatchSnapshot("2 skin");
    key(run.container, "Enter");
    await flush();
    expect(textOf(run.container)).toMatchSnapshot("3 workshop");
    key(run.container, "Enter");
    await flush();
    expect(textOf(run.container)).toMatchSnapshot("4 models");
    expect(cursorLabel(run.container)).toBe(localFirstWord);
    key(run.container, "Enter");
    await flush();
    expect(textOf(run.container)).toMatchSnapshot("5 made");
    expect(run.created).toEqual([
      { name: "Wren", skin: "kid", models: localPolicy, substrate: "host" },
    ]);
    expect(run.read).toEqual(["wren"]);
    expect(run.seated()).toBe(1);
    expect(run.injected).toEqual([
      ["s-conv", introductionFrame({ name: "Wren", workspace, named: true, names })],
    ]);
    expect(run.opened).toEqual(["s-conv"]);
    expect(linesOf(run.container)).toContain(threadLine("Wren"));
    expect(rememberedOnboarding(run.storage, onboardingStorageKey(workspace)).made).toEqual({
      slug: "wren",
      at,
    });
  });

  it("with Osk on the stead, proposes names no creature wears, shows the first free coat and wears it with its seed", async () => {
    const run = harness({ creatures: creaturesListed([{ slug: "osk", name: "Osk", seed: 0 }]) });
    await flush();
    const proposals = run.onboarding.proposals();
    expect(proposals?.names).toHaveLength(3);
    expect(proposals?.names).not.toContain("Osk");
    const listed = creaturesOnTheStead(creaturesListed([{ slug: "osk", name: "Osk", seed: 0 }]));
    expect(proposals?.names).toEqual(proposeNames(workspace, namesLeft(listed)));
    expect(proposals?.coat).toBe(hueStop(1));
    expect(run.onboarding.coat()).toBe(hueStop(1));
    for (const _ of ["name", "skin", "workshop", "models"]) {
      key(run.container, "Escape");
      await flush();
    }
    const made = run.created[0]?.name ?? "";
    expect(made).not.toBe("Osk");
    expect(proposals?.names).toContain(made);
    expect(run.patched).toEqual([[made.toLowerCase(), seedForCoat(hueStop(1))]]);
    expect(run.patched[0]?.[1]).toBe(1);
  });

  it("with two creatures on the stead, takes the third coat and a third name; the fourth creature wraps to the first coat", async () => {
    const two = harness({
      creatures: creaturesListed([
        { slug: "osk", name: "Osk", seed: 0 },
        { slug: "tam", name: "Tam", seed: 1 },
      ]),
    });
    await flush();
    expect(two.onboarding.proposals()?.names).not.toContain("Osk");
    expect(two.onboarding.proposals()?.names).not.toContain("Tam");
    expect(two.onboarding.coat()).toBe(hueStop(2));
    for (const _ of ["name", "skin", "workshop", "models"]) {
      key(two.container, "Escape");
      await flush();
    }
    expect(two.patched.map(([, seed]) => seed)).toEqual([2]);

    const three = harness({
      creatures: creaturesListed([
        { slug: "osk", name: "Osk", seed: 0 },
        { slug: "tam", name: "Tam", seed: 1 },
        { slug: "quin", name: "Quin", seed: 2 },
      ]),
    });
    await flush();
    expect(three.onboarding.coat()).toBe(hueStop(0));
  });

  it("skips every step with esc and still makes a working creature: the first proposed name, the tinkerer, the host workshop, inherit everywhere", async () => {
    const run = harness();
    await flush();
    fireEvent.keyDown(inputOf(run.container), { key: "Escape" });
    await flush();
    expect(stepMarks(run.container)).toEqual(["name ·", "skin", "workshop", "models"]);
    key(run.container, "Escape");
    await flush();
    key(run.container, "Escape");
    await flush();
    key(run.container, "Escape");
    await flush();
    const first = names[0] ?? "";
    expect(run.created).toEqual([{ name: first, skin: "kid", substrate: "host" }]);
    expect(run.injected).toHaveLength(1);
    expect(run.injected[0]?.[1]).toContain("one question and nothing else");
    expect(run.injected[0]?.[1]).toContain(`${names[0]}, ${names[1]} and ${names[2]}`);
    expect(run.opened).toEqual(["s-conv"]);
  });

  it("takes a proposed name by its digit while the field is empty, and a accepts the rest", async () => {
    const run = harness();
    await flush();
    fireEvent.keyDown(inputOf(run.container), { key: "2" });
    await flush();
    expect(stepMarks(run.container)).toEqual(["name █", "skin", "workshop", "models"]);
    key(run.container, "a");
    await flush();
    expect(run.created).toEqual([{ name: names[1], skin: "kid", substrate: "host" }]);
  });

  it("keeps the proposed name when enter lands on the untouched field, as its line says", async () => {
    const run = harness();
    await flush();
    fireEvent.submit(inputOf(run.container).closest("form") as HTMLFormElement);
    await flush();
    expect(stepMarks(run.container)).toEqual(["name █", "skin", "workshop", "models"]);
    expect(linesOf(run.container)).not.toContain(nameRefused);
    key(run.container, "a");
    await flush();
    expect(run.created).toEqual([{ name: names[0], skin: "kid", substrate: "host" }]);
  });

  it("refuses a name outside one to sixty-four characters and stays on the name step", async () => {
    const run = harness();
    await flush();
    typeName(run.container, "w".repeat(65));
    await flush();
    expect(linesOf(run.container)).toContain(nameRefused);
    expect(currentStep(run.container)).toBe("name");
    expect(run.created).toEqual([]);
  });

  it("offers keywork connect when nothing is reachable, never requires a cloud key, and lets the introduction wait", async () => {
    const run = harness({ models: noModels });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(factsOf(run.container)).toEqual([
      nothingLocal,
      "cloud: unknown until the first turn answers",
      nothingReachableLine,
      connectKey,
    ]);
    expect(choiceLabels(run.container)).toEqual([inheritWord]);
    expect(textOf(run.container)).toMatchSnapshot("4 models, nothing reachable");
    key(run.container, "c");
    expect(run.panes).toEqual(["connect"]);
    key(run.container, "Enter");
    await flush();
    expect(run.created).toEqual([{ name: "Wren", skin: "kid", substrate: "host" }]);
    expect(run.injected).toEqual([]);
    expect(run.opened).toEqual(["s-conv"]);
    expect(linesOf(run.container)).toContain(threadWaitsLine("Wren"));
  });

  it("counts a cloud model that answered before as reachable, with the policy inheriting it", async () => {
    const run = harness({
      models: noModels,
      cloud: { kind: "answering", model: "anthropic/claude-sonnet-4-5" },
    });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "a");
    await flush();
    expect(run.created).toEqual([{ name: "Wren", skin: "kid", substrate: "host" }]);
    expect(run.injected).toHaveLength(1);
    expect(linesOf(run.container)).toContain(threadLine("Wren"));
  });

  it("counts a cloud provider connected through keywork as reachable on a fresh workspace, offers inherit, and the creature introduces itself", async () => {
    const run = harness({ models: cloudConnected });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(factsOf(run.container)).toEqual([
      nothingLocal,
      "cloud: openrouter connected with `keywork connect`",
    ]);
    expect(choiceLabels(run.container)).toEqual([inheritWord]);
    key(run.container, "Enter");
    await flush();
    expect(run.created).toEqual([{ name: "Wren", skin: "kid", substrate: "host" }]);
    expect(run.injected).toEqual([
      ["s-conv", introductionFrame({ name: "Wren", workspace, named: true, names })],
    ]);
    expect(run.opened).toEqual(["s-conv"]);
    expect(run.panes).toEqual([]);
    expect(linesOf(run.container)).toContain(threadLine("Wren"));
  });

  it("counts an unverified provider as connected and promises the introduction through inherits.strong when it resolves", async () => {
    const run = harness({ models: inheritsResolved });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(factsOf(run.container)).toEqual([
      nothingLocal,
      "cloud: openrouter connected with `keywork connect`, not yet answered",
    ]);
    key(run.container, "Enter");
    await flush();
    expect(run.injected).toHaveLength(1);
    expect(run.opened).toEqual(["s-conv"]);
    expect(linesOf(run.container)).toContain(threadLine("Wren", "openrouter/openai/gpt-5-mini"));
  });

  it("accepts every step with enter on a node whose only model is keywork's OpenRouter default and injects the introduction", async () => {
    const run = harness({ models: inheritsKeyworksDefault });
    await flush();
    fireEvent.submit(inputOf(run.container).closest("form") as HTMLFormElement);
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(run.created).toEqual([{ name: names[0], skin: "kid", substrate: "host" }]);
    expect(run.injected).toHaveLength(1);
    expect(run.opened).toEqual(["s-conv"]);
    expect(linesOf(run.container)).toContain(
      threadLine(names[0] as string, "openrouter/openai/gpt-5-mini"),
    );
  });

  it("says in words why the introduction waits when inherits.strong resolves to a refusal", async () => {
    const run = harness({ models: inheritsRefused });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(run.created).toEqual([{ name: "Wren", skin: "kid", substrate: "host" }]);
    expect(run.injected).toEqual([]);
    expect(run.opened).toEqual(["s-conv"]);
    expect(linesOf(run.container)).toContain(
      threadWaitsLine("Wren", "no provider holds a credential for strong"),
    );
  });

  it("with no provider connected, c opens keywork connect in a terminal pane on the stead", async () => {
    const panes: unknown[] = [];
    const record = recorder();
    const storage = memoryStorage();
    const { container } = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={fakeShell({ creatures: 0, panes })}
        storage={storage}
        seams={{ client: fakeClient({ models: nothingConnected }, record), skins: ["kid"] }}
      />
    ));
    await flush();
    typeName(container, "Wren");
    await flush();
    key(container, "Enter");
    await flush();
    key(container, "Enter");
    await flush();
    expect(factsOf(container)).toEqual([
      nothingLocal,
      "cloud: unknown until the first turn answers",
      nothingReachableLine,
      connectKey,
    ]);
    key(container, "c");
    expect(panes).toEqual([{ kind: "terminal", mode: "bridge", verb: "connect" }]);
  });

  it("chooses a sealed microVM when this machine has sbx", async () => {
    const run = harness({ workshops: sbxWorkshops });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(choiceLabels(run.container)).toEqual([substrateWords.sbx, substrateWords.host]);
    expect(cursorLabel(run.container)).toBe(substrateWords.sbx);
    expect(factsOf(run.container)).toEqual([]);
    key(run.container, "Enter");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(run.created[0]?.substrate).toBe("sbx");
    expect(linesOf(run.container)).toContain(workshopRaisedLine("sbx"));
  });

  it("chooses the bare host with its limitation and the one install step when the node serves no workshops", async () => {
    const run = harness({ workshops: workshopsUnserved });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "Enter");
    await flush();
    expect(choiceLabels(run.container)).toEqual([substrateWords.host]);
    expect(subLines(run.container)).toEqual([noWorkshopsServed("this host serves no workshops")]);
    expect(factsOf(run.container)).toEqual([installStep]);
    expect(textOf(run.container)).toMatchSnapshot("3 workshop, bare host");
    key(run.container, "i");
    expect(run.panes).toEqual(["install"]);
    key(run.container, "a");
    await flush();
    expect(run.created).toEqual([{ name: "Wren", skin: "kid" }]);
    expect(linesOf(run.container)).toContain(workshopRefusedLine("this host serves no workshops"));
  });

  it("shows the portrait live: the skin under the cursor, and surprise me resolving to a registered skin", async () => {
    const run = harness({ skins: ["kid", "placeholder"] });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    expect(portraitSkin(run.container)).toBe("kid");
    key(run.container, "j");
    await flush();
    expect(portraitSkin(run.container)).toBe("placeholder");
    key(run.container, "j");
    await flush();
    expect(cursorLabel(run.container)).toBe(surpriseWord);
    const surprised = portraitSkin(run.container);
    expect(["kid", "placeholder"]).toContain(surprised);
    key(run.container, "Enter");
    await flush();
    expect(portraitSkin(run.container)).toBe(surprised);
    key(run.container, "a");
    await flush();
    expect(run.created[0]?.skin).toBe(surprised);
  });

  it("proposes no name whose slug owns a workshop on this node, read from each row's creature or its id, and makes the first proposal it kept", async () => {
    const [byCreature, byId] = names as [string, string, string];
    const owners = [byCreature.toLowerCase(), byId.toLowerCase()];
    const run = harness({ workshops: workshopsHeldBy([owners[0] ?? ""], [owners[1] ?? ""]) });
    await flush();
    const proposed = run.onboarding.proposals()?.names ?? [];
    expect(proposed).toHaveLength(3);
    expect(proposed).not.toContain(byCreature);
    expect(proposed).not.toContain(byId);
    expect(proposed).toEqual(proposeNames(workspace, namesLeft([], owners)));
    for (const _ of ["name", "skin", "workshop", "models"]) {
      key(run.container, "Escape");
      await flush();
    }
    expect(run.created.map((request) => request.name)).toEqual([proposed[0]]);
    expect(linesOf(run.container)[0]).toBe(madeLine(proposed[0] ?? ""));
  });

  it("when the node refuses a typed name as taken, says so, and backspace returns to the name step with the next free proposal, which it then makes", async () => {
    const taken = nameTakenOnNode("bea", "bea-dc1057");
    const run = harness({ refuse: (request) => (request.name === "Bea" ? taken : undefined) });
    await flush();
    typeName(run.container, "Bea");
    await flush();
    key(run.container, "a");
    await flush();
    expect(linesOf(run.container)).toEqual([notMadeLine(refusalOf(taken))]);
    key(run.container, "Backspace");
    await flush();
    expect(currentStep(run.container)).toBe("name");
    const next = run.onboarding.proposals()?.names ?? [];
    expect(next).toHaveLength(3);
    expect(next).not.toContain("Bea");
    expect(next).toEqual(proposeNames(workspace, namesLeft([], ["bea"])));
    key(run.container, "Escape");
    await flush();
    key(run.container, "a");
    await flush();
    expect(run.created.map((request) => request.name)).toEqual(["Bea", next[0]]);
    expect(linesOf(run.container)[0]).toBe(madeLine(next[0] ?? ""));
  });

  it("says a refusal plainly and backspace returns to the name", async () => {
    const run = harness({ creation: slugTaken });
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "a");
    await flush();
    expect(linesOf(run.container)).toEqual([notMadeLine("a bot already has the slug wren")]);
    expect(textOf(run.container)).toMatchSnapshot("not made");
    key(run.container, "Backspace");
    await flush();
    expect(currentStep(run.container)).toBe("name");
  });

  it("x says not now, remembers it, and the first run then stays quiet", async () => {
    const run = harness();
    await flush();
    typeName(run.container, "Wren");
    await flush();
    key(run.container, "x");
    await flush();
    expect(run.onboarding.phase()).toEqual({ kind: "closed" });
    expect(run.onboarding.act("keep")).toBe(false);
    const remembered = rememberedOnboarding(run.storage, onboardingStorageKey(workspace));
    expect(remembered.dismissedAt).toBe(at);
    expect(firstRunWanted({ trusted: true, creatures: [], remembered })).toBe(false);
    expect(run.created).toEqual([]);
  });

  it("wants the first run only on a trusted workspace whose GET /creatures answered and listed none", () => {
    const fresh = { trusted: true, creatures: [], remembered: {} };
    expect(firstRunWanted(fresh)).toBe(true);
    expect(firstRunWanted({ ...fresh, trusted: false })).toBe(false);
    expect(firstRunWanted({ ...fresh, creatures: undefined })).toBe(false);
    expect(firstRunWanted({ ...fresh, creatures: [creature()] })).toBe(false);
    expect(firstRunWanted({ ...fresh, remembered: { made: { slug: "wren", at } } })).toBe(false);
  });

  it("reads the cloud standing from the newest session that named a model", () => {
    expect(cloudStandingOf([])).toEqual({ kind: "unknown" });
    expect(
      cloudStandingOf([
        row("s1", "2026-11-05T09:00:00.000Z", "openai/gpt-5"),
        row("s2", "2026-11-05T10:00:00.000Z", "anthropic/claude-sonnet-4-5"),
        row("s3", "2026-11-05T11:00:00.000Z", undefined),
      ]),
    ).toEqual({ kind: "answering", model: "anthropic/claude-sonnet-4-5" });
  });
});

describe("the card on the stead", () => {
  it("waits for an explicit onboarding request when embedded in Keywork", async () => {
    const storage = memoryStorage();
    const seams = fakeSeams({}, recorder(), storage);
    const shell = fakeShell({ creatures: 0 });
    const { container } = render(() => (
      <OnboardingOnTheStead shell={shell} storage={storage} seams={seams} />
    ));
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
    shell.onboarding.request();
    await flush();
    expect(currentStep(container)).toBe("name");
    fireEvent.keyDown(cardOf(container), { key: "x" });
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
  });

  it("mounts when the first run is wanted, stays away once a creature exists, and comes back on request", async () => {
    const record = recorder();
    const storage = memoryStorage();
    const seams = fakeSeams({}, record, storage);
    const shell = fakeShell({ creatures: 1 });
    const quiet = render(() => (
      <OnboardingOnTheStead automatic shell={shell} storage={storage} seams={seams} />
    ));
    await flush();
    expect(quiet.container.querySelector(".kw-onboard")).toBeNull();
    shell.onboarding.request();
    await flush();
    expect(quiet.container.querySelector(".kw-onboard")).not.toBeNull();
    fireEvent.keyDown(cardOf(quiet.container), { key: "x" });
    await flush();
    expect(quiet.container.querySelector(".kw-onboard")).toBeNull();
    cleanup();
    const wanted = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={fakeShell({ creatures: 0 })}
        storage={memoryStorage()}
        seams={fakeSeams({}, recorder(), memoryStorage())}
      />
    ));
    await flush();
    expect(wanted.container.querySelector(".kw-onboard")).not.toBeNull();
    expect(currentStep(wanted.container)).toBe("name");
    cleanup();
    const untrusted = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={fakeShell({ creatures: 0, trusted: false })}
        storage={memoryStorage()}
        seams={fakeSeams({}, recorder(), memoryStorage())}
      />
    ));
    await flush();
    expect(untrusted.container.querySelector(".kw-onboard")).toBeNull();
  });

  it("wants a creature, not a bot: a workspace with a plain bot and no creature shows the card, one whose listing is refused does not", async () => {
    const withBot = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={fakeShell({ creatures: 0, bots: [plainBot("reviewer")] })}
        storage={memoryStorage()}
        seams={fakeSeams({}, recorder(), memoryStorage())}
      />
    ));
    await flush();
    expect(withBot.container.querySelector(".kw-onboard")).not.toBeNull();
    expect(currentStep(withBot.container)).toBe("name");
    cleanup();
    const refused = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={fakeShell({ creatures: "refused" })}
        storage={memoryStorage()}
        seams={fakeSeams({}, recorder(), memoryStorage())}
      />
    ));
    await flush();
    expect(refused.container.querySelector(".kw-onboard")).toBeNull();
  });

  it("lists again when a creature changes on the wire, so a creature made elsewhere closes the door", async () => {
    const creatures: CreatureSummary[] = [];
    const shell = fakeShell({ creatures });
    const { container } = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={shell}
        storage={memoryStorage()}
        seams={fakeSeams({}, recorder(), memoryStorage())}
      />
    ));
    await flush();
    expect(container.querySelector(".kw-onboard")).not.toBeNull();
    creatures.push(creature());
    emitTo(shell, [
      {
        id: 1,
        ts: at,
        sessionId: "",
        type: "creature.changed",
        payload: { slug: "wren", change: "created" },
      } as BusEnvelope,
    ]);
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
  });

  it("keeps the made card up after the stead has seated the creature, until enter closes it", async () => {
    const record = recorder();
    const storage = memoryStorage();
    const creatures: CreatureSummary[] = [];
    const shell = fakeShell({ creatures });
    const { container } = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={shell}
        storage={storage}
        seams={fakeSeams({}, record, storage, () => void creatures.push(creature()))}
      />
    ));
    await flush();
    typeName(container, "Wren");
    await flush();
    key(container, "a");
    await flush();
    expect(creatures).toHaveLength(1);
    expect(linesOf(container)[0]).toBe("Wren is made · its workshop rises on the stead");
    key(container, "Enter");
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
  });

  it("owns the keyboard once made: focus lands on the card and enter closes it", async () => {
    const record = recorder();
    const storage = memoryStorage();
    const creatures: CreatureSummary[] = [];
    const shell = fakeShell({ creatures });
    const { container } = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={shell}
        storage={storage}
        seams={fakeSeams({}, record, storage, () => void creatures.push(creature()))}
      />
    ));
    await flush();
    typeName(container, "Wren");
    await flush();
    const elsewhere = document.createElement("textarea");
    document.body.append(elsewhere);
    elsewhere.focus();
    key(container, "a");
    await flush();
    expect(linesOf(container)[0]).toBe("Wren is made · its workshop rises on the stead");
    expect(document.activeElement).toBe(cardOf(container));
    expect(shell.onboarding.card()).toBe(cardOf(container));
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
    expect(shell.onboarding.card()).toBeUndefined();
    elsewhere.remove();
  });

  it("keeps the keyboard when a thread composer mounts and focuses itself mid-card, and enter still closes it", async () => {
    const record = recorder();
    const storage = memoryStorage();
    const creatures: CreatureSummary[] = [];
    const shell = fakeShell({ creatures });
    const keyboard = createKeyboardScope();
    const { container } = render(() => (
      <KeyboardScopeProvider value={keyboard}>
        <OnboardingOnTheStead
          automatic
          shell={shell}
          storage={storage}
          seams={fakeSeams({}, record, storage, () => void creatures.push(creature()))}
        />
      </KeyboardScopeProvider>
    ));
    await flush();
    typeName(container, "Wren");
    await flush();
    key(container, "a");
    await flush();
    expect(document.activeElement).toBe(cardOf(container));
    let composerInput: HTMLTextAreaElement | undefined;
    const thread = render(() => (
      <KeyboardScopeProvider value={keyboard}>
        <Composer
          queue={[]}
          onSteer={() => undefined}
          onQueue={() => undefined}
          onInterrupt={() => undefined}
          inputRef={(input) => {
            composerInput = input;
          }}
        />
      </KeyboardScopeProvider>
    ));
    composerInput?.focus();
    await flush();
    expect(document.activeElement).toBe(cardOf(container));
    queueMicrotask(() => composerInput?.focus());
    await flush();
    expect(document.activeElement).toBe(cardOf(container));
    fireEvent.keyDown(document.activeElement as Element, { key: "Enter" });
    await flush();
    expect(container.querySelector(".kw-onboard")).toBeNull();
    composerInput?.focus();
    expect(document.activeElement).toBe(composerInput);
    thread.unmount();
  });

  it("takes the stead pane's own cursor and open actions while it is showing", async () => {
    const record = recorder();
    const storage = memoryStorage();
    const shell = fakeShell({ creatures: 0 });
    const { container } = render(() => (
      <OnboardingOnTheStead
        automatic
        shell={shell}
        storage={storage}
        seams={fakeSeams({}, record, storage)}
      />
    ));
    await flush();
    expect(shell.onboarding.take("stead.open")).toBe(false);
    typeName(container, "Wren");
    await flush();
    expect(shell.onboarding.take("stead.down")).toBe(true);
    expect(cursorLabel(container)).toBe(surpriseWord);
    expect(shell.onboarding.take("stead.up")).toBe(true);
    expect(shell.onboarding.take("stead.open")).toBe(true);
    await flush();
    expect(currentStep(container)).toBe("workshop");
    expect(shell.onboarding.take("stead.approve")).toBe(false);
    key(container, "x");
    await flush();
    expect(shell.onboarding.take("stead.down")).toBe(false);
  });

  it("injects the introduction as the creature's frame, never as a keeper prompt", async () => {
    const sent: unknown[] = [];
    const shell = {
      ...fakeShell({ creatures: 0 }),
      client: {
        inject: async (sessionId: string, injection: unknown) => {
          sent.push([sessionId, injection]);
          return "started";
        },
      },
    } as unknown as ShellSeams;
    await onboardingSeamsOf(shell, memoryStorage()).inject("s-conv", "the frame", "wren");
    expect(sent).toEqual([
      ["s-conv", { text: "the frame", client: "stead-onboarding", frame: { creature: "wren" } }],
    ]);
  });

  it("answers to leader 1 everywhere and to /creature.new, and asks for the stead", () => {
    expect(onboardingAction.chords).toBe("leader 1");
    expect(keymapFromConfig().describe("onboarding.start")).toBe("ctrl+k 1");
    expect(onboardingAction.command?.name).toBe("creature.new");
    expect(onboardingAction.command?.label).toBe("new creature");
    const summoned: string[] = [];
    const onboarding = createOnboardingController();
    onboardingAction.invoke({
      requestOnboarding: onboarding.request,
      summon: (kind: string) => summoned.push(kind),
    } as never);
    expect(onboarding.requested()).toBe(true);
    expect(summoned).toEqual(["stead"]);
  });
});

interface Answers {
  workshops?: ServerReading;
  models?: ServerReading;
  creation?: ServerReading;
  refuse?: (request: CreatureRequest) => ServerReading | undefined;
  opened?: ServerReading;
  cloud?: CloudStanding;
  skins?: readonly string[];
  creatures?: ServerReading;
}

interface Record {
  created: CreatureRequest[];
  patched: [string, number][];
  read: string[];
  injected: [string, string][];
  opened: string[];
  panes: string[];
  seats: number;
}

interface Harness extends Record {
  container: HTMLElement;
  onboarding: Onboarding;
  storage: OnboardingStorage;
  seated(): number;
}

function recorder(): Record {
  return { created: [], patched: [], read: [], injected: [], opened: [], panes: [], seats: 0 };
}

function memoryStorage(): OnboardingStorage {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
  };
}

function fakeClient(answers: Answers, record: Record): OnboardingClient {
  const listing = answers.creatures;
  return {
    workshops: async () => answers.workshops ?? noWorkshops,
    models: async () => answers.models ?? localModels,
    ...(listing !== undefined && { creatures: async () => listing }),
    createCreature: async (request) => {
      record.created.push(request);
      return (
        answers.refuse?.(request) ??
        answers.creation ??
        creatureMade(request.name, request.name.toLowerCase())
      );
    },
    patchCreature: async (slug, patch) => {
      record.patched.push([slug, patch.body.seed]);
      return creatureMade(slug, slug);
    },
    createWorkshop: async () => {
      throw new Error("onboarding raises the workshop through POST /creatures, never apart");
    },
    readCreature: async (slug) => {
      record.read.push(slug);
      return answers.opened ?? creatureOpened("s-conv", slug);
    },
  };
}

function fakeSeams(
  answers: Answers,
  record: Record,
  storage: OnboardingStorage,
  onSeat: () => void = () => undefined,
): OnboardingSeams {
  return {
    client: fakeClient(answers, record),
    workspace,
    cloud: () => answers.cloud ?? { kind: "unknown" },
    seat: async () => {
      record.seats += 1;
      onSeat();
    },
    inject: async (sessionId, text) => {
      record.injected.push([sessionId, text]);
      return "started";
    },
    openThread: (sessionId) => void record.opened.push(sessionId),
    openConnect: () => void record.panes.push("connect"),
    openInstall: () => void record.panes.push("install"),
    storage,
    skins: answers.skins ?? ["kid"],
    now: () => t0,
  };
}

function harness(answers: Answers = {}): Harness {
  const record = recorder();
  const storage = memoryStorage();
  const onboarding = createRoot(() => startOnboarding(fakeSeams(answers, record, storage)));
  const { container } = render(() => (
    <OnboardingCard onboarding={onboarding} workspace={workspace} />
  ));
  return { ...record, container, onboarding, storage, seated: () => record.seats };
}

function fakeShell(facts: {
  creatures: number | CreatureSummary[] | "refused";
  bots?: BotSummary[];
  trusted?: boolean;
  panes?: unknown[];
}): ShellSeams & { onboarding: OnboardingController } {
  const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
  const creatures = async () => {
    if (facts.creatures === "refused") return { refused: "unserved", detail: "not served" };
    return typeof facts.creatures === "number"
      ? Array.from({ length: facts.creatures }, creature)
      : [...facts.creatures];
  };
  return {
    onboarding: createOnboardingController(),
    trust: inertTrust(facts.trusted === false ? { kind: "undecided", root: "C:/work" } : undefined),
    feed: {
      ...inertFeed(),
      subscribe: (listener: (batch: readonly BusEnvelope[]) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (batch: readonly BusEnvelope[]) => {
      for (const listener of listeners) listener(batch);
    },
    store: {
      state: { summaries: [] },
      surfaces: {
        state: { bots: facts.bots ?? [], loaded: { bots: true } },
        refetch: async () => undefined,
      },
    },
    workspace,
    host: {} as HostPort,
    client: { creatures },
    sessions: { openSession: () => undefined },
    openPane: (pane: unknown) => void facts.panes?.push(pane),
  } as unknown as ShellSeams & { onboarding: OnboardingController };
}

function emitTo(shell: ShellSeams, batch: readonly BusEnvelope[]): void {
  (shell as unknown as { emit: (batch: readonly BusEnvelope[]) => void }).emit(batch);
}

function creature(): CreatureSummary {
  return { slug: "wren", name: "Wren", created: at } as CreatureSummary;
}

function plainBot(name: string): BotSummary {
  return { name, sigil: name[0] ?? "b", source: "project", sessions: 0 } as BotSummary;
}

function row(id: string, lastActivityAt: string, model: string | undefined): SessionSummary {
  return {
    id,
    title: id,
    createdAt: lastActivityAt,
    lastActivityAt,
    messageCount: 1,
    ...(model !== undefined && { model }),
  };
}

const flush = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

function cardOf(container: HTMLElement): HTMLElement {
  const card = container.querySelector<HTMLElement>(".kw-onboard");
  if (card === null) throw new Error("no onboarding card");
  return card;
}

function key(container: HTMLElement, name: string): void {
  fireEvent.keyDown(cardOf(container), { key: name });
}

function inputOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(".kw-ov-draft input");
  if (input === null) throw new Error("no name field");
  return input;
}

function typeName(container: HTMLElement, text: string): void {
  const input = inputOf(container);
  fireEvent.input(input, { target: { value: text } });
  const form = input.closest("form");
  if (form === null) throw new Error("no name form");
  fireEvent.submit(form);
}

function stepMarks(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-onboard-step")].map((step) =>
    (step.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

function currentStep(container: HTMLElement): string | undefined {
  return container
    .querySelector(".kw-onboard-step[data-current]")
    ?.textContent?.trim()
    .split(" ")[0];
}

function choiceLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-onboard-choices .kw-ov-name")].map(
    (name) => name.textContent?.trim() ?? "",
  );
}

function cursorLabel(container: HTMLElement): string | undefined {
  return container.querySelector(".kw-ov-row[data-cursor] .kw-ov-name")?.textContent?.trim();
}

function subLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-sub")].map((line) => line.textContent ?? "");
}

function factsOf(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-onboard-facts li")].map(
    (fact) => fact.textContent ?? "",
  );
}

function linesOf(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-onboard-line")].map((line) => line.textContent ?? "");
}

function portraitSkin(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>(".kw-onboard-portrait")?.dataset.skin;
}

function textOf(container: HTMLElement): string {
  const card = cardOf(container);
  const lines: string[] = [];
  for (const element of card.querySelectorAll<HTMLElement>("*")) {
    const line = lineOf(element);
    if (line !== undefined) lines.push(line);
  }
  return lines.join("\n");
}

function lineOf(element: HTMLElement): string | undefined {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (element.classList.contains("kw-onboard-title")) return text;
  if (element.classList.contains("kw-onboard-step")) {
    return `${element.hasAttribute("data-current") ? "> " : "  "}${text}`;
  }
  if (element.classList.contains("kw-onboard-portrait"))
    return `[portrait ${element.dataset.skin}]`;
  if (element.classList.contains("kw-onboard-ask")) return text;
  if (element.classList.contains("kw-ov-draft")) {
    const input = element.querySelector("input");
    return `${text} ▏${input?.value === "" ? input.placeholder : (input?.value ?? "")}`;
  }
  if (element.classList.contains("kw-ov-row")) {
    const parts = [".kw-ov-mark", ".kw-ov-name", ".kw-ov-aside"]
      .map((part) => element.querySelector(part)?.textContent?.trim() ?? "")
      .filter((part) => part !== "");
    return `${element.hasAttribute("data-cursor") ? "> " : "  "}${parts.join(" ")}`;
  }
  if (element.classList.contains("kw-ov-sub")) return `    ${text}`;
  if (element.closest(".kw-onboard-facts") !== null && element.tagName === "LI") return `  ${text}`;
  if (element.classList.contains("kw-onboard-line")) return text;
  return undefined;
}
