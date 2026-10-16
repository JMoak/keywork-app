import type { KeyworkClient } from "@keywork-app/client";
import type { McpServerStatus, PermissionsView } from "@keywork-app/protocol";
import { isManifest, packageManifest, scriptsOfPackage } from "./toolchains.ts";

export interface PostureFacts {
  readonly permissions: PermissionsView;
  readonly version: string | undefined;
  readonly manifests: readonly string[] | undefined;
  readonly scripts: readonly string[];
  readonly mcp: readonly McpServerStatus[] | undefined;
  readonly bots: readonly string[] | undefined;
  readonly unread: readonly string[];
}

export type FactsClient = Pick<
  KeyworkClient,
  "permissions" | "document" | "tree" | "file" | "mcpServers" | "bots"
>;

export async function readPostureFacts(client: FactsClient): Promise<PostureFacts> {
  const [permissions, version, manifests, mcp, bots] = await Promise.all([
    client.permissions(),
    attempt("the keywork version", async () => (await client.document()).version),
    attempt("the workspace root", () => rootManifests(client)),
    attempt("the mcp servers", () => enabledMcpServers(client)),
    attempt("the bots", async () => (await client.bots()).map((bot) => bot.name)),
  ]);
  const scripts: Attempted<string[]> = manifests.value?.includes(packageManifest)
    ? await attempt(`the ${packageManifest} scripts`, () => packageScripts(client))
    : { value: [] };
  return {
    permissions,
    version: version.value,
    manifests: manifests.value,
    scripts: scripts.value ?? [],
    mcp: mcp.value,
    bots: bots.value,
    unread: [version, manifests, scripts, mcp, bots].flatMap((reading) =>
      reading.unread === undefined ? [] : [reading.unread],
    ),
  };
}

interface Attempted<T> {
  readonly value?: T;
  readonly unread?: string;
}

async function attempt<T>(what: string, read: () => Promise<T>): Promise<Attempted<T>> {
  try {
    return { value: await read() };
  } catch (error) {
    return { unread: `could not read ${what} · ${messageOf(error)}` };
  }
}

async function rootManifests(client: FactsClient): Promise<string[]> {
  const root = await client.tree("");
  if (typeof root === "string") throw new Error(`the server answers ${root}`);
  return root.entries
    .filter((entry) => entry.kind === "file" && isManifest(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function packageScripts(client: FactsClient): Promise<string[]> {
  const file = await client.file(packageManifest);
  if (typeof file === "string") throw new Error(`the server answers ${file}`);
  return scriptsOfPackage(file.text);
}

async function enabledMcpServers(client: FactsClient): Promise<McpServerStatus[]> {
  return (await client.mcpServers()).filter((server) => server.enabled);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
