import type { CampaignReading } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { campaignFixture } from "../../../../protocol/src/campaign-testing.ts";
import type { ShellSeams } from "../registry.ts";
import { campaignsPaneWith } from "./index.tsx";
import { campaignAdmits, campaignModelsLine } from "./model.ts";

afterEach(cleanup);

it("keeps a reopened creation draft when the abandoned form's request completes", async () => {
  const campaign = campaignFixture();
  let finish: (reading: CampaignReading) => void = () => undefined;
  const pending = new Promise<CampaignReading>((resolve) => {
    finish = resolve;
  });
  const rebind = vi.fn();
  const read = vi.fn(async () => ({ campaign, sequence: 1 }));
  const create = vi.fn(() => pending);
  const pane = campaignsPaneWith({
    client: () => ({
      list: async () => [],
      cartridges: async () => [],
      read,
      create,
      command: async () => ({ campaign, sequence: 1 }),
      artifact: async (_id, artifactId) => ({
        artifactId,
        path: null,
        content: "",
        mimeType: "text/plain",
        totalBytes: 0,
        truncated: false,
      }),
      export: async (_id, artifactId, path) => ({ artifactId, path }),
      async *watch() {
        yield { kind: "connected" };
      },
    }),
  });
  const shell = {
    client: { models: async () => ({ nodes: [] }) },
    rebind,
  } as unknown as ShellSeams;
  render(() => (
    <pane.component
      id="campaigns"
      spec={{ kind: "campaigns" }}
      focused
      shell={shell}
      onAction={() => undefined}
    />
  ));
  await waitFor(() =>
    expect(
      (screen.getAllByRole("button", { name: "New campaign" })[0] as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  await newCampaign();
  await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Original draft" } });
  await fireEvent.input(screen.getByLabelText("Desired outcome"), {
    target: { value: "Clear setup" },
  });
  await fireEvent.input(screen.getByLabelText("Quality criteria, one per line"), {
    target: { value: "Usable" },
  });
  await fireEvent.input(screen.getByLabelText("Provider"), { target: { value: "openrouter" } });
  await fireEvent.input(screen.getByLabelText("Model identifier"), {
    target: { value: "openai/gpt-5" },
  });
  const form = screen.getByRole("button", { name: "Create campaign" }).closest("form");
  if (form === null) throw new Error("Missing creation form");
  await fireEvent.submit(form);
  expect(create).toHaveBeenCalledTimes(1);
  await fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await newCampaign();
  await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Fresh draft" } });
  finish({ campaign, sequence: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Fresh draft");
  expect(read).not.toHaveBeenCalled();
  expect(rebind.mock.calls).toEqual([["campaigns", { kind: "campaigns" }]]);
});

it("offers only models a campaign can run on, says why, and focuses the title", async () => {
  const pane = campaignsPaneWith({
    client: () => ({
      list: async () => [],
      cartridges: async () => [],
      read: vi.fn(),
      create: vi.fn(),
      command: vi.fn(),
      artifact: vi.fn(),
      export: vi.fn(),
      async *watch() {
        yield { kind: "connected" };
      },
    }),
  });
  const market = (ids: readonly string[]) => ({
    root: "market",
    kind: "openrouter",
    models: ids.map((id) => ({ id })),
  });
  const shell = {
    client: {
      models: async () => ({
        nodes: [],
        market: [market(["anthropic/claude-sonnet-4-5", "openai/gpt-5", "openai/gpt-latest"])],
      }),
    },
    rebind: vi.fn(),
  } as unknown as ShellSeams;
  render(() => (
    <pane.component
      id="campaigns"
      spec={{ kind: "campaigns" }}
      focused
      shell={shell}
      onAction={() => undefined}
    />
  ));
  await waitFor(() =>
    expect(
      (screen.getAllByRole("button", { name: "New campaign" })[0] as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  await newCampaign();
  expect(document.activeElement).toBe(screen.getByLabelText("Title"));
  const picker = screen.getByRole("combobox", { name: "Model" });
  await waitFor(() =>
    expect([...picker.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "openai/gpt-5 · openrouter",
      "Configured provider and model…",
    ]),
  );
  expect(screen.getByText(campaignModelsLine)).toBeTruthy();
  expect(campaignAdmits("anthropic/claude-sonnet-4-5")).toBe(false);
  expect(campaignAdmits("openai/gpt-4o-mini")).toBe(true);
});

async function newCampaign(): Promise<void> {
  const button = screen.getAllByRole("button", { name: "New campaign" })[0];
  if (button === undefined) throw new Error("Missing new campaign button");
  await fireEvent.click(button);
}
