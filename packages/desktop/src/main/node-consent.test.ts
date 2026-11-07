import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import {
  answerNodeRefusal,
  type ConsentCard,
  consumerInstallationId,
  type FailureCard,
  type NodeConsentSeams,
  nodeAnswerFiles,
  nodeConsentCard,
  nodeConsumerArgs,
  nodeStatusArgs,
  offerNodeAtFirstRun,
  readNodeStanding,
  restartAnOlderNode,
  runtimeConsumerFile,
  type SidecarRun,
} from "./node-consent.ts";
import { runtimeFailure } from "./runtime-failure.ts";
import { type ContractMismatch, expectedContract, expectedServerVersion } from "./serve-process.ts";

const userData = "C:/Users/keeper/AppData/Roaming/stead";
const sidecar = "C:/Programs/stead/resources/sidecar/keywork.exe";
const ticket = { url: "http://127.0.0.1:53111", token: "node-token" };

describe("product consent and durable runtime registration", () => {
  it("reconsiders a declined answer only when the keeper explicitly retries setup", async () => {
    const world = fakeWorld(false);
    await offerNodeAtFirstRun(world.seams);
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({
      kind: "answered",
      answer: "declined",
    });
    expect(world.asked).toHaveLength(1);
    world.seams.ask = async (card) => {
      world.asked.push(card);
      return true;
    };
    expect(await offerNodeAtFirstRun(world.seams, { reconsiderDecline: true })).toEqual({
      kind: "installed",
    });
    expect(world.asked).toHaveLength(2);
    expect(world.runs).toHaveLength(1);
  });
  it("records a declined answer without running an engine command", async () => {
    const world = fakeWorld(false);
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({ kind: "declined" });
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({
      kind: "answered",
      answer: "declined",
    });
    expect(world.asked).toHaveLength(1);
    expect(world.runs).toEqual([]);
    expect(world.record("declined")).toMatchObject({ schema: 1, answer: "declined" });
    expect(world.files.has(join(userData, runtimeConsumerFile))).toBe(false);
  });

  it("registers the stable product consumer after consent without adding a project", async () => {
    const world = fakeWorld(true);
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({ kind: "installed" });
    const id = consumerInstallationId(world.seams);
    expect(world.runs).toEqual([
      { args: nodeConsumerArgs("install", keyworkProfile, id), cwd: undefined },
    ]);
    expect(world.files.get(join(userData, runtimeConsumerFile))).toBe(`${id}\n`);
    expect(world.record("installed")).toMatchObject({ answer: "installed" });
  });

  it("reconciles an existing consent record through the consumer registry without asking again", async () => {
    const world = fakeWorld(true);
    await offerNodeAtFirstRun(world.seams);
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({
      kind: "answered",
      answer: "installed",
    });
    expect(world.asked).toHaveLength(1);
    expect(world.runs).toHaveLength(2);
    expect(world.runs[0]?.args).toEqual(world.runs[1]?.args);
  });

  it("keeps product installation identities distinct and stable", () => {
    const world = fakeWorld(true);
    const first = consumerInstallationId(world.seams);
    expect(consumerInstallationId(world.seams)).toBe(first);
    expect(consumerInstallationId({ ...world.seams, profile: steadProfile })).not.toBe(first);
    expect(consumerInstallationId({ ...world.seams, userData: userData.toUpperCase() })).toBe(
      first,
    );
  });

  it("does not create ownership records after a refused registration", async () => {
    const world = fakeWorld(true);
    world.result = {
      code: 3,
      output: JSON.stringify({
        kind: "refused",
        code: "consumer-conflict",
        message: "Update the other product before replacing the shared engine.",
        recovery: "update-products",
      }),
    };
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({
      kind: "failed",
      code: 3,
      detail: "Update the other product before replacing the shared engine.",
    });
    expect(world.files.size).toBe(0);
    expect(world.told[0]?.detail).toBe(
      "Update the other product before replacing the shared engine.",
    );
  });

  it("works before a project folder exists and never uses a profile directory as project cwd", async () => {
    const world = fakeWorld(true);
    world.seams.folder = undefined;
    await offerNodeAtFirstRun(world.seams);
    expect(world.runs[0]?.cwd).toBeUndefined();
    expect(world.runs[0]?.args).not.toContain("workspace");
    expect(world.runs[0]?.args).not.toContain(userData);
  });

  it("stays silent when no compiled sidecar is available", async () => {
    const world = fakeWorld(true);
    world.seams.exists = async () => false;
    expect(await offerNodeAtFirstRun(world.seams)).toEqual({ kind: "no-sidecar" });
    expect(world.asked).toEqual([]);
    expect(world.runs).toEqual([]);
  });
});

