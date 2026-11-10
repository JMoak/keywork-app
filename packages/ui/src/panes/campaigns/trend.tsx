import type { Campaign } from "@keywork-app/protocol";
import { createMemo, For, Show } from "solid-js";
import { campaignSpendTrend, moment, money } from "./model.ts";

export function CampaignSpendTrend(props: { campaign: Campaign }) {
  const points = createMemo(() => campaignSpendTrend(props.campaign));
  const extent = createMemo(() =>
    points().reduce(
      (maximum, point) => Math.max(maximum, point.settledMicros + point.estimatedMicros),
      1,
    ),
  );
  const first = () => points()[0]?.at ?? props.campaign.createdAt;
  const last = () => points().at(-1)?.at ?? first();
  const x = (at: number) => 18 + ((at - first()) / Math.max(1, last() - first())) * 564;
  const y = (micros: number) => 142 - (micros / extent()) * 124;
  const line = (estimates: boolean) =>
    points()
      .map(
        (point) =>
          `${x(point.at)},${y(point.settledMicros + (estimates ? point.estimatedMicros : 0))}`,
      )
      .join(" ");
  const hasEstimates = () => points().some((point) => point.estimatedMicros > 0);
  const hasCosts = () => points().some((point) => point.settledMicros + point.estimatedMicros > 0);
  return (
    <figure class="kw-campaign-trend">
      <figcaption>Cumulative cost</figcaption>
      <Show when={hasCosts()} fallback={<p>No reported costs or estimates yet.</p>}>
        <div class="kw-campaign-trend-scale">
          <span>{money(extent())}</span>
          <span>Reported · solid</span>
          <Show when={hasEstimates()}>
            <span>With estimates · dashed</span>
          </Show>
        </div>
        <svg
          viewBox="0 0 600 160"
          role="img"
          aria-label="Cumulative reported costs and unsettled estimates by receipt time"
        >
          <title>Cumulative cost</title>
          <path d="M18 18V142H582" class="kw-campaign-trend-axis" />
          <For each={points().filter((point) => point.milestones.length > 0)}>
            {(point) => (
              <line
                x1={x(point.at)}
                x2={x(point.at)}
                y1="18"
                y2="142"
                class="kw-campaign-trend-marker"
              >
                <title>{point.milestones.join("; ")}</title>
              </line>
            )}
          </For>
          <Show when={hasEstimates()}>
            <polyline points={line(true)} class="kw-campaign-trend-estimate" />
          </Show>
          <polyline points={line(false)} class="kw-campaign-trend-settled" />
          <For each={points()}>
            {(point) => (
              <circle
                cx={x(point.at)}
                cy={y(point.settledMicros)}
                r="3"
                class="kw-campaign-trend-point"
              >
                <title>
                  {moment(point.at)}: {money(point.settledMicros)} reported;{" "}
                  {money(point.estimatedMicros)} estimated
                </title>
              </circle>
            )}
          </For>
        </svg>
        <div class="kw-campaign-trend-scale">
          <span>{moment(first())}</span>
          <span>{moment(last())}</span>
        </div>
      </Show>
      <details>
        <summary>Values and milestones</summary>
        <p class="kw-campaign-meta">
          By receipt time; reconciled charges update the curve. Estimates remain unsettled.
          Reservations are excluded. Markers show purpose changes and adopted artifacts.
        </p>
        <div class="kw-campaign-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Reported</th>
                <th>Unsettled estimates</th>
                <th>Milestone</th>
              </tr>
            </thead>
            <tbody>
              <For each={points()}>
                {(point) => (
                  <tr>
                    <td>{moment(point.at)}</td>
                    <td>{money(point.settledMicros)}</td>
                    <td>{money(point.estimatedMicros)}</td>
                    <td>{point.milestones.join(" · ")}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
