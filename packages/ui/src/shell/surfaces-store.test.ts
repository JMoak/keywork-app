import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFeed, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope, SurfaceKind } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createSurfacesStore,
  type SurfacesClient,
  type SurfacesStore,
  surfacesOfKind,
} from "./surfaces-store.ts";

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(join(process.cwd(), "packages/client/src/fixtures", `${name}.json`), "utf8"),
  ) as T;

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

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function inRoot<T>(build: (dispose: () => void) => T): T {
  return createRoot((dispose) => build(dispose));
}

describe("the surfaces store", () => {
  it("loads every surface whole from the fixtures", async () => {
    const client = fixtureSurfacesClient();
    const store = inRoot(() => createSurfacesStore(client, fakeFeed().feed));
    await store.load();
    expect(store.state.mcp.map((server) => server.name)).toEqual([
      "filesystem",
      "remote-docs",
      "broken",
      "parked",
    ]);
    expect(store.state.arcs.map((arc) => arc.slug)).toEqual(["arc-1", "pricing", "arc-0"]);
    expect(store.arcOrdinal("pricing")).toBe(2);
    expect(store.arcOrdinal(undefined)).toBeUndefined();
    expect(store.bot("reviewer")?.sigil).toBe("◆");
    expect(store.state.workspaces.filter((choice) => choice.current)).toHaveLength(1);
    expect(store.state.themes.map((theme) => theme.name)).toEqual(["keywork-night", "closet-mist"]);
    expect(store.state.activeTheme).toBe("keywork-night");
    expect(store.state.loaded).toEqual({
      mcp: true,
      arcs: true,
      bots: true,
      workspaces: true,
      themes: true,
    });
    expect(store.state.notices).toEqual({});
  });

  it("refetches exactly the surface a surface.changed names, and the trust-bound ones beside the workspaces", async () => {
    const client = fixtureSurfacesClient();
    const feed = fakeFeed();
    const store = inRoot(() => createSurfacesStore(client, feed.feed));
    await store.load();
    client.calls.splice(0);
    feed.emit("mcp");
    await settle();
    expect(client.calls).toEqual(["mcpServers"]);
    client.calls.splice(0);
    feed.emit("workspaces");
    await settle();
    expect(client.calls.sort()).toEqual(["arcs", "bots", "workspaces"]);
    expect(surfacesOfKind("arcs")).toEqual(["arcs"]);
  });

  it("reads the theme an arc wears off its summary, and follows another client's change", async () => {
    let worn: string | undefined;
    const client = fixtureSurfacesClient({
      arcs: async () => ({
        ...surfaceFixtures.arcs,
        arcs: surfaceFixtures.arcs.arcs.map((arc) =>
          arc.slug === "pricing" && worn !== undefined ? { ...arc, theme: worn } : arc,
        ),
      }),
    });
    const feed = fakeFeed();
    const store = inRoot(() => createSurfacesStore(client, feed.feed));
    await store.load();
    expect(store.arcTheme("pricing")).toBeUndefined();
    worn = "nord";
    feed.emit("arcs");
    await settle();
    expect(store.arcTheme("pricing")).toBe("nord");
    expect(store.arcTheme("arc-0")).toBeUndefined();
  });

  it("tells the session store when arc or bot bindings moved, since summaries carry both", async () => {
    let changed = 0;
    const feed = fakeFeed();
    const store = inRoot(() =>
      createSurfacesStore(fixtureSurfacesClient(), feed.feed, {
        sessionsChanged: () => {
          changed += 1;
        },
      }),
    );
    feed.emit("arcs");
    feed.emit("bots");
    feed.emit("mcp");
    await settle();
    expect(changed).toBe(2);
    store.dispose();
    expect(feed.listeners).toBe(0);
  });

  it("keeps the server's readiness notice when arcs are refused and clears it once they load", async () => {
    const notice = "arcs need a trusted workspace with memory · /init sets one up";
    let ready = false;
    const client = fixtureSurfacesClient({
      arcs: async () => (ready ? surfaceFixtures.arcs : { refused: "not-ready", detail: notice }),
    });
    const store: SurfacesStore = inRoot(() => createSurfacesStore(client, fakeFeed().feed));
    await store.refetch("arcs");
    expect(store.state.arcs).toEqual([]);
    expect(store.state.notices.arcs).toBe(notice);
    expect(store.state.loaded.arcs).toBe(true);
    ready = true;
    await store.refetch("workspaces");
    expect(store.state.arcs).toHaveLength(3);
    expect(store.state.notices.arcs).toBeUndefined();
  });

  it("records a failed fetch as that surface's notice without losing the others", async () => {
    const client = fixtureSurfacesClient({
      bots: async () => {
        throw new Error("the server answered 500");
      },
    });
    const store = inRoot(() => createSurfacesStore(client, fakeFeed().feed));
    await store.load();
    expect(store.state.notices).toEqual({ bots: "the server answered 500" });
    expect(store.state.loaded.bots).toBeUndefined();
    expect(store.state.mcp).toHaveLength(4);
  });
});

describe("the surfaces store across a reopened server", () => {
  it("reloads every surface when the feed reconnects, but not on its first connection", async () => {
    const client = fixtureSurfacesClient();
    const feed = fakeFeed();
    const store = inRoot(() => createSurfacesStore(client, feed.feed));
    feed.connect();
    await settle();
    expect(client.calls).toEqual([]);
    feed.connect();
    await settle();
    expect([...client.calls].sort()).toEqual(
      ["arcs", "bots", "mcpServers", "themes", "workspaces"].sort(),
    );
    store.dispose();
  });
});
