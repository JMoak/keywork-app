import type { CampaignsClient } from "@keywork-app/client";
import type { Campaign } from "@keywork-app/protocol";
import { onCleanup, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import {
  artifactFixture,
  campaignFixture,
  usageFixture,
} from "../../protocol/src/campaign-testing.ts";
import { CampaignForm } from "../src/panes/campaigns/form.tsx";
import { createCampaignMonitor } from "../src/panes/campaigns/store.ts";
import { CampaignDetail } from "../src/panes/campaigns/views.tsx";
import { applyTheme, keyworkNight, themeNamed } from "../src/theme/index.ts";
import "../src/app.css";
import "../src/panes/campaigns/campaigns.css";

function CampaignStage() {
  const creating = new URLSearchParams(location.search).get("create") === "1";
  const models = [
    {
      key: "fixture-model",
      provider: "openrouter",
      model: "model-a",
      label: "model-a · current model",
    },
  ];
  const theme =
    themeNamed(new URLSearchParams(location.search).get("theme") ?? "keywork-night") ??
    keyworkNight;
  applyTheme(theme);
  const campaign = stagedCampaign();
  if (new URLSearchParams(location.search).get("paused") === "1") {
    campaign.status = "paused";
    for (const attempt of campaign.attempts) {
      if (attempt.status !== "running") continue;
      attempt.status = "succeeded";
      attempt.finishedAt = campaign.updatedAt;
    }
  }
  const client: CampaignsClient = {
    list: async () => [],
    cartridges: async () => [
      {
        id: "evidence-review",
        title: "Evidence review",
        description: "Check claims against their sources",
        version: "1.0",
        digest: "fixture-evidence",
        stages: ["evaluating"],
      },
    ],
    read: async () => ({ campaign, sequence: 15 }),
    create: async () => ({ campaign, sequence: 15 }),
    command: async () => ({ campaign, sequence: 15 }),
    export: async (_id, artifactId, destination) => ({ artifactId, path: destination }),
    artifact: async (_id, artifactId) => ({
      artifactId,
      path: "report.md",
      mimeType: "text/markdown",
      content:
        artifactId === "baseline"
          ? "# Original brief\n\nAccount creation asks for seven fields before showing the product.\n\nQuestion: Where does setup create unnecessary friction?"
          : "# Refined onboarding proposal\n\n1. Show the workspace before requesting account details.\n2. Ask only for the information needed at each step.\n3. Keep an accessible route back to the previous step.\n\n## Evidence\nThe reviewed flow now separates exploration from commitment.\nUsability validation remains pending.",
      truncated: false,
      totalBytes: 340,
    }),
    async *watch(_id, _sequence, signal) {
      yield { kind: "connected" };
      yield { kind: "snapshot", reading: { campaign, sequence: 15 } };
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  };
  const monitor = createCampaignMonitor(client);
  onMount(() => {
    if (!creating) void monitor.open(campaign.id);
  });
  onCleanup(() => monitor.dispose());
  return (
    <main
      class="kw-campaigns"
      style={{ height: "auto", overflow: "visible", "min-height": "100vh" }}
    >
      <Show
        when={creating}
        fallback={
          <CampaignDetail campaign={campaign} monitor={monitor} client={client} models={models} />
        }
      >
        <CampaignForm
          models={models}
          busy={false}
          submit={async () => true}
          close={() => undefined}
          cancel={() => undefined}
        />
      </Show>
    </main>
  );
}

function stagedCampaign(): Campaign {
  const at = Date.UTC(2026, 10, 10, 14);
  const campaign = campaignFixture({
    title: "A calmer first five minutes",
    createdAt: at,
    updatedAt: at + 600_000,
    status: "running",
    currentBestArtifactId: "improved",
    latestArtifactId: "improved",
    verification: "partial",
    artifacts: [
      artifactFixture({ createdAt: at }),
      artifactFixture({
        id: "improved",
        title: "Refined onboarding proposal",
        createdAt: at + 480_000,
        parentIds: ["baseline"],
        producerAttemptId: "attempt-1",
      }),
    ],
    usage: [
      usageFixture({
        id: "review",
        operationId: "review",
        attemptId: "attempt-1",
        stage: "evaluating",
        recordedAt: at + 180_000,
        state: "reported",
        costMicros: 180_000,
        inputTokens: 8_200,
        outputTokens: 900,
        cachedTokens: 4_100,
      }),
      usageFixture({
        id: "build",
        operationId: "build",
        attemptId: "attempt-1",
        stage: "building",
        recordedAt: at + 360_000,
        state: "reconciled",
        costMicros: 300_000,
      }),
      usageFixture({
        id: "probe",
        operationId: "probe",
        attemptId: "attempt-2",
        stage: "probe",
        recordedAt: at + 600_000,
        state: "estimated",
        costMicros: 270_000,
      }),
    ],
  });
  const purpose = campaign.purposes[0];
  if (purpose !== undefined) {
    purpose.createdAt = at;
    purpose.outcome = "Make setup clear, useful, and easy to recover from.";
  }
  campaign.attempts = [
    {
      id: "attempt-1",
      operationId: "build",
      purposeRevision: 1,
      parentArtifactId: "baseline",
      branch: "main",
      hypothesis: "Remove premature account requirements without obscuring the next step.",
      method: "Inspect the entire onboarding journey",
      expectedBenefit: "Less friction",
      model: campaign.model,
      probe: false,
      status: "succeeded",
      startedAt: at,
      finishedAt: at + 480_000,
      candidateArtifactId: "improved",
      failure: null,
    },
    {
      id: "attempt-2",
      operationId: "probe",
      purposeRevision: 1,
      parentArtifactId: "improved",
      branch: "main",
      hypothesis: "Can the recovery path be clearer without adding another choice?",
      method: "Review keyboard navigation and interrupted setup",
      expectedBenefit: "Clearer recovery",
      model: campaign.model,
      probe: true,
      status: "running",
      startedAt: at + 540_000,
      finishedAt: null,
      candidateArtifactId: null,
      failure: null,
    },
  ];
  campaign.evidence = [
    {
      id: "evidence",
      artifactId: "improved",
      purposeRevision: 1,
      criterionIds: ["useful"],
      kind: "critique",
      verdict: "pass",
      summary:
        "The proposed flow asks for fewer decisions before useful work begins. Human usability review remains outstanding.",
      sourceRefs: ["artifact:baseline"],
      methodId: "journey-review",
      methodVersion: "1",
      observedAt: at + 480_000,
      producer: { id: "review-model", role: "worker" },
    },
  ];
  campaign.achievements = [
    {
      id: "achievement",
      criterionId: "useful",
      artifactId: "improved",
      purposeRevision: 1,
      title: "Account setup moved after exploration",
      summary:
        "Retained as the current best following model review; usability validation is pending.",
      evidenceIds: ["evidence"],
      status: "observed",
      verifiedBy: null,
      adoptedAt: at + 480_000,
      history: [],
    },
  ];
  campaign.decisions = [
    {
      id: "adoption",
      kind: "adopt",
      reason: "A promising improvement; keep the original available for comparison.",
      evidenceIds: ["evidence"],
      artifactId: "improved",
      purposeRevision: 1,
      actor: { id: "controller", role: "controller" },
      at: at + 480_000,
    },
  ];
  return campaign;
}

const root = document.getElementById("root");
if (root !== null) render(CampaignStage, root);
