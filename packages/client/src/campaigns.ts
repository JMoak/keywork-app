import type {
  CampaignArtifactExport,
  CampaignArtifactPreview,
  CampaignCartridgeChoice,
  CampaignCommandRequest,
  CampaignCreateRequest,
  CampaignEvent,
  CampaignReading,
  CampaignSummary,
} from "@keywork-app/protocol";
import type { Fetch } from "./client.ts";
import { sseFrames } from "./sse.ts";

export type CampaignStreamItem =
  | { kind: "connected" }
  | { kind: "heartbeat"; at: string | number }
  | { kind: "snapshot"; reading: CampaignReading }
  | { kind: "event"; event: CampaignEvent }
  | { kind: "resync" };

export interface CampaignsClient {
  list(signal?: AbortSignal): Promise<CampaignSummary[]>;
  cartridges(): Promise<CampaignCartridgeChoice[]>;
  read(id: string, signal?: AbortSignal): Promise<CampaignReading>;
  create(input: CampaignCreateRequest): Promise<CampaignReading>;
  command(id: string, request: CampaignCommandRequest): Promise<CampaignReading>;
  artifact(id: string, artifactId: string, path?: string): Promise<CampaignArtifactPreview>;
  export(id: string, artifactId: string, destination: string): Promise<CampaignArtifactExport>;
  watch(id: string, sequence: number, signal: AbortSignal): AsyncIterable<CampaignStreamItem>;
}

export class CampaignRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "CampaignRequestError";
    this.status = status;
    this.code = code;
  }
}

export function campaignsOverFetch(fetch: Fetch): CampaignsClient {
  const request = async <Value>(
    path: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Value> => {
    const response = await fetch(path, {
      method,
      ...(signal !== undefined && { signal }),
      ...(body !== undefined && {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    return readResponse<Value>(response);
  };
  return {
    cartridges: async () => {
      const listed = await request<{ cartridges: CampaignCartridgeChoice[] }>(
        "/campaigns/cartridges",
        "GET",
      );
      if (!Array.isArray(listed.cartridges)) throw unreadable();
      return listed.cartridges;
    },
    list: async (signal) => {
      const listed = await request<{ campaigns: CampaignSummary[] }>(
        "/campaigns",
        "GET",
        undefined,
        signal,
      );
      if (!Array.isArray(listed.campaigns)) throw unreadable();
      return listed.campaigns;
    },
    read: async (id, signal) =>
      readingOf(await request(campaignPath(id), "GET", undefined, signal)),
    create: async (input) => readingOf(await request("/campaigns", "POST", input)),
    command: async (id, command) =>
      readingOf(await request(`${campaignPath(id)}/commands`, "POST", command)),
    artifact: (id, artifactId, path) =>
      request(
        `${campaignPath(id)}/artifacts/${encodeURIComponent(artifactId)}${path === undefined ? "" : `?path=${encodeURIComponent(path)}`}`,
        "GET",
      ),
    export: async (id, artifactId, destination) =>
      exportOf(
        await request(
          `${campaignPath(id)}/artifacts/${encodeURIComponent(artifactId)}/export`,
          "POST",
          { destination },
        ),
        artifactId,
      ),
    watch: (id, sequence, signal) => watchCampaign(fetch, id, sequence, signal),
  };
}

export function campaignPath(id: string): string {
  return `/campaigns/${encodeURIComponent(id)}`;
}

async function* watchCampaign(
  fetch: Fetch,
  id: string,
  sequence: number,
  signal: AbortSignal,
): AsyncIterable<CampaignStreamItem> {
  const response = await fetch(`${campaignPath(id)}/events`, {
    method: "GET",
    headers: { accept: "text/event-stream", "last-event-id": String(sequence) },
    signal,
  });
  if (!response.ok) await readResponse(response);
  if (response.body === null) throw unreadable();
  if (signal.aborted) {
    await response.body.cancel();
    return;
  }
  yield { kind: "connected" };
  for await (const frame of sseFrames(response.body)) {
    if (signal.aborted) return;
    if (frame.comments.some((comment) => comment.includes("gap"))) {
      yield { kind: "resync" };
    }
    if (frame.event === "heartbeat") {
      const value = jsonValue(frame.data);
      if (record(value) && (typeof value.at === "string" || typeof value.at === "number"))
        yield { kind: "heartbeat", at: value.at };
      continue;
    }
    if (frame.event === "snapshot") {
      yield { kind: "snapshot", reading: readingOf(jsonValue(frame.data)) };
      continue;
    }
    if (frame.event === "resync") {
      yield { kind: "resync" };
      continue;
    }
    if (frame.data === "") continue;
    const value = jsonValue(frame.data);
    if (!isCampaignEvent(value) || value.campaignId !== id) throw unreadable();
    yield { kind: "event", event: value };
  }
}

async function readResponse<Value>(response: Response): Promise<Value> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CampaignRequestError(
      response.status,
      "The campaign service returned an unreadable response.",
    );
  }
  if (!response.ok) {
    const detail =
      record(body) && typeof body.detail === "string"
        ? body.detail
        : record(body) && typeof body.error === "string"
          ? body.error
          : response.status === 404
            ? "Campaigns are unavailable on this connected runtime."
            : `Campaign request failed (${response.status}).`;
    const code =
      record(body) && typeof body.refused === "string"
        ? body.refused
        : record(body) && typeof body.code === "string"
          ? body.code
          : undefined;
    throw new CampaignRequestError(response.status, detail, code);
  }
  return body as Value;
}

function exportOf(value: unknown, artifactId: string): CampaignArtifactExport {
  if (
    !record(value) ||
    value.artifactId !== artifactId ||
    typeof value.path !== "string" ||
    value.path.trim() === ""
  )
    throw unreadable();
  return { artifactId, path: value.path };
}

function readingOf(value: unknown): CampaignReading {
  if (!record(value) || !record(value.campaign)) throw unreadable();
  const campaign = value.campaign;
  if (
    campaign.schemaVersion !== 1 ||
    typeof campaign.id !== "string" ||
    !safeSequence(campaign.revision) ||
    !safeSequence(value.sequence)
  )
    throw unreadable();
  return value as unknown as CampaignReading;
}

function isCampaignEvent(value: unknown): value is CampaignEvent {
  return (
    record(value) &&
    value.schemaVersion === 1 &&
    typeof value.campaignId === "string" &&
    safeSequence(value.sequence) &&
    typeof value.at === "number" &&
    typeof value.kind === "string"
  );
}

function safeSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw unreadable();
  }
}

function unreadable(): CampaignRequestError {
  return new CampaignRequestError(
    502,
    "The campaign service returned an unsupported or unreadable record.",
  );
}
