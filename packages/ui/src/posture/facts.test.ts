import { ServerRefusal } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { readPostureFacts } from "./facts.ts";
import { bunWorkspace, factsHarness } from "./facts-testing.ts";

describe("reading the posture's facts over the wire", () => {
  it("reads the manifests at the root, the package scripts, enabled mcp servers and bots", async () => {
    const harness = factsHarness(bunWorkspace);
    const facts = await readPostureFacts(harness.client);
    expect(facts.version).toBe("0.2.0");
    expect(facts.manifests).toEqual(["bun.lock", "package.json"]);
    expect(facts.scripts).toEqual(["test", "lint"]);
    expect(facts.mcp?.map((server) => server.name)).toEqual(["filesystem"]);
    expect(facts.bots).toEqual(["reviewer"]);
    expect(facts.unread).toEqual([]);
  });

  it("asks the server for every fact and opens package.json only when the root lists it", async () => {
    const harness = factsHarness({ root: ["Cargo.toml"] });
    await readPostureFacts(harness.client);
    expect([...harness.calls].sort()).toEqual(["bots", "document", "mcp", "permissions", "tree:"]);
  });

  it("keeps going when one fact cannot be read and says which, in the server's words", async () => {
    const harness = factsHarness(bunWorkspace);
    harness.fail("mcp", new ServerRefusal(503, "this host serves no mcp registry"));
    const facts = await readPostureFacts(harness.client);
    expect(facts.mcp).toBeUndefined();
    expect(facts.manifests).toEqual(["bun.lock", "package.json"]);
    expect(facts.unread).toEqual([
      "could not read the mcp servers · this host serves no mcp registry",
    ]);
  });

  it("reads no scripts from a package.json that is not json, and says so", async () => {
    const harness = factsHarness({ ...bunWorkspace, packageJson: "{ nope" });
    const facts = await readPostureFacts(harness.client);
    expect(facts.scripts).toEqual([]);
    expect(facts.unread).toHaveLength(1);
    expect(facts.unread[0]).toMatch(/^could not read the package\.json scripts · /);
  });

  it("fails the whole reading when the permissions themselves cannot be read", async () => {
    const harness = factsHarness(bunWorkspace);
    harness.fail("permissions", new ServerRefusal(500, "the server answered 500"));
    await expect(readPostureFacts(harness.client)).rejects.toThrow("the server answered 500");
  });
});