describe("shared runtime compatibility", () => {
  it("never restarts a running engine merely because a sidecar is newer", async () => {
    const world = fakeWorld(true);
    expect(await restartAnOlderNode(world.seams)).toEqual({ kind: "current" });
    expect(world.runs.map((run) => run.args)).toEqual([nodeStatusArgs]);
  });

  it("reports incompatible engine versions without interrupting another client", async () => {
    const world = fakeWorld(true);
    world.status = statusReport("0.1.0", "1.0");
    expect(await restartAnOlderNode(world.seams)).toMatchObject({ kind: "failed" });
    expect(world.runs.map((run) => run.args)).toEqual([nodeStatusArgs]);
    expect(world.asked).toEqual([]);
  });

  it("treats a legacy status without a contract as unknown", async () => {
    const world = fakeWorld(true);
    const status = JSON.parse(world.status) as { node: { contract?: string } };
    delete status.node.contract;
    world.status = JSON.stringify(status);
    expect(await restartAnOlderNode(world.seams)).toEqual({ kind: "unknown" });
    expect(world.runs.map((run) => run.args)).toEqual([nodeStatusArgs]);
  });

  it("annotates shared tickets without offering a disruptive restart", async () => {
    const world = fakeWorld(true);
    const failure: ContractMismatch = {
      kind: "contract-mismatch",
      expected: expectedContract,
      actual: "old",
      ticket,
      source: { origin: "ticket", from: ticket.url },
    };
    expect(await answerNodeRefusal(world.seams, failure)).toMatchObject({
      kind: "contract-mismatch",
      source: { node: "shared-runtime" },
    });
    expect(world.runs.map((run) => run.args)).toEqual([nodeStatusArgs]);
    expect(world.asked).toEqual([]);
  });

  it("reads exact running engine and contract identities", async () => {
    const world = fakeWorld(true);
    expect(await readNodeStanding(world.seams)).toMatchObject({
      installed: true,
      running: true,
      version: expectedServerVersion,
      contract: expectedContract,
      tickets: [ticket.url],
    });
  });
});

describe("runtime presentation", () => {
  it("explains shared background work and private home without requiring terminal commands", () => {
    const card = nodeConsentCard({
      platform: "win32",
      machine: "keeper-pc",
      account: "keeper",
      profile: steadProfile,
    });
    expect(card.detail).toContain("private home before you choose a project");
    expect(card.detail).toContain("Uninstalling one app preserves the other");
    expect(card.detail).not.toContain("keywork node");
  });

  it("maps structured recovery actions into product copy", () => {
    expect(
      runtimeFailure(
        JSON.stringify({
          message: "The other client still needs the engine.",
          recovery: "close-clients",
        }),
      ),
    ).toEqual({
      message: "The other client still needs the engine.",
      nextAction: "Close the other app windows before updating the shared engine.",
    });
  });
});

describe("product uninstall ownership", () => {
  it("unregisters a durable consumer instead of stopping the node from a consent marker", () => {
    const script = readFileSync(join(import.meta.dirname, "../../resources/installer.nsh"), "utf8");
    expect(script).toContain(runtimeConsumerFile);
    expect(script).toContain("node consumer remove");
    expect(script).not.toContain("node uninstall");
  });
});

function fakeWorld(consent: boolean) {
  const files = new Map<string, string>();
  const asked: ConsentCard[] = [];
  const told: FailureCard[] = [];
  const runs: { args: readonly string[]; cwd: string | undefined }[] = [];
  const world = {
    files,
    asked,
    told,
    runs,
    result: { code: 0, output: '{"kind":"installed"}' } as SidecarRun,
    status: statusReport(),
    seams: undefined as unknown as NodeConsentSeams,
    record: (answer: "installed" | "declined"): unknown => {
      const text = files.get(join(userData, nodeAnswerFiles[answer]));
      return text === undefined ? undefined : JSON.parse(text);
    },
  };
  world.seams = {
    platform: "win32",
    machine: "keeper-pc",
    account: "keeper",
    userData,
    sidecar,
    folder: "C:/src/project",
    exists: async () => true,
    modifiedAt: async () => Date.now(),
    readText: async (path) => files.get(path),
    writeText: async (path, text) => {
      files.set(path, text);
    },
    ask: async (card) => {
      asked.push(card);
      return consent;
    },
    tell: async (card) => {
      told.push(card);
    },
    run: async (_binary, args, cwd) => {
      runs.push({ args, cwd });
      return args.join(" ") === nodeStatusArgs.join(" ")
        ? { code: 0, output: world.status }
        : world.result;
    },
    now: () => new Date("2026-11-07T12:00:00Z"),
  };
  return world;
}

function statusReport(version = expectedServerVersion, contract = expectedContract): string {
  return JSON.stringify({
    registration: { installed: true, program: "C:/Users/keeper/.keywork/runtime/engine.exe" },
    liveness: "running",
    node: {
      startedAt: "2026-11-06T12:00:00Z",
      version,
      contract,
      workspaces: [{ url: ticket.url }],
    },
  });
}
