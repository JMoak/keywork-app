export const hostChannels = {
  about: "host:about",
  pickFolder: "host:pick-folder",
  recentWorkspaces: "host:recent-workspaces",
  openWorkspace: "host:open-workspace",
  closeWorkspace: "host:close-workspace",
  openExternal: "host:open-external",
  notify: "host:notify",
  serverLost: "host:server-lost",
  serverFetch: "host:server-fetch",
  serverAbort: "host:server-abort",
  serverChunk: "host:server-chunk",
  serverEnd: "host:server-end",
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
