import { CampaignRequestError, type CampaignsClient } from "@keywork-app/client";
import type { Campaign, CampaignArtifactPreview, CampaignReading } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  artifactFixture,
  campaignFixture,
  usageFixture,
} from "../../../../protocol/src/campaign-testing.ts";
import { CampaignForm } from "./form.tsx";
import { createCampaignMonitor } from "./store.ts";
import { CampaignCosts, CampaignDetail } from "./views.tsx";

afterEach(cleanup);

describe("campaign workspace", () => {
  it("labels unresolved charges and reserves separately", () => {
    render(() => (
      <CampaignCosts campaign={campaignFixture({ usage: [usageFixture({ state: "unknown" })] })} />
    ));
    expect(screen.getByText("Held")).toBeDefined();
    expect(screen.getByText(/1 unresolved charge/)).toBeDefined();
    expect(screen.getByText(/Remaining includes reserves: evaluation/)).toBeDefined();
  });
  it("shows persistence and pending control truth while rendering artifact HTML as text", async () => {
    const campaign = campaignFixture({ status: "running", controlRequested: "pause" });
    const client: CampaignsClient = {
      list: async () => [],
      cartridges: async () => [],
      export: async (_id, artifactId, path) => ({ artifactId, path }),
      read: async () => ({ campaign, sequence: 1 }),
      create: async () => ({ campaign, sequence: 1 }),
      command: async () => ({ campaign, sequence: 1 }),
      artifact: async () => ({
        artifactId: "baseline",
        path: "report.html",
        mimeType: "text/html",
        content: "<script>window.intrusion = true</script>",
        truncated: false,
        totalBytes: 46,
      }),
      async *watch() {
        yield { kind: "connected" };
      },
    };
    const monitor = createRoot(() => createCampaignMonitor(client));
    render(() => (
      <CampaignDetail campaign={campaign} monitor={monitor} client={client} models={[]} />
    ));
    try {
      expect(screen.getByText(/Pause requested/)).toBeDefined();
      expect(screen.getByText("Exploring beyond a finish proposal")).toBeDefined();
      expect(screen.getByText("5 / 8")).toBeDefined();
      await waitFor(() =>
        expect(screen.getByText("<script>window.intrusion = true</script>")).toBeDefined(),
      );
      expect(document.querySelector(".kw-campaign-artifact script")).toBeNull();
      expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    } finally {
      monitor.dispose();
    }
  });
  it("creates a draft with the explicit model and budget without dispatching a run", async () => {
    const submitted: unknown[] = [];
    render(() => (
      <CampaignForm
        models={[
          { key: "chosen", label: "Strong model", provider: "openrouter", model: "model-a" },
        ]}
        busy={false}
        submit={async (input) => {
          submitted.push(input);
          return true;
        }}
        close={() => undefined}
        cancel={() => undefined}
      />
    ));
    await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Research report" } });
    await fireEvent.input(screen.getByLabelText("Desired outcome"), {
      target: { value: "Answer the question" },
    });
    await fireEvent.input(screen.getByLabelText("Quality criteria, one per line"), {
      target: { value: "Claims cite sources" },
    });
    const form = screen.getByRole("button", { name: "Create campaign" }).closest("form");
    expect(form).not.toBeNull();
    if (form === null) throw new Error("Missing campaign form");
    await fireEvent.submit(form);
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]).toMatchObject({
      title: "Research report",
      model: { provider: "openrouter", model: "model-a" },
      budgetMicros: 5_000_000,
      persistenceProfile: "persistent",
    });
  });

  it("brings an achievement artifact into focus and never compares the baseline with itself", async () => {
    const campaign = campaignFixture({
      artifacts: [artifactFixture(), artifactFixture({ id: "candidate", title: "Candidate" })],
      achievements: [
        {
          id: "achievement",
          criterionId: "useful",
          artifactId: "candidate",
          purposeRevision: 1,
          title: "Clearer setup",
          summary: "Fewer decisions before useful work.",
          evidenceIds: [],
          status: "observed",
          verifiedBy: null,
          adoptedAt: null,
          history: [],
        },
      ],
    });
    const client = clientFor(() => campaign);
    const monitor = createRoot(() => createCampaignMonitor(client));
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    render(() => (
      <CampaignDetail campaign={campaign} monitor={monitor} client={client} models={[]} />
    ));
    try {
      const picker = screen.getByRole("combobox", { name: "Inspect artifact" });
      const compare = screen.getByLabelText("Compare with baseline") as HTMLInputElement;
      expect(compare.disabled).toBe(true);
      await fireEvent.click(screen.getByRole("button", { name: "Inspect artifact" }));
      expect((picker as HTMLSelectElement).value).toBe("candidate");
      expect(document.activeElement).toBe(picker);
      expect(scroll).toHaveBeenCalledOnce();
      expect(scroll).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
      await fireEvent.click(compare);
      await waitFor(() =>
        expect(document.querySelectorAll(".kw-campaign-artifact pre")).toHaveLength(2),
      );
      await fireEvent.change(picker, { target: { value: "baseline" } });
      await waitFor(() =>
        expect(document.querySelectorAll(".kw-campaign-artifact pre")).toHaveLength(1),
      );
      expect(compare.disabled).toBe(true);
      expect(compare.checked).toBe(false);
      expect(scroll).toHaveBeenCalledOnce();
    } finally {
      scroll.mockRestore();
      monitor.dispose();
    }
  });

  it("keeps a file choice during refresh but resets it for another artifact and ignores late previews", async () => {
    const baseline = artifactFixture({
      entries: ["first.md", "second.md"].map((path) => ({
        path,
        digest: path,
        sizeBytes: 1,
        mediaType: "text/markdown",
      })),
    });
    const [campaign, setCampaign] = createSignal(
      campaignFixture({
        artifacts: [baseline, artifactFixture({ id: "next", title: "Next version" })],
      }),
    );
    const slow = deferred<CampaignArtifactPreview>();
    const requests: { id: string; path: string | undefined }[] = [];
    const client = clientFor(campaign, {
      artifact: async (_campaignId, id, path) => {
        requests.push({ id, path });
        return path === "second.md" ? slow.promise : preview(id, path);
      },
    });
    const monitor = createRoot(() => createCampaignMonitor(client));
    render(() => (
      <CampaignDetail campaign={campaign()} monitor={monitor} client={client} models={[]} />
    ));
    try {
      await fireEvent.change(screen.getByLabelText("File"), { target: { value: "second.md" } });
      setCampaign((prior) => ({
        ...prior,
        revision: 2,
        artifacts: prior.artifacts.map((artifact) => ({ ...artifact })),
      }));
      expect((screen.getByLabelText("File") as HTMLSelectElement).value).toBe("second.md");
      expect(requests.at(-1)).toEqual({ id: "baseline", path: "second.md" });
      await fireEvent.change(screen.getByRole("combobox", { name: "Inspect artifact" }), {
        target: { value: "next" },
      });
      expect(requests.at(-1)).toEqual({ id: "next", path: undefined });
      expect(requests).not.toContainEqual({ id: "next", path: "second.md" });
      await waitFor(() => expect(screen.getByText("next/default")).toBeDefined());
      slow.resolve(preview("baseline", "second.md"));
      await Promise.resolve();
      expect(screen.queryByText("baseline/second.md")).toBeNull();
      expect(screen.getByText("next/default")).toBeDefined();
    } finally {
      monitor.dispose();
    }
  });

  it("keeps a rejected redirect draft through refreshed server state and closes only after confirmation", async () => {
    let latest = campaignFixture();
    let commands = 0;
    const firstCommand = deferred<CampaignReading>();
    const client = clientFor(() => latest, {
      command: async () => {
        latest = campaignFixture({ revision: commands + 2 });
        latest.purposes = latest.purposes.map((purpose) => ({
          ...purpose,
          outcome: "A remotely updated outcome",
        }));
        if (++commands === 1) return firstCommand.promise;
        return { campaign: latest, sequence: latest.revision };
      },
    });
    const monitor = createRoot(() => createCampaignMonitor(client));
    render(() => (
      <CampaignDetail
        campaign={monitor.state.reading?.campaign ?? latest}
        monitor={monitor}
        client={client}
        models={[]}
      />
    ));
    try {
      await monitor.open(latest.id);
      await waitFor(() => expect(monitor.state.connection).toBe("live"));
      await fireEvent.click(screen.getByRole("button", { name: "Redirect purpose" }));
      await fireEvent.input(screen.getByLabelText("Revised outcome"), {
        target: { value: "My revised goal" },
      });
      const form = screen.getByRole("button", { name: "Save new purpose" }).closest("form");
      if (form === null) throw new Error("Missing redirect form");
      await fireEvent.input(within(form).getByLabelText("Reason"), {
        target: { value: "Clarify the goal" },
      });
      await fireEvent.submit(form);
      expect((screen.getByLabelText("Revised outcome") as HTMLTextAreaElement).disabled).toBe(true);
      expect((within(form).getByLabelText("Reason") as HTMLInputElement).disabled).toBe(true);
      firstCommand.reject(new CampaignRequestError(409, "Campaign changed"));
      await waitFor(() => expect(monitor.state.problem).toBe("Campaign changed"));
      expect((screen.getByLabelText("Revised outcome") as HTMLTextAreaElement).value).toBe(
        "My revised goal",
      );
      expect(form.querySelector<HTMLInputElement>("[name=reason]")?.value).toBe("Clarify the goal");
      await fireEvent.submit(form);
      await waitFor(() => expect(screen.queryByLabelText("Revised outcome")).toBeNull());
      expect(commands).toBe(2);
    } finally {
      monitor.dispose();
    }
  });

  it("ignores a redirect response after opening another campaign", async () => {
    const slow = deferred<CampaignReading>();
    const [campaign, setCampaign] = createSignal(campaignFixture());
    const client = clientFor(campaign, { command: async () => slow.promise });
    const monitor = createRoot(() => createCampaignMonitor(client));
    render(() => (
      <CampaignDetail campaign={campaign()} monitor={monitor} client={client} models={[]} />
    ));
    try {
      await monitor.open(campaign().id);
      await waitFor(() => expect(monitor.state.connection).toBe("live"));
      await fireEvent.click(screen.getByRole("button", { name: "Redirect purpose" }));
      const form = screen.getByRole("button", { name: "Save new purpose" }).closest("form");
      if (form === null) throw new Error("Missing redirect form");
      await fireEvent.submit(form);
      setCampaign(campaignFixture({ id: "another-campaign" }));
      await monitor.open(campaign().id);
      await waitFor(() => expect(monitor.state.connection).toBe("live"));
      await fireEvent.click(screen.getByRole("button", { name: "Redirect purpose" }));
      await fireEvent.input(screen.getByLabelText("Revised outcome"), {
        target: { value: "Another campaign's draft" },
      });
      slow.resolve({ campaign: campaignFixture({ revision: 2 }), sequence: 2 });
      await Promise.resolve();
      await Promise.resolve();
      expect((screen.getByLabelText("Revised outcome") as HTMLTextAreaElement).value).toBe(
        "Another campaign's draft",
      );
    } finally {
      monitor.dispose();
    }
  });
});

function clientFor(
  campaign: () => Campaign,
  overrides: Partial<CampaignsClient> = {},
): CampaignsClient {
  const reading = () => ({ campaign: campaign(), sequence: campaign().revision });
  return {
    list: async () => [],
    cartridges: async () => [],
    export: async (_id, artifactId, path) => ({ artifactId, path }),
    read: async () => reading(),
    create: async () => reading(),
    command: async () => reading(),
    artifact: async (_id, artifactId, path) => preview(artifactId, path),
    async *watch(_id, _sequence, signal) {
      yield { kind: "connected" };
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
        if (signal.aborted) resolve();
      });
    },
    ...overrides,
  };
}

function preview(artifactId: string, path?: string): CampaignArtifactPreview {
  return {
    artifactId,
    path: path ?? "report.md",
    mimeType: "text/plain",
    content: `${artifactId}/${path ?? "default"}`,
    truncated: false,
    totalBytes: 10,
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<Value>((answer, fail) => {
    resolve = answer;
    reject = fail;
  });
  return { promise, resolve, reject };
}
