import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  contractMajorOf,
  contractVersion,
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

export const pinnedShapesFile = join(repoRoot, "packages/protocol/src/fixtures/event-shapes.json");

export const servedShapesPath = "packages/server/src/event-shapes.fixture.json";

export type ContractSource = "auto" | "fixture" | "checkout";

export type Shape = string | Shape[] | { [key: string]: Shape };

export interface EventShapes {
  envelope: Shape;
  events: Record<string, Shape>;
}

export interface ContractDocument {
  readonly origin: string;
  readonly version: string | undefined;
  readonly contract: string | undefined;
  readonly routes: readonly RouteShape[];
  readonly events: readonly string[] | undefined;
  readonly shapes?: EventShapes | undefined;
}

export function contractViolations(document: ContractDocument, pinned?: EventShapes): string[] {
  return [
    ...versionViolations(document.version),
    ...contractVersionViolations(document.contract),
    ...routeViolations(document.routes),
    ...eventViolations(document.events),
    ...shapeViolations(pinned, document.shapes),
  ];
}

export function shapeViolations(
  pinned: EventShapes | undefined,
  served: EventShapes | undefined,
): string[] {
  if (pinned === undefined || served === undefined) return [];
  const drift = [
    ...shapeDrift("envelope", pinned.envelope, served.envelope),
    ...eventNamesOf(pinned, served).flatMap((type) =>
      eventShapeDrift(type, pinned.events[type], served.events[type]),
    ),
  ];
  return drift.length === 0 ? [] : [...drift, wayBack];
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
    contract: doc.info["x-keywork-contract"],
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
  const document = openapi.openApiDocument("http://127.0.0.1:0", manifest.version);
  return { ...documentOfOpenApi(document, root), shapes: await servedShapesOf(root) };
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

export function pinnedEventShapes(): Promise<EventShapes> {
  return shapesIn(pinnedShapesFile);
}

export interface OpenApiShape {
  info: { version: string; "x-keywork-contract"?: string };
  paths: Record<string, Record<string, { operationId: string }>>;
  components?: {
    schemas?: { BusEnvelope?: { properties?: { type?: { enum?: string[] } } } };
  };
}

const recordedVersion = "fixture";

const wayBack = `once the protocol mirrors the server, copy keywork's ${servedShapesPath} to packages/protocol/src/fixtures/event-shapes.json`;

function versionViolations(version: string | undefined): string[] {
  if (version === undefined || version === protocolVersion) return [];
  return [`the server reports version ${version}; the app pins ${protocolVersion}`];
}

function contractVersionViolations(served: string | undefined): string[] {
  if (served === undefined) {
    return [`the server names no x-keywork-contract; the protocol pins ${contractVersion}`];
  }
  if (served === contractVersion) return [];
  if (contractMajorOf(served) !== contractMajorOf(contractVersion)) {
    return [
      `the server speaks contract ${served}, a different major than the ${contractVersion} the protocol pins`,
    ];
  }
  return [`the server speaks contract ${served}; the protocol pins ${contractVersion}`];
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

async function servedShapesOf(root: string): Promise<EventShapes | undefined> {
  try {
    return await shapesIn(join(root, servedShapesPath));
  } catch {
    return undefined;
  }
}

async function shapesIn(file: string): Promise<EventShapes> {
  return JSON.parse(await readFile(file, "utf8")) as EventShapes;
}

function eventNamesOf(pinned: EventShapes, served: EventShapes): string[] {
  return [...new Set([...Object.keys(served.events), ...Object.keys(pinned.events)])];
}

function eventShapeDrift(
  type: string,
  pinned: Shape | undefined,
  served: Shape | undefined,
): string[] {
  if (served === undefined) return [`${type}: the server's shapes no longer list it`];
  if (pinned === undefined) return [`${type}: the server sends it; the protocol pins no shape`];
  return variantDrift(type, variantsOf(pinned), variantsOf(served));
}

function shapeDrift(path: string, pinned: Shape, served: Shape): string[] {
  if (sameShape(pinned, served)) return [];
  if (Array.isArray(pinned) && Array.isArray(served)) return variantDrift(path, pinned, served);
  if (isFields(pinned) && isFields(served)) return fieldDrift(path, pinned, served);
  return [`${path}: the server sends ${summary(served)}; the protocol pins ${summary(pinned)}`];
}

function fieldDrift(path: string, pinned: Fields, served: Fields): string[] {
  const keys = [...new Set([...Object.keys(pinned), ...Object.keys(served)])].sort();
  return keys.flatMap((key) => {
    const at = `${path}.${key}`;
    const was = pinned[key];
    const now = served[key];
    if (now === undefined) return [`${at}: the server no longer sends it`];
    if (was === undefined) return [`${at}: the server sends it; the protocol does not pin it`];
    return shapeDrift(at, was, now);
  });
}

function variantDrift(path: string, pinned: readonly Shape[], served: readonly Shape[]): string[] {
  const dropped = pinned.filter((shape) => !served.some((other) => sameShape(shape, other)));
  const unpaired = served.filter((shape) => !pinned.some((other) => sameShape(shape, other)));
  const drift = dropped.flatMap((was) => {
    const tag = tagOf(was);
    const [now] = takeClosest(was, unpaired);
    return now === undefined
      ? [`${path}: the server no longer sends ${summary(was)}`]
      : shapeDrift(tag === "" ? path : `${path}[${tag}]`, was, now);
  });
  const arrivals = unpaired.map(
    (now) => `${path}: the server sends ${summary(now)}; the protocol does not pin it`,
  );
  return [...drift, ...arrivals];
}

function takeClosest(was: Shape, candidates: Shape[]): Shape[] {
  const tag = tagOf(was);
  const distances = candidates.map((now) =>
    tagOf(now) === tag ? shapeDrift("", was, now).length : Number.POSITIVE_INFINITY,
  );
  const nearest = Math.min(...distances);
  return nearest === Number.POSITIVE_INFINITY
    ? []
    : candidates.splice(distances.indexOf(nearest), 1);
}

type Fields = { [key: string]: Shape };

function isFields(shape: Shape): shape is Fields {
  return typeof shape === "object" && !Array.isArray(shape);
}

function variantsOf(shape: Shape): readonly Shape[] {
  return Array.isArray(shape) ? shape : [shape];
}

function sameShape(a: Shape, b: Shape): boolean {
  return canonical(a) === canonical(b);
}

function canonical(shape: Shape): string {
  if (typeof shape === "string") return JSON.stringify(shape);
  if (Array.isArray(shape)) return `[${shape.map(canonical).sort().join(",")}]`;
  const fields = Object.entries(shape)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`);
  return `{${fields.join(",")}}`;
}

function tagOf(shape: Shape): string {
  if (typeof shape === "string") return "";
  if (Array.isArray(shape)) return tagsOf(shape);
  const own = typeof shape.type === "string" ? literalOf(shape.type) : "";
  return [own, tagsOf(Object.values(shape))].filter((part) => part !== "").join(" ");
}

function tagsOf(shapes: readonly Shape[]): string {
  return shapes
    .map(tagOf)
    .filter((part) => part !== "")
    .join(" ");
}

function literalOf(type: string): string {
  return type.startsWith("'") && type.endsWith("'") ? type.slice(1, -1) : "";
}

function summary(shape: Shape): string {
  if (typeof shape === "string") return shape;
  if (Array.isArray(shape)) return `[${shape.map(summary).join(" | ")}]`;
  const fields = Object.entries(shape).map(([key, value]) =>
    typeof value === "string" ? key : `${key}: ${summary(value)}`,
  );
  return `{ ${fields.join(", ")} }`;
}

function routeKey(route: RouteShape): string {
  return `${route.method} ${route.path}`;
}

function byRoute(a: RouteShape, b: RouteShape): number {
  return routeKey(a).localeCompare(routeKey(b));
}

function scannedLine(document: ContractDocument): string {
  const shapes =
    document.shapes === undefined
      ? "event shapes unchecked"
      : `${Object.keys(document.shapes.events).length} event shapes`;
  return [
    `${document.routes.length} routes`,
    `contract ${document.contract ?? "unnamed"}`,
    shapes,
    `server version ${document.version ?? "unversioned fixture"}`,
    `from ${document.origin}`,
  ].join(", ");
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
      scanned: scannedLine(document),
    },
    contractViolations(document, await pinnedEventShapes()),
  );
}

function isSource(value: string): value is ContractSource {
  return value === "auto" || value === "fixture" || value === "checkout";
}
