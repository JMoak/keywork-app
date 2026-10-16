import { ServerRefusal } from "@keywork-app/client";
import type { PermissionAsk } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  bunWorkspace,
  type FactsHarness,
  factsHarness,
  memoryStorage,
  type WorkspaceFixture,
} from "./facts.test.ts";
import { type Offer, offerKey } from "./proposal.ts";
import { type PostureRecord, postureStorageKey, rememberedPosture } from "./record.ts";
import { createTrustSetup, type TrustSetup, trustArrivals } from "./trust-setup.ts";

const key = postureStorageKey("C:/work");

interface Setup {
  readonly setup: TrustSetup;
  readonly harness: FactsHarness;
  readonly storage: Pick<Storage, "getItem" | "setItem">;
  record(): PostureRecord;
  relaunch(): Setup;
}

function setupOver(
  fixture: WorkspaceFixture,
  storage = memoryStorage(),
  harness = factsHarness(fixture),
): Setup {
  const setup = createRoot(() =>
    createTrustSetup({ client: harness.client, storage, storageKey: key }),
  );
  return {
    setup,
    harness,
    storage,
    record: () => rememberedPosture(storage, key),
    relaunch: () => setupOver(fixture, storage, harness),
  };
}

const playwright = {
  name: "playwright",
  state: "connected",
  enabled: true,
  toolCount: 12,
} as const;

const rules = (setup: TrustSetup): string[] =>
  setup.shown().map((offer) => `${offer.rule.action} ${offer.rule.resource}`);

const declinedMcp = {
  refused: "declined",
  detail:
    "an answered ask never records mcp filesystem__*; grants hold bash commands and MCP tools as an answer would remember them",
} as const;

async function begun(setup = setupOver(bunWorkspace)): Promise<Setup & { offers: Offer[] }> {
  await setup.setup.begin();
  return { ...setup, offers: [...setup.setup.shown()] };
}

function waitingFrom(storage: Pick<Storage, "getItem" | "setItem">, ...waiting: Offer[]): void {
  const record: PostureRecord = {
    version: 1,
    accepted: waiting.map((offer) => ({ rule: offer.rule, scope: offer.scope })),
  };
  storage.setItem(key, JSON.stringify(record));
}

