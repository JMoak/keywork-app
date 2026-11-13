import type { CampaignsClient } from "@keywork-app/client";
import type {
  Campaign,
  CampaignArtifact,
  CampaignArtifactPreview,
  CampaignUserCommand,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { ArtifactExport } from "./export.tsx";
import {
  campaignSpending,
  elapsed,
  type ModelChoice,
  moment,
  money,
  receiptCost,
} from "./model.ts";
import { ArtifactReview } from "./review.tsx";
import { CampaignSettings } from "./settings.tsx";
import type { CampaignMonitor } from "./store.ts";
import { CampaignSpendTrend } from "./trend.tsx";

export function CampaignDetail(props: {
  campaign: Campaign;
  monitor: CampaignMonitor;
  client: CampaignsClient;
  models: readonly ModelChoice[];
}) {
  const [artifactId, setArtifactId] = createSignal<string>();
  const [compare, setCompare] = createSignal(false);
  const [steering, setSteering] = createSignal(false);
  const [confirming, setConfirming] = createSignal<Ending>();
  const [redirectOutcome, setRedirectOutcome] = createSignal("");
  const finished = () => endedStatuses.has(props.campaign.status);
  let artifactSection: HTMLElement | undefined;
  let artifactSelect: HTMLSelectElement | undefined;
  let redirectGeneration = 0;
  let disposed = false;
  createEffect(
    on(
      () => props.campaign.id,
      () => {
        setArtifactId(undefined);
        setCompare(false);
        setSteering(false);
        setConfirming(undefined);
        redirectGeneration += 1;
      },
    ),
  );
  onCleanup(() => {
    disposed = true;
  });
  const purpose = () =>
    props.campaign.purposes.find((purpose) => purpose.revision === props.campaign.purposeRevision);
  const selected = () =>
    artifactId() ??
    props.campaign.currentBestArtifactId ??
    props.campaign.latestArtifactId ??
    undefined;
  const chosenArtifact = () =>
    props.campaign.artifacts.find((artifact) => artifact.id === selected());
  const baseline = () =>
    props.campaign.artifacts.find((artifact) => artifact.id === props.campaign.baselineArtifactId);
  const canCompare = () => baseline() !== undefined && selected() !== baseline()?.id;
  const comparing = () => compare() && canCompare();
  const running = () => props.campaign.attempts.findLast((attempt) => attempt.status === "running");
  const reviewBlocked = () =>
    props.campaign.attempts.some(
      (attempt) => attempt.status === "running" || attempt.status === "unknown",
    );
  const showSelectedModel = () =>
    props.campaign.model &&
    (running()?.model.providerId !== props.campaign.model.providerId ||
      running()?.model.modelId !== props.campaign.model.modelId);
  const canControl = () =>
    !props.monitor.state.busy &&
    !props.monitor.state.stale &&
    props.monitor.state.connection === "live";
  const canReview = createMemo(() => canControl() && !reviewBlocked());
  const send = (command: CampaignUserCommand) => void props.monitor.command(command);
  const inspect = (id: string): void => {
    setArtifactId(id);
    artifactSection?.scrollIntoView({ behavior: "instant", block: "start" });
    artifactSelect?.focus({ preventScroll: true });
  };
  const toggleSteering = (): void => {
    redirectGeneration += 1;
    setRedirectOutcome(purpose()?.outcome ?? "");
    setSteering(!steering());
  };
  const redirect = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if (!canControl()) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const campaignId = props.campaign.id;
    const generation = redirectGeneration;
    const saved = await props.monitor.command({
      type: "redirect",
      objective: String(data.get("objective") ?? "").trim(),
      reason: String(data.get("reason") ?? "").trim(),
    });
    if (saved && !disposed && generation === redirectGeneration && campaignId === props.campaign.id)
      setSteering(false);
  };
  return (
    <article class="kw-campaign-detail" aria-label={props.campaign.title}>
      <header class="kw-campaign-title">
        <div>
          <h1>{props.campaign.title}</h1>
          <p>{purpose()?.outcome}</p>
          <p class="kw-campaign-meta">
            Verification: {props.campaign.verification} · delivery: {props.campaign.delivery}
          </p>
        </div>
        <span class="kw-campaign-state">{props.campaign.status}</span>
      </header>
      <fieldset class="kw-campaign-actions" aria-label="Campaign controls">
        <Show when={props.campaign.status === "draft" || props.campaign.status === "ready"}>
          <button
            type="button"
            disabled={!canControl()}
            onClick={() =>
              send({ type: "start", reason: "Start with the reviewed campaign budget and model." })
            }
          >
            Start campaign
          </button>
        </Show>
        <Show when={props.campaign.status === "running"}>
          <button
            type="button"
            disabled={!canControl()}
            onClick={() =>
              send({ type: "pause", reason: "Pause requested from campaign monitor." })
            }
          >
            Pause
          </button>
        </Show>
        <Show when={props.campaign.status === "paused" || props.campaign.status === "waiting"}>
          <button
            type="button"
            disabled={!canControl()}
            onClick={() => send({ type: "resume", reason: "Continue from the current best." })}
          >
            Resume
          </button>
        </Show>
        <Show when={!finished()}>
          <button
            type="button"
            disabled={!canControl()}
            aria-expanded={confirming() === "cancel"}
            onClick={() => setConfirming("cancel")}
          >
            Cancel campaign
          </button>
          <button
            type="button"
            disabled={!canControl()}
            aria-expanded={confirming() === "finish"}
            onClick={() => setConfirming("finish")}
          >
            Finish with best
          </button>
          <button type="button" disabled={!canControl()} onClick={toggleSteering}>
            Redirect purpose
          </button>
        </Show>
      </fieldset>
      <Show when={!finished() && confirming()}>
        {(ending) => (
          <fieldset class="kw-campaign-actions" aria-label={endingWords[ending()].ask}>
            <p>
              {ending() === "finish" && props.campaign.attempts.length === 0
                ? `${endingWords.finish.ask} Nothing has run yet, so there is no improved result.`
                : endingWords[ending()].ask}{" "}
              {endingWords[ending()].consequence}
            </p>
            <button
              type="button"
              disabled={!canControl()}
              onClick={() => {
                const { command } = endingWords[ending()];
                setConfirming(undefined);
                send(command);
              }}
            >
              {endingWords[ending()].confirm}
            </button>
            <button type="button" onClick={() => setConfirming(undefined)}>
              Keep going
            </button>
          </fieldset>
        )}
      </Show>
      <Show when={props.campaign.controlRequested}>
        <p role="status">
          {props.campaign.controlRequested === "pause"
            ? "Pause requested"
            : "Cancellation requested"}
          . Waiting for the active operation; costs may still arrive.
        </p>
      </Show>
      <Show when={props.monitor.state.busy}>
        <p role="status">Sending {props.monitor.state.requested ?? "request"}…</p>
      </Show>
      <Show when={props.campaign.statusReason}>
        <p class="kw-campaign-reason">{props.campaign.statusReason}</p>
      </Show>
      <Show when={steering()}>
        <form class="kw-campaign-form" onSubmit={(event) => void redirect(event)}>
          <label>
            Revised outcome
            <textarea
              name="objective"
              required
              value={redirectOutcome()}
              disabled={props.monitor.state.busy}
            />
          </label>
          <label>
            Reason
            <input name="reason" required disabled={props.monitor.state.busy} />
          </label>
          <p>Earlier reviews keep their original criteria.</p>
          <button type="submit" disabled={!canControl()}>
            Save new purpose
          </button>
        </form>
      </Show>
      <section aria-label="Current work">
        <h2>Now</h2>
        <Show when={running()} fallback={<p>No active operation.</p>}>
          {(attempt) => (
            <>
              <p>{attempt().hypothesis}</p>
              <p class="kw-campaign-meta">
                {attempt().method} · {attempt().model.providerId}/{attempt().model.modelId} ·
                started {moment(attempt().startedAt)}
              </p>
            </>
          )}
        </Show>
        <Show when={showSelectedModel()}>
          <p class="kw-campaign-meta">
            Selected model: {props.campaign.model?.providerId}/{props.campaign.model?.modelId}
          </p>
        </Show>
        <Show when={props.campaign.decisions.at(-1)}>
          {(decision) => <p>Latest decision: {decision().reason}</p>}
        </Show>
      </section>
      <CampaignCosts campaign={props.campaign} />
      <section aria-label="Persistence">
        <h2>Persistence</h2>
        <Show when={props.campaign.persistence.active}>
          <p>Exploring beyond a finish proposal</p>
        </Show>
        <dl class="kw-campaign-metrics">
          <div>
            <dt>Probes used</dt>
            <dd>
              {props.campaign.persistence.probesUsed} / {props.campaign.persistence.probeLimit}
            </dd>
          </div>
          <div>
            <dt>Without accepted improvement</dt>
            <dd>{props.campaign.persistence.consecutiveWithoutImprovement}</dd>
          </div>
          <div>
            <dt>Spent / limit</dt>
            <dd>
              {money(props.campaign.persistence.spentMicros)} /{" "}
              {money(props.campaign.persistence.spendLimitMicros)}
            </dd>
          </div>
          <div>
            <dt>Time / limit</dt>
            <dd>
              {elapsed(props.campaign.persistence.elapsedMs)} /{" "}
              {elapsed(props.campaign.persistence.timeLimitMs)}
            </dd>
          </div>
        </dl>
        <Show when={props.campaign.persistence.reservedMicros > 0}>
          <p>{money(props.campaign.persistence.reservedMicros)} held for active probes.</p>
        </Show>
        <Show when={props.campaign.persistence.terminationReason}>
          <p>{props.campaign.persistence.terminationReason}</p>
        </Show>
      </section>
      <section ref={artifactSection} aria-label="Artifacts">
        <h2>Artifacts</h2>
        <Show when={props.campaign.artifacts.length > 0} fallback={<p>No artifacts yet.</p>}>
          <div class="kw-campaign-actions">
            <label>
              Inspect
              <select
                ref={artifactSelect}
                aria-label="Inspect artifact"
                value={selected() ?? ""}
                onChange={(event) => setArtifactId(event.currentTarget.value)}
              >
                <For each={props.campaign.artifacts}>
                  {(artifact) => (
                    <option value={artifact.id} selected={artifact.id === selected()}>
                      {artifact.title}
                      {artifactRole(props.campaign, artifact.id)}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={comparing()}
                disabled={!canCompare()}
                onChange={(event) => setCompare(event.currentTarget.checked)}
              />{" "}
              Compare with baseline
            </label>
            <button
              type="button"
              disabled={!canControl() || selected() === undefined}
              onClick={() => {
                const id = selected();
                if (id !== undefined)
                  send({
                    type: "retain",
                    artifactId: id,
                    reason: "Retain this version for comparison.",
                  });
              }}
            >
              Retain version
            </button>
            <button
              type="button"
              disabled={!canControl() || selected() === undefined}
              onClick={() => {
                const id = selected();
                if (id !== undefined)
                  send({
                    type: "branch",
                    artifactId: id,
                    reason: "Explore another direction from this artifact.",
                  });
              }}
            >
              Branch here
            </button>
          </div>
          <div class="kw-campaign-artifacts" data-compare={comparing()}>
            <Show when={comparing() && baseline()}>
              {(artifact) => (
                <ArtifactInspection
                  campaignId={props.campaign.id}
                  artifact={artifact()}
                  client={props.client}
                  label="Baseline"
                />
              )}
            </Show>
            <Show when={chosenArtifact()}>
              {(artifact) => (
                <ArtifactInspection
                  campaignId={props.campaign.id}
                  artifact={artifact()}
                  client={props.client}
                />
              )}
            </Show>
          </div>
          <Show when={chosenArtifact()}>
            {(artifact) => (
              <ArtifactReview
                campaign={props.campaign}
                artifactId={artifact().id}
                enabled={canReview()}
                disabledReason={
                  reviewBlocked()
                    ? "Pause and resolve active or uncertain operations to review."
                    : undefined
                }
                submit={props.monitor.command}
              />
            )}
          </Show>
        </Show>
      </section>
      <section aria-label="Achievements">
        <h2>Achievements</h2>
        <Show when={props.campaign.achievements.length > 0} fallback={<p>No achievements yet.</p>}>
          <ul class="kw-campaign-records">
            <For each={props.campaign.achievements}>
              {(achievement) => (
                <li>
                  <strong>{achievement.title}</strong>
                  <span class="kw-campaign-state">
                    {achievement.status}
                    {achievement.adoptedAt === null ? " · not adopted" : " · adopted"}
                  </span>
                  <p>{achievement.summary}</p>
                  <p class="kw-campaign-meta">Purpose revision {achievement.purposeRevision}</p>
                  <button type="button" onClick={() => inspect(achievement.artifactId)}>
                    Inspect artifact
                  </button>
                  <details>
                    <summary>Evidence ({achievement.evidenceIds.length})</summary>
                    <For
                      each={props.campaign.evidence.filter((item) =>
                        achievement.evidenceIds.includes(item.id),
                      )}
                    >
                      {(evidence) => (
                        <div>
                          <strong>
                            {evidence.kind} · {evidence.verdict}
                          </strong>
                          <p>{evidence.summary}</p>
                          <For each={evidence.sourceRefs}>{(source) => <code>{source}</code>}</For>
                        </div>
                      )}
                    </For>
                  </details>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
      <section aria-label="Quality criteria">
        <h2>Quality criteria</h2>
        <p class="kw-campaign-meta">Purpose revision {props.campaign.purposeRevision}</p>
        <ul>
          <For each={purpose()?.criteria ?? []}>
            {(criterion) => (
              <li>
                {criterion.description}
                {criterion.critical ? " · required" : ""}
              </li>
            )}
          </For>
        </ul>
        <For each={props.campaign.evaluations}>
          {(evaluation) => (
            <details>
              <summary>
                {evaluation.materialImprovement ? "Material improvement" : "Evaluation"} · purpose{" "}
                {evaluation.purposeRevision} · {moment(evaluation.createdAt)}
              </summary>
              <p>{evaluation.summary}</p>
              <For each={evaluation.observations}>
                {(observation) => (
                  <p>
                    {observation.verdict}: {observation.summary}
                  </p>
                )}
              </For>
            </details>
          )}
        </For>
      </section>
      <section aria-label="Iteration timeline">
        <h2>Iteration timeline</h2>
        <Show when={props.campaign.attempts.length > 0} fallback={<p>No attempts yet.</p>}>
          <ol class="kw-campaign-records">
            <For each={props.campaign.attempts}>
              {(attempt, index) => (
                <li>
                  <strong>
                    Attempt {index() + 1}
                    {attempt.probe ? " · persistence probe" : ""}
                  </strong>
                  <span class="kw-campaign-state">{attempt.status}</span>
                  <p>{attempt.hypothesis}</p>
                  <p>{attempt.method}</p>
                  <p class="kw-campaign-meta">
                    {attempt.branch} · {attempt.model.providerId}/{attempt.model.modelId} ·{" "}
                    {moment(attempt.startedAt)}
                    {attempt.finishedAt === null
                      ? ""
                      : ` · ${elapsed(attempt.finishedAt - attempt.startedAt)}`}
                  </p>
                  <Show when={attempt.failure}>
                    <p>{attempt.failure}</p>
                  </Show>
                  <Show when={attempt.candidateArtifactId}>
                    {(id) => (
                      <button type="button" onClick={() => inspect(id())}>
                        Inspect candidate
                      </button>
                    )}
                  </Show>
                  <For
                    each={props.campaign.usage.filter(
                      (receipt) => receipt.attemptId === attempt.id,
                    )}
                  >
                    {(receipt) => (
                      <p class="kw-campaign-meta">
                        {receipt.stage}: {receiptCost(receipt)}
                      </p>
                    )}
                  </For>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </section>
      <section aria-label="Decisions">
        <h2>Decisions</h2>
        <For each={props.campaign.decisions}>
          {(decision) => (
            <p>
              <span class="kw-campaign-meta">
                {moment(decision.at)} · {decision.kind} ·{" "}
              </span>
              {decision.reason}
            </p>
          )}
        </For>
      </section>
      <Show when={props.campaign.handoff}>
        {(handoff) => (
          <section aria-label="Handoff">
            <h2>Handoff</h2>
            <p>{handoff().summary}</p>
            <For each={handoff().unresolved}>{(question) => <p>{question}</p>}</For>
            <p>{handoff().nextStep}</p>
          </section>
        )}
      </Show>
      <CampaignSettings
        campaign={props.campaign}
        models={props.models}
        client={props.client}
        enabled={canControl()}
        submit={props.monitor.command}
      />
      <details>
        <summary>Context and methods</summary>
        <For each={props.campaign.contexts}>
          {(context) => (
            <p>
              Estimated {context.estimatedTokens.toLocaleString()} tokens · reported{" "}
              {context.reportedTokens?.toLocaleString() ?? "not available"} ·{" "}
              {context.activeSkillDigests.length} active skill versions · {context.omitted.length}{" "}
              omitted references
            </p>
          )}
        </For>
        <For each={props.campaign.cartridges}>
          {(cartridge) => (
            <p>
              {cartridge.id} · {cartridge.version} · {cartridge.status}
            </p>
          )}
        </For>
      </details>
    </article>
  );
}

function artifactRole(campaign: Campaign, artifactId: string): string {
  const roles: string[] = [];
  if (artifactId === campaign.currentBestArtifactId) roles.push("current best");
  if (artifactId === campaign.latestArtifactId) roles.push("latest");
  if (artifactId === campaign.baselineArtifactId) roles.push("baseline");
  if (campaign.alternativeArtifactIds.includes(artifactId)) roles.push("retained alternative");
  return ` · ${roles.length > 0 ? roles.join(" · ") : "candidate"}`;
}

export function CampaignCosts(props: { campaign: Campaign }) {
  const spending = () => campaignSpending(props.campaign);
  return (
    <section aria-label="Spending">
      <h2>Spending</h2>
      <dl class="kw-campaign-metrics">
        <div>
          <dt>Reported</dt>
          <dd>{money(spending().settledMicros)}</dd>
        </div>
        <div>
          <dt>Held</dt>
          <dd>{money(spending().outstandingMicros)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{money(spending().remainingMicros)}</dd>
        </div>
        <div>
          <dt>Limit</dt>
          <dd>{money(props.campaign.budget.limitMicros)}</dd>
        </div>
      </dl>
      <p class="kw-campaign-meta">
        Held for pending costs
        {spending().estimatedMicros > 0
          ? `, including ${money(spending().estimatedMicros)} estimated.`
          : "."}
      </p>
      <Show when={spending().unknown > 0}>
        <p role="status">
          {spending().unknown} unresolved {spending().unknown === 1 ? "charge" : "charges"}; funds
          remain held.
        </p>
      </Show>
      <CampaignSpendTrend campaign={props.campaign} />
      <details>
        <summary>Cost breakdown ({props.campaign.usage.length} operations)</summary>
        <p class="kw-campaign-meta">
          Reported includes reconciled charges. Held funds are pending costs, separate from reported
          charges. Remaining includes reserves: evaluation{" "}
          {money(props.campaign.budget.evaluationReserveMicros)} · delivery{" "}
          {money(props.campaign.budget.deliveryReserveMicros)}.
        </p>
        <div class="kw-campaign-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Model or service</th>
                <th>Cost</th>
                <th>Tokens in / out / cached</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.campaign.usage}>
                {(receipt) => (
                  <tr>
                    <td>{receipt.stage}</td>
                    <td>
                      {receipt.model === null
                        ? receipt.costSource
                        : `${receipt.model.providerId}/${receipt.model.modelId}`}
                    </td>
                    <td>{receiptCost(receipt)}</td>
                    <td>
                      {receipt.inputTokens ?? "?"} / {receipt.outputTokens ?? "?"} /{" "}
                      {receipt.cachedTokens ?? "?"}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

interface ArtifactInspectionProps {
  campaignId: string;
  artifact: CampaignArtifact;
  client: CampaignsClient;
  label?: string;
}

function ArtifactInspection(props: ArtifactInspectionProps) {
  return (
    <Show keyed when={JSON.stringify([props.campaignId, props.artifact.id])}>
      {(_identity) => <ArtifactPreview {...props} />}
    </Show>
  );
}

function ArtifactPreview(props: ArtifactInspectionProps) {
  const [path, setPath] = createSignal<string>();
  const [preview, setPreview] = createSignal<CampaignArtifactPreview>();
  const [problem, setProblem] = createSignal<string>();
  let turn = 0;
  let disposed = false;
  createEffect(() => {
    const artifact = props.artifact;
    const selectedPath = path();
    const request = ++turn;
    setPreview(undefined);
    setProblem(undefined);
    void props.client
      .artifact(props.campaignId, artifact.id, selectedPath)
      .then((reading) => {
        if (!disposed && request === turn) setPreview(reading);
      })
      .catch((cause: unknown) => {
        if (!disposed && request === turn)
          setProblem(cause instanceof Error ? cause.message : String(cause));
      });
  });
  onCleanup(() => {
    disposed = true;
    turn += 1;
  });
  return (
    <div class="kw-campaign-artifact">
      <h3>
        {props.label ? `${props.label}: ` : ""}
        {props.artifact.title}
      </h3>
      <Show when={props.artifact.capabilities.includes("export")}>
        <ArtifactExport
          campaignId={props.campaignId}
          artifactId={props.artifact.id}
          client={props.client}
        />
      </Show>
      <Show when={props.artifact.entries.length > 1}>
        <label>
          File
          <select
            value={path() ?? ""}
            onChange={(event) => setPath(event.currentTarget.value || undefined)}
          >
            <option value="">Choose a file</option>
            <For each={props.artifact.entries}>
              {(entry) => <option value={entry.path}>{entry.path}</option>}
            </For>
          </select>
        </label>
      </Show>
      <Show when={problem()}>{(message) => <p role="alert">{message()}</p>}</Show>
      <Show
        when={preview()}
        fallback={
          <Show when={!problem()}>
            <p role="status">Loading artifact…</p>
          </Show>
        }
      >
        {(reading) => (
          <>
            <p class="kw-campaign-meta">
              {reading().mimeType} · {reading().totalBytes.toLocaleString()} bytes
              {reading().truncated ? " · preview truncated" : ""}
            </p>
            <Show when={reading().content !== null} fallback={<p>No text preview available.</p>}>
              <pre>{reading().content}</pre>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

type Ending = "cancel" | "finish";

const endedStatuses: ReadonlySet<string> = new Set(["completed", "cancelled", "failed"]);

const endingWords: Readonly<
  Record<
    Ending,
    { ask: string; consequence: string; confirm: string; command: CampaignUserCommand }
  >
> = {
  cancel: {
    ask: "Cancel this campaign?",
    consequence: "It stops for good and cannot be started again; its artifacts stay.",
    confirm: "Cancel campaign",
    command: { type: "cancel", reason: "Cancel requested from campaign monitor." },
  },
  finish: {
    ask: "Finish with the best result so far?",
    consequence: "The campaign ends and keeps that result; it cannot run again.",
    confirm: "Finish campaign",
    command: { type: "finish", reason: "Finish with the best result retained." },
  },
};
