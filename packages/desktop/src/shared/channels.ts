export const hostChannels = {
  about: "host:about",
  pickFolder: "host:pick-folder",
  recentWorkspaces: "host:recent-workspaces",
  openWorkspace: "host:open-workspace",
  restartServer: "host:restart-server",
  closeWorkspace: "host:close-workspace",
  listOpenWorkspaces: "host:list-open-workspaces",
  switchWorkspace: "host:switch-workspace",
  openWorkspacesChanged: "host:open-workspaces-changed",
  openRequested: "host:open-requested",
  setNeedsYou: "host:set-needs-you",
  notificationActivated: "host:notification-activated",
  openExternal: "host:open-external",
  notify: "host:notify",
  serverLost: "host:server-lost",
  serverFetch: "host:server-fetch",
  serverAbort: "host:server-abort",
  serverChunk: "host:server-chunk",
  serverEnd: "host:server-end",
  updateReady: "host:update-ready",
  acceptUpdate: "host:accept-update",
  saveAs: "host:save-as",
} as const;

export interface RelayRequest {
  requestId: number;
  workspace: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface RelayHead {
  status: number;
  statusText: string;
  headers: [string, string][];
}

export type RelayEnd = { requestId: number; error?: string };

export const ptyChannels = {
  open: "pty:open",
  write: "pty:write",
  resize: "pty:resize",
  close: "pty:close",
  data: "pty:data",
  exit: "pty:exit",
} as const;

export type PtyProgram = "shell" | "keywork";

export interface PtyOpenRequest {
  workspace: string;
  program: PtyProgram;
  args: readonly string[];
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
