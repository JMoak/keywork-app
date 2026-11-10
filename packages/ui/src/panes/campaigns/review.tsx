import type {
  Campaign,
  CampaignReviewObservation,
  CampaignUserCommand,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

export function ArtifactReview(props: {
  campaign: Campaign;
  artifactId: string;
  enabled: boolean;
  disabledReason?: string | undefined;
  submit(command: CampaignUserCommand): Promise<boolean>;
}) {
  const [problem, setProblem] = createSignal<string>();
  const [pending, setPending] = createSignal(false);
  const [recorded, setRecorded] = createSignal(false);
  let generation = 0;
  let disposed = false;
  const purpose = () =>
    props.campaign.purposes.find((item) => item.revision === props.campaign.purposeRevision);
  const identity = createMemo(() =>
    JSON.stringify([props.campaign.id, props.artifactId, props.campaign.purposeRevision]),
  );
  createEffect(() => {
    identity();
    generation += 1;
    setProblem(undefined);
    setPending(false);
    setRecorded(false);
  });
  onCleanup(() => {
    disposed = true;
  });
  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!props.enabled || pending()) return;
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    if (!data.has("inspected")) {
      setProblem("Confirm that you inspected this artifact before recording observations.");
      return;
    }
    const observations: CampaignReviewObservation[] = [];
    for (const criterion of purpose()?.criteria ?? []) {
      const verdict = String(data.get(`verdict:${criterion.id}`) ?? "");
      const summary = String(data.get(`summary:${criterion.id}`) ?? "").trim();
      if (!["pass", "fail", "uncertain"].includes(verdict) || summary === "") {
        setProblem("Choose a verdict and explain your observation for every criterion.");
        return;
      }
      if (verdict === "pass" || verdict === "fail" || verdict === "uncertain")
        observations.push({ criterionId: criterion.id, verdict, summary });
    }
    const reason = String(data.get("reason") ?? "").trim();
    if (observations.length === 0 || reason === "") {
      setProblem("Describe the reason for this review.");
      return;
    }
    const turn = generation;
    setProblem(undefined);
    setRecorded(false);
    setPending(true);
    try {
      const confirmed = await props.submit({
        type: "review-artifact",
        artifactId: props.artifactId,
        observations,
        reason,
        adopt: data.has("adopt"),
        attested: true,
      });
      if (disposed || turn !== generation) return;
      if (!confirmed) {
        setProblem("Review not confirmed. Check the campaign before submitting again.");
        return;
      }
      for (const name of ["inspected", "adopt"]) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.checked = false;
      }
      setRecorded(true);
    } catch {
      if (!disposed && turn === generation)
        setProblem("Review not confirmed. Check the campaign before submitting again.");
    } finally {
      if (!disposed && turn === generation) setPending(false);
    }
  };
  return (
    <details>
      <summary>Review artifact</summary>
      <Show when={!props.enabled && props.disabledReason}>
        {(reason) => <p role="status">{reason()}</p>}
      </Show>
      <Show keyed when={identity()}>
        {(reviewKey) => (
          <form
            onSubmit={(event) => void submit(event)}
            onInput={() => setRecorded(false)}
            data-review={reviewKey}
          >
            <fieldset class="kw-campaign-form" disabled={!props.enabled || pending()}>
              <legend>Your review · purpose {props.campaign.purposeRevision}</legend>
              <p>{purpose()?.outcome}</p>
              <For each={purpose()?.criteria ?? []}>
                {(criterion) => (
                  <fieldset class="kw-campaign-review-criterion">
                    <legend>
                      {criterion.description}
                      {criterion.critical ? " · required" : ""}
                    </legend>
                    <label>
                      Verdict
                      <select
                        name={`verdict:${criterion.id}`}
                        aria-label={`Verdict for ${criterion.description}`}
                      >
                        <option value="uncertain" selected>
                          Uncertain
                        </option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </label>
                    <label>
                      Observation
                      <textarea
                        name={`summary:${criterion.id}`}
                        aria-label={`Your observation for ${criterion.description}`}
                        rows={3}
                        maxLength={4000}
                        required
                      />
                    </label>
                  </fieldset>
                )}
              </For>
              <label>
                Reason for this review
                <textarea name="reason" rows={2} maxLength={4000} required />
              </label>
              <label class="kw-campaign-cartridge-choice">
                <span>
                  <input type="checkbox" name="adopt" /> Use as current best if review passes
                </span>
              </label>
              <label class="kw-campaign-cartridge-choice">
                <span>
                  <input type="checkbox" name="inspected" required /> I inspected this artifact
                </span>
              </label>
              <Show when={problem()}>{(message) => <p role="alert">{message()}</p>}</Show>
              <Show when={recorded()}>
                <p role="status">Review recorded</p>
              </Show>
              <button type="submit">{pending() ? "Recording…" : "Record review"}</button>
            </fieldset>
          </form>
        )}
      </Show>
    </details>
  );
}
