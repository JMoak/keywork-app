import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFeed, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope, SurfaceKind } from "@keywork-app/protocol";
import type { SurfacesClient } from "./surfaces-store.ts";

export const surfaceFixtures = {
  mcp: fixture<{ servers: Awaited<ReturnType<SurfacesClient["mcpServers"]>> }>("mcp").servers,
  arcs: fixture<Exclude<Awaited<ReturnType<SurfacesClient["arcs"]>>, { refused: string }>>("arcs"),
  bots: fixture<{ bots: Awaited<ReturnType<SurfacesClient["bots"]>> }>("bots").bots,
  workspaces: fixture<{ workspaces: Awaited<ReturnType<SurfacesClient["workspaces"]>> }>(
    "workspaces",
  ).workspaces,
  themes: fixture<Awaited<ReturnType<SurfacesClient["themes"]>>>("themes"),
};

export function fixtureSurfacesClient(
  overrides: Partial<SurfacesClient> = {},
): SurfacesClient & { calls: string[] } {
  const calls: string[] = [];
  const counted = <K extends keyof SurfacesClient>(
    name: K,
    answer: SurfacesClient[K],
  ): SurfacesClient[K] =>
    ((...args: unknown[]) => {
      calls.push(name);
      return (answer as (...inner: unknown[]) => unknown)(...args);
    }) as SurfacesClient[K];
  return {
    ...emptySurfacesClient(),
    ...overrides,
    calls,
    mcpServers: counted("mcpServers", overrides.mcpServers ?? (async () => surfaceFixtures.mcp)),
    arcs: counted("arcs", overrides.arcs ?? (async () => surfaceFixtures.arcs)),
    bots: counted("bots", overrides.bots ?? (async () => surfaceFixtures.bots)),
    workspaces: counted(
      "workspaces",
      overrides.workspaces ?? (async () => surfaceFixtures.workspaces),
    ),
    themes: counted("themes", overrides.themes ?? (async () => surfaceFixtures.themes)),
  };
}

export function emptySurfacesClient(): SurfacesClient {
  const missing = { refused: "missing" as const, detail: "nothing is defined here" };
  return {
    mcpServers: async () => [],
    arcs: async () => ({ arcs: [], ordinals: {} }),
    bots: async () => [],
    workspaces: async () => [],
    themes: async () => ({ themes: [], active: "keywork-night", placeholders: ["system"] }),
    restartMcpServer: async () => missing,
    setMcpServerEnabled: async () => missing,
    mcpServerTools: async () => missing,
    createArc: async () => missing,
    closeArc: async () => missing,
    abandonArc: async () => missing,
    setArcTheme: async () => missing,
    bindSessionArc: async () => missing,
    createBot: async () => missing,
    bindSessionBot: async () => missing,
    createWorkspace: async () => missing,
    useWorkspace: async () => missing,
    focusWorkspaceDir: async () => missing,
    unfocusWorkspaceDir: async () => missing,
  };
}

export function fakeFeed(): {
  feed: Pick<ServerFeed, "subscribe" | "onNotice">;
  emit: (kind: SurfaceKind) => void;
  connect: () => void;
  listeners: number;
} {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  const noticeListeners = new Set<(notice: StreamNotice) => void>();
  let id = 0;
  return {
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onNotice: (listener) => {
        noticeListeners.add(listener);
        return () => noticeListeners.delete(listener);
      },
    },
    connect: () => {
      for (const listener of noticeListeners) listener({ kind: "connected" });
    },
    emit: (kind) => {
      id += 1;
      const envelope: BusEnvelope = {
        id,
        ts: "t",
        sessionId: "",
        type: "surface.changed",
        payload: { kind },
      };
      for (const listener of listeners) listener([envelope]);
    },
    get listeners() {
      return listeners.size;
    },
  };
}

function fixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), "packages/client/src/fixtures", `${name}.json`), "utf8"),
  ) as T;
}
