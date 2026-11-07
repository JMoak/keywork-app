import { describe, expect, it } from "vitest";
import {
  auditPage,
  auditRows,
  begunBuild,
  census,
  fakeMeshServer,
  grantList,
  ids,
  ok,
  pairsReading,
  wrenGate,
} from "./fixtures.ts";
import {
  auditPageLimit,
  emptyTrail,
  followAudit,
  isUnserved,
  keptAuditRows,
  meshOperations,
  meshRoutesOver,
} from "./routes.ts";
import type { AuditRow } from "./wire.ts";

const contractOneEight = [
  ["GET", "/mesh/pairs", "listMeshPairs"],
  ["POST", "/mesh/pairs", "beginMeshPairing"],
  ["POST", "/mesh/pairs/{id}/complete", "completeMeshPairing"],
  ["POST", "/mesh/pairings/{id}/confirm", "confirmMeshPairingHere"],
  ["DELETE", "/mesh/pairs/{id}", "removeMeshPair"],
  ["GET", "/mesh/grants", "listMeshGrants"],
  ["POST", "/mesh/grants", "issueMeshGrant"],
  ["DELETE", "/mesh/grants/{id}", "revokeMeshGrant"],
  ["GET", "/mesh/audit", "meshAudit"],
];

describe("the parcels pane's mesh routes", () => {
  it("names every console route of contract 1.8 exactly as /doc records it, and one proposal", () => {
    const served = Object.values(meshOperations).filter((operation) => operation.since === "1.8");
    expect(
      served.map((operation) => [operation.method, operation.path, operation.operationId]),
    ).toEqual(contractOneEight);
    expect(
      Object.values(meshOperations).filter((operation) => operation.since === "proposed"),
    ).toEqual([
      { method: "GET", path: "/mesh/peers", operationId: "listMeshPeers", since: "proposed" },
    ]);
  });

  it("reads the four readings in the recorded shapes", async () => {
    const routes = meshRoutesOver(fakeMeshServer().fetch);
    expect(await routes.census()).toEqual({ ok: true, value: census });
    expect(await routes.pairs()).toEqual({ ok: true, value: pairsReading });
    expect(await routes.grants()).toEqual({ ok: true, value: grantList });
    expect(await routes.audit()).toEqual({ ok: true, value: auditPage });
  });

  it("sends each verb with its path id and body", async () => {
    const server = fakeMeshServer();
    const routes = meshRoutesOver(server.fetch);
    const target = {
      endpoint: "http://100.71.3.4:47800",
      stableId: ids.build,
      userId: null,
      tags: ["tag:ci"],
    };
    expect(await routes.beginPairing(target)).toEqual({ ok: true, value: begunBuild });
    await routes.completePairing("attempt build", { matches: true, claimCode: "K7Q2-MX4P" });
    await routes.completePairing("attempt-x", { matches: false });
    await routes.confirmHere("pairing-lab", "105377");
    await routes.unpair("pair-spark");
    const draft = {
      subject: { creature: "wren", node: ids.house },
      target: ids.spark,
      caps: wrenGate.caps,
      expiresAt: wrenGate.expiresAt,
    };
    await routes.issueGrant(draft);
    await routes.revokeGrant("grant-wren");
    expect(
      server.calls.map((call) => [call.operation, call.id ?? null, call.body ?? null]),
    ).toEqual([
      ["beginPairing", null, { ...target, role: "console" }],
      ["completePairing", "attempt build", { matches: true, claimCode: "K7Q2-MX4P" }],
      ["completePairing", "attempt-x", { matches: false }],
      ["confirmHere", "pairing-lab", { sas: "105377" }],
      ["unpair", "pair-spark", null],
      ["issueGrant", null, draft],
      ["revokeGrant", "grant-wren", null],
    ]);
  });

  it("turns every refusal body the node writes into one line", async () => {
    const routes = meshRoutesOver(
      fakeMeshServer({
        pairs: () => ({ status: 503, body: { error: "the mesh is not served by this host" } }),
        beginPairing: () => ({
          status: 502,
          body: {
            failed: "refused",
            detail: "build-box refused the hello: unclaimed-needs-a-console",
          },
        }),
        confirmHere: () => ({ status: 409, body: { state: "aborted", reason: "sas-mismatch" } }),
        grants: () => ({ status: 500, body: "not json at all" }),
        audit: () => ok({ rows: "nope" }),
      }).fetch,
    );
    const target = { endpoint: "http://x:1", stableId: ids.build, userId: null, tags: [] };
    expect(await routes.pairs()).toEqual({
      ok: false,
      status: 503,
      detail: "the mesh is not served by this host",
    });
    expect(await routes.beginPairing(target)).toEqual({
      ok: false,
      status: 502,
      detail: "build-box refused the hello: unclaimed-needs-a-console",
    });
    expect(await routes.confirmHere("pairing-lab", "000000")).toEqual({
      ok: false,
      status: 409,
      detail: "sas-mismatch",
    });
    expect(await routes.grants()).toMatchObject({ ok: false, status: 500 });
    expect(await routes.audit()).toEqual({
      ok: false,
      status: 200,
      detail: "meshAudit answered in a shape this console does not read",
    });
    const unreachable = meshRoutesOver(async () => {
      throw new Error("the server went away");
    });
    expect(await unreachable.pairs()).toEqual({
      ok: false,
      status: 0,
      detail: "the server went away",
    });
  });

  it("calls a missing peers route unserved, as a 404 or a 503 is", async () => {
    const routes = meshRoutesOver(fakeMeshServer({ census: undefined }).fetch);
    const missing = await routes.census();
    expect(missing).toEqual({ ok: false, status: 404, detail: "no such route" });
    expect(isUnserved(missing)).toBe(true);
    expect(isUnserved({ ok: false, status: 503, detail: "" })).toBe(true);
    expect(isUnserved({ ok: false, status: 500, detail: "" })).toBe(false);
    expect(isUnserved({ ok: true, value: 1 })).toBe(false);
  });
});

