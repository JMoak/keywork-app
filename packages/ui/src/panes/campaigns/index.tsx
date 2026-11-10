import { type CampaignsClient, campaignsOverFetch } from "@keywork-app/client";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { hostFetch } from "../../host/transport.ts";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { definePane, type PaneDefinition, type PaneProps, type ShellSeams } from "../registry.ts";
import { CampaignForm } from "./form.tsx";
import { campaignModelChoices, type ModelChoice, moment, money } from "./model.ts";
import { createCampaignMonitor } from "./store.ts";
import { CampaignDetail } from "./views.tsx";
import "./campaigns.css";

const campaignSpec = z.object({ kind: z.literal("campaigns"), campaignId: z.string().optional() });
export type CampaignSpec = z.output<typeof campaignSpec>;

export interface CampaignPaneSeams {
  client(shell: ShellSeams): CampaignsClient;
}
export const liveCampaignSeams: CampaignPaneSeams = {
  client: (shell) => campaignsOverFetch(hostFetch(shell.host, shell.workspace)),
};

export function campaignsPaneWith(seams: CampaignPaneSeams): PaneDefinition<CampaignSpec> {
  return definePane({
    kind: "campaigns",
    heading: "in refinement campaigns",
    spec: campaignSpec,
    home: "main",
    attire: "house",
    title: () => "campaigns",
    emptyState: (keys) => `no campaigns yet · ${keys.chord("campaigns.new")} creates one`,
    component: (props) => <Campaigns pane={props} seams={seams} />,
    summon: {
      action: "campaigns.summon",
      chords: "none",
      help: "refinement campaigns",
      command: {
        name: "campaigns",
        description: "follow refinement, costs, and achievements",
        argument: { hint: "campaign" },
      },
      spec: (_shell, campaignId) => ({
        kind: "campaigns",
        ...(campaignId !== undefined && campaignId !== "" && { campaignId }),
      }),
    },
    localActions: {
      "campaigns.new": {
        chords: "n",
        help: "new campaign",
        command: { name: "campaign-new", description: "prepare a refinement campaign" },
      },
      "campaigns.refresh": {
        chords: "shift+r",
        help: "refresh campaign",
        command: { name: "campaign-refresh", description: "read current campaign state" },
      },
      "campaigns.back": {
        chords: "escape",
        help: "back to campaigns",
        command: { name: "campaign-back", description: "return to the campaign list" },
      },
    },
  });
}

export const campaignsPane = campaignsPaneWith(liveCampaignSeams);

