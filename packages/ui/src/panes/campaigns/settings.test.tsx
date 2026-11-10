import type { CampaignsClient } from "@keywork-app/client";
import type { Campaign, CampaignUserCommand } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { campaignFixture, usageFixture } from "../../../../protocol/src/campaign-testing.ts";
import type { ModelChoice } from "./model.ts";
import { CampaignSettings } from "./settings.tsx";

afterEach(cleanup);

describe("campaign configuration", () => {
  it("shows manual fields only for a stable custom model choice", async () => {
    const commands: CampaignUserCommand[] = [];
    const [models, setModels] = createSignal<readonly ModelChoice[]>([]);
    showSettings(campaignFixture(), commands, models);
    expect(screen.queryByLabelText("Configured provider")).toBeNull();
    const picker = screen.getByRole("combobox", { name: "Model" });
    await fireEvent.change(picker, { target: { value: "custom" } });
    await fireEvent.input(screen.getByLabelText("Configured provider"), {
      target: { value: "manual-provider" },
    });
    await fireEvent.input(screen.getByLabelText("Configured model"), {
      target: { value: "manual-model" },
    });
    setModels([{ key: "incoming", label: "Incoming", provider: "openrouter", model: "incoming" }]);
    expect((picker as HTMLSelectElement).value).toBe("custom");
    await submit("Save model");
    expect(commands).toEqual([
      {
        type: "select-model",
        model: { provider: "manual-provider", model: "manual-model" },
        reason: "",
      },
    ]);
  });

  it("refuses a vanished catalog model instead of using leftover custom fields", async () => {
    const commands: CampaignUserCommand[] = [];
    const [models, setModels] = createSignal<readonly ModelChoice[]>([
      { key: "chosen", label: "Chosen", provider: "openrouter", model: "chosen" },
    ]);
    showSettings(campaignFixture(), commands, models);
    const picker = screen.getByRole("combobox", { name: "Model" });
    await fireEvent.change(picker, { target: { value: "custom" } });
    await fireEvent.input(screen.getByLabelText("Configured provider"), {
      target: { value: "leftover" },
    });
    await fireEvent.input(screen.getByLabelText("Configured model"), {
      target: { value: "leftover" },
    });
    await fireEvent.change(picker, { target: { value: "chosen" } });
    setModels([]);
    await submit("Save model");
    expect(commands).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("selected model is unavailable");
  });

  it("requires a new choice when the campaign's current model changes during editing", async () => {
    const initial = campaignFixture();
    const [campaign, setCampaign] = createSignal(initial);
    const commands: CampaignUserCommand[] = [];
    render(() => (
      <CampaignSettings
        campaign={campaign()}
        client={fakeClient(initial)}
        models={[]}
        enabled={true}
        submit={async (command) => {
          commands.push(command);
          return true;
        }}
      />
    ));
    const picker = screen.getByRole("combobox", {
      name: "Model",
    }) as HTMLSelectElement;
    const originalChoice = picker.value;
    setCampaign(
      campaignFixture({
        model: { providerId: "openrouter", modelId: "changed", connectionId: null, effort: null },
      }),
    );
    expect(picker.value).toBe(originalChoice);
    await submit("Save model");
    expect(commands).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("selected model is unavailable");
  });

  it("submits explicit total allowances without rewriting consumed counters", async () => {
    const commands: CampaignUserCommand[] = [];
    const campaign = campaignFixture();
    showSettings(campaign, commands);
    await fireEvent.input(screen.getByLabelText("Total probes"), { target: { value: "12" } });
    await fireEvent.input(screen.getByLabelText("Total exploration spending (USD)"), {
      target: { value: "2.50" },
    });
    await fireEvent.input(screen.getByLabelText("Reason for extending the search"), {
      target: { value: "Test another approach" },
    });
    await submit("Authorize total limits");
    expect(commands).toEqual([
      {
        type: "renew-persistence",
        probeLimit: 12,
        spendLimitMicros: 2_500_000,
        timeLimitMs: 600_000,
        reason: "Test another approach",
      },
    ]);
    expect(campaign.persistence.probesUsed).toBe(5);
    expect(campaign.persistence.openedAt).toBe(1_000);
  });

  it("sends cartridge identities from the trusted inventory and keeps instruction content out of the client", async () => {
    const commands: CampaignUserCommand[] = [];
    showSettings(campaignFixture(), commands);
    const checkbox = await screen.findByRole("checkbox", { name: /Evidence review/ });
    await fireEvent.click(checkbox);
    const button = screen.getByRole("button", { name: "Save cartridges" });
    const reason = button.closest("form")?.querySelector("input[name='reason']");
    if (reason === null || reason === undefined) throw new Error("Missing reason input");
    await fireEvent.input(reason, { target: { value: "Check claims" } });
    await submit("Save cartridges");
    expect(commands).toEqual([
      { type: "set-cartridges", cartridgeIds: ["evidence"], reason: "Check claims" },
    ]);
  });

  it.each(["unknown", "estimated"] as const)(
    "requires an entered actual charge and receipt confirmation before reconciling %s costs",
    async (state) => {
      const commands: CampaignUserCommand[] = [];
      showSettings(campaignFixture({ usage: [usageFixture({ state })] }), commands);
      expect((screen.getByLabelText("Total actual charge (USD)") as HTMLInputElement).value).toBe(
        "",
      );
      await submit("Confirm actual charge");
      expect(commands).toEqual([]);
      await fireEvent.input(screen.getByLabelText("Total actual charge (USD)"), {
        target: { value: "0.37" },
      });
      await fireEvent.input(screen.getByLabelText("Provider receipt reference"), {
        target: { value: "receipt-123" },
      });
      await fireEvent.click(
        screen.getByLabelText("I verified this total against the provider receipt."),
      );
      const button = screen.getByRole("button", { name: "Confirm actual charge" });
      const reason = button.closest("form")?.querySelector("input[name='reason']");
      if (reason === null || reason === undefined) throw new Error("Missing reason input");
      await fireEvent.input(reason, { target: { value: "Provider receipt checked" } });
      await submit("Confirm actual charge");
      await waitFor(() =>
        expect(commands).toEqual([
          {
            type: "reconcile",
            operationId: "operation-one",
            costMicros: 370_000,
            reference: "receipt-123",
            reason: "Provider receipt checked",
          },
        ]),
      );
    },
  );
});

