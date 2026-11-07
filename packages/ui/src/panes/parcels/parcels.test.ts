import { describe, expect, it } from "vitest";
import {
  auditRows,
  begunBuild,
  buildPeer,
  census,
  fixtureNow,
  grantList,
  ids,
  meshEnvelope,
  mossGate,
  pairsReading,
  sparkPair,
  wrenGate,
} from "./fixtures.ts";
import {
  censusWithLanes,
  endpointOf,
  listenerAfter,
  machineNames,
  meshNewsOf,
  type OutboundAttempt,
  type ParcelRow,
  type ParcelSources,
  parcelRows,
  quietListener,
  selfIdOf,
  tallyOf,
} from "./parcels.ts";

const served: ParcelSources = {
  census,
  pairs: pairsReading,
  grants: grantList,
  audit: auditRows,
  attempts: [],
  now: fixtureNow,
};

const buildAttempt: OutboundAttempt = { ...begunBuild, peer: ids.build };

const rowOf = (rows: readonly ParcelRow[], id: string): ParcelRow => {
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
};

describe("parcel rows", () => {
  it("puts this machine first, then every other tailnet machine by name", () => {
    const rows = parcelRows(served);
    expect(rows.map((row) => [row.machine, row.here])).toEqual([
      ["moak-main", true],
      ["build-box", false],
      ["lab-mac", false],
      ["old-laptop", false],
      ["spark-ad4d", false],
    ]);
    expect(selfIdOf(rows)).toBe(ids.house);
    expect(machineNames(rows).get(ids.spark)).toBe("spark-ad4d");
  });

  it("reads each pairing state from pairs, pending attempts, begun attempts and hello", () => {
    const rows = parcelRows({ ...served, attempts: [buildAttempt] });
    expect(rowOf(rows, ids.house).pairing).toEqual({ kind: "here", claim: "claimed" });
    expect(rowOf(rows, ids.spark).pairing).toEqual({ kind: "paired", pair: sparkPair });
    expect(rowOf(rows, ids.build).pairing).toEqual({ kind: "pairing-out", attempt: buildAttempt });
    expect(rowOf(rows, ids.lab).pairing).toEqual({
      kind: "pairing-in",
      pending: pairsReading.pending[0],
    });
    expect(rowOf(rows, ids.laptop).pairing).toEqual({ kind: "no-node" });
    expect(rowOf(parcelRows(served), ids.build).pairing).toEqual({
      kind: "unpaired",
      claimed: false,
    });
  });

  it("forgets attempts and pending pairings once they expire", () => {
    const later = { ...served, attempts: [buildAttempt], now: fixtureNow + 6 * 60_000 };
    const rows = parcelRows(later);
    expect(rowOf(rows, ids.build).pairing.kind).toBe("unpaired");
    expect(rowOf(rows, ids.lab).pairing).toEqual({ kind: "unpaired", claimed: true });
  });

  it("maps manifest roles to house, host and pasture, and a console pair to a house", () => {
    const rows = parcelRows(served);
    expect(rowOf(rows, ids.house).roles).toEqual(["house"]);
    expect(rowOf(rows, ids.spark).roles).toEqual(["host", "pasture"]);
    expect(rowOf(rows, ids.build).roles).toEqual([]);
    const consolePair = {
      ...sparkPair,
      id: "pair-lab",
      peerStableId: ids.lab,
      role: "console" as const,
    };
    const withConsole = parcelRows({
      ...served,
      pairs: { ...pairsReading, pairs: [consolePair], pending: [] },
    });
    expect(rowOf(withConsole, ids.lab).roles).toEqual(["house"]);
  });

  it("hangs each gate on the parcel it opens onto and each audit row on its actor, newest first", () => {
    const rows = parcelRows(served);
    expect(rowOf(rows, ids.spark).gates).toEqual([wrenGate]);
    expect(rowOf(rows, ids.house).gates).toEqual([mossGate]);
    expect(rowOf(rows, ids.spark).audit.map((row) => row.hash)).toEqual([
      "hash-4",
      "hash-3",
      "hash-2",
      "hash-1",
    ]);
    expect(rowOf(rows, ids.house).audit).toHaveLength(auditRows.length);
    expect(rowOf(rows, ids.laptop).audit).toEqual([]);
  });

  it("knows where to pair only for a machine whose node answered", () => {
    const rows = parcelRows(served);
    expect(rowOf(rows, ids.spark).target).toEqual({
      endpoint: "http://100.85.160.9:47800",
      stableId: ids.spark,
      userId: "7000000000000001",
      tags: [],
    });
    expect(rowOf(rows, ids.build).target).toEqual({
      endpoint: "http://100.71.3.4:47800",
      stableId: ids.build,
      userId: null,
      tags: ["tag:ci"],
    });
    expect(rowOf(rows, ids.laptop).target).toBeUndefined();
    expect(rowOf(rows, ids.house).target).toBeUndefined();
    expect(endpointOf({ ...buildPeer, addresses: ["fd7a:115c:a1e0::b0b0"] })).toBe(
      "http://[fd7a:115c:a1e0::b0b0]:47800",
    );
    expect(endpointOf({ ...buildPeer, addresses: [] })).toBeUndefined();
  });

  it("still lists pairs, attempts and gates by id when the node does not list the tailnet", () => {
    const rows = parcelRows({ ...served, census: undefined, attempts: [buildAttempt] });
    expect(rows.map((row) => [row.id, row.pairing.kind, row.lane.kind])).toEqual([
      [ids.build, "pairing-out", "unlisted"],
      [ids.lab, "pairing-in", "unlisted"],
      [ids.house, "unlisted", "unlisted"],
      [ids.spark, "paired", "unlisted"],
    ]);
    expect(rows.every((row) => !row.here && row.target === undefined)).toBe(true);
  });

  it("tallies parcels, pairs, pairings and open gates", () => {
    const rows = parcelRows({ ...served, attempts: [buildAttempt] });
    expect(tallyOf(rows, fixtureNow)).toEqual({ parcels: 5, paired: 1, pairing: 2, gates: 2 });
    expect(tallyOf(rows, fixtureNow + 2 * 60 * 60_000).gates).toBe(1);
  });
});