function Campaigns(props: { pane: PaneProps<CampaignSpec>; seams: CampaignPaneSeams }) {
  const client = props.seams.client(props.pane.shell);
  const monitor = createCampaignMonitor(client);
  const [creating, setCreating] = createSignal(false);
  const [models, setModels] = createSignal<ModelChoice[]>([]);
  let root: HTMLElement | undefined;
  let disposed = false;
  keepKeyboardHome(
    () => root,
    () => props.pane.focused,
  );
  const open = (campaignId: string): void => {
    void monitor.open(campaignId);
    props.pane.shell.rebind(props.pane.id, { kind: "campaigns", campaignId });
  };
  const back = (): void => {
    setCreating(false);
    monitor.close();
    props.pane.shell.rebind(props.pane.id, { kind: "campaigns" });
  };
  props.pane.onAction((action) => {
    if (action === "campaigns.new" && monitor.state.available === true) setCreating(true);
    else if (action === "campaigns.refresh") {
      void monitor.load();
      void monitor.refresh();
    } else if (action === "campaigns.back") back();
  });
  createEffect(() => {
    const id = props.pane.spec.campaignId;
    if (id !== undefined && id !== monitor.state.selected) void monitor.open(id);
  });
  onMount(() => {
    void monitor.load();
    void props.pane.shell.client
      .models()
      .then((report) => {
        if (!disposed && "nodes" in report) setModels(campaignModelChoices(report));
      })
      .catch(() => undefined);
  });
  const refreshList = setInterval(() => {
    if (!disposed) void monitor.load();
  }, 15_000);
  onCleanup(() => {
    disposed = true;
    clearInterval(refreshList);
    monitor.dispose();
  });
  return (
    <section ref={root} tabIndex={-1} class="kw-campaigns" aria-label="Refinement campaigns">
      <header class="kw-campaign-bar">
        <button type="button" onClick={back}>
          Campaigns
        </button>
        <span aria-live="polite">
          {monitor.state.connection === "live"
            ? monitor.state.stale
              ? "Updating…"
              : "Live"
            : monitor.state.connection === "idle"
              ? ""
              : monitor.state.connection === "connecting"
                ? "Connecting…"
                : "Updates disconnected"}
        </span>
        <Show when={monitor.state.receivedAt !== null}>
          <time>{moment(monitor.state.receivedAt ?? 0)}</time>
        </Show>
        <button
          type="button"
          onClick={() => {
            void monitor.load();
            void monitor.refresh();
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={monitor.state.available !== true}
          onClick={() => setCreating(true)}
        >
          New campaign
        </button>
      </header>
      <Show when={monitor.state.problem}>
        {(problem) => (
          <p class="kw-campaign-problem" role="alert">
            {problem()}
          </p>
        )}
      </Show>
      <Show
        when={creating()}
        fallback={
          <Show
            when={monitor.state.reading}
            fallback={
              <Show
                when={monitor.state.selected === null}
                fallback={
                  <p role="status">
                    {monitor.state.connection === "offline"
                      ? "Campaign could not be loaded. Refresh to try again."
                      : "Loading campaign…"}
                  </p>
                }
              >
                <CampaignList monitor={monitor} open={open} create={() => setCreating(true)} />
              </Show>
            }
          >
            {(reading) => (
              <CampaignDetail
                campaign={reading().campaign}
                monitor={monitor}
                client={client}
                models={models()}
              />
            )}
          </Show>
        }
      >
        <CampaignForm
          models={models()}
          busy={monitor.state.busy}
          submit={async (input) => {
            const saved = await monitor.create(input);
            if (saved && monitor.state.selected !== null)
              props.pane.shell.rebind(props.pane.id, {
                kind: "campaigns",
                campaignId: monitor.state.selected,
              });
            return saved;
          }}
          close={() => setCreating(false)}
          cancel={back}
        />
      </Show>
    </section>
  );
}

function CampaignList(props: {
  monitor: ReturnType<typeof createCampaignMonitor>;
  open(id: string): void;
  create(): void;
}) {
  return (
    <div class="kw-campaign-list">
      <h1>Refinement campaigns</h1>
      <Show when={props.monitor.state.loaded} fallback={<p role="status">Loading campaigns…</p>}>
        <Show
          when={props.monitor.state.campaigns.length > 0}
          fallback={
            <div>
              <p>
                {props.monitor.state.available
                  ? "No campaigns yet."
                  : "Campaigns unavailable. Refresh to try again."}
              </p>
              <button
                type="button"
                disabled={props.monitor.state.available !== true}
                onClick={() => props.create()}
              >
                New campaign
              </button>
            </div>
          }
        >
          <ul>
            <For each={props.monitor.state.campaigns}>
              {(campaign) => (
                <li>
                  <button
                    type="button"
                    class="kw-campaign-row"
                    onClick={() => props.open(campaign.id)}
                  >
                    <span>
                      <strong>{campaign.title}</strong>
                      <small>{campaign.workload.replaceAll("-", " ")}</small>
                    </span>
                    <span>{campaign.status}</span>
                    <span>
                      {campaign.settledMicros === undefined
                        ? "Open for costs"
                        : `${money(campaign.settledMicros)} reported`}
                      {campaign.pendingMicros === undefined || campaign.pendingMicros === 0
                        ? ""
                        : ` · ${money(campaign.pendingMicros)} pending`}
                    </span>
                    <Show when={campaign.latestAchievement}>
                      <span>{campaign.latestAchievement}</span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
