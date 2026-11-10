import { CampaignRequestError, type CampaignsClient } from "@keywork-app/client";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

export function ArtifactExport(props: {
  campaignId: string;
  artifactId: string;
  client: Pick<CampaignsClient, "export">;
}) {
  const [busy, setBusy] = createSignal(false);
  const [path, setPath] = createSignal<string>();
  const [problem, setProblem] = createSignal<string>();
  let generation = 0;
  let disposed = false;
  createEffect(() => {
    props.campaignId;
    props.artifactId;
    generation += 1;
    setBusy(false);
    setPath(undefined);
    setProblem(undefined);
  });
  onCleanup(() => {
    disposed = true;
  });
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (busy()) return;
    const destination = String(
      new FormData(event.currentTarget as HTMLFormElement).get("destination") ?? "",
    ).trim();
    if (destination === "") return;
    const turn = generation;
    setBusy(true);
    setPath(undefined);
    setProblem(undefined);
    try {
      const result = await props.client.export(props.campaignId, props.artifactId, destination);
      if (!disposed && turn === generation) setPath(result.path);
    } catch (cause) {
      if (!disposed && turn === generation)
        setProblem(
          cause instanceof CampaignRequestError && cause.status >= 400 && cause.status < 500
            ? cause.message
            : "Export was not confirmed. Inspect the destination before trying again.",
        );
    } finally {
      if (!disposed && turn === generation) setBusy(false);
    }
  };
  return (
    <details>
      <summary>Export artifact</summary>
      <form class="kw-campaign-form" onSubmit={(event) => void submit(event)}>
        <label>
          New folder in this workspace
          <input
            name="destination"
            placeholder="exports/reviewed-version"
            disabled={busy()}
            required
          />
        </label>
        <p>Copies the full artifact. Existing files stay untouched.</p>
        <button type="submit" disabled={busy()}>
          {busy() ? "Exporting…" : "Export version"}
        </button>
        <Show when={path()}>
          {(destination) => (
            <p role="status">
              Exported to <code>{destination()}</code>
            </p>
          )}
        </Show>
        <Show when={problem()}>{(message) => <p role="alert">{message()}</p>}</Show>
      </form>
    </details>
  );
}
