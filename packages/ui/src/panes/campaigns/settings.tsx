import type { CampaignsClient } from "@keywork-app/client";
import type { Campaign, CampaignCartridgeChoice, CampaignUserCommand } from "@keywork-app/protocol";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { type ModelChoice, money } from "./model.ts";

export function CampaignSettings(props: {
  campaign: Campaign;
  models: readonly ModelChoice[];
  client: CampaignsClient;
  enabled: boolean;
  submit(command: CampaignUserCommand): Promise<boolean>;
}) {
  const [cartridges, setCartridges] = createSignal<CampaignCartridgeChoice[]>();
  const [problem, setProblem] = createSignal<string>();
  const [invalid, setInvalid] = createSignal<string>();
  const currentKey = () =>
    props.campaign.model === null
      ? undefined
      : JSON.stringify(["current", props.campaign.model.providerId, props.campaign.model.modelId]);
  const [modelChoice, setModelChoice] = createSignal(
    currentKey() ?? props.models[0]?.key ?? "custom",
  );
  const [customProvider, setCustomProvider] = createSignal("");
  const [customModel, setCustomModel] = createSignal("");
  const selectedModel = () =>
    modelChoice() === currentKey() && props.campaign.model !== null
      ? { provider: props.campaign.model.providerId, model: props.campaign.model.modelId }
      : props.models.find((model) => model.key === modelChoice());
  const unavailable = () => modelChoice() !== "custom" && selectedModel() === undefined;
  let modelSelect: HTMLSelectElement | undefined;
  let disposed = false;
  createEffect(() => {
    props.models;
    currentKey();
    const choice = modelChoice();
    if (modelSelect !== undefined) modelSelect.value = choice;
  });
  onMount(() => {
    void props.client
      .cartridges()
      .then((inventory) => {
        if (!disposed) setCartridges(inventory);
      })
      .catch((cause: unknown) => {
        if (!disposed) setProblem(cause instanceof Error ? cause.message : String(cause));
      });
  });
  onCleanup(() => {
    disposed = true;
  });
  const send = (command: CampaignUserCommand): void => {
    if (!props.enabled) return;
    setInvalid(undefined);
    void props.submit(command);
  };
  return (
    <section aria-label="Campaign configuration">
      <h2>Model, skills, and allowance</h2>
      <Show when={invalid()}>{(message) => <p role="alert">{message()}</p>}</Show>
      <details>
        <summary>Change model</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (unavailable()) {
              setInvalid("The selected model is unavailable. Choose another model.");
              return;
            }
            const selected = selectedModel();
            const provider =
              modelChoice() === "custom" ? customProvider().trim() : selected?.provider;
            const model = modelChoice() === "custom" ? customModel().trim() : selected?.model;
            if (!provider || !model) {
              setInvalid("Enter a configured provider and model.");
              return;
            }
            send({
              type: "select-model",
              model: { provider, model },
              reason: field(data, "reason"),
            });
          }}
        >
          <fieldset class="kw-campaign-form" disabled={!props.enabled}>
            <legend>Model selection</legend>
            <label>
              Model
              <select
                ref={modelSelect}
                name="choice"
                onChange={(event) => setModelChoice(event.currentTarget.value)}
              >
                <Show when={unavailable()}>
                  <option value={modelChoice()} disabled>
                    Selected model unavailable
                  </option>
                </Show>
                <Show when={props.campaign.model}>
                  <option value={currentKey()}>
                    {props.campaign.model?.providerId}/{props.campaign.model?.modelId} · current
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
                Configured provider
                <input
                  name="provider"
                  value={customProvider()}
                  onInput={(event) => setCustomProvider(event.currentTarget.value)}
                  required
                />
              </label>
              <label>
                Configured model
                <input
                  name="model"
                  value={customModel()}
                  onInput={(event) => setCustomModel(event.currentTarget.value)}
                  required
                />
              </label>
            </Show>
            <label>
              Reason
              <input name="reason" required />
            </label>
            <p>Applies to future operations.</p>
            <button type="submit">Save model</button>
          </fieldset>
        </form>
      </details>
      <details>
        <summary>Choose skill cartridges</summary>
        <Show when={problem()}>
          {(message) => <p role="alert">Cartridge discovery is unavailable: {message()}</p>}
        </Show>
        <Show
          when={cartridges()}
          fallback={
            <Show when={!problem()}>
              <p role="status">Reading available cartridges…</p>
            </Show>
          }
        >
          {(available) => (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                send({
                  type: "set-cartridges",
                  cartridgeIds: data.getAll("cartridge").map(String),
                  reason: field(data, "reason"),
                });
              }}
            >
              <fieldset class="kw-campaign-form" disabled={!props.enabled}>
                <legend>Available cartridges</legend>
                <Show
                  when={available().length > 0}
                  fallback={<p>No cartridges are available on this runtime.</p>}
                >
                  <For each={available()}>
                    {(cartridge) => (
                      <label class="kw-campaign-cartridge-choice">
                        <span>
                          <input
                            type="checkbox"
                            name="cartridge"
                            value={cartridge.id}
                            checked={props.campaign.cartridges.some(
                              (lock) => lock.id === cartridge.id && lock.status === "active",
                            )}
                          />{" "}
                          {cartridge.title} · {cartridge.version}
                        </span>
                        <span>{cartridge.description}</span>
                        <small>{cartridge.stages.join(" · ")}</small>
                      </label>
                    )}
                  </For>
                  <label>
                    Reason
                    <input name="reason" required />
                  </label>
                  <button type="submit">Save cartridges</button>
                </Show>
              </fieldset>
            </form>
          )}
        </Show>
      </details>
      <details>
        <summary>Change persistence limits</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const probeLimit = Number(field(data, "probes"));
            const spendLimitMicros = Math.round(Number(field(data, "spend")) * 1_000_000);
            const timeLimitMs = Math.round(Number(field(data, "minutes")) * 60_000);
            if (
              ![probeLimit, spendLimitMicros, timeLimitMs].every(
                (value) => Number.isSafeInteger(value) && value >= 0,
              )
            ) {
              setInvalid("Enter valid total probe, spending, and time limits.");
              return;
            }
            send({
              type: "renew-persistence",
              probeLimit,
              spendLimitMicros,
              timeLimitMs,
              reason: field(data, "reason"),
            });
          }}
        >
          <fieldset class="kw-campaign-form" disabled={!props.enabled}>
            <legend>Total allowance</legend>
            <p>
              Total limits include prior usage; the clock does not restart. Campaign limit remains{" "}
              {money(props.campaign.budget.limitMicros)}.
            </p>
            <label>
              Total probes
              <input
                name="probes"
                type="number"
                min={props.campaign.persistence.probesUsed}
                max="1000"
                step="1"
                value={props.campaign.persistence.probeLimit}
                required
              />
            </label>
            <label>
              Total exploration spending (USD)
              <input
                name="spend"
                type="number"
                min={props.campaign.persistence.spentMicros / 1_000_000}
                step="0.000001"
                value={props.campaign.persistence.spendLimitMicros / 1_000_000}
                required
              />
            </label>
            <label>
              Total exploration time (minutes)
              <input
                name="minutes"
                type="number"
                min={props.campaign.persistence.elapsedMs / 60_000}
                step="any"
                value={props.campaign.persistence.timeLimitMs / 60_000}
                required
              />
            </label>
            <label>
              Reason for extending the search
              <input name="reason" required />
            </label>
            <button type="submit">Authorize total limits</button>
          </fieldset>
        </form>
      </details>
      <For
        each={props.campaign.usage.filter(
          (receipt) => receipt.state === "unknown" || receipt.state === "estimated",
        )}
      >
        {(receipt) => (
          <details>
            <summary>
              Reconcile {receipt.state === "unknown" ? "unknown" : "estimated"} charge ·{" "}
              {receipt.stage} · {receipt.operationId}
            </summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const costMicros = Math.round(Number(field(data, "cost")) * 1_000_000);
                if (
                  field(data, "cost") === "" ||
                  !Number.isSafeInteger(costMicros) ||
                  costMicros < 0 ||
                  !data.has("confirmed")
                ) {
                  setInvalid("Enter and verify the total actual provider charge.");
                  return;
                }
                send({
                  type: "reconcile",
                  operationId: receipt.operationId,
                  costMicros,
                  reference: field(data, "reference"),
                  reason: field(data, "reason"),
                });
              }}
            >
              <fieldset class="kw-campaign-form" disabled={!props.enabled}>
                <legend>Actual charge</legend>
                <p>
                  {money(receipt.reservedMicros)} held pending confirmation. Enter the total from
                  the provider receipt. This does not rerun the operation.
                </p>
                <label>
                  Total actual charge (USD)
                  <input name="cost" type="number" min="0" step="0.000001" required />
                </label>
                <label>
                  Provider receipt reference
                  <input name="reference" required />
                </label>
                <label>
                  Reason
                  <input name="reason" required />
                </label>
                <label class="kw-campaign-cartridge-choice">
                  <span>
                    <input name="confirmed" type="checkbox" required /> I verified this total
                    against the provider receipt.
                  </span>
                </label>
                <button type="submit">Confirm actual charge</button>
              </fieldset>
            </form>
          </details>
        )}
      </For>
    </section>
  );
}

function field(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim();
}
