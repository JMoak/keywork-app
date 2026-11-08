import type { ProductId } from "@keywork-app/product";
import type { CompanionHost } from "../companion/port.ts";
import type { ScreenPort } from "../panes/screen/port.ts";

export interface HostPort {
  readonly productId?: ProductId;
  about(): Promise<HostAbout>;
  pickFolder(): Promise<string | undefined>;
  recentWorkspaces(): Promise<readonly RecentWorkspace[]>;
  openWorkspace(path: string): Promise<WorkspaceOpen>;
  openHome?(): Promise<WorkspaceOpen>;
  enableRuntime?(): Promise<void>;
  restartServer(path: string): Promise<WorkspaceOpen>;
  servingOf?(path: string): Promise<"node" | "console" | undefined>;
  stopServing?(path: string): Promise<WorkspaceOpen>;
  closeWorkspace(path: string): Promise<void>;
  listOpenWorkspaces(): Promise<readonly OpenWorkspaceEntry[]>;
  switchWorkspace(path: string): Promise<void>;
  onOpenWorkspacesChanged(listener: (open: readonly OpenWorkspaceEntry[]) => void): () => void;
  onOpenRequested(listener: (path: string) => void): () => void;
  onServerLost(listener: (loss: ServerLoss) => void): () => void;
  onServerRegained(listener: (regained: ServerRegained) => void): () => void;
  onUpdateReady(listener: (update: UpdateReady) => void): () => void;
  acceptUpdate(): Promise<void>;
  openExternal(url: string): Promise<void>;
  openInEditor(target: EditorTarget): Promise<EditorOpened>;
  writeClipboard(text: string): Promise<void>;
  watchKeybindings(
    scope: KeybindingsScope,
    listener: (reading: KeybindingsReading) => void,
  ): () => void;
  notify(notice: HostNotice): Promise<void>;
  onNotificationActivated(listener: (trigger: NeedsYouTrigger) => void): () => void;
  setNeedsYou(count: number): Promise<void>;
  saveAs(suggestedName: string, text: string): Promise<SaveOutcome>;
  serverFetch(
    workspace: string,
    path: string,
    init: ServerRequestInit,
  ): Promise<ServerResponseHead>;
  readonly pty: PtyPort;
  readonly companion?: CompanionHost | undefined;
  readonly screen?: ScreenPort | undefined;
  readonly surroundings?: SurroundingsPort | undefined;
}

export interface SurroundingsPort {
  read(): Promise<Surroundings>;
  onChange(listener: (surroundings: Surroundings) => void): () => void;
}

export interface Surroundings {
  readonly fullscreen: boolean;
  readonly fullscreenElsewhere: boolean;
  readonly displayShared: boolean;
}

export interface PtyPort {
  open(request: PtyOpenRequest): Promise<PtyOpened>;
  write(id: number, data: string): void;
  resize(id: number, cols: number, rows: number): void;
  close(id: number): void;
  onData(id: number, listener: (bytes: Uint8Array) => void): () => void;
  onExit(id: number, listener: (exit: PtyExit) => void): () => void;
}

export type PtyProgram = "shell" | "keywork";

export interface PtyOpenRequest {
  workspace: string;
  program: PtyProgram;
  args?: readonly string[] | undefined;
  cols: number;
  rows: number;
}

export interface PtyOpened {
  id: number;
  title: string;
}

export interface PtyExit {
  id: number;
  exitCode: number;
  signal: number | undefined;
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
  | { kind: "no-ticket"; detail: string }
  | { kind: "silent"; waitedMs: number; detail: string }
  | { kind: "gone"; url: string };

export type WorkspaceOpen =
  | { ok: true; opened: OpenedWorkspace }
  | { ok: false; failure: WorkspaceFailure };

export interface UpdateReady {
  version: string;
  reviewRequired?: boolean;
}

export interface ServerLoss {
  workspace: string;
  failure: WorkspaceFailure;
  reattaching?: boolean | undefined;
}

export interface ServerRegained {
  workspace: string;
  opened: OpenedWorkspace;
}

export interface OpenWorkspaceEntry {
  workspace: string;
  windows: number;
  needsYou: number;
}

export type NeedsYouTrigger =
  | { kind: "ask"; workspace: string; sessionId: string; callId: string }
  | { kind: "memory-inbox"; workspace: string; pending: number }
  | { kind: "chore"; workspace: string; creature: string; routineId: string };

export type SaveOutcome =
  | { saved: true; path: string }
  | { saved: false; refused: "cancelled" }
  | { saved: false; refused: "invalid" | "failed" | "unavailable"; detail: string };

export interface HostNotice {
  title: string;
  body: string;
  trigger: NeedsYouTrigger;
}

export interface EditorTarget {
  path: string;
  line?: number | undefined;
}

export type EditorOpened =
  | { via: "editor"; editor: string }
  | { via: "revealed"; because: string; shownIn: string };

export interface KeybindingsScope {
  workspace?: string | undefined;
  projectTrusted: boolean;
}

export type KeybindingsReading =
  | { kind: "read"; layers: readonly KeybindingsLayer[] }
  | { kind: "unreadable"; problem: string };

export interface KeybindingsLayer {
  file: string;
  keybindings: unknown;
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
      return `the running engine is version ${failure.actual}; this app expects ${failure.expected}`;
    case "port-in-use":
      return `port ${failure.port} is taken`;
    case "unreachable":
      return `the server started but did not answer: ${failure.detail}`;
    case "silent":
      return silentLine(failure.waitedMs, failure.detail);
    case "gone":
      return `the server at ${hostOf(failure.url)} stopped answering`;
    case "no-ticket":
    case "usage":
    case "failed":
      return failure.detail === "" ? "the server stopped without saying why" : failure.detail;
  }
}

function silentLine(waitedMs: number, stderr: string): string {
  const said = `the server gave no address in ${Math.round(waitedMs / 1000)}s`;
  const lastWords = stderr.split("\n").findLast((line) => line.trim() !== "");
  return lastWords === undefined
    ? `${said} and was stopped`
    : `${said} · it last said ${lastWords.trim()}`;
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function isHostPort(candidate: unknown): candidate is HostPort {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "about" in candidate &&
    "openWorkspace" in candidate &&
    "serverFetch" in candidate &&
    "pty" in candidate
  );
}
