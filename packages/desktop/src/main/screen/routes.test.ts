import { describe, expect, it } from "vitest";
import { inboundSignaling, type SignalingRouteSeams, signalingRoutes } from "./routes.ts";

const nodeFile = JSON.stringify({
  schema: 1,
  state: "running",
  machine: { id: "9718bdd2", name: "moak-main" },
  ports: { mesh: 47800, screenUdp: { first: 47810, last: 47829 } },
});

const self = {
  stableId: "nSelf",
  machine: "moak-main",
  dnsName: "moak-main.tail1234.ts.net.",
  addresses: ["fd7a:115c:a1e0::8928:307e", "100.124.48.125"],
  endpoint: "http://100.124.48.125:47800",
};

const spark = {
  stableId: "nSpark",
  machine: "spark-ad4d",
  dnsName: "spark-ad4d.tail1234.ts.net.",
  addresses: ["100.90.1.2"],
  endpoint: "http://100.90.1.2:47800",
};

const pairWithSpark = { id: "pair-1", peerStableId: "nSpark", endpoint: "http://100.90.1.2:47801" };

const houseToken = "house-token-0123456789abcdefghijklmnopqrstuv";
const houseFile = JSON.stringify({ token: houseToken, listeners: [] });
const pairToken = "pair.pair-1.1762400000000.mac";

const issuing: typeof fetch = async (url, init) => {
  expect(String(url)).toBe("http://100.124.48.125:47800/mesh/screen/tickets");
  expect(init?.headers).toMatchObject({ authorization: `Bearer ${houseToken}` });
  const { pairId } = JSON.parse(String(init?.body)) as { pairId: string };
  return pairId === "pair-1"
    ? Response.json({ token: pairToken, expiresAt: "2026-11-06T12:00:00.000Z" }, { status: 201 })
    : Response.json({ error: `this machine holds no pair ${pairId}` }, { status: 404 });
};

function seams(overrides: Partial<SignalingRouteSeams> = {}): SignalingRouteSeams {
  return {
    nodeFile: async () => nodeFile,
    houseFile: async () => houseFile,
    census: async () => ({ self, peers: [spark] }),
    pairs: async () => ({ claim: "claimed", owner: null, pairs: [pairWithSpark], pending: [] }),
    fetch: issuing,
    ...overrides,
  };
}

function routes(overrides: Partial<SignalingRouteSeams> = {}) {
  return signalingRoutes(seams(overrides));
}

describe("signaling routes for a display on this machine", () => {
  it("reach the local node's mesh listener with the house ticket, never the session id", async () => {
    expect(await routes()("moak-main", "session-1")).toEqual({
      ok: true,
      endpoint: {
        url: "http://100.124.48.125:47800/mesh/screen/signal?session=session-1",
        token: houseToken,
      },
    });
  });

  it("prefer the listener the node published beside its house ticket", async () => {
    const published = JSON.stringify({
      token: houseToken,
      listeners: ["http://[fd7a:115c:a1e0::8928:307e]:47899", "http://100.124.48.125:47899"],
    });
    const route = await routes({ houseFile: async () => published, census: async () => undefined })(
      "moak-main",
      "s",
    );
    expect(route).toMatchObject({
      ok: true,
      endpoint: { url: "http://100.124.48.125:47899/mesh/screen/signal?session=s" },
    });
  });

  it("refuse plainly when the node has published no house ticket", async () => {
    expect(await routes({ houseFile: async () => undefined })("moak-main", "s")).toEqual({
      ok: false,
      problem: "the node on moak-main has published no screen ticket: restart `keywork node`",
    });
  });

  it("name this machine by its tailnet DNS name too, and bracket an IPv6-only address", async () => {
    const ipv6Only = { ...self, addresses: ["fd7a:115c:a1e0::8928:307e"] };
    const route = await routes({ census: async () => ({ self: ipv6Only, peers: [] }) })(
      "MOAK-MAIN.tail1234.ts.net",
      "session-2",
    );
    expect(route).toMatchObject({
      ok: true,
      endpoint: {
        url: "http://[fd7a:115c:a1e0::8928:307e]:47800/mesh/screen/signal?session=session-2",
      },
    });
  });

  it("refuse plainly when no node runs here", async () => {
    const stopped = JSON.stringify({ ...JSON.parse(nodeFile), state: "stopped" });
    expect(await routes({ nodeFile: async () => stopped })("moak-main", "s")).toEqual({
      ok: false,
      problem: "no node is running on moak-main: start `keywork node`",
    });
    expect(await routes({ nodeFile: async () => undefined })("moak-main", "s")).toMatchObject({
      ok: false,
      problem: "no node is running on moak-main: start `keywork node`",
    });
  });
});

