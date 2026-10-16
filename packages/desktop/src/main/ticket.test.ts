import { describe, expect, it } from "vitest";
import { liveServerOf, probeTicket } from "./ticket.ts";

const ticket = { url: "http://127.0.0.1:4770/", token: "secret" };

const keyworkDocument = {
  info: {
    title: "keywork",
    version: "0.2.0",
    workspace: { anchor: "C:/work", identity: "5de0568f6bc0" },
  },
};

function serverAnswering(asks: number, document: unknown = keyworkDocument) {
  const seen: Array<{ url: string; authorization: string | undefined }> = [];
  const transport = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, authorization: new Headers(init?.headers).get("authorization") ?? undefined });
    return url.endsWith("/doc")
      ? Response.json(document)
      : new Response(asks === 200 ? '{"asks":[]}' : null, { status: asks });
  }) as typeof fetch;
  return { transport, seen };
}

describe("probeTicket", () => {
  it("calls a ticket live only when /doc answers as keywork and the token opens an authenticated route", async () => {
    const server = serverAnswering(200);
    expect(await probeTicket(ticket, server.transport)).toEqual({
      version: "0.2.0",
      identity: "5de0568f6bc0",
    });
    expect(server.seen).toEqual([
      { url: "http://127.0.0.1:4770/doc", authorization: "Bearer secret" },
      { url: "http://127.0.0.1:4770/asks", authorization: "Bearer secret" },
    ]);
  });

  it("calls a ticket dead when its port refuses, its token is refused, or something else answers", async () => {
    const refused = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await probeTicket(ticket, refused)).toBeUndefined();
    expect(await probeTicket(ticket, serverAnswering(401).transport)).toBeUndefined();
    expect(
      await probeTicket(ticket, serverAnswering(200, { info: { title: "other" } }).transport),
    ).toBeUndefined();
  });
});

describe("liveServerOf", () => {
  it("reads the version and the workspace identity a keywork /doc carries, tolerating none", () => {
    expect(liveServerOf({ info: { title: "keywork", version: "0.1.0" } })).toEqual({
      version: "0.1.0",
      identity: undefined,
    });
    expect(liveServerOf(null)).toBeUndefined();
    expect(liveServerOf({ info: { title: "keywork" } })).toBeUndefined();
  });
});
