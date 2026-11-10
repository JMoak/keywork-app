import type { CampaignCreateRequest } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignForm } from "./form.tsx";
import { campaignModelChoices, type ModelChoice } from "./model.ts";

afterEach(cleanup);

const first: ModelChoice = {
  key: "one",
  label: "First model",
  provider: "openrouter",
  model: "one",
};
const second: ModelChoice = {
  key: "two",
  label: "Second model",
  provider: "openrouter",
  model: "two",
};

describe("campaign creation", () => {
  it("requires a fresh choice when the inherited strong model changes", async () => {
    const choices = (model: string) => {
      const inherited = { provider: "openrouter", model };
      return campaignModelChoices({
        generatedAt: "2026-11-10T14:00:00Z",
        nodes: [],
        inherits: { strong: inherited, loop: inherited, decide: inherited, vision: inherited },
      });
    };
    const [models, setModels] = createSignal(choices("original"));
    const submit = vi.fn(async (_input: CampaignCreateRequest) => true);
    render(() => (
      <CampaignForm
        models={models()}
        busy={false}
        submit={submit}
        close={() => undefined}
        cancel={() => undefined}
      />
    ));
    await fillBrief();
    const picker = screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement;
    const original = picker.value;
    setModels(choices("replacement"));
    expect(picker.value).toBe(original);
    await submitForm();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("selected model is unavailable");
  });

  it("keeps a custom model draft when the configured inventory arrives", async () => {
    const [models, setModels] = createSignal<readonly ModelChoice[]>([]);
    const submit = vi.fn(async (_input: CampaignCreateRequest) => false);
    render(() => (
      <CampaignForm
        models={models()}
        busy={false}
        submit={submit}
        close={() => undefined}
        cancel={() => undefined}
      />
    ));
    await fillBrief();
    await fireEvent.input(screen.getByLabelText("Provider"), {
      target: { value: "configured-provider" },
    });
    await fireEvent.input(screen.getByLabelText("Model identifier"), {
      target: { value: "chosen-model" },
    });
    setModels([first, second]);
    expect((screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement).value).toBe(
      "custom",
    );
    expect((screen.getByLabelText("Model identifier") as HTMLInputElement).value).toBe(
      "chosen-model",
    );
    await submitForm();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "configured-provider", model: "chosen-model" },
      }),
    );
  });

  it("keeps a configured selection through reordering and refuses its disappearance", async () => {
    const [models, setModels] = createSignal<readonly ModelChoice[]>([first, second]);
    const submit = vi.fn(async (_input: CampaignCreateRequest) => true);
    render(() => (
      <CampaignForm
        models={models()}
        busy={false}
        submit={submit}
        close={() => undefined}
        cancel={() => undefined}
      />
    ));
    await fillBrief();
    const picker = screen.getByRole("combobox", { name: "Model" });
    expect(screen.queryByLabelText("Provider")).toBeNull();
    await fireEvent.change(picker, { target: { value: "custom" } });
    await fireEvent.input(screen.getByLabelText("Provider"), { target: { value: "leftover" } });
    await fireEvent.input(screen.getByLabelText("Model identifier"), {
      target: { value: "leftover" },
    });
    await fireEvent.change(picker, { target: { value: second.key } });
    setModels([second, first]);
    expect((picker as HTMLSelectElement).value).toBe(second.key);
    setModels([first]);
    expect((picker as HTMLSelectElement).value).toBe(second.key);
    await submitForm();
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("selected model is unavailable");
    expect(screen.queryByLabelText("Provider")).toBeNull();
  });

  it.each(["rejected", "thrown"])(
    "preserves a draft after %s creation and prevents duplicate dispatch",
    async (outcome) => {
      const result = deferred<boolean>();
      const submit = vi.fn(() => result.promise);
      const close = vi.fn();
      render(() => (
        <CampaignForm
          models={[first]}
          busy={false}
          submit={submit}
          close={close}
          cancel={() => undefined}
        />
      ));
      await fillBrief();
      await submitForm();
      expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
      await submitForm();
      expect(submit).toHaveBeenCalledTimes(1);
      if (outcome === "thrown") result.reject(new Error("Lost response"));
      else result.resolve(false);
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain("Creation not confirmed"),
      );
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Welcome");
      expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(false);
      expect(close).not.toHaveBeenCalled();
    },
  );

  it("uses cancellation for Back and ignores a creation acknowledged after leaving", async () => {
    const result = deferred<boolean>();
    const [shown, setShown] = createSignal(true);
    const close = vi.fn();
    const cancel = vi.fn(() => setShown(false));
    render(() => (
      <Show when={shown()}>
        <CampaignForm
          models={[first]}
          busy={false}
          submit={() => result.promise}
          close={close}
          cancel={cancel}
        />
      </Show>
    ));
    await fillBrief();
    await submitForm();
    await fireEvent.click(screen.getByRole("button", { name: "Back" }));
    result.resolve(true);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes only after confirmed creation", async () => {
    const close = vi.fn();
    const cancel = vi.fn();
    render(() => (
      <CampaignForm
        models={[first]}
        busy={false}
        submit={async () => true}
        close={close}
        cancel={cancel}
      />
    ));
    await fillBrief();
    await submitForm();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(cancel).not.toHaveBeenCalled();
  });
});

async function fillBrief(): Promise<void> {
  await fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Welcome" } });
  await fireEvent.input(screen.getByLabelText("Desired outcome"), {
    target: { value: "Clear setup" },
  });
  await fireEvent.input(screen.getByLabelText("Quality criteria, one per line"), {
    target: { value: "Usable" },
  });
}

async function submitForm(): Promise<void> {
  const form = screen.getByLabelText("Title").closest("form");
  if (form === null) throw new Error("Missing creation form");
  await fireEvent.submit(form);
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
