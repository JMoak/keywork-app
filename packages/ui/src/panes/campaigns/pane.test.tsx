import type { CampaignReading } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { campaignFixture } from "../../../../protocol/src/campaign-testing.ts";
import type { ShellSeams } from "../registry.ts";
import { campaignsPaneWith } from "./index.tsx";

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
    target: { value: "model-a" },
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

async function newCampaign(): Promise<void> {
  const button = screen.getAllByRole("button", { name: "New campaign" })[0];
  if (button === undefined) throw new Error("Missing new campaign button");
  await fireEvent.click(button);
}
