import type { CampaignUserCommand } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { campaignFixture } from "../../../../protocol/src/campaign-testing.ts";
import { ArtifactReview } from "./review.tsx";

afterEach(cleanup);

describe("human artifact review", () => {
  it("defaults to uncertainty and requires inspected confirmation and observations", async () => {
    const calls: CampaignUserCommand[] = [];
    showReview(calls);
    expect(
      (screen.getByLabelText("Verdict for A visitor can finish setup") as HTMLSelectElement).value,
    ).toBe("uncertain");
    expect((screen.getByLabelText("I inspected this artifact") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      (screen.getByLabelText("Use as current best if review passes") as HTMLInputElement).checked,
    ).toBe(false);
    await submit();
    expect(calls).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("Confirm that you inspected");
    await fireEvent.click(screen.getByLabelText("I inspected this artifact"));
    await submit();
    expect(calls).toEqual([]);
    expect(screen.getByRole("alert").textContent).toContain("every criterion");
  });

  it("records an explicit pass and adoption request without assigning verification in the client", async () => {
    const calls: CampaignUserCommand[] = [];
    showReview(calls);
    await fireEvent.change(screen.getByLabelText("Verdict for A visitor can finish setup"), {
      target: { value: "pass" },
    });
    await fireEvent.input(
      screen.getByLabelText("Your observation for A visitor can finish setup"),
      { target: { value: "I completed setup using only the keyboard." } },
    );
    await fireEvent.input(screen.getByLabelText("Reason for this review"), {
      target: { value: "Checked the whole journey" },
    });
    await fireEvent.click(screen.getByLabelText("Use as current best if review passes"));
    await fireEvent.click(screen.getByLabelText("I inspected this artifact"));
    await submit();
    expect(calls).toEqual([
      {
        type: "review-artifact",
        artifactId: "baseline",
        observations: [
          {
            criterionId: "useful",
            verdict: "pass",
            summary: "I completed setup using only the keyboard.",
          },
        ],
        reason: "Checked the whole journey",
        adopt: true,
        attested: true,
      },
    ]);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Review recorded"));
    expect((screen.getByLabelText("I inspected this artifact") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      (screen.getByLabelText("Use as current best if review passes") as HTMLInputElement).checked,
    ).toBe(false);
    await submit();
    expect(calls).toHaveLength(1);
  });

  it("clears an unfinished attestation when the selected immutable artifact changes", async () => {
    const [artifactId, setArtifactId] = createSignal("baseline");
    render(() => (
      <ArtifactReview
        campaign={campaignFixture()}
        artifactId={artifactId()}
        enabled={true}
        submit={async () => true}
      />
    ));
    await fireEvent.input(
      screen.getByLabelText("Your observation for A visitor can finish setup"),
      { target: { value: "Notes about the baseline" } },
    );
    await fireEvent.click(screen.getByLabelText("I inspected this artifact"));
    setArtifactId("another-artifact");
    expect(
      (
        screen.getByLabelText(
          "Your observation for A visitor can finish setup",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect((screen.getByLabelText("I inspected this artifact") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it.each(["refused", "rejected"])(
    "preserves feedback after a %s submission and blocks duplicate in-flight requests",
    async (outcome) => {
      const result = deferred<boolean>();
      const record = vi.fn(() => result.promise);
      render(() => (
        <ArtifactReview
          campaign={campaignFixture()}
          artifactId="baseline"
          enabled={true}
          submit={record}
        />
      ));
      await fillReview();
      const form = screen.getByRole("button", { name: "Record review" }).closest("form");
      if (form === null) throw new Error("Missing review form");
      await fireEvent.submit(form);
      expect(screen.getByRole("button", { name: "Recording…" }).closest("fieldset")?.disabled).toBe(
        true,
      );
      await fireEvent.submit(form);
      expect(record).toHaveBeenCalledTimes(1);
      if (outcome === "refused") result.resolve(false);
      else result.reject(new Error("Connection lost"));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not confirmed"));
      expect(screen.queryByText("Review recorded")).toBeNull();
      expect(
        (
          screen.getByLabelText(
            "Your observation for A visitor can finish setup",
          ) as HTMLTextAreaElement
        ).value,
      ).toBe("I finished setup using the keyboard.");
      expect((screen.getByLabelText("Reason for this review") as HTMLTextAreaElement).value).toBe(
        "Checked setup",
      );
      expect(
        screen.getByRole("button", { name: "Record review" }).closest("fieldset")?.disabled,
      ).toBe(false);
    },
  );

  it.each(["artifact", "purpose"])("ignores confirmation after the %s changes", async (change) => {
    const result = deferred<boolean>();
    const [artifactId, setArtifactId] = createSignal("baseline");
    const [campaign, setCampaign] = createSignal(campaignFixture());
    render(() => (
      <ArtifactReview
        campaign={campaign()}
        artifactId={artifactId()}
        enabled={true}
        submit={() => result.promise}
      />
    ));
    await fillReview();
    await submit();
    if (change === "artifact") setArtifactId("another-artifact");
    else {
      const purpose = campaign().purposes[0];
      if (purpose === undefined) throw new Error("Missing purpose");
      setCampaign(campaignFixture({ purposeRevision: 2, purposes: [{ ...purpose, revision: 2 }] }));
    }
    await fireEvent.input(
      screen.getByLabelText("Your observation for A visitor can finish setup"),
      {
        target: { value: "New review draft" },
      },
    );
    result.resolve(true);
    await result.promise;
    expect(screen.queryByText("Review recorded")).toBeNull();
    expect(
      (
        screen.getByLabelText(
          "Your observation for A visitor can finish setup",
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("New review draft");
    expect((screen.getByLabelText("I inspected this artifact") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("keeps pending feedback attached across snapshots of the same artifact and purpose", async () => {
    const result = deferred<boolean>();
    const record = vi.fn(() => result.promise);
    const [campaign, setCampaign] = createSignal(campaignFixture());
    render(() => (
      <ArtifactReview campaign={campaign()} artifactId="baseline" enabled={true} submit={record} />
    ));
    await fillReview();
    await submit();
    setCampaign({ ...campaign(), updatedAt: campaign().updatedAt + 1 });
    const button = screen.getByRole("button", { name: "Recording…" });
    const form = button.closest("form");
    if (form === null) throw new Error("Missing review form");
    expect(button.closest("fieldset")?.disabled).toBe(true);
    await fireEvent.submit(form);
    expect(record).toHaveBeenCalledTimes(1);
    result.resolve(true);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Review recorded"));
  });
});

function showReview(calls: CampaignUserCommand[]): void {
  render(() => (
    <ArtifactReview
      campaign={campaignFixture()}
      artifactId="baseline"
      enabled={true}
      submit={async (command) => {
        calls.push(command);
        return true;
      }}
    />
  ));
}

async function submit(): Promise<void> {
  const form = screen.getByRole("button", { name: "Record review" }).closest("form");
  if (form === null) throw new Error("Missing review form");
  await fireEvent.submit(form);
}

async function fillReview(): Promise<void> {
  await fireEvent.input(screen.getByLabelText("Your observation for A visitor can finish setup"), {
    target: { value: "I finished setup using the keyboard." },
  });
  await fireEvent.input(screen.getByLabelText("Reason for this review"), {
    target: { value: "Checked setup" },
  });
  await fireEvent.click(screen.getByLabelText("I inspected this artifact"));
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Value>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
