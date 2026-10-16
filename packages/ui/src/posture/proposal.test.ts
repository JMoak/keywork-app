import type { PermissionRule, PermissionsView } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import grantAnswers from "../../../client/src/fixtures/grants.json";
import { factsWith, mcpServer } from "./facts.test.ts";
import { coversServerOf, mcpServerOf, offersFrom, proposalOf, sameRule } from "./proposal.ts";

const recordedView = grantAnswers.permissions.body as PermissionsView;

const bash = (resource: string): PermissionRule => ({ action: "bash", resource, effect: "allow" });

describe("the proposed posture", () => {
  it("states the trusted reads keywork already applies, from the server's own bundle", () => {
    const proposal = proposalOf(factsWith({ permissions: recordedView }));
    expect(proposal.reads).toBe("trusted reads · 40 commands without an ask · fixed in keywork");
    expect(proposalOf(factsWith({ permissions: { ...recordedView, trusted: false } })).reads).toBe(
      "trusted reads · off until the workspace is trusted",
    );
  });

  it("offers command families at workspace scope, each with the manifest that names it", () => {
    const { offers } = proposalOf(factsWith());
    expect(offers).toEqual([
      {
        rule: bash("bun install *"),
        scope: "workspace",
        reason: "bun.lock · installs what it pins",
        fact: { kind: "manifest", name: "bun.lock" },
      },
      {
        rule: bash("bun run *"),
        scope: "workspace",
        reason: "package.json scripts test · runs any of them",
        fact: { kind: "manifest", name: "package.json" },
      },
    ]);
  });

  it("offers every enabled mcp server whole, for one session at a time", () => {
    const { offers } = proposalOf(factsWith({ manifests: [], mcp: [mcpServer("playwright", 12)] }));
    expect(offers).toEqual([
      {
        rule: { action: "mcp", resource: "playwright__*", effect: "allow" },
        scope: "session",
        reason: "mcp server playwright · connected · 12 tools",
        fact: { kind: "mcp", name: "playwright" },
      },
    ]);
  });

  it("lists what the workspace already grants instead of offering it again", () => {
    const permissions = { ...recordedView, workspace: [bash("bun run *")] };
    const proposal = proposalOf(factsWith({ permissions }));
    expect(proposal.granted).toEqual([bash("bun run *")]);
    expect(proposal.offers.map((offer) => offer.rule.resource)).toEqual(["bun install *"]);
  });

  it("says what still asks, in keywork's terms, from the bundle and the contract", () => {
    expect(proposalOf(factsWith({ permissions: recordedView })).stillAsks).toEqual([
      "write and edit · approved once at a time, never remembered",
      "rm, rmdir, rd, del, erase, Remove-Item, git branch -D · a grant covers only the exact command",
      "git push --force, git reset --hard, git clean, git checkout -- · never remembered by a grant",
      "find *-delete*, find *-exec* and 9 more · forms the trusted reads still ask for",
      "any other command or mcp tool · asks until a rule covers it",
    ]);
  });

  it("narrows the offers to the facts a review is about", () => {
    const { offers } = proposalOf(factsWith({ mcp: [mcpServer("playwright")] }));
    expect(offersFrom(offers, [{ kind: "mcp", name: "playwright" }])).toHaveLength(1);
    expect(offersFrom(offers, [{ kind: "manifest", name: "package.json" }])).toHaveLength(1);
    expect(offersFrom(offers, [{ kind: "bot", name: "scribe" }])).toEqual([]);
  });
});

describe("the rules in keywork's grammar", () => {
  const playwright: PermissionRule = { action: "mcp", resource: "playwright__*", effect: "allow" };

  it("reads a whole-server mcp rule and the tools it covers", () => {
    expect(mcpServerOf(playwright)).toBe("playwright");
    expect(mcpServerOf(bash("bun run *"))).toBeUndefined();
    expect(coversServerOf(playwright, "playwright__browser_click")).toBe(true);
    expect(coversServerOf(playwright, "playwrightish__click")).toBe(false);
    expect(coversServerOf(bash("playwright__*"), "playwright__browser_click")).toBe(false);
  });

  it("matches rules by action, resource and effect", () => {
    expect(sameRule(bash("bun run *"), bash("bun run *"))).toBe(true);
    expect(sameRule(bash("bun run *"), { ...bash("bun run *"), effect: "ask" })).toBe(false);
  });
});
