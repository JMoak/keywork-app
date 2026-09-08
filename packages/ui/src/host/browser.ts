import type { HostPort, RecentWorkspace, ServerLoss, WorkspaceOpen } from "./port.ts";

export interface BrowserHostOptions {
  server?: { url: string; token: string } | undefined;
  recents?: readonly RecentWorkspace[] | undefined;
}

export function browserHost(options: BrowserHostOptions = {}): HostPort {
  const lossListeners = new Set<(loss: ServerLoss) => void>();
  const recents = [...(options.recents ?? [])];
  const server = options.server ?? serverFromLocation();
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
        opened: { workspace: path, server, attached: true, version: "dev", binary: undefined },
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
  };
}

function serverFromLocation(): { url: string; token: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token === null) return undefined;
  return { url: params.get("url") ?? `${window.location.origin}${devProxyPath}`, token };
}

const devProxyPath = "/kw";
