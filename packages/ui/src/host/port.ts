export interface HostPort {
  about(): Promise<HostAbout>;
  pickFolder(): Promise<string | undefined>;
  recentWorkspaces(): Promise<readonly RecentWorkspace[]>;
  openWorkspace(path: string): Promise<WorkspaceOpen>;
  closeWorkspace(path: string): Promise<void>;
  onServerLost(listener: (loss: ServerLoss) => void): () => void;
  openExternal(url: string): Promise<void>;
  notify(notice: HostNotice): Promise<void>;
  serverFetch(
    workspace: string,
    path: string,
    init: ServerRequestInit,
  ): Promise<ServerResponseHead>;
}

export interface HostAbout {
  shell: "electron" | "browser";
  platform: string;
  version: string;
}

export interface RecentWorkspace {
  path: string;
  openedAt: string;
}

export interface OpenedWorkspace {
  workspace: string;
  serverLabel: string;
  attached: boolean;
  version: string;
  binary: string | undefined;
}

export interface ServerRequestInit {
  method?: string | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
}

export interface ServerResponseHead {
  status: number;
  statusText: string;
  headers: [string, string][];
  read(): Promise<Uint8Array | undefined>;
  cancel(): void;
}

export type WorkspaceFailure =
  | { kind: "usage"; detail: string }
  | { kind: "unresolved"; message: string; nextAction: string }
  | { kind: "port-in-use"; port: number; detail: string }
  | { kind: "failed"; exitCode: number | null; detail: string }
  | { kind: "unreachable"; ticket: { url: string }; detail: string }
  | { kind: "version-mismatch"; expected: string; actual: string }
  | { kind: "no-ticket"; detail: string };

export type WorkspaceOpen =
  | { ok: true; opened: OpenedWorkspace }
  | { ok: false; failure: WorkspaceFailure };

export interface ServerLoss {
  workspace: string;
  failure: WorkspaceFailure;
}

export interface HostNotice {
  title: string;
  body: string;
}

export const hostGlobal = "keyworkHost";

export function hostFromWindow(): HostPort | undefined {
  const candidate = (globalThis as Record<string, unknown>)[hostGlobal];
  return isHostPort(candidate) ? candidate : undefined;
}

export function describeFailure(failure: WorkspaceFailure): string {
  switch (failure.kind) {
    case "unresolved":
      return failure.nextAction === ""
        ? failure.message
        : `${failure.message} · ${failure.nextAction}`;
    case "version-mismatch":
      return `the running keywork is ${failure.actual}; this app expects ${failure.expected}`;
    case "port-in-use":
      return `port ${failure.port} is taken`;
    case "unreachable":
      return `keywork serve started but did not answer: ${failure.detail}`;
    case "no-ticket":
    case "usage":
    case "failed":
      return failure.detail === "" ? "keywork serve stopped without saying why" : failure.detail;
  }
}

function isHostPort(candidate: unknown): candidate is HostPort {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "about" in candidate &&
    "openWorkspace" in candidate &&
    "serverFetch" in candidate
  );
}
