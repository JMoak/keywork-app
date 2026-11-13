import type { Campaign, CampaignSummary, CampaignUsage, ModelsReport } from "@keywork-app/protocol";

export interface CampaignSpending {
  settledMicros: number;
  estimatedMicros: number;
  outstandingMicros: number;
  remainingMicros: number;
  unknown: number;
}

export interface CampaignSpendPoint {
  at: number;
  settledMicros: number;
  estimatedMicros: number;
  milestones: string[];
}

export function campaignSummary(campaign: Campaign): CampaignSummary {
  const spending = campaignSpending(campaign);
  return {
    id: campaign.id,
    title: campaign.title,
    workload: campaign.workload,
    status: campaign.status,
    revision: campaign.revision,
    updatedAt: campaign.updatedAt,
    settledMicros: spending.settledMicros,
    pendingMicros: spending.outstandingMicros,
    latestAchievement:
      campaign.achievements.findLast((achievement) => achievement.status === "verified")?.title ??
      null,
  };
}

export function campaignSpendTrend(campaign: Campaign): CampaignSpendPoint[] {
  const moments = new Map<number, { settled: number; estimated: number; milestones: string[] }>();
  const at = (time: number) => {
    let point = moments.get(time);
    if (point === undefined) {
      point = { settled: 0, estimated: 0, milestones: [] };
      moments.set(time, point);
    }
    return point;
  };
  at(campaign.createdAt);
  for (const receipt of campaign.usage) {
    if (receipt.state === "reported" || receipt.state === "reconciled")
      at(receipt.recordedAt).settled += receipt.costMicros ?? 0;
    else if (receipt.state === "estimated")
      at(receipt.recordedAt).estimated += receipt.costMicros ?? 0;
  }
  for (const purpose of campaign.purposes)
    at(purpose.createdAt).milestones.push(`Purpose revision ${purpose.revision}`);
  for (const decision of campaign.decisions)
    if (decision.kind === "adopt")
      at(decision.at).milestones.push(`Artifact adopted · purpose ${decision.purposeRevision}`);
  let settledMicros = 0;
  let estimatedMicros = 0;
  return [...moments.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time, point]) => {
      settledMicros += point.settled;
      estimatedMicros += point.estimated;
      return { at: time, settledMicros, estimatedMicros, milestones: point.milestones };
    });
}

export function campaignSpending(campaign: Campaign): CampaignSpending {
  let settledMicros = 0;
  let estimatedMicros = 0;
  let outstandingMicros = 0;
  let unknown = 0;
  for (const receipt of campaign.usage) {
    if (receipt.state === "released") continue;
    if (receipt.state === "reported" || receipt.state === "reconciled") {
      settledMicros += receipt.costMicros ?? 0;
    } else {
      outstandingMicros += Math.max(receipt.reservedMicros, receipt.costMicros ?? 0);
      if (receipt.state === "estimated") estimatedMicros += receipt.costMicros ?? 0;
      if (receipt.state === "unknown") unknown += 1;
    }
  }
  return {
    settledMicros,
    estimatedMicros,
    outstandingMicros,
    unknown,
    remainingMicros: Math.max(0, campaign.budget.limitMicros - settledMicros - outstandingMicros),
  };
}

export function money(micros: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);
}

export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m ${seconds % 60}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function moment(at: number): string {
  return new Date(at).toLocaleString();
}

export function receiptCost(receipt: CampaignUsage): string {
  if (receipt.state === "released") return "Released";
  if (receipt.state === "unknown") return `${money(receipt.reservedMicros)} held; charge unknown`;
  if (receipt.state === "reserved") return `${money(receipt.reservedMicros)} reserved`;
  return receipt.costMicros === null
    ? "Not reported"
    : `${money(receipt.costMicros)} ${receipt.state}`;
}

export interface ModelChoice {
  key: string;
  label: string;
  provider: string;
  model: string;
}

export const campaignModelsLine =
  "Campaigns run only on models whose prices can be checked before every step: today, OpenAI GPT models reached through OpenRouter (for example openai/gpt-5).";

export const noCampaignModelLine =
  "No connected model can run a campaign yet. Connect OpenRouter and choose an OpenAI GPT model, then come back.";

export function campaignAdmits(model: string): boolean {
  return !model.includes("latest") && priceCheckedModel.test(model);
}

export function admittedChoices(choices: readonly ModelChoice[]): ModelChoice[] {
  return choices.filter((choice) => campaignAdmits(choice.model));
}

// Mirrors keywork's campaign admission (engine campaigns/pricing.ts) until /models reports it.
const priceCheckedModel =
  /^openai\/gpt-(?:4\.1(?:-(?:mini|nano))?|4o(?:-mini)?|4-turbo|[56](?:\.\d+)?(?:-[a-z0-9]+)*)(?:-\d{4}-\d{2}-\d{2})?$/;

export function campaignModelChoices(report: ModelsReport): ModelChoice[] {
  const choices: ModelChoice[] = [];
  const inherited = report.inherits?.strong;
  if (inherited !== undefined && "provider" in inherited) {
    choices.push({
      key: JSON.stringify(["inherited", inherited.provider, inherited.model]),
      label: `${inherited.model} · current strong model`,
      provider: inherited.provider,
      model: inherited.model,
    });
  }
  for (const server of [
    ...report.nodes.flatMap((node) => node.servers),
    ...(report.market ?? []),
  ]) {
    for (const model of server.models) {
      if (choices.some((choice) => choice.provider === server.kind && choice.model === model.id))
        continue;
      choices.push({
        key: JSON.stringify(["catalog", server.root, server.kind, model.id]),
        label: `${model.id} · ${server.kind}`,
        provider: server.kind,
        model: model.id,
      });
    }
  }
  return choices;
}
