import type { Campaign, CampaignActor } from "./campaign-state.ts";

export type * from "./campaign-state.ts";

export interface CampaignCreateRequest {
  title: string;
  workload: "app-improvement" | "project-development" | "research-refinement";
  objective: string;
  criteria: string[];
  references: string[];
  model: { provider: string; model: string };
  budgetMicros: number;
  persistenceProfile: "focused" | "persistent" | "deep";
  artifactPath?: string;
  text?: string;
  sources?: { title: string; reference: string; text: string }[];
}

export interface CampaignSummary {
  id: string;
  title: string;
  workload: CampaignCreateRequest["workload"];
  status: Campaign["status"];
  revision: number;
  updatedAt: number;
  settledMicros?: number;
  pendingMicros?: number;
  latestAchievement?: string | null;
}

export interface CampaignReading {
  campaign: Campaign;
  sequence: number;
}

export interface CampaignCartridgeChoice {
  id: string;
  version: string;
  digest: string;
  title: string;
  description: string;
  stages: string[];
}

export interface CampaignReviewObservation {
  criterionId: string;
  verdict: "pass" | "fail" | "uncertain";
  summary: string;
}

export type CampaignUserCommand =
  | { type: "start" | "pause" | "resume" | "cancel" | "finish"; reason?: string }
  | { type: "retain"; artifactId: string; reason: string }
  | { type: "branch"; artifactId: string; reason: string }
  | { type: "redirect"; objective: string; reason: string }
  | { type: "set-cartridges"; cartridgeIds: string[]; reason: string }
  | { type: "select-model"; model: { provider: string; model: string }; reason: string }
  | {
      type: "renew-persistence";
      probeLimit: number;
      spendLimitMicros: number;
      timeLimitMs: number;
      reason: string;
    }
  | {
      type: "reconcile";
      operationId: string;
      costMicros: number;
      reference: string;
      reason: string;
    }
  | {
      type: "review-artifact";
      artifactId: string;
      observations: CampaignReviewObservation[];
      reason: string;
      adopt: boolean;
      attested: true;
    };

export interface CampaignCommandRequest {
  expectedRevision: number;
  command: CampaignUserCommand;
}

export interface CampaignArtifactPreview {
  artifactId: string;
  path: string | null;
  mimeType: string;
  content: string | null;
  truncated: boolean;
  totalBytes: number;
}

export interface CampaignArtifactExport {
  artifactId: string;
  path: string;
}

export interface CampaignEvent {
  schemaVersion: 1;
  id: string;
  campaignId: string;
  sequence: number;
  commandId: string;
  kind: string;
  at: number;
  actor: CampaignActor;
  summary: string;
  refs: string[];
}

export const campaignRoutes = [
  { method: "GET", path: "/campaigns", operationId: "listCampaigns" },
  { method: "GET", path: "/campaigns/cartridges", operationId: "listCampaignCartridges" },
  { method: "POST", path: "/campaigns", operationId: "createCampaign" },
  { method: "GET", path: "/campaigns/{id}", operationId: "readCampaign" },
  { method: "POST", path: "/campaigns/{id}/commands", operationId: "commandCampaign" },
  { method: "GET", path: "/campaigns/{id}/events", operationId: "campaignEvents" },
  {
    method: "GET",
    path: "/campaigns/{id}/artifacts/{artifactId}",
    operationId: "readCampaignArtifact",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/artifacts/{artifactId}/export",
    operationId: "exportCampaignArtifact",
  },
] as const;

export const campaignRequestBodies = {
  createCampaign: [
    "title",
    "workload",
    "objective",
    "criteria",
    "references",
    "model",
    "model.provider",
    "model.model",
    "budgetMicros",
    "persistenceProfile",
    "artifactPath",
    "text",
    "sources",
    "sources.title",
    "sources.reference",
    "sources.text",
  ],
  commandCampaign: ["expectedRevision", "command"],
  exportCampaignArtifact: ["destination"],
} as const;
