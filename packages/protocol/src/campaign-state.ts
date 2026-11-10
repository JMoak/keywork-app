export interface CampaignActor {
  id: string;
  role: "user" | "controller" | "worker";
}
export interface ModelSelection {
  modelId: string;
  providerId: string;
  connectionId: string | null;
  effort: string | null;
}
export interface PurposeRevision {
  revision: number;
  outcome: string;
  audience: string;
  scope: string[];
  references: string[];
  criteria: { id: string; description: string; critical: boolean }[];
  invariants: string[];
  sufficientDelivery: string;
  createdAt: number;
}
export interface CampaignArtifact {
  schemaVersion: 1;
  id: string;
  kind: "file" | "directory" | "code" | "report" | "web-preview";
  title: string;
  digest: string;
  parentIds: string[];
  storageRef: string;
  ownerScope: string;
  producerAttemptId: string | null;
  createdAt: number;
  entries: { path: string; digest: string; sizeBytes: number; mediaType: string }[];
  capabilities: ("inspect" | "export" | "diff" | "preview")[];
}
export interface CampaignAttempt {
  id: string;
  operationId: string;
  purposeRevision: number;
  parentArtifactId: string | null;
  branch: string;
  hypothesis: string;
  method: string;
  expectedBenefit: string;
  model: ModelSelection;
  probe: boolean;
  status: "running" | "succeeded" | "failed" | "cancelled" | "unknown";
  startedAt: number;
  finishedAt: number | null;
  candidateArtifactId: string | null;
  failure: string | null;
}
export interface CampaignEvidence {
  id: string;
  artifactId: string;
  purposeRevision: number;
  criterionIds: string[];
  kind: "claim" | "test" | "observation" | "source" | "render" | "human-review" | "critique";
  verdict: "pass" | "fail" | "uncertain";
  summary: string;
  sourceRefs: string[];
  methodId: string;
  methodVersion: string;
  observedAt: number;
  producer: CampaignActor;
}
export interface CampaignEvaluation {
  id: string;
  artifactId: string;
  comparedToArtifactId: string | null;
  purposeRevision: number;
  observations: {
    criterionId: string;
    verdict: "pass" | "fail" | "uncertain";
    evidenceIds: string[];
    summary: string;
  }[];
  materialImprovement: boolean;
  summary: string;
  evaluator: CampaignActor;
  model: ModelSelection | null;
  createdAt: number;
}
export type AchievementStatus = "claimed" | "observed" | "verified" | "regressed" | "superseded";
export interface CampaignAchievement {
  id: string;
  criterionId: string;
  artifactId: string;
  purposeRevision: number;
  title: string;
  summary: string;
  evidenceIds: string[];
  status: AchievementStatus;
  verifiedBy: CampaignActor | null;
  adoptedAt: number | null;
  history: { status: AchievementStatus; at: number; reason: string; evidenceIds: string[] }[];
}
export interface CampaignBudget {
  currency: "USD";
  limitMicros: number;
  evaluationReserveMicros: number;
  deliveryReserveMicros: number;
}
export interface CampaignPersistence {
  profile: "focused" | "persistent" | "deep";
  probeLimit: number;
  spendLimitMicros: number;
  timeLimitMs: number;
  probesUsed: number;
  spentMicros: number;
  reservedMicros: number;
  elapsedMs: number;
  consecutiveWithoutImprovement: number;
  active: boolean;
  openedAt: number | null;
  terminationReason: string | null;
}
export interface CampaignUsage {
  id: string;
  operationId: string;
  attemptId: string | null;
  providerRequestId: string | null;
  stage: string;
  model: ModelSelection | null;
  currency: "USD";
  reservedMicros: number;
  costMicros: number | null;
  state: "reserved" | "estimated" | "reported" | "reconciled" | "unknown" | "released";
  costSource: string;
  pricingAt: number;
  recordedAt: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}
export interface CampaignCartridge {
  id: string;
  version: string;
  digest: string;
  stage: string;
  status: "active" | "suspended" | "retired";
  activatedAt: number;
  obligations: string[];
}
export interface CampaignContext {
  id: string;
  operationId: string;
  purposeRevision: number;
  activeSkillDigests: string[];
  includedRefs: string[];
  omitted: { ref: string; reason: string }[];
  tools: string[];
  estimatedTokens: number;
  reportedTokens: number | null;
  createdAt: number;
}
export interface CampaignDecision {
  id: string;
  kind:
    | "adopt"
    | "retain"
    | "branch"
    | "investigate"
    | "ask"
    | "finish-proposed"
    | "finish"
    | "steer";
  reason: string;
  evidenceIds: string[];
  artifactId: string | null;
  purposeRevision: number;
  actor: CampaignActor;
  at: number;
}
export interface CampaignHandoff {
  summary: string;
  currentBestArtifactId: string | null;
  obligations: string[];
  unresolved: string[];
  options: string[];
  attemptedApproaches: string[];
  nextStep: string;
}
export interface Campaign {
  schemaVersion: 1;
  id: string;
  ownerScope: string;
  title: string;
  workload: "app-improvement" | "project-development" | "research-refinement";
  createdAt: number;
  updatedAt: number;
  revision: number;
  status:
    | "draft"
    | "ready"
    | "running"
    | "waiting"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";
  waitingReason: "person" | "dependency" | "reconciliation" | null;
  statusReason: string | null;
  controlRequested: "pause" | "cancel" | null;
  model: ModelSelection;
  purposeRevision: number;
  purposes: PurposeRevision[];
  baselineArtifactId: string | null;
  currentBestArtifactId: string | null;
  latestArtifactId: string | null;
  alternativeArtifactIds: string[];
  artifacts: CampaignArtifact[];
  attempts: CampaignAttempt[];
  evidence: CampaignEvidence[];
  evaluations: CampaignEvaluation[];
  achievements: CampaignAchievement[];
  budget: CampaignBudget;
  persistence: CampaignPersistence;
  cartridges: CampaignCartridge[];
  contexts: CampaignContext[];
  usage: CampaignUsage[];
  decisions: CampaignDecision[];
  handoff: CampaignHandoff | null;
  delivery: "pending" | "available" | "delivered";
  verification: "unverified" | "partial" | "verified" | "failed";
}
