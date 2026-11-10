import { z } from "zod";

export const modelGroups = ["local", "flagship", "openrouter"] as const;
export type ModelGroup = (typeof modelGroups)[number];
export type ModelSetupScope = "project" | "conversation";

export interface SelectedModel {
  readonly provider: string;
  readonly model: string;
  readonly mode?: "chat" | "tools" | undefined;
}

export interface ProjectCheck extends SelectedModel {
  readonly endpoint: string;
}

export interface ModelInventory {
  readonly projectCheck?: ProjectCheck | undefined;
  readonly projectModel?: SelectedModel | undefined;
  readonly selected?: SelectedModel | undefined;
  readonly selectionProblem?: string | undefined;
  readonly localCandidate?: string | undefined;
  readonly localLoaded?: string | undefined;
  readonly localService?: string | undefined;
  readonly marketProviders?: readonly string[] | undefined;
  readonly availableMarketModels: readonly SelectedModel[];
}

export function setupInventory(value: unknown, scope: ModelSetupScope = "project"): ModelInventory {
  const report = inventory.parse(value);
  const servers = report.nodes
    .flatMap((node) => node.servers)
    .filter((server) => loopback(server.root));
  const localService = servers.find((server) => server.health.state !== "down");
  const loaded = servers
    .filter((server) => server.health.state === "up")
    .flatMap((server) => server.models)
    .filter((model) => model.loaded && model.health.state === "up");
  const localCandidate = loaded.find((model) => model.classes.includes("strong"));
  const effective =
    scope === "conversation"
      ? (report.conversation ?? report.inherits?.strong)
      : report.inherits?.strong;
  const selected = selection.safeParse(effective);
  const refusal = selectionRefusal.safeParse(effective);
  const project = selection.safeParse(report.inherits?.strong);
  const conversation = conversationSelection.safeParse(report.conversation);
  const target = conversation.success ? conversation.data.projectCheck : undefined;
  const checkable =
    target !== undefined &&
    conversation.success &&
    target.model === conversation.data.model &&
    loopback(target.endpoint);
  return {
    projectCheck: checkable ? { ...target, provider: conversation.data.provider } : undefined,
    projectModel: project.success ? project.data : undefined,
    selected: selected.success ? selected.data : undefined,
    selectionProblem:
      refusal.success && refusal.data.refused !== "unconfigured" ? refusal.data.detail : undefined,
    localCandidate: localCandidate?.id,
    localLoaded: loaded[0]?.id,
    localService: localService?.kind,
    marketProviders: report.market?.map((provider) => provider.kind),
    availableMarketModels: (report.market ?? []).flatMap((provider) =>
      provider.health === undefined || provider.health.state === "down"
        ? []
        : (provider.models ?? [])
            .filter((model) => model.health.state !== "down")
            .map((model) => ({ provider: provider.kind, model: model.id })),
    ),
  };
}

export function selectedForSetup(
  inventory: ModelInventory | undefined,
  current: SelectedModel | undefined,
): SelectedModel | undefined {
  if (current === undefined) return inventory?.selected;
  const matches = (model: SelectedModel | undefined) => sameModel(model, current);
  if (matches(inventory?.selected)) return inventory?.selected;
  return inventory?.availableMarketModels.some(matches) ? current : undefined;
}

export function sameModel(a: SelectedModel | undefined, b: SelectedModel | undefined): boolean {
  return a !== undefined && b !== undefined && a.provider === b.provider && a.model === b.model;
}

export function modelDestination(
  selected: SelectedModel,
  inventory: ModelInventory | undefined,
): string {
  const market = inventory?.marketProviders;
  if (market?.includes(selected.provider)) {
    return `${selected.provider} may charge for replies.`;
  }
  return `Provider: ${selected.provider}.`;
}

function loopback(root: string): boolean {
  try {
    const { protocol, hostname, username, password } = new URL(root);
    if ((protocol !== "http:" && protocol !== "https:") || username !== "" || password !== "")
      return false;
    return (
      hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

const selection = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  mode: z.enum(["chat", "tools"]).optional(),
});
const conversationSelection = selection.extend({
  projectCheck: z.object({ endpoint: z.string(), model: z.string() }).optional(),
});
const selectionRefusal = z.object({ refused: z.string(), detail: z.string().min(1) });
const health = z.object({ state: z.string() });
const inventory = z.object({
  nodes: z.array(
    z.object({
      servers: z.array(
        z.object({
          kind: z.string(),
          root: z.string(),
          health,
          models: z.array(
            z.object({ id: z.string(), loaded: z.boolean(), classes: z.array(z.string()), health }),
          ),
        }),
      ),
    }),
  ),
  market: z
    .array(
      z.object({
        kind: z.string(),
        health: health.optional(),
        models: z.array(z.object({ id: z.string(), health })).optional(),
      }),
    )
    .optional(),
  inherits: z.object({ strong: z.unknown() }).optional(),
  conversation: z.unknown().optional(),
});
