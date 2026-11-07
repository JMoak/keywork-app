import type { InheritedModel } from "@keywork-app/protocol";
import { z } from "zod";
import {
  cloudLine,
  connectedCloudLine,
  noInventoryLine,
  nothingReachableLine,
  reachableModelLine,
  unverifiedCloudLine,
} from "./copy.ts";
import { errorOf, type ServerReading } from "./workshop.ts";

export const modelClasses = ["strong", "loop", "decide", "vision"] as const;

export type ModelClass = (typeof modelClasses)[number];

export type ModelChoice = "inherit" | { readonly provider: string; readonly model: string };

export type ModelPolicy = Readonly<Record<ModelClass, ModelChoice>>;

export const inheritEverywhere: ModelPolicy = {
  strong: "inherit",
  loop: "inherit",
  decide: "inherit",
  vision: "inherit",
};

export interface ReachableModel {
  readonly node: string;
  readonly server: string;
  readonly root: string;
  readonly model: string;
  readonly loaded: boolean;
  readonly health: string;
  readonly classes: readonly ModelClass[];
}

export type CloudStanding =
  | { readonly kind: "answering"; readonly model: string }
  | { readonly kind: "connected"; readonly providers: readonly string[] }
  | { readonly kind: "unverified"; readonly providers: readonly string[] }
  | { readonly kind: "unknown" };

export interface Reach {
  readonly served: boolean;
  readonly local: readonly ReachableModel[];
  readonly cloud: CloudStanding;
  readonly inherited: InheritedModel | undefined;
  readonly detail: string | undefined;
}

export type Introduction =
  | { readonly kind: "promised"; readonly through: string | undefined }
  | { readonly kind: "waits"; readonly detail: string | undefined };

export function reachOf(reading: ServerReading, cloud: CloudStanding): Reach {
  if (reading.status !== 200) {
    return { served: false, local: [], cloud, inherited: undefined, detail: errorOf(reading.body) };
  }
  const report = reportSchema.safeParse(reading.body);
  if (!report.success) {
    return {
      served: false,
      local: [],
      cloud,
      inherited: undefined,
      detail: "unreadable inventory",
    };
  }
  return {
    served: true,
    local: localModelsOf(report.data),
    cloud: standingWith(cloud, marketStanding(report.data)),
    inherited: report.data.inherits?.strong,
    detail: undefined,
  };
}

export function introductionOf(reach: Reach | undefined, strong: ModelChoice): Introduction {
  if (reach === undefined || nothingReachable(reach)) return { kind: "waits", detail: undefined };
  if (strong !== "inherit" || reach.inherited === undefined) {
    return { kind: "promised", through: undefined };
  }
  return "refused" in reach.inherited
    ? { kind: "waits", detail: reach.inherited.detail }
    : { kind: "promised", through: `${reach.inherited.provider}/${reach.inherited.model}` };
}

export function proposePolicy(reach: Reach): ModelPolicy {
  const choice = (modelClass: ModelClass): ModelChoice => {
    const best = [...reach.local]
      .filter((model) => model.classes.includes(modelClass))
      .sort(readiest)[0];
    return best === undefined ? "inherit" : { provider: best.server, model: best.model };
  };
  return {
    strong: choice("strong"),
    loop: choice("loop"),
    decide: choice("decide"),
    vision: choice("vision"),
  };
}

export function localFirst(policy: ModelPolicy): boolean {
  return modelClasses.some((modelClass) => policy[modelClass] !== "inherit");
}

export function nothingReachable(reach: Reach): boolean {
  return reach.local.length === 0 && reach.cloud.kind === "unknown";
}

export function reachLines(reach: Reach): string[] {
  const local =
    reach.local.length > 0
      ? reach.local.map((model) => reachableModelLine(model))
      : [reach.served ? nothingLocal : noInventoryLine(reach.detail)];
  const nothing = nothingReachable(reach) ? [nothingReachableLine] : [];
  return [...local, cloudStandingLine(reach.cloud), ...nothing];
}

export function policyLines(policy: ModelPolicy): [ModelClass, string][] {
  return modelClasses.map((modelClass) => [modelClass, choiceWord(policy[modelClass])]);
}

export function choiceWord(choice: ModelChoice): string {
  return choice === "inherit" ? "inherit" : `${choice.provider}/${choice.model}`;
}

export const nothingLocal = "no local model server answers on this machine";

const answering: ReadonlySet<string> = new Set(["up", "loading"]);

type Report = z.infer<typeof reportSchema>;

function localModelsOf(report: Report): ReachableModel[] {
  return report.nodes.flatMap((node) =>
    node.servers
      .filter((server) => answering.has(server.health.state))
      .flatMap((server) =>
        server.models
          .filter((model) => model.installed || model.loaded)
          .map(
            (model): ReachableModel => ({
              node: node.node,
              server: server.kind,
              root: server.root,
              model: model.id,
              loaded: model.loaded,
              health: server.health.state,
              classes: model.classes,
            }),
          ),
      ),
  );
}

function marketStanding(report: Report): CloudStanding {
  const providersIn = (states: ReadonlySet<string>): string[] =>
    (report.market ?? [])
      .filter((provider) => states.has(provider.health.state))
      .map((provider) => provider.kind);
  const connected = providersIn(answering);
  if (connected.length > 0) return { kind: "connected", providers: connected };
  const unverified = providersIn(new Set(["unverified"]));
  if (unverified.length > 0) return { kind: "unverified", providers: unverified };
  return { kind: "unknown" };
}

function standingWith(answered: CloudStanding, market: CloudStanding): CloudStanding {
  return answered.kind === "unknown" ? market : answered;
}

function cloudStandingLine(cloud: CloudStanding): string {
  switch (cloud.kind) {
    case "answering":
      return cloudLine(cloud.model);
    case "connected":
      return connectedCloudLine(cloud.providers);
    case "unverified":
      return unverifiedCloudLine(cloud.providers);
    case "unknown":
      return cloudLine(undefined);
  }
}

function readiest(a: ReachableModel, b: ReachableModel): number {
  if (a.loaded !== b.loaded) return a.loaded ? -1 : 1;
  if (a.health !== b.health) return a.health === "up" ? -1 : 1;
  return a.model.localeCompare(b.model);
}

const modelSchema = z
  .object({
    id: z.string(),
    installed: z.boolean(),
    loaded: z.boolean(),
    classes: z.array(z.enum(modelClasses)),
  })
  .loose();

const serverSchema = z
  .object({
    kind: z.string(),
    root: z.string(),
    health: z.object({ state: z.string() }).loose(),
    models: z.array(modelSchema),
  })
  .loose();

const marketProviderSchema = z
  .object({ kind: z.string(), health: z.object({ state: z.string() }).loose() })
  .loose();

const inheritedSchema = z.union([
  z.object({ provider: z.string(), model: z.string() }).loose(),
  z.object({ refused: z.string(), detail: z.string() }).loose(),
]);

const reportSchema = z
  .object({
    nodes: z.array(z.object({ node: z.string(), servers: z.array(serverSchema) }).loose()),
    market: z.array(marketProviderSchema).optional(),
    inherits: z.object({ strong: inheritedSchema }).loose().optional(),
  })
  .loose();