describe("mesh events", () => {
  it("names which readings each event makes stale and keeps listener and revocation news", () => {
    const news = meshNewsOf([
      meshEnvelope(1, "mesh.listener", { change: "bound", address: "100.124.48.125", port: 47800 }),
      meshEnvelope(2, "mesh.walked", { grantId: "grant-wren" }),
      meshEnvelope(3, "mesh.grant", { change: "revoked", grantId: "grant-wren", by: "keeper" }),
      meshEnvelope(4, "mesh.revocation", {
        change: "undelivered",
        revocation: { kind: "grant", id: "grant-wren", target: ids.spark },
        attempts: 3,
        error: "connect ETIMEDOUT",
      }),
      meshEnvelope(5, "turn.started", { userText: "hi" }),
      meshEnvelope(6, "mesh.listener", { change: "nonsense" }),
    ]);
    expect([...news.stale].sort()).toEqual(["audit", "grants"]);
    expect(news.listener).toEqual([{ change: "bound", address: "100.124.48.125", port: 47800 }]);
    expect(news.undelivered.map((missed) => missed.attempts)).toEqual([3]);
    expect(
      [...meshNewsOf([meshEnvelope(7, "mesh.pair", { change: "added" })]).stale].sort(),
    ).toEqual(["audit", "census", "pairs"]);
    expect(meshNewsOf([meshEnvelope(8, "mesh.pairing", { change: "started" })]).stale).toEqual(
      new Set(["pairs", "audit"]),
    );
  });

  it("follows the listener through bind, idle and failure", () => {
    const bound = [
      { change: "bound", address: "100.124.48.125", port: 47800 },
      { change: "bound", address: "fd7a:115c:a1e0::7c30:307d", port: 47800 },
      { change: "serve-warning", message: "update tailscale" },
    ] as const;
    const listening = bound.reduce(listenerAfter, quietListener);
    expect(listening.bound).toEqual({
      "100.124.48.125": 47800,
      "fd7a:115c:a1e0::7c30:307d": 47800,
    });
    expect(listening.warning).toBe("update tailscale");
    const unbound = listenerAfter(listening, {
      change: "unbound",
      address: "100.124.48.125",
      reason: "address-gone",
    });
    expect(Object.keys(unbound.bound)).toEqual(["fd7a:115c:a1e0::7c30:307d"]);
    const idle = listenerAfter(unbound, { change: "idle", reason: "funnel-enabled" });
    expect(idle).toMatchObject({ bound: {}, idle: "funnel-enabled" });
    const failing = listenerAfter(idle, { change: "status-failed", error: "exit 1" });
    expect(failing.unreadable).toBe("exit 1");
    const failed = listenerAfter(failing, {
      change: "bind-failed",
      address: "100.1.1.1",
      error: "EADDRINUSE",
    });
    expect(failed.bound).toEqual({});
    expect(listenerAfter(failed, bound[0])).toMatchObject({
      idle: undefined,
      unreadable: undefined,
    });
  });
});

describe("lanes that move under an open pane", () => {
  it("reads mesh.peers into lanes and stales no reading", () => {
    const news = meshNewsOf([
      meshEnvelope(9, "mesh.peers", {
        change: "lanes",
        peers: [{ stableId: ids.spark, path: { kind: "derp", region: "ord" } }],
      }),
      meshEnvelope(10, "mesh.peers", { change: "lanes", peers: [{ stableId: 7 }] }),
    ]);
    expect(news.lanes).toEqual([{ stableId: ids.spark, path: { kind: "derp", region: "ord" } }]);
    expect(news.stale.size).toBe(0);
  });

  it("moves only the named peers, and an offline lane takes the peer offline", () => {
    const moved = censusWithLanes(census, [
      { stableId: ids.spark, path: { kind: "offline" } },
      { stableId: "nGoneCNTRL", path: { kind: "direct", endpoint: "10.0.0.1:41641" } },
    ]);
    const spark = moved?.peers.find((peer) => peer.stableId === ids.spark);
    expect(spark).toMatchObject({ path: { kind: "offline" }, online: false });
    expect(moved?.peers.filter((peer) => peer.stableId !== ids.spark)).toEqual(
      census.peers.filter((peer) => peer.stableId !== ids.spark),
    );
    expect(censusWithLanes(undefined, [])).toBeUndefined();
  });
});
