import { describe, expect, it } from "vitest";
import { campaignFixture } from "../../protocol/src/campaign-testing.ts";
import { CampaignRequestError, campaignsOverFetch } from "./campaigns.ts";

describe("campaign transport", () => {
  it("sends a revision-guarded user command once and surfaces a conflict", async () => {
    const seen: { path: string; body: unknown }[] = [];
    const client = campaignsOverFetch(async (path, init) => {
      seen.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json(
        { refused: "stale-revision", detail: "Read the newer campaign." },
        { status: 409 },
      );
    });
    await expect(
      client.command("a/b", { expectedRevision: 4, command: { type: "pause", reason: "Review" } }),
    ).rejects.toMatchObject({
      status: 409,
      code: "stale-revision",
      message: "Read the newer campaign.",
    });
    expect(seen).toEqual([
      {
        path: "/campaigns/a%2Fb/commands",
        body: { expectedRevision: 4, command: { type: "pause", reason: "Review" } },
      },
    ]);
  });
  it("does not confuse HTTP errors with valid snapshots or invent a missing sequence", async () => {
    const client = campaignsOverFetch(async () => Response.json({ campaign: campaignFixture() }));
    await expect(client.read("campaign-one")).rejects.toBeInstanceOf(CampaignRequestError);
    const forbidden = campaignsOverFetch(async () =>
      Response.json({ campaign: campaignFixture(), sequence: 1 }, { status: 403 }),
    );
    await expect(forbidden.read("campaign-one")).rejects.toMatchObject({ status: 403 });
  });
  it.each(["read", "command"] as const)(
    "rejects a %s response for another campaign",
    async (method) => {
      const client = campaignsOverFetch(async () =>
        Response.json({ campaign: campaignFixture({ id: "another-campaign" }), sequence: 1 }),
      );
      const request =
        method === "read"
          ? client.read("campaign-one")
          : client.command("campaign-one", { expectedRevision: 1, command: { type: "pause" } });
      await expect(request).rejects.toMatchObject({ status: 502 });
    },
  );
  it.each([
    ["an envelope without a campaign body", { schemaVersion: 1, id: "campaign-one", revision: 1 }],
    ["an empty identity", campaignFixture({ id: "" })],
    ["missing usage", { ...campaignFixture(), usage: undefined }],
    ["a null budget", { ...campaignFixture(), budget: null }],
    ["an invalid persistence object", { ...campaignFixture(), persistence: [] }],
    ["a null artifact", { ...campaignFixture(), artifacts: [null] }],
  ])("rejects a campaign reading with %s", async (_description, campaign) => {
    const client = campaignsOverFetch(async () => Response.json({ campaign, sequence: 1 }));
    await expect(client.read("campaign-one")).rejects.toMatchObject({ status: 502 });
  });
  it("rejects a streamed snapshot for another campaign before yielding it", async () => {
    const client = campaignsOverFetch(
      async () =>
        new Response(
          `event: snapshot\ndata: ${JSON.stringify({ campaign: campaignFixture({ id: "another-campaign" }), sequence: 99 })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const stream = client
      .watch("campaign-one", 1, new AbortController().signal)
      [Symbol.asyncIterator]();
    expect(await stream.next()).toEqual({ done: false, value: { kind: "connected" } });
    await expect(stream.next()).rejects.toMatchObject({ status: 502 });
  });
  it("resumes with a durable cursor and reads snapshots, heartbeats and domain events", async () => {
    let headers: Headers | undefined;
    const event = {
      schemaVersion: 1,
      id: "event-2",
      campaignId: "campaign-one",
      sequence: 2,
      commandId: "command-2",
      kind: "paused",
      at: 3_000,
      actor: { id: "person", role: "user" },
      summary: "Paused",
      refs: [],
    };
    const client = campaignsOverFetch(async (_path, init) => {
      headers = new Headers(init?.headers);
      return new Response(
        `event: snapshot\ndata: ${JSON.stringify({ campaign: campaignFixture(), sequence: 1 })}\n\nevent: heartbeat\ndata: {"at":"2026-11-10T00:00:00Z"}\n\nid: 2\nevent: campaign\ndata: ${JSON.stringify(event)}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const items = [];
    for await (const item of client.watch("campaign-one", 1, new AbortController().signal))
      items.push(item);
    expect(headers?.get("last-event-id")).toBe("1");
    expect(items.map((item) => item.kind)).toEqual(["connected", "snapshot", "heartbeat", "event"]);
    expect(items.at(-1)).toEqual({ kind: "event", event });
  });
  it("encodes artifact paths and requests previews without executing content", async () => {
    const paths: string[] = [];
    const client = campaignsOverFetch(async (path) => {
      paths.push(path);
      return Response.json({
        artifactId: "artifact/a",
        path: "nested/a b.md",
        mimeType: "text/html",
        content: "<script>danger()</script>",
        truncated: false,
        totalBytes: 25,
      });
    });
    expect((await client.artifact("a/b", "artifact/a", "nested/a b.md")).content).toContain(
      "<script>",
    );
    expect(paths).toEqual(["/campaigns/a%2Fb/artifacts/artifact%2Fa?path=nested%2Fa%20b.md"]);
  });
  it("confirms only the requested artifact export and sends its destination once", async () => {
    const seen: { path: string; method: string | undefined; body: unknown }[] = [];
    const exported = { artifactId: "artifact/a", path: "workspace/exports/result" };
    const client = campaignsOverFetch(async (path, init) => {
      seen.push({ path, method: init?.method, body: JSON.parse(String(init?.body)) });
      return Response.json(exported);
    });
    await expect(client.export("a/b", "artifact/a", "exports/result")).resolves.toEqual(exported);
    expect(seen).toEqual([
      {
        path: "/campaigns/a%2Fb/artifacts/artifact%2Fa/export",
        method: "POST",
        body: { destination: "exports/result" },
      },
    ]);
  });
  it.each([
    null,
    {},
    { artifactId: "another", path: "exports/result" },
    { artifactId: "version", path: null },
    { artifactId: "version", path: "" },
    { artifactId: "version", path: " \t\n " },
  ])("rejects an unconfirmed successful export response: %j", async (body) => {
    let calls = 0;
    const client = campaignsOverFetch(async () => {
      calls += 1;
      return Response.json(body);
    });
    await expect(client.export("campaign", "version", "exports/result")).rejects.toMatchObject({
      status: 502,
    });
    expect(calls).toBe(1);
  });
});