describe("the first trust setup on a workspace", () => {
  it("proposes the whole posture and grants nothing until a rule is accepted", async () => {
    const { setup, harness } = await begun();
    expect(setup.focus()).toEqual([]);
    expect(rules(setup)).toEqual(["bash bun install *", "bash bun run *", "mcp filesystem__*"]);
    expect(new Set(harness.calls)).toEqual(
      new Set(["permissions", "document", "tree:", "file:package.json", "mcp", "bots"]),
    );
    expect(harness.grants).toEqual([]);
  });

  it("records a workspace rule through keywork the moment it is accepted, and waits for nothing", async () => {
    const { setup, harness, record, offers } = await begun();
    const [, run] = offers;
    if (run === undefined) throw new Error();
    expect(await setup.decide(run, "accepted")).toEqual({ kind: "granted", scope: "workspace" });
    expect(harness.grants).toEqual(["workspace bash bun run *"]);
    expect(setup.decisionOf(run)).toBe("accepted");
    expect(setup.waitsForItsAsk(run)).toBe(false);
    expect(record().accepted).toEqual([]);
  });

  it("records an mcp server for the focused session, and keeps it waiting when no session is focused", async () => {
    const focused = await begun();
    const filesystem = focused.offers[2];
    if (filesystem === undefined) throw new Error();
    expect(await focused.setup.decide(filesystem, "accepted", "s1")).toEqual({
      kind: "granted",
      scope: "session",
    });
    expect(focused.harness.grants).toEqual(["s1 mcp filesystem__*"]);
    expect(focused.record().accepted).toEqual([]);

    const unfocused = await begun();
    expect(await unfocused.setup.decide(filesystem, "accepted")).toEqual({ kind: "waiting" });
    expect(unfocused.harness.grants).toEqual([]);
    expect(unfocused.setup.waitsForItsAsk(filesystem)).toBe(true);
    expect(unfocused.record().accepted).toEqual([{ rule: filesystem.rule, scope: "session" }]);
  });

  it("settles the fingerprint once every rule is decided", async () => {
    const { setup, record, offers } = await begun();
    const [install, run, filesystem] = offers;
    if (install === undefined || run === undefined || filesystem === undefined) throw new Error();
    await setup.decide(run, "accepted");
    expect(record().settled).toBeUndefined();
    await setup.decide(install, "declined");
    await setup.decide(filesystem, "accepted");
    expect(setup.allDecided()).toBe(true);
    expect(record().settled).toEqual({
      version: "0.2.0",
      manifests: ["bun.lock", "package.json"],
      mcp: ["filesystem"],
      bots: ["reviewer"],
    });
  });

  it("shows keywork's own words when it declines a rule, and leaves the rule undecided", async () => {
    const { setup, harness, record, offers } = await begun();
    const filesystem = offers[2];
    if (filesystem === undefined) throw new Error();
    harness.refuseGrants(declinedMcp);
    expect(await setup.decide(filesystem, "accepted", "s1")).toEqual({
      kind: "refused",
      reason: declinedMcp.detail,
    });
    expect(setup.refusalOf(filesystem)).toBe(declinedMcp.detail);
    expect(setup.decisionOf(filesystem)).toBeUndefined();
    expect(record().accepted).toEqual([]);
    harness.refuseGrants(undefined);
    await setup.decide(filesystem, "accepted", "s1");
    expect(setup.refusalOf(filesystem)).toBeUndefined();
    expect(setup.decisionOf(filesystem)).toBe("accepted");
  });

  it.each([
    [
      { refused: "missing", detail: "no session has that id" },
      "not recorded · that session is gone",
    ],
    [
      { refused: "invalid", detail: "the body must be { rule }" },
      "not recorded · keywork could not read the rule",
    ],
  ] as const)("reads a %o refusal in the house's words", async (refusal, words) => {
    const { setup, harness, offers } = await begun();
    const filesystem = offers[2];
    if (filesystem === undefined) throw new Error();
    harness.refuseGrants(refusal);
    await setup.decide(filesystem, "accepted", "gone");
    expect(setup.refusalOf(filesystem)).toBe(words);
    expect(setup.decisionOf(filesystem)).toBeUndefined();
  });

  it("says why when keywork cannot be reached, and records nothing", async () => {
    const { setup, harness, offers } = await begun();
    const run = offers[1];
    if (run === undefined) throw new Error();
    harness.fail("grant:workspace", new ServerRefusal(503, "the server answered 503"));
    await setup.decide(run, "accepted");
    expect(setup.refusalOf(run)).toBe("not recorded · the server answered 503");
    expect(setup.decisionOf(run)).toBeUndefined();
  });

  it("leaves the posture as it was on decline, and a later decline takes a waiting acceptance back", async () => {
    const { setup, record, offers } = await begun();
    const filesystem = offers[2];
    if (filesystem === undefined) throw new Error();
    await setup.decide(filesystem, "declined");
    expect(record().accepted).toEqual([]);
    await setup.decide(filesystem, "accepted");
    await setup.decide(filesystem, "declined");
    expect(record().accepted).toEqual([]);
    expect(setup.decisionOf(filesystem)).toBe("declined");
  });

  it("never pretends to take back a rule keywork already holds", async () => {
    const { setup, harness, offers } = await begun();
    const run = offers[1];
    if (run === undefined) throw new Error();
    await setup.decide(run, "accepted");
    expect(await setup.decide(run, "declined")).toEqual({ kind: "held" });
    expect(setup.decisionOf(run)).toBe("accepted");
    expect(harness.grants).toEqual(["workspace bash bun run *"]);
  });

  it("keeps a rule it recorded in the review after keywork lists it among the grants", async () => {
    const { setup, offers } = await begun();
    const run = offers[1];
    if (run === undefined) throw new Error();
    await setup.decide(run, "accepted");
    await setup.refresh();
    expect(rules(setup)).toEqual(["bash bun install *", "bash bun run *", "mcp filesystem__*"]);
    expect(setup.decisionOf(run)).toBe("accepted");
    const reading = setup.reading();
    expect(reading.phase === "read" ? reading.proposal.granted : undefined).toEqual([]);
  });

  it("accepts the rest without overriding a decline, granting what keywork can hold now", async () => {
    const { setup, harness, record, offers } = await begun();
    const install = offers[0];
    if (install === undefined) throw new Error();
    await setup.decide(install, "declined");
    const outcomes = await setup.acceptRest();
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["granted", "waiting"]);
    expect(setup.shown().map(setup.decisionOf)).toEqual(["declined", "accepted", "accepted"]);
    expect(harness.grants).toEqual(["workspace bash bun run *"]);
    expect(record().accepted.map((held) => held.rule.resource)).toEqual(["filesystem__*"]);
    expect(record().settled).toBeDefined();
  });
});

