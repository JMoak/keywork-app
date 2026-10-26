import { ServerRefusal } from "@keywork-app/client";
import type {
  BotSummary,
  GrantAheadRefusal,
  GrantOutcome,
  McpServerStatus,
  PermissionRule,
  TreeEntry,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type PostureFacts, readPostureFacts } from "./facts.ts";
import type { SetupClient } from "./trust-setup.ts";

export function factsWith(overrides: Partial<PostureFacts> = {}): PostureFacts {
  return {
    permissions: { trusted: true, bundle: [], workspace: [], session: {} },
    version: "0.2.0",
    manifests: ["bun.lock", "package.json"],
    scripts: ["test"],
    runners: [],
    mcp: [],
    bots: [],
    unread: [],
    ...overrides,
  };
}

export function mcpServer(name: string, toolCount = 4): McpServerStatus {
  return { name, state: "connected", enabled: true, toolCount };
}

export function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (name) => items.get(name) ?? null,
    setItem: (name, value) => {
      items.set(name, value);
    },
  };
}

export interface WorkspaceFixture {
  readonly version?: string;
  readonly root?: readonly string[];
  readonly packageJson?: string;
  readonly mcp?: readonly McpServerStatus[];
  readonly bots?: readonly string[];
  readonly workspaceGrants?: readonly string[];
}

export interface FactsHarness {
  readonly client: SetupClient;
  readonly calls: string[];
  readonly grants: string[];
  fail(route: string, refusal: ServerRefusal): void;
  change(next: Partial<WorkspaceFixture>): void;
  refuseGrants(refusal: GrantAheadRefusal | undefined): void;
}

export function factsHarness(initial: WorkspaceFixture = {}): FactsHarness {
  let fixture: WorkspaceFixture = initial;
  let grantRefusal: GrantAheadRefusal | undefined;
  const failing = new Map<string, ServerRefusal>();
  const calls: string[] = [];
  const grants: string[] = [];
  const answer = async <T>(route: string, value: () => T): Promise<T> => {
    calls.push(route);
    const refusal = failing.get(route);
    if (refusal !== undefined) throw refusal;
    return value();
  };
  const grant = (scope: string, rule: PermissionRule, record: () => void) =>
    answer(`grant:${scope}`, (): GrantOutcome => {
      if (grantRefusal !== undefined) return grantRefusal;
      grants.push(`${scope} ${rule.action} ${rule.resource}`);
      record();
      return { granted: rule };
    });
  const client: SetupClient = {
    grantWorkspaceRule: (rule) =>
      grant("workspace", rule, () => {
        fixture = {
          ...fixture,
          workspaceGrants: [...(fixture.workspaceGrants ?? []), rule.resource],
        };
      }),
    grantSessionRule: (sessionId, rule) => grant(sessionId, rule, () => {}),
    permissions: () =>
      answer("permissions", () => ({
        trusted: true,
        bundle: [{ action: "bash", resource: "git status*", effect: "allow" as const }],
        workspace: (fixture.workspaceGrants ?? []).map((resource) => ({
          action: "bash",
          resource,
          effect: "allow" as const,
        })),
        session: {},
      })),
    document: () =>
      answer("document", () => ({ version: fixture.version ?? "0.2.0", operationIds: [] })),
    tree: (path) =>
      answer(`tree:${path}`, () => ({ path, entries: (fixture.root ?? []).map(fileEntry) })),
    file: (path) =>
      answer(`file:${path}`, () => {
        const text = fixture.packageJson ?? "{}";
        return {
          path,
          bytes: text.length,
          from: 0,
          to: text.length,
          text,
          truncated: false,
          encoding: "utf-8" as const,
        };
      }),
    mcpServers: () => answer("mcp", () => fixture.mcp ?? []),
    bots: () =>
      answer("bots", () =>
        (fixture.bots ?? []).map(
          (name): BotSummary => ({ name, sigil: "◆", source: "project", sessions: 0 }),
        ),
      ),
  };
  return {
    client,
    calls,
    grants,
    fail: (route, refusal) => failing.set(route, refusal),
    change: (next) => {
      fixture = { ...fixture, ...next };
    },
    refuseGrants: (refusal) => {
      grantRefusal = refusal;
    },
  };
}

export const bunWorkspace: WorkspaceFixture = {
  root: ["README.md", "bun.lock", "package.json", "src"],
  packageJson: JSON.stringify({ scripts: { test: "vitest run", lint: "biome check ." } }),
  mcp: [
    { name: "filesystem", state: "connected", enabled: true, toolCount: 11 },
    { name: "parked", state: "down", enabled: false, toolCount: 0 },
  ],
  bots: ["reviewer"],
};

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

function fileEntry(name: string): TreeEntry {
  return { name, kind: name.includes(".") ? "file" : "dir", ignored: false, hidden: false };
}