describe("following the audit log", () => {
  it("pages after the last hash it holds until a short page, never keeping a row twice", async () => {
    const log = numberedRows(auditPageLimit + 3);
    const server = fakeMeshServer({
      audit: (request) => {
        const start = request.query.after === undefined ? 0 : Number(request.query.after.slice(1));
        return ok({
          rows: log.slice(start, start + Number(request.query.limit)),
          chain: { intact: true, head: "h", rows: log.length },
        });
      },
    });
    const routes = meshRoutesOver(server.fetch);
    const first = await followAudit(routes, emptyTrail);
    expect(first.ok && first.value.rows.length).toBe(log.length);
    expect(server.callsTo("audit").map((call) => call.query)).toEqual([
      { limit: String(auditPageLimit) },
      { after: `h${auditPageLimit}`, limit: String(auditPageLimit) },
    ]);
    const again = first.ok ? await followAudit(routes, first.value) : first;
    expect(again.ok && again.value.rows.length).toBe(log.length);
    expect(server.callsTo("audit").at(-1)?.query.after).toBe(`h${log.length}`);
  });

  it("keeps only the newest rows and stops at a refusal", async () => {
    const held = { rows: numberedRows(keptAuditRows), chain: undefined };
    const routes = meshRoutesOver(
      fakeMeshServer({
        audit: () => ok({ rows: auditRows, chain: { intact: true, head: "x", rows: 5 } }),
      }).fetch,
    );
    const followed = await followAudit(routes, held);
    expect(followed.ok && followed.value.rows.length).toBe(keptAuditRows);
    expect(followed.ok && followed.value.rows.at(-1)?.hash).toBe("hash-5");
    const refused = meshRoutesOver(
      fakeMeshServer({ audit: () => ({ status: 503, body: { error: "the mesh is not served" } }) })
        .fetch,
    );
    expect(await followAudit(refused, held)).toEqual({
      ok: false,
      status: 503,
      detail: "the mesh is not served",
    });
  });
});

function numberedRows(count: number): AuditRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ...(auditRows[0] as AuditRow),
    hash: `h${index + 1}`,
    prevHash: `h${index}`,
  }));
}
