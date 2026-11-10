import type { CampaignCreateRequest } from "@keywork-app/protocol";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { ModelChoice } from "./model.ts";

export function CampaignForm(props: {
  models: readonly ModelChoice[];
  busy: boolean;
  submit(input: CampaignCreateRequest): Promise<boolean>;
  close(): void;
  cancel(): void;
}) {
  const [problem, setProblem] = createSignal<string>();
  const [pending, setPending] = createSignal(false);
  const [modelChoice, setModelChoice] = createSignal(props.models[0]?.key ?? "custom");
  const [customProvider, setCustomProvider] = createSignal("");
  const [customModel, setCustomModel] = createSignal("");
  const selectedModel = () => props.models.find((model) => model.key === modelChoice());
  const unavailable = () => modelChoice() !== "custom" && selectedModel() === undefined;
  const busy = () => props.busy || pending();
  let modelSelect: HTMLSelectElement | undefined;
  let disposed = false;
  createEffect(() => {
    props.models;
    const choice = modelChoice();
    if (modelSelect !== undefined) modelSelect.value = choice;
  });
  onCleanup(() => {
    disposed = true;
  });
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy() || disposed) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const selected = selectedModel();
    const budgetMicros = Math.round(Number(value("budget")) * 1_000_000);
    if (!Number.isSafeInteger(budgetMicros) || budgetMicros <= 0) {
      setProblem("Enter a positive spending limit.");
      return;
    }
    const criteria = lines(value("criteria"));
    if (criteria.length === 0) {
      setProblem("Describe at least one quality criterion.");
      return;
    }
    const workload = value("workload");
    const profile = value("persistence");
    if (
      workload !== "app-improvement" &&
      workload !== "project-development" &&
      workload !== "research-refinement"
    )
      return;
    if (profile !== "focused" && profile !== "persistent" && profile !== "deep") return;
    if (unavailable()) {
      setProblem("The selected model is unavailable. Choose another model.");
      return;
    }
    const provider = modelChoice() === "custom" ? customProvider().trim() : selected?.provider;
    const model = modelChoice() === "custom" ? customModel().trim() : selected?.model;
    if (!provider || !model) {
      setProblem("Select a model or enter its configured provider and model name.");
      return;
    }
    setProblem(undefined);
    setPending(true);
    try {
      const saved = await props.submit({
        title: value("title"),
        workload,
        objective: value("objective"),
        criteria,
        references: lines(value("references")),
        model: { provider, model },
        budgetMicros,
        persistenceProfile: profile,
        ...(value("artifactPath") !== "" && { artifactPath: value("artifactPath") }),
        ...(value("text") !== "" && { text: value("text") }),
      });
      if (disposed) return;
      if (saved) props.close();
      else setProblem("Creation not confirmed. Check campaigns before trying again.");
    } catch {
      if (!disposed) setProblem("Creation not confirmed. Check campaigns before trying again.");
    } finally {
      if (!disposed) setPending(false);
    }
  };
  return (
    <form class="kw-campaign-form" onSubmit={(event) => void submit(event)}>
      <h2>New campaign</h2>
      <label>
        Title
        <input name="title" required maxLength={512} disabled={busy()} />
      </label>
      <label>
        Work
        <select name="workload" disabled={busy()}>
          <option value="app-improvement">Improve an app</option>
          <option value="project-development">Develop a project</option>
          <option value="research-refinement">Refine research or a plan</option>
        </select>
      </label>
      <label>
        Desired outcome
        <textarea name="objective" required rows={3} maxLength={16000} disabled={busy()} />
      </label>
      <label>
        Quality criteria, one per line
        <textarea
          name="criteria"
          required
          rows={3}
          placeholder="What must the result accomplish?"
          disabled={busy()}
        />
      </label>
      <label>
        Starting file or folder
        <input
          name="artifactPath"
          placeholder="Path within this workspace (optional)"
          disabled={busy()}
        />
      </label>
      <label>
        Starting text or brief
        <textarea name="text" rows={3} disabled={busy()} />
      </label>
      <label>
        References, one per line
        <textarea name="references" rows={2} disabled={busy()} />
      </label>
      <label>
        Model
        <select
          ref={modelSelect}
          name="modelChoice"
          disabled={busy()}
          onChange={(event) => setModelChoice(event.currentTarget.value)}
        >
          <Show when={unavailable()}>
            <option value={modelChoice()} disabled>
              Selected model unavailable
            </option>
          </Show>
          <For each={props.models}>
            {(model) => <option value={model.key}>{model.label}</option>}
          </For>
          <option value="custom">Configured provider and model…</option>
        </select>
      </label>
      <Show when={modelChoice() === "custom"}>
        <label>
          Provider
          <input
            name="provider"
            placeholder="Provider name"
            value={customProvider()}
            onInput={(event) => setCustomProvider(event.currentTarget.value)}
            required
            disabled={busy()}
          />
        </label>
        <label>
          Model identifier
          <input
            name="model"
            placeholder="Model identifier"
            value={customModel()}
            onInput={(event) => setCustomModel(event.currentTarget.value)}
            required
            disabled={busy()}
          />
        </label>
      </Show>
      <div class="kw-campaign-form-pair">
        <label>
          Spending limit (USD)
          <input
            name="budget"
            type="number"
            min="0.01"
            step="0.01"
            value="5.00"
            required
            disabled={busy()}
          />
        </label>
        <label>
          Persistence
          <select name="persistence" disabled={busy()}>
            <option value="focused">Focused · up to 2 extra probes</option>
            <option value="persistent" selected>
              Persistent · up to 8 extra probes
            </option>
            <option value="deep">Deep · up to 12 extra probes</option>
          </select>
        </label>
      </div>
      <p>Creating a campaign does not run the model. Start when ready.</p>
      <Show when={problem()}>{(message) => <p role="alert">{message()}</p>}</Show>
      <div class="kw-campaign-actions">
        <button type="submit" disabled={busy()}>
          {pending() ? "Creating…" : "Create campaign"}
        </button>
        <button type="button" onClick={() => props.cancel()}>
          Back
        </button>
      </div>
    </form>
  );
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
