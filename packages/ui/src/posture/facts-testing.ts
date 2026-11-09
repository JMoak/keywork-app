import type { ServerRefusal } from "@keywork-app/client";
import type {
  BotSummary,
  GrantAheadRefusal,
  GrantOutcome,
  McpServerStatus,
  PermissionRule,
  TreeEntry,
} from "@keywork-app/protocol";
import type { PostureFacts } from "./facts.ts";
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

function fileEntry(name: string): TreeEntry {
  return { name, kind: name.includes(".") ? "file" : "dir", ignored: false, hidden: false };
}