describe("later launches", () => {
  it("says nothing while the fingerprint is the one that was settled", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    expect(await first.relaunch().setup.launchNotice()).toBeUndefined();
  });

  it("names the difference once, then never again for the same facts", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    first.harness.change({ mcp: [...(bunWorkspace.mcp ?? []), playwright] });
    expect(await first.relaunch().setup.launchNotice()).toBe(
      "new mcp server: playwright · trust-setup proposes 1 rule",
    );
    expect(await first.relaunch().setup.launchNotice()).toBeUndefined();
  });

  it("reopens scoped only to the difference, never the whole posture", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    first.harness.change({ mcp: [...(bunWorkspace.mcp ?? []), playwright] });
    const later = first.relaunch();
    await later.setup.begin();
    expect(later.setup.focus()).toEqual([{ kind: "mcp", name: "playwright" }]);
    expect(rules(later.setup)).toEqual(["mcp playwright__*"]);
  });

  it("lists what an earlier setup recorded among the grants, not the offers", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    const later = first.relaunch();
    await later.setup.refresh();
    const reading = later.setup.reading();
    expect(
      reading.phase === "read" ? reading.proposal.granted.map((rule) => rule.resource) : [],
    ).toEqual(["bun install *", "bun run *"]);
    expect(rules(later.setup)).toEqual(["mcp filesystem__*"]);
  });

  it("settles a difference that proposes nothing without a word", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    first.harness.change({ bots: ["reviewer", "scribe"], version: "0.3.0" });
    const later = first.relaunch();
    expect(await later.setup.launchNotice()).toBeUndefined();
    expect(later.record().settled?.bots).toEqual(["reviewer", "scribe"]);
    expect(later.record().settled?.version).toBe("0.3.0");
  });

  it("tells a workspace that was trusted before trust setup existed, once", async () => {
    const first = setupOver(bunWorkspace);
    expect(await first.setup.launchNotice()).toBe(
      "no trust setup for this workspace yet · trust-setup proposes 3 rules",
    );
    expect(await first.relaunch().setup.launchNotice()).toBeUndefined();
  });

  it("counts a fact it could not read as unchanged rather than new", async () => {
    const first = setupOver(bunWorkspace);
    await first.setup.begin();
    await first.setup.acceptRest();
    first.harness.fail("mcp", new ServerRefusal(503, "this host serves no mcp registry"));
    expect(await first.relaunch().setup.launchNotice()).toBeUndefined();
  });

  it("drops a workspace rule left waiting by an older setup once keywork has recorded it", async () => {
    const { offers, storage, harness } = await begun();
    const [install, run, filesystem] = offers;
    if (install === undefined || run === undefined || filesystem === undefined) throw new Error();
    waitingFrom(storage, install, run, filesystem);
    harness.change({ workspaceGrants: ["bun run *"] });
    const later = setupOver(bunWorkspace, storage, harness);
    await later.setup.refresh();
    expect(later.record().accepted.map((held) => held.rule.resource)).toEqual([
      "bun install *",
      "filesystem__*",
    ]);
  });
});

describe("an ask the person already accepted in trust setup", () => {
  const ask = (tool: string, resources: string[]): Pick<PermissionAsk, "tool" | "rules"> => ({
    tool,
    rules: resources.map((resource) => ({ action: tool, resource, effect: "allow" as const })),
  });

  async function accepted(): Promise<TrustSetup> {
    const { offers, storage, harness } = await begun();
    const [, run, filesystem] = offers;
    if (run === undefined || filesystem === undefined) throw new Error();
    waitingFrom(storage, run, filesystem);
    return setupOver(bunWorkspace, storage, harness).setup;
  }

  it("names the workspace scope when every rule the ask would record still waits for it", async () => {
    const setup = await accepted();
    expect(setup.acceptedScopeOf(ask("bash", ["bun run *"]))).toBe("workspace");
    expect(setup.acceptedScopeOf(ask("bash", ["bun run *", "rm -rf build"]))).toBeUndefined();
    expect(setup.acceptedScopeOf(ask("bash", ["bun install *"]))).toBeUndefined();
  });

  it("names nothing for a rule keywork already recorded, since its ask never comes", async () => {
    const { setup, offers } = await begun();
    const run = offers[1];
    if (run === undefined) throw new Error();
    await setup.decide(run, "accepted");
    expect(setup.acceptedScopeOf(ask("bash", ["bun run *"]))).toBeUndefined();
  });

  it("names the session scope for a tool of an accepted mcp server", async () => {
    const setup = await accepted();
    const click = {
      tool: "filesystem__read_file",
      rules: [{ action: "filesystem__read_file", resource: "*", effect: "allow" as const }],
    };
    expect(setup.acceptedScopeOf(click)).toBe("session");
    expect(setup.acceptedScopeOf({ ...click, tool: "github__create_issue" })).toBeUndefined();
  });

  it("names nothing for an ask keywork would remember nothing from", async () => {
    const setup = await accepted();
    expect(setup.acceptedScopeOf({ tool: "write", rules: [] })).toBeUndefined();
    expect(setup.acceptedScopeOf({ tool: "bash" })).toBeUndefined();
  });

  it("keys a decision by its scope and rule", async () => {
    const { offers } = await begun();
    const [, run] = offers;
    expect(run === undefined ? undefined : offerKey(run)).toBe("workspace:bash:bun run *");
  });
});

describe("trust arriving", () => {
  it("reads a trust granted in this window apart from one the workspace already had", () => {
    const granted = trustArrivals();
    expect(granted("unknown")).toBeUndefined();
    expect(granted("undecided")).toBeUndefined();
    expect(granted("restarting")).toBeUndefined();
    expect(granted("trusted")).toBe("granted");
    expect(granted("trusted")).toBeUndefined();

    const found = trustArrivals();
    expect(found("unknown")).toBeUndefined();
    expect(found("trusted")).toBe("found");
    expect(found("undecided")).toBeUndefined();
    expect(found("trusted")).toBe("granted");
  });
});
