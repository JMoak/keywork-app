import { describe, expect, it } from "vitest";
import { keyworkClientOver } from "./client.ts";
import { CreatureProjectRefusal } from "./creature-projects.ts";

describe("qualified creature project requests", () => {
  it("preserves home and project session identities and explicit discussion text", async () => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    const home = { workspace: "home-1", session: "same-id" };
    const project = { workspace: "project-2", session: "same-id" };
    const client = keyworkClientOver(async (path, init = {}) => {
      calls.push({
        path,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Response.json(
        { session: path.endsWith("/discussion") ? home : project },
        { status: 202 },
      );
    });
    const draft = { requestId: "keeper-1", text: "this excerpt only", source: project };
    expect(await client.discussCreatureProjectSession("my creature", "project/2", draft)).toEqual({
      session: home,
    });
    expect(await client.startCreatureProjectThread("my creature", "project/2", draft)).toEqual({
      session: project,
    });
    expect(calls).toEqual([
      {
        path: expect.stringContaining("/creatures/my%20creature/projects/project%2F2/discussion"),
        method: "POST",
        body: draft,
      },
      {
        path: expect.stringContaining("/creatures/my%20creature/projects/project%2F2/threads"),
        method: "POST",
        body: draft,
      },
    ]);
  });

  it("keeps an authorization refusal out of successful session results", async () => {
    const client = keyworkClientOver(async () =>
      Response.json(
        { code: "untrusted-project", error: "authorize the project first" },
        { status: 403 },
      ),
    );
    await expect(client.bindCreatureProject("one", "two")).rejects.toMatchObject({
      name: CreatureProjectRefusal.name,
      status: 403,
      code: "untrusted-project",
      message: "authorize the project first",
    });
  });
});
