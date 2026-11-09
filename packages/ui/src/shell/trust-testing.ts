import type { ConsoleClient, KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { WorkspaceView } from "@keywork-app/protocol";
import type { ShellSeams } from "../panes/registry.ts";
import { isUntrusted, type TrustFlow, type TrustState } from "./trust.ts";

export type WorkspaceClient = Pick<KeyworkClient, "workspace" | "tree" | "file" | "trustWorkspace">;

export const undecidedWorkspace: WorkspaceView = {
  anchor: { root: "C:/work", source: "git" },
  identity: "abc123",
  declared: false,
  contextDirs: [],
  missingContextDirs: [],
  focusDirs: [],
  trust: "undecided",
  readiness: "undecided",
};

export function inertWorkspaceClient(overrides: Partial<WorkspaceClient> = {}): WorkspaceClient {
  return {
    workspace: async () => undecidedWorkspace,
    tree: async () => ({ path: "", entries: [] }),
    file: async () => "missing",
    trustWorkspace: async () => ({
      trusted: true,
      root: "C:/work",
      vault: "C:/work/.keywork/memory",
      reopens: false,
    }),
    ...overrides,
  };
}

export function inertShellExtras(
  overrides: Partial<Pick<ShellSeams, "client" | "feed" | "trust" | "openPane">> = {},
): Pick<ShellSeams, "client" | "feed" | "trust" | "openPane"> {
  return {
    client: inertWorkspaceClient() as unknown as ConsoleClient,
    feed: inertFeed(),
    trust: inertTrust(),
    openPane: () => undefined,
    ...overrides,
  };
}

export function inertFeed(): ServerFeed {
  return {
    open: async () => undefined,
    subscribe: () => () => undefined,
    subscribeSession: () => () => undefined,
    onNotice: () => () => undefined,
    whenLost: () => () => undefined,
    close: () => undefined,
  };
}

export function inertTrust(state: TrustState = { kind: "trusted", root: "C:/work" }): TrustFlow {
  return {
    state: () => state,
    workspace: () => undefined,
    untrusted: () => isUntrusted(state),
    refresh: async () => undefined,
    accept: async () => undefined,
    dispose: () => undefined,
  };
}