async function submit(name: string): Promise<void> {
  const form = screen.getByRole("button", { name }).closest("form");
  if (form === null) throw new Error("Missing command form");
  await fireEvent.submit(form);
}

function showSettings(
  campaign: Campaign,
  commands: CampaignUserCommand[],
  models: () => readonly ModelChoice[] = () => [],
): void {
  render(() => (
    <CampaignSettings
      campaign={campaign}
      client={fakeClient(campaign)}
      models={models()}
      enabled={true}
      submit={async (command) => {
        commands.push(command);
        return true;
      }}
    />
  ));
}

function fakeClient(campaign: Campaign): CampaignsClient {
  return {
    list: async () => [],
    cartridges: async () => [
      {
        id: "evidence",
        version: "1",
        digest: "sha256:evidence",
        title: "Evidence review",
        description: "Check claims against references",
        stages: ["evaluate"],
      },
    ],
    export: async (_id, artifactId, path) => ({ artifactId, path }),
    read: async () => ({ campaign, sequence: 1 }),
    create: async () => ({ campaign, sequence: 1 }),
    command: async () => ({ campaign, sequence: 1 }),
    artifact: async () => ({
      artifactId: "baseline",
      path: null,
      mimeType: "text/plain",
      content: "",
      truncated: false,
      totalBytes: 0,
    }),
    async *watch() {
      yield { kind: "connected" };
    },
  };
}
