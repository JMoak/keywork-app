import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  eventTypes,
  type HttpMethod,
  protocolVersion,
  type RouteShape,
  routes,
} from "@keywork-app/protocol";
import { keyworkCheckoutPresent, keyworkModuleUrl, keyworkRepo } from "./lib/keywork-checkout.ts";
import { repoRoot, reportViolations } from "./lib/repo-files.ts";

export const usage =
  "usage: bun scripts/check-contract.ts [--source auto|fixture|checkout] [--url <serve url>]\n" +
  "  auto (default) reads the keywork checkout at KEYWORK_REPO or ../keywork, else the recorded fixture";

export const docFixture = join(repoRoot, "packages/client/src/fixtures/doc.json");

export type ContractSource = "auto" | "fixture" | "checkout";

export interface ContractDocument {
  readonly origin: string;
  readonly version: string | undefined;
  readonly routes: readonly RouteShape[];
  readonly events: readonly string[] | undefined;
}

export function contractViolations(document: ContractDocument): string[] {
  return [
    ...versionViolations(document.version),
    ...routeViolations(document.routes),
    ...eventViolations(document.events),
  ];
}

export function documentOfOpenApi(doc: OpenApiShape, origin: string): ContractDocument {
  const served: RouteShape[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      served.push({
        method: method.toUpperCase() as HttpMethod,
        path,
        operationId: operation.operationId,
      });
    }
  }
  return {
    origin,
    version: doc.info.version === recordedVersion ? undefined : doc.info.version,
    routes: served.sort(byRoute),
    events: doc.components?.schemas?.BusEnvelope?.properties?.type?.enum,
  };
}

export async function documentOfFixture(file = docFixture): Promise<ContractDocument> {
  return documentOfOpenApi(JSON.parse(await readFile(file, "utf8")) as OpenApiShape, file);
}

export async function documentOfCheckout(root = keyworkRepo): Promise<ContractDocument> {
  const openapi = (await import(keyworkModuleUrl("packages/server/src/openapi.ts", root))) as {
    openApiDocument(serverUrl: string, version: string): OpenApiShape;
  };
  const manifest = JSON.parse(await readFile(join(root, "packages/cli/package.json"), "utf8")) as {
    version: string;
  };
  return documentOfOpenApi(openapi.openApiDocument("http://127.0.0.1:0", manifest.version), root);
}

export async function documentOfServer(url: string): Promise<ContractDocument> {
  const response = await fetch(`${url.replace(/\/+$/, "")}/doc`);
  return documentOfOpenApi((await response.json()) as OpenApiShape, url);
}

export async function documentOfSource(source: ContractSource): Promise<ContractDocument> {
  if (source === "fixture") return documentOfFixture();
  if (source === "checkout" || (await keyworkCheckoutPresent())) return documentOfCheckout();
  return documentOfFixture();
}

export interface OpenApiShape {
  info: { version: string };
  paths: Record<string, Record<string, { operationId: string }>>;
  components?: {
    schemas?: { BusEnvelope?: { properties?: { type?: { enum?: string[] } } } };
  };
}

const recordedVersion = "fixture";

function versionViolations(version: string | undefined): string[] {
  if (version === undefined || version === protocolVersion) return [];
  return [`the server reports version ${version}; the app pins ${protocolVersion}`];
}

function routeViolations(served: readonly RouteShape[]): string[] {
  const expected = new Map<string, RouteShape>(routes.map((route) => [route.operationId, route]));
  const actual = new Map<string, RouteShape>(served.map((route) => [route.operationId, route]));
  const missing = [...expected.keys()].filter((id) => !actual.has(id));
  const unknown = [...actual.keys()].filter((id) => !expected.has(id));
  const moved = [...expected.values()].filter((route) => {
    const live = actual.get(route.operationId);
    return live !== undefined && routeKey(live) !== routeKey(route);
  });
  return [
    ...missing.map((id) => `the server no longer serves ${id}`),
    ...unknown.map((id) => `the server added ${id}; the protocol does not know it yet`),
    ...moved.map(
      (route) =>
        `${route.operationId} moved: the protocol has ${routeKey(route)}, the server ${routeKey(actual.get(route.operationId) as RouteShape)}`,
    ),
  ];
}

function eventViolations(served: readonly string[] | undefined): string[] {
  if (served === undefined) return [];
  const known = new Set<string>(eventTypes);
  const missing = eventTypes.filter((type) => !served.includes(type));
  const unknown = served.filter((type) => !known.has(type));
  return [
    ...missing.map((type) => `the server no longer emits ${type}`),
    ...unknown.map(
      (type) => `the server added the event ${type}; the protocol does not know it yet`,
    ),
  ];
}

function routeKey(route: RouteShape): string {
  return `${route.method} ${route.path}`;
}

function byRoute(a: RouteShape, b: RouteShape): number {
  return routeKey(a).localeCompare(routeKey(b));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      source: { type: "string", default: "auto" },
      url: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !isSource(values.source)) {
    console.log(usage);
    process.exit(values.help ? 0 : 2);
  }
  const document =
    values.url === undefined
      ? await documentOfSource(values.source)
      : await documentOfServer(values.url);
  process.exitCode = reportViolations(
    {
      check: "check:contract",
      heading: `The protocol and the server at ${document.origin} disagree:`,
      scanned: `${document.routes.length} routes, server version ${document.version ?? "unversioned fixture"}, from ${document.origin}`,
    },
    contractViolations(document),
  );
}

function isSource(value: string): value is ContractSource {
  return value === "auto" || value === "fixture" || value === "checkout";
}
