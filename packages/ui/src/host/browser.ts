import { echoPty } from "./echo-pty.ts";
import type {
  HostPort,
  NeedsYouTrigger,
  OpenWorkspaceEntry,
  RecentWorkspace,
  ServerLoss,
  ServerResponseHead,
  WorkspaceOpen,
} from "./port.ts";

export interface BrowserHostOptions {
  server?: { url: string; token: string } | undefined;
  recents?: readonly RecentWorkspace[] | undefined;
  fetch?: typeof fetch | undefined;
}

export function browserHost(options: BrowserHostOptions = {}): HostPort {
  const lossListeners = new Set<(loss: ServerLoss) => void>();
  const openListeners = new Set<(open: readonly OpenWorkspaceEntry[]) => void>();
  const requestListeners = new Set<(path: string) => void>();
  const activationListeners = new Set<(trigger: NeedsYouTrigger) => void>();
  const recents = [...(options.recents ?? [])];
  const open = new Map<string, OpenWorkspaceEntry>();
  const announceOpen = (): void => {
    for (const listener of [...openListeners]) listener([...open.values()]);
  };
  const server = options.server ?? serverFromLocation();
  const transport = options.fetch ?? fetch;
  const host: HostPort = {
    pty: echoPty(),
    about: async () => ({ shell: "browser", platform: navigator.platform, version: "dev" }),
    pickFolder: async () => window.prompt("workspace folder") ?? undefined,
    recentWorkspaces: async () => recents,
    openWorkspace: async (path): Promise<WorkspaceOpen> => {
      if (server === undefined) {
        return {
          ok: false,
          failure: {
            kind: "no-ticket",
            detail: "no server: add ?token=… to the page (the dev proxy at /kw carries it)",
          },
        };
      }
      recents.unshift({ path, openedAt: new Date().toISOString() });
      open.set(path, { workspace: path, windows: 1, pendingAsks: 0 });
      announceOpen();
      return {
        ok: true,
        opened: {
          workspace: path,
          serverLabel: server.url.replace(/^https?:\/\//, ""),
          attached: true,
          version: "dev",
          binary: undefined,
        },
      };
    },
    restartServer: (path) => host.openWorkspace(path),
    closeWorkspace: async (path) => {
      if (open.delete(path)) announceOpen();
    },
    listOpenWorkspaces: async () => [...open.values()],
    switchWorkspace: async (path) => {
      for (const listener of [...requestListeners]) listener(path);
    },
    onOpenWorkspacesChanged: (listener) => {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
    onOpenRequested: (listener) => {
      requestListeners.add(listener);
      return () => requestListeners.delete(listener);
    },
    onUpdateReady: () => () => {},
    acceptUpdate: async () => {},
    onServerLost: (listener) => {
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
    },
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    notify: async (notice) => {
      console.info(`[notify] ${notice.title}: ${notice.body}`, notice.trigger);
    },
    onNotificationActivated: (listener) => {
      activationListeners.add(listener);
      return () => activationListeners.delete(listener);
    },
    setPendingAsks: async (count) => {
      for (const entry of open.values()) entry.pendingAsks = count;
      document.title = count === 0 ? "keywork" : `(${count}) keywork`;
    },
    serverFetch: async (_workspace, path, init): Promise<ServerResponseHead> => {
      if (server === undefined) throw new Error("no server");
      const controller = new AbortController();
      const response = await transport(`${server.url}${path}`, {
        method: init.method ?? "GET",
        headers: { ...(init.headers ?? {}), authorization: `Bearer ${server.token}` },
        ...(init.body !== undefined && { body: init.body }),
        signal: controller.signal,
      });
      const reader = response.body?.getReader();
      return {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
        read: async () => {
          if (reader === undefined) return undefined;
          const { value, done } = await reader.read();
          return done ? undefined : value;
        },
        cancel: () => controller.abort(),
      };
    },
  };
  return host;
}

function serverFromLocation(): { url: string; token: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token === null) return undefined;
  return { url: params.get("url") ?? `${window.location.origin}${devProxyPath}`, token };
}

const devProxyPath = "/kw";
