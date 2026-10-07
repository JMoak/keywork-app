export type TrustDecision = "trusted" | "untrusted" | "undecided";

export type WorkspaceReadiness = "ready" | "undeclared" | "undecided" | "refused";

export type AnchorSource = "declaration" | "git" | "launch";

export interface WorkspaceView {
  anchor: { root: string; source: AnchorSource };
  identity: string;
  slug?: string;
  name?: string;
  declared: boolean;
  declarationFile?: string;
  contextDirs: readonly string[];
  missingContextDirs: readonly string[];
  focusDirs: readonly string[];
  vault?: string;
  trust: TrustDecision;
  readiness: WorkspaceReadiness;
}

export interface TreeEntry {
  name: string;
  kind: "file" | "dir";
  ignored: boolean;
  hidden: boolean;
}

export interface TreeListing {
  path: string;
  entries: readonly TreeEntry[];
}

export type TreeReading = TreeListing | "outside-scope" | "missing";

export interface FileRange {
  from?: number | undefined;
  to?: number | undefined;
}

export interface FileSlice {
  path: string;
  bytes: number;
  from: number;
  to: number;
  text: string;
  truncated: boolean;
  eof: boolean;
  encoding: "utf-8";
}

export type FileReading = FileSlice | "outside-scope" | "missing" | "too-large" | "binary";

export const maxFileSliceBytes = 1024 * 1024;

export const maxFileBytes = 20 * 1024 * 1024;

export interface TrustGrant {
  trusted: true;
  root: string;
  reopens: boolean;
}

export type TrustRefusal = "untrusted" | "home";

export type TrustOutcome = TrustGrant | { refused: TrustRefusal; message: string };

export type SurfaceKind = "mcp" | "arcs" | "bots" | "workspaces" | "workspace";
