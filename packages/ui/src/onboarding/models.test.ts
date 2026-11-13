import { describe, expect, it } from "vitest";
import { cloudNeverRequired, nothingReachableLine } from "./copy.ts";
import {
  cloudConnected,
  cloudUnverified,
  inheritsKeyworksDefault,
  inheritsRefused,
  inheritsResolved,
  inheritsUnconfigured,
  localAndCloud,
  localModels,
  modelsUnserved,
  noModels,
  nothingConnected,
} from "./fixtures.ts";
import {
  inheritEverywhere,
  introductionOf,
  localFirst,
  nothingLocal,
  nothingReachable,
  policyLines,
  proposePolicy,
  reachLines,
  reachOf,
} from "./models.ts";

const unknown = { kind: "unknown" } as const;

describe("what is reachable now", () => {
  it("lists the models on servers that answer and leaves a down server out", () => {
    const reach = reachOf(localModels, unknown);
    expect(reach.served).toBe(true);
    expect(reach.local.map((model) => model.model)).toEqual(["qwen3:32b", "qwen3:8b", "moondream"]);
    expect(reach.local[0]).toEqual({
      node: "moak-main",
      server: "ollama",
      root: "http://127.0.0.1:11434",
      model: "qwen3:32b",
      loaded: true,
      health: "up",
      classes: ["strong", "loop"],
    });
  });

  it("proposes local first per class, a loaded model before an installed one, inherit where nothing local fits", () => {
    const policy = proposePolicy(reachOf(localModels, unknown));
    expect(policy).toEqual({
      strong: { provider: "ollama", model: "qwen3:32b" },
      loop: { provider: "ollama", model: "qwen3:32b" },
      decide: "inherit",
      vision: { provider: "ollama", model: "moondream" },
    });
    expect(localFirst(policy)).toBe(true);
    expect(localFirst(inheritEverywhere)).toBe(false);
    expect(policyLines(policy)).toEqual([
      ["strong", "ollama/qwen3:32b"],
      ["loop", "ollama/qwen3:32b"],
      ["decide", "inherit"],
      ["vision", "ollama/moondream"],
    ]);
  });

  it("inherits everywhere when no local server answers", () => {
    const reach = reachOf(noModels, unknown);
    expect(proposePolicy(reach)).toEqual(inheritEverywhere);
    expect(nothingReachable(reach)).toBe(true);
    expect(reachLines(reach)).toEqual([
      nothingLocal,
      "cloud: unknown until the first turn answers",
      nothingReachableLine,
    ]);
  });

  it("counts a cloud model that answered this workspace as reachable without requiring a key", () => {
    const reach = reachOf(noModels, { kind: "answering", model: "anthropic/claude-sonnet-4-5" });
    expect(nothingReachable(reach)).toBe(false);
    expect(reachLines(reach)).toEqual([
      nothingLocal,
      "cloud: anthropic/claude-sonnet-4-5 answered this workspace before",
    ]);
    expect(cloudNeverRequired).toContain("no cloud account needed");
  });

  it("counts a cloud provider connected with keywork connect as reachable on a workspace no turn has answered in", () => {
    const reach = reachOf(cloudConnected, unknown);
    expect(reach.cloud).toEqual({ kind: "connected", providers: ["openrouter"] });
    expect(nothingReachable(reach)).toBe(false);
    expect(proposePolicy(reach)).toEqual(inheritEverywhere);
    expect(reachLines(reach)).toEqual([
      nothingLocal,
      "cloud: openrouter connected with `keywork connect`",
    ]);
  });

  it("keeps local first when a cloud provider is connected too", () => {
    const reach = reachOf(localAndCloud, unknown);
    expect(reach.cloud).toEqual({ kind: "connected", providers: ["openrouter"] });
    expect(proposePolicy(reach)).toEqual(proposePolicy(reachOf(localModels, unknown)));
    expect(localFirst(proposePolicy(reach))).toBe(true);
  });

  it("finds nothing reachable when every provider on the market road lacks a credential", () => {
    const reach = reachOf(nothingConnected, unknown);
    expect(reach.cloud).toEqual(unknown);
    expect(nothingReachable(reach)).toBe(true);
    expect(reachLines(reach)).toEqual([
      nothingLocal,
      "cloud: unknown until the first turn answers",
      nothingReachableLine,
    ]);
  });

  it("counts a provider the market calls unverified as connected, not yet answered", () => {
    const reach = reachOf(cloudUnverified, unknown);
    expect(reach.cloud).toEqual({ kind: "unverified", providers: ["openrouter"] });
    expect(nothingReachable(reach)).toBe(false);
    expect(reachLines(reach)).toEqual([
      nothingLocal,
      "cloud: openrouter connected with `keywork connect`, not yet answered",
    ]);
    expect(reach.inherited).toBeUndefined();
  });

  it("promises the introduction through inherits.strong when it resolves and waits in words when it refuses", () => {
    expect(introductionOf(reachOf(inheritsResolved, unknown), "inherit")).toEqual({
      kind: "promised",
      through: "openrouter/openai/gpt-5-mini",
    });
    expect(introductionOf(reachOf(inheritsRefused, unknown), "inherit")).toEqual({
      kind: "waits",
      detail: "no provider holds a credential for strong",
    });
    const local = { provider: "ollama", model: "qwen3:32b" };
    expect(introductionOf(reachOf(inheritsRefused, unknown), local)).toEqual({
      kind: "promised",
      through: undefined,
    });
    expect(introductionOf(reachOf(nothingConnected, unknown), "inherit")).toEqual({
      kind: "waits",
      detail: undefined,
    });
    expect(introductionOf(undefined, "inherit")).toEqual({ kind: "waits", detail: undefined });
  });

  it("introduces through keywork's own OpenRouter default as contract 1.20 answers it, and waits only when nothing is configured", () => {
    const reach = reachOf(inheritsKeyworksDefault, unknown);
    expect(nothingReachable(reach)).toBe(false);
    expect(introductionOf(reach, "inherit")).toEqual({
      kind: "promised",
      through: "openrouter/openai/gpt-5-mini",
    });
    expect(introductionOf(reachOf(inheritsUnconfigured, unknown), "inherit")).toEqual({
      kind: "waits",
      detail: "this host has no default model to inherit",
    });
  });

  it("names the model that answered this workspace before over a connected provider", () => {
    const answered = { kind: "answering", model: "openrouter/openai/gpt-5-mini" } as const;
    expect(reachOf(cloudConnected, answered).cloud).toEqual(answered);
  });

  it("says the node serves no inventory when the route is 503 and does not invent servers", () => {
    const reach = reachOf(modelsUnserved, unknown);
    expect(reach).toEqual({
      served: false,
      local: [],
      cloud: unknown,
      detail: "this host serves no model inventory",
    });
    expect(reachLines(reach)[0]).toBe(
      "this node serves no model inventory (this host serves no model inventory)",
    );
  });
});
