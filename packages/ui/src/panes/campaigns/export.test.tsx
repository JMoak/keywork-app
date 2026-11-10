import { CampaignRequestError } from "@keywork-app/client";
import type { CampaignArtifactExport } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactExport } from "./export.tsx";

afterEach(cleanup);

describe("campaign artifact export", () => {
  it("exports only after an explicit destination submission and shows the confirmed path", async () => {
    const calls: string[][] = [];
    render(() => (
      <ArtifactExport
        campaignId="campaign"
        artifactId="version"
        client={{
          export: async (id, artifactId, destination) => {
            calls.push([id, artifactId, destination]);
            return { artifactId, path: `workspace/${destination}` };
          },
        }}
      />
    ));
    expect(calls).toEqual([]);
    await fireEvent.input(screen.getByLabelText("New folder in this workspace"), {
      target: { value: "exports/result" },
    });
    await submit();
    expect(calls).toEqual([["campaign", "version", "exports/result"]]);
    await waitFor(() => expect(screen.getByText("workspace/exports/result")).toBeDefined());
  });

  it("keeps a refused destination visible without retrying or claiming export succeeded", async () => {
    let calls = 0;
    render(() => (
      <ArtifactExport
        campaignId="campaign"
        artifactId="version"
        client={{
          export: async () => {
            calls += 1;
            throw new CampaignRequestError(409, "Destination already exists");
          },
        }}
      />
    ));
    await fireEvent.input(screen.getByLabelText("New folder in this workspace"), {
      target: { value: "existing" },
    });
    await submit();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Destination already exists"),
    );
    expect(calls).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    new TypeError("Connection lost"),
    new CampaignRequestError(200, "Unreadable response"),
    new CampaignRequestError(502, "Unsupported export acknowledgement"),
    new CampaignRequestError(503, "Service unavailable"),
  ])("asks for destination inspection when export is unconfirmed: %s", async (cause) => {
    let calls = 0;
    render(() => (
      <ArtifactExport
        campaignId="campaign"
        artifactId="version"
        client={{
          export: async () => {
            calls += 1;
            throw cause;
          },
        }}
      />
    ));
    await fireEvent.input(screen.getByLabelText("New folder in this workspace"), {
      target: { value: "exports/result" },
    });
    await submit();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Export was not confirmed. Inspect the destination before trying again.",
      ),
    );
    expect(calls).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("locks the pending destination and ignores a late result after switching artifacts", async () => {
    const [artifactId, setArtifactId] = createSignal("first");
    const first = deferred<CampaignArtifactExport>();
    const second = deferred<CampaignArtifactExport>();
    const calls: string[][] = [];
    render(() => (
      <ArtifactExport
        campaignId="campaign"
        artifactId={artifactId()}
        client={{
          export: (id, artifact, destination) => {
            calls.push([id, artifact, destination]);
            return artifact === "first" ? first.promise : second.promise;
          },
        }}
      />
    ));
    const input = screen.getByLabelText("New folder in this workspace") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "exports/first" } });
    const form = input.closest("form");
    if (form === null) throw new Error("Missing export form");
    await fireEvent.submit(form);
    expect(input.disabled).toBe(true);
    await fireEvent.submit(form);
    expect(calls).toHaveLength(1);
    setArtifactId("second");
    await waitFor(() => expect(input.disabled).toBe(false));
    await fireEvent.input(input, { target: { value: "exports/second" } });
    await fireEvent.submit(form);
    first.resolve({ artifactId: "first", path: "workspace/exports/first" });
    await first.promise;
    expect(screen.queryByRole("status")).toBeNull();
    expect(input.disabled).toBe(true);
    second.resolve({ artifactId: "second", path: "workspace/exports/second" });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("workspace/exports/second"),
    );
    expect(input.disabled).toBe(false);
    expect(calls).toEqual([
      ["campaign", "first", "exports/first"],
      ["campaign", "second", "exports/second"],
    ]);
  });
});

async function submit(): Promise<void> {
  const form = screen.getByRole("button", { name: "Export version" }).closest("form");
  if (form === null) throw new Error("Missing export form");
  await fireEvent.submit(form);
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((answer) => {
    resolve = answer;
  });
  return { promise, resolve };
}
