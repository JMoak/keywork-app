import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createSurfacesStore, type SurfacesStore, surfacesOfKind } from "./surfaces-store.ts";
import { fakeFeed, fixtureSurfacesClient, surfaceFixtures } from "./surfaces-store-testing.ts";

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

  it("leaves every listing alone when the permissions change, since it holds none of them", async () => {
    let sessionsChanged = 0;
    const client = fixtureSurfacesClient();
    const feed = fakeFeed();
    const store = inRoot(() =>
      createSurfacesStore(client, feed.feed, { sessionsChanged: () => (sessionsChanged += 1) }),
    );
    await store.load();
    client.calls.splice(0);
    feed.emit("permissions");
    await settle();
    expect(client.calls).toEqual([]);
    expect(sessionsChanged).toBe(0);
    expect(surfacesOfKind("permissions")).toEqual([]);
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