describe("signaling routes for a paired peer", () => {
  it("reach the listener its pair record names with a pair ticket this node issued", async () => {
    expect(await routes()("spark-ad4d", "session-3")).toEqual({
      ok: true,
      endpoint: {
        url: "http://100.90.1.2:47801/mesh/screen/signal?session=session-3",
        token: pairToken,
      },
    });
  });

  it("pass on this node's refusal to vouch, in its words", async () => {
    const pairs = async () => ({ pairs: [{ ...pairWithSpark, id: "pair-gone" }] });
    expect(await routes({ pairs })("spark-ad4d", "s")).toEqual({
      ok: false,
      problem:
        "this node would not vouch for a view of spark-ad4d: this machine holds no pair pair-gone",
    });
  });

  it("fall back to the listener the mesh census found when the pair names none", async () => {
    const pairs = async () => ({ pairs: [{ ...pairWithSpark, endpoint: null }] });
    expect(await routes({ pairs })("spark-ad4d", "s")).toMatchObject({
      ok: true,
      endpoint: { url: "http://100.90.1.2:47800/mesh/screen/signal?session=s" },
    });
  });
});

describe("signaling routes that do not exist", () => {
  it("refuse an unpaired machine", async () => {
    const route = await routes({ pairs: async () => ({ pairs: [] }) })("spark-ad4d", "s");
    expect(route).toEqual({ ok: false, problem: "spark-ad4d is not paired with this machine" });
  });

  it("refuse a name the tailnet does not know", async () => {
    expect(await routes()("elsewhere", "s")).toEqual({
      ok: false,
      problem: "elsewhere is not a machine on this tailnet",
    });
  });

  it("refuse a paired machine with no listener anywhere", async () => {
    const quiet = { ...spark, endpoint: undefined };
    const route = await routes({
      census: async () => ({ self, peers: [quiet] }),
      pairs: async () => ({ pairs: [{ ...pairWithSpark, endpoint: null }] }),
    })("spark-ad4d", "s");
    expect(route).toEqual({
      ok: false,
      problem: "spark-ad4d has no node listening on the tailnet",
    });
  });

  it("refuse a peer lookup when no server answers the mesh routes", async () => {
    const route = await routes({
      census: async () => {
        throw new Error("no server");
      },
    })("spark-ad4d", "s");
    expect(route).toEqual({
      ok: false,
      problem: "cannot look up spark-ad4d: no engine answers",
    });
  });
});

describe("the inbound route this house's console listens on", () => {
  it("follows the local node as the sharer with the house ticket", async () => {
    expect(await inboundSignaling(seams())()).toEqual({
      ok: true,
      endpoint: {
        url: "http://100.124.48.125:47800/mesh/screen/signal?party=sharer",
        token: houseToken,
      },
    });
  });

  it("says why it cannot listen while no node runs", async () => {
    expect(await inboundSignaling(seams({ nodeFile: async () => undefined }))()).toEqual({
      ok: false,
      problem: "no node is running on this machine: start `keywork node`",
    });
  });
});
