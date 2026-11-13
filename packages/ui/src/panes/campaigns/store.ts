import { CampaignRequestError, type CampaignsClient } from "@keywork-app/client";
import type {
  CampaignCreateRequest,
  CampaignReading,
  CampaignSummary,
  CampaignUserCommand,
} from "@keywork-app/protocol";
import { createStore, reconcile } from "solid-js/store";
import { campaignSummary } from "./model.ts";

export interface CampaignMonitorState {
  campaigns: CampaignSummary[];
  loaded: boolean;
  available: boolean | null;
  selected: string | null;
  reading: CampaignReading | null;
  connection: "idle" | "connecting" | "live" | "reconnecting" | "offline";
  receivedAt: number | null;
  stale: boolean;
  problem: string | null;
  busy: boolean;
  requested: string | null;
  createRefusal: string | null;
}

export interface MonitorClock {
  now(): number;
  pause(ms: number, signal: AbortSignal): Promise<void>;
}

export const liveMonitorClock: MonitorClock = { now: Date.now, pause: waitFor };

export function createCampaignMonitor(client: CampaignsClient, clock = liveMonitorClock) {
  const [state, setState] = createStore<CampaignMonitorState>({
    campaigns: [],
    loaded: false,
    available: null,
    selected: null,
    reading: null,
    connection: "idle",
    receivedAt: null,
    stale: true,
    problem: null,
    busy: false,
    requested: null,
    createRefusal: null,
  });
  let lifetime = new AbortController();
  let generation = 0;
  let disposed = false;
  let listingGeneration = 0;
  let newestSequence = 0;
  let commandProblem: string | null = null;
  let snapshotEpoch = 0;

  const apply = (reading: CampaignReading, turn: number, epoch: number): boolean => {
    if (
      disposed ||
      turn !== generation ||
      epoch !== snapshotEpoch ||
      reading.campaign.id !== state.selected
    )
      return false;
    const prior = state.reading;
    if (
      prior !== null &&
      (reading.campaign.revision < prior.campaign.revision || reading.sequence < prior.sequence)
    )
      return false;
    setState("reading", reconcile(reading));
    setState({
      receivedAt: clock.now(),
      problem: commandProblem,
      stale: reading.sequence < newestSequence,
    });
    setState("campaigns", (rows) =>
      rows
        .map((row) =>
          row.id === reading.campaign.id && row.revision <= reading.campaign.revision
            ? campaignSummary(reading.campaign)
            : row,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt),
    );
    return true;
  };
  const load = async (): Promise<void> => {
    const turn = ++listingGeneration;
    try {
      const rows = await client.list();
      if (!disposed && turn === listingGeneration) {
        const known = new Map(state.campaigns.map((row) => [row.id, row]));
        setState(
          "campaigns",
          rows
            .map((row) => {
              const prior = known.get(row.id);
              return prior !== undefined && prior.revision > row.revision ? prior : row;
            })
            .sort((left, right) => right.updatedAt - left.updatedAt),
        );
        setState({ loaded: true, available: true });
        if (state.selected === null) setState("problem", null);
      }
    } catch (cause) {
      if (!disposed && turn === listingGeneration)
        setState({ loaded: true, available: false, problem: messageOf(cause) });
    }
  };
  const refresh = async (): Promise<void> => {
    const id = state.selected;
    const turn = generation;
    const epoch = snapshotEpoch;
    if (id === null || disposed) return;
    if (state.connection === "offline") {
      await open(id);
      return;
    }
    try {
      apply(await client.read(id, lifetime.signal), turn, epoch);
    } catch (cause) {
      if (!disposed && turn === generation && epoch === snapshotEpoch && !lifetime.signal.aborted)
        setState("problem", messageOf(cause));
    }
  };
  const follow = async (id: string, turn: number, signal: AbortSignal): Promise<void> => {
    let cursor = state.reading?.sequence ?? 0;
    let retry = 0;
    let refreshing: Promise<void> | undefined;
    let refreshAgain = false;
    const reload = (): void => {
      if (refreshing !== undefined) {
        refreshAgain = true;
        return;
      }
      refreshing = refresh().finally(() => {
        refreshing = undefined;
        if (refreshAgain && !signal.aborted) {
          refreshAgain = false;
          reload();
        }
      });
    };
    while (!signal.aborted && !disposed && turn === generation) {
      const connection = new AbortController();
      const stop = () => connection.abort();
      signal.addEventListener("abort", stop, { once: true });
      let lastEventAt = clock.now();
      const watchdog = setInterval(() => {
        if (clock.now() - lastEventAt < 45_000) return;
        if (turn === generation && !disposed)
          setState({
            connection: "reconnecting",
            problem: "Live updates are delayed. Reconnecting…",
          });
        connection.abort();
      }, 5_000);
      try {
        for await (const item of client.watch(id, cursor, connection.signal)) {
          if (signal.aborted || disposed || turn !== generation) break;
          lastEventAt = clock.now();
          setState("connection", "live");
          retry = 0;
          if (item.kind === "snapshot") {
            if (apply(item.reading, turn, snapshotEpoch))
              cursor = Math.max(cursor, item.reading.sequence);
          } else if (item.kind === "event" && item.event.sequence > cursor) {
            cursor = item.event.sequence;
            newestSequence = Math.max(newestSequence, cursor);
            setState("stale", (stale) => stale || (state.reading?.sequence ?? 0) < newestSequence);
            reload();
          } else if (item.kind === "resync" || item.kind === "connected") {
            snapshotEpoch += 1;
            setState("stale", true);
            reload();
          }
        }
      } catch (cause) {
        if (turn !== generation || signal.aborted || disposed) return;
        setState("problem", messageOf(cause));
        if (cause instanceof CampaignRequestError && [401, 403, 404, 501].includes(cause.status)) {
          setState("connection", "offline");
          return;
        }
      } finally {
        clearInterval(watchdog);
        signal.removeEventListener("abort", stop);
        connection.abort();
      }
      if (signal.aborted || disposed || turn !== generation) return;
      setState({ connection: "reconnecting", stale: true });
      await clock.pause(Math.min(500 * 2 ** retry++, 10_000), signal);
    }
  };
  const open = async (id: string): Promise<void> => {
    lifetime.abort();
    lifetime = new AbortController();
    const signal = lifetime.signal;
    const turn = ++generation;
    const epoch = ++snapshotEpoch;
    newestSequence = 0;
    commandProblem = null;
    setState({
      selected: id,
      reading: null,
      connection: "connecting",
      problem: null,
      receivedAt: null,
      requested: null,
      busy: false,
      stale: true,
    });
    try {
      apply(await client.read(id, signal), turn, epoch);
      if (!signal.aborted && turn === generation && !disposed) void follow(id, turn, signal);
    } catch (cause) {
      if (!signal.aborted && turn === generation && !disposed)
        setState({ connection: "offline", problem: messageOf(cause) });
    }
  };
  const create = async (input: CampaignCreateRequest): Promise<boolean> => {
    if (state.busy || disposed) return false;
    const turn = generation;
    setState({ busy: true, problem: null, createRefusal: null });
    try {
      const created = await client.create(input);
      if (disposed || turn !== generation) return false;
      await load();
      if (disposed || turn !== generation) return false;
      const opened = generation + 1;
      await open(created.campaign.id);
      return !disposed && generation === opened;
    } catch (cause) {
      if (!disposed && turn === generation) {
        if (refusedRequest(cause)) setState("createRefusal", creationRefusal(cause, input));
        else setState("problem", messageOf(cause));
      }
      return false;
    } finally {
      if (!disposed && turn === generation) setState("busy", false);
    }
  };
  const command = async (command: CampaignUserCommand): Promise<boolean> => {
    const reading = state.reading;
    if (reading === null || state.busy || state.stale || state.connection !== "live" || disposed)
      return false;
    const turn = generation;
    const epoch = snapshotEpoch;
    commandProblem = null;
    setState({ busy: true, requested: command.type, problem: null });
    try {
      const confirmed = await client.command(reading.campaign.id, {
        expectedRevision: reading.campaign.revision,
        command,
      });
      if (disposed || turn !== generation) return false;
      if (confirmed.campaign.id !== reading.campaign.id)
        throw new Error("Campaign response did not match the request.");
      apply(confirmed, turn, epoch);
      return true;
    } catch (cause) {
      if (turn === generation && !disposed) {
        if (cause instanceof CampaignRequestError && cause.status === 409) await refresh();
        if (turn !== generation || disposed) return false;
        const refused =
          cause instanceof CampaignRequestError && cause.status >= 400 && cause.status < 500;
        if (!refused) setState("stale", true);
        commandProblem = refused
          ? cause.message
          : "The request was not confirmed. Refresh the campaign before trying again.";
        setState("problem", commandProblem);
      }
      return false;
    } finally {
      if (!disposed && turn === generation) setState({ busy: false, requested: null });
    }
  };
  return {
    state,
    load,
    open,
    refresh,
    create,
    command,
    close: () => {
      lifetime.abort();
      generation += 1;
      commandProblem = null;
      setState({
        selected: null,
        reading: null,
        connection: "idle",
        busy: false,
        receivedAt: null,
        stale: true,
        problem: null,
        requested: null,
      });
    },
    dispose: () => {
      disposed = true;
      lifetime.abort();
      generation += 1;
    },
  };
}

export type CampaignMonitor = ReturnType<typeof createCampaignMonitor>;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function refusedRequest(cause: unknown): cause is CampaignRequestError {
  return cause instanceof CampaignRequestError && cause.status >= 400 && cause.status < 500;
}

function creationRefusal(cause: CampaignRequestError, input: CampaignCreateRequest): string {
  const start = input.artifactPath;
  if (start !== undefined && /\bENOENT\b/.test(cause.message))
    return `${start} is not in this folder. Check the starting file or folder.`;
  return cause.message;
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
