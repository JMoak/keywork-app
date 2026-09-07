import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { keyworkClient, type ServerDocument } from "@keywork-app/client";
import { operationIds } from "@keywork-app/protocol";
import { repoRoot, reportViolations } from "./lib/repo-files.ts";

export const docFixture = join(repoRoot, "packages/client/src/fixtures/doc.json");

export function contractViolations(document: ServerDocument): string[] {
  const expected = new Set<string>(operationIds);
  const actual = new Set(document.operationIds);
  const missing = [...expected].filter((id) => !actual.has(id));
  const unknown = [...actual].filter((id) => !expected.has(id));
  return [
    ...missing.map((id) => `the server no longer serves ${id}`),
    ...unknown.map((id) => `the server added ${id}; the protocol does not know it yet`),
  ];
}

export function documentOfFixture(text: string): ServerDocument {
  const doc = JSON.parse(text) as {
    info: { version: string };
    paths: Record<string, Record<string, { operationId: string }>>;
  };
  return {
    version: doc.info.version,
    operationIds: Object.values(doc.paths)
      .flatMap((item) => Object.values(item))
      .map((operation) => operation.operationId)
      .sort(),
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { url: { type: "string" }, token: { type: "string" } },
  });
  const document =
    values.url === undefined
      ? documentOfFixture(await readFile(docFixture, "utf8"))
      : await keyworkClient({ url: values.url, token: values.token ?? "" }).document();
  const source = values.url ?? docFixture;
  process.exitCode = reportViolations(
    {
      check: "check:contract",
      heading: `The protocol and the server at ${source} disagree:`,
      scanned: `${document.operationIds.length} operations, server version ${document.version}`,
    },
    contractViolations(document),
  );
}
