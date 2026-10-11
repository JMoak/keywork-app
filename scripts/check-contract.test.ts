import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protocolVersion, routes } from "@keywork-app/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  contractViolations,
  documentOfCheckout,
  documentOfFixture,
  documentOfOpenApi,
} from "./check-contract.ts";

describe("check:contract", () => {
  it("passes against the recorded document, whose version is a placeholder", async () => {
    const document = await documentOfFixture();
    expect(document.version).toBeUndefined();
    expect(document.routes).toEqual(
      [...routes].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`)),
    );
    expect(contractViolations(document)).toEqual([]);
  });

  it("names dropped, unknown and moved routes and a version off the pin", () => {
    const paths: Record<string, Record<string, { operationId: string }>> = {};
    for (const route of routes) {
      if (route.operationId === "abortSession") continue;
      const method = route.operationId === "injectPrompt" ? "put" : route.method.toLowerCase();
      paths[route.path] = { ...paths[route.path], [method]: { operationId: route.operationId } };
    }
    paths["/sessions/{id}/mode"] = { post: { operationId: "setSessionMode" } };
    const document = documentOfOpenApi({ info: { version: "9.9.9" }, paths }, "drifted");
    expect(contractViolations(document)).toEqual([
      `the server reports version 9.9.9; the app pins ${protocolVersion}`,
      "the server no longer serves abortSession",
      "the server added setSessionMode; the protocol does not know it yet",
      "injectPrompt moved: the protocol has POST /sessions/{id}/inject, the server PUT /sessions/{id}/inject",
    ]);
  });

  describe("against a keywork checkout", () => {
    let checkout: string;

    beforeAll(async () => {
      checkout = await mkdtemp(join(tmpdir(), "keywork-app-drifted-"));
      await writeDriftedCheckout(checkout);
    });

    afterAll(async () => {
      await rm(checkout, { recursive: true, force: true });
    });

    it("imports openApiDocument by path and fails on a drifted server", async () => {
      const document = await documentOfCheckout(checkout);
      expect(document.origin).toBe(checkout);
      expect(document.version).toBe("0.0.9");
      expect(contractViolations(document)).toEqual([
        `the server reports version 0.0.9; the app pins ${protocolVersion}`,
        "the server no longer serves injectPrompt",
      ]);
    });
  });
});

async function writeDriftedCheckout(root: string): Promise<void> {
  const served = routes.filter((route) => route.operationId !== "injectPrompt");
  await mkdir(join(root, "packages/server/src"), { recursive: true });
  await mkdir(join(root, "packages/cli"), { recursive: true });
  await writeFile(
    join(root, "packages/cli/package.json"),
    JSON.stringify({ name: "@keywork/cli", version: "0.0.9" }),
  );
  await writeFile(
    join(root, "packages/server/src/openapi.ts"),
    [
      "export function openApiDocument(serverUrl: string, version: string) {",
      "  const paths: Record<string, Record<string, { operationId: string }>> = {};",
      `  for (const route of ${JSON.stringify(served)}) {`,
      "    paths[route.path] = { ...paths[route.path], [route.method.toLowerCase()]: { operationId: route.operationId } };",
      "  }",
      '  return { openapi: "3.1.0", info: { title: "keywork", version }, servers: [{ url: serverUrl }], paths };',
      "}",
      "",
    ].join("\n"),
  );
}
