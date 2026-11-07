import type { Fetch } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { creatureMade, creatureOpened } from "./fixtures.ts";
import {
  conversationOf,
  creatureMadeOf,
  creaturesOnTheStead,
  onboardingClientOver,
  onboardingPaths,
  refusalOf,
  workshopOwnersOnTheNode,
} from "./requests.ts";

interface Sent {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function recording(answer: (sent: Sent) => Response): { transport: Fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const transport: Fetch = async (path, init = {}) => {
    const request: Sent = {
      path,
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? init.body : undefined,
    };
    sent.push(request);
    return answer(request);
  };
  return { transport, sent };
}

const jsonAnswer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("the onboarding requests", () => {
  it("reads workshops and models with GET and makes the creature and its workshop with JSON POSTs", async () => {
    const { transport, sent } = recording((request) =>
      request.path === onboardingPaths.creatures
        ? jsonAnswer(201, creatureMade().body)
        : jsonAnswer(200, { workshops: [] }),
    );
    const client = onboardingClientOver(transport);
    await client.workshops();
    await client.models();
    await client.createCreature({
      name: "Wren",
      skin: "kid",
      models: { strong: { provider: "ollama", model: "qwen3:32b" } },
    });
    await client.createWorkshop({ creature: "wren", substrate: "host" });
    await client.readCreature("wren/odd slug");
    expect(sent.map((request) => [request.method, request.path])).toEqual([
      ["GET", "/workshops"],
      ["GET", "/models"],
      ["POST", "/creatures"],
      ["POST", "/workshops"],
      ["GET", "/creatures/wren%2Fodd%20slug"],
    ]);
    expect(JSON.parse(sent[2]?.body ?? "")).toEqual({
      name: "Wren",
      skin: "kid",
      models: { strong: { provider: "ollama", model: "qwen3:32b" } },
    });
    expect(sent[2]?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(sent[3]?.body ?? "")).toEqual({ creature: "wren", substrate: "host" });
    expect(sent[0]?.body).toBeUndefined();
  });

  it("reads the creatures on the stead from the listing as the server serves it, { creatures }, and from a bare array", () => {
    const rows = [
      { slug: "osk", name: "Osk", seed: 0, sigil: "o", workshop: "host" },
      { slug: "tam", name: "Tam", sigil: "t", workshop: "host" },
    ];
    const expected = [
      { slug: "osk", name: "Osk", seed: 0 },
      { slug: "tam", name: "Tam", seed: undefined },
    ];
    expect(creaturesOnTheStead({ status: 200, body: { creatures: rows } })).toEqual(expected);
    expect(creaturesOnTheStead({ status: 200, body: rows })).toEqual(expected);
    expect(creaturesOnTheStead({ status: 200, body: { bots: rows } })).toEqual([]);
    expect(creaturesOnTheStead({ status: 503, body: { creatures: rows } })).toEqual([]);
  });

  it("reads which slugs own a workshop on the node from each row's creature, else from the id before its hash, and nobody from a refusal", () => {
    const rows = [
      { id: "bea-dc1057", creature: "bea", substrate: "host", state: "stopped" },
      { id: "old-tom-1f2e3d", substrate: "host", state: "running" },
    ];
    expect(workshopOwnersOnTheNode({ status: 200, body: { workshops: rows } })).toEqual([
      "bea",
      "old-tom",
    ]);
    expect(workshopOwnersOnTheNode({ status: 200, body: { bots: rows } })).toEqual([]);
    expect(
      workshopOwnersOnTheNode({ status: 503, body: { error: "this host serves no workshops" } }),
    ).toEqual([]);
  });

  it("reads JSON bodies, keeps plain text as an error line, and leaves an empty body undefined", async () => {
    const answers = [
      jsonAnswer(503, { error: "this host serves no workshops" }),
      new Response("gateway timeout", { status: 504 }),
      new Response(null, { status: 204 }),
    ];
    const client = onboardingClientOver(async () => answers.shift() ?? new Response(null));
    expect(await client.workshops()).toEqual({
      status: 503,
      body: { error: "this host serves no workshops" },
    });
    expect(await client.models()).toEqual({ status: 504, body: { error: "gateway timeout" } });
    expect(await client.workshops()).toEqual({ status: 204, body: undefined });
  });

  it("recognises a made creature, an opened conversation, and words a refusal", () => {
    expect(creatureMadeOf(creatureMade("Tam", "tam"))).toEqual({ slug: "tam", name: "Tam" });
    expect(creatureMadeOf({ status: 409, body: { error: "taken" } })).toBeUndefined();
    expect(conversationOf(creatureOpened("s-9"))).toBe("s-9");
    expect(conversationOf({ status: 404, body: { error: "no creature" } })).toBeUndefined();
    expect(refusalOf({ status: 409, body: { error: "taken" } })).toBe("taken");
    expect(refusalOf({ status: 500, body: undefined })).toBe("the server answered 500");
  });
});
