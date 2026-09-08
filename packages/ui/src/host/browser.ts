import type {
  HostPort,
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
  const recents = [...(options.recents ?? [])];
  const server = options.server ?? serverFromLocation();
  const transport = options.fetch ?? fetch;
  return {
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
    closeWorkspace: async () => undefined,
    onServerLost: (listener) => {
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
    },
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    notify: async (notice) => {
      console.info(`[notify] ${notice.title}: ${notice.body}`);
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
}

function serverFromLocation(): { url: string; token: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token === null) return undefined;
  return { url: params.get("url") ?? `${window.location.origin}${devProxyPath}`, token };
}

const devProxyPath = "/kw";
