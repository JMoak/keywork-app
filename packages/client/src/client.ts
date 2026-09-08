import type {
  AbortOutcome,
  BusEnvelope,
  PromptOutcome,
  SessionDetail,
  SessionSummary,
} from "@keywork-app/protocol";
import {
  envelopeOf,
  type FrameReader,
  frameId,
  noticesOf,
  type StreamNotice,
  sseFrames,
} from "./sse.ts";

export interface KeyworkClient {
  readonly url: string;
  document(): Promise<ServerDocument>;
  sessions(): Promise<readonly SessionSummary[]>;
  session(id: string): Promise<SessionDetail | undefined>;
  createSession(): Promise<SessionSummary>;
  prompt(id: string, text: string): Promise<PromptOutcome>;
  abort(id: string): Promise<AbortOutcome>;
  events(options?: EventStreamOptions): AsyncIterable<BusEnvelope>;
}

export interface ServerDocument {
  version: string;
  operationIds: string[];
}

export interface ServerTicket {
  url: string;
  token: string;
}

export interface EventStreamOptions {
  since?: number | undefined;
  signal?: AbortSignal | undefined;
  onOpen?: (() => void) | undefined;
  onNotice?: ((notice: StreamNotice) => void) | undefined;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type Delay = (ms: number, signal: AbortSignal | undefined) => Promise<void>;

export interface ClientSeams {
  fetch?: Fetch;
  readFrames?: FrameReader;
  delay?: Delay;
}

export class ServerRefusal extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ServerRefusal";
    this.status = status;
  }
}

export const reconnectDelaysMs = { first: 250, ceiling: 5000 } as const;

export function reconnectDelayMs(attempt: number): number {
  return Math.min(reconnectDelaysMs.first * 2 ** attempt, reconnectDelaysMs.ceiling);
}

export function keyworkClient(ticket: ServerTicket, seams: ClientSeams = {}): KeyworkClient {
  return clientOver(
    ticket.url.replace(/\/+$/, ""),
    authorizedFetch(ticket, seams.fetch ?? fetch),
    seams,
  );
}

export function keyworkClientOver(transport: Fetch, seams: ClientSeams = {}): KeyworkClient {
  return clientOver("", transport, seams);
}

export function authorizedFetch(ticket: ServerTicket, transport: Fetch): Fetch {
  return (input, init = {}) =>
    transport(input, {
      ...init,
      headers: { authorization: `Bearer ${ticket.token}`, ...(init.headers ?? {}) },
    });
}

function clientOver(url: string, transport: Fetch, seams: ClientSeams): KeyworkClient {
  const readFrames = seams.readFrames ?? sseFrames;
  const delay = seams.delay ?? sleep;
  const request = (method: string, path: string, body?: unknown, init: RequestInit = {}) =>
    transport(`${url}${path}`, {
      ...init,
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  return {
    url,
    document: async () => documentOf(await json<OpenApiShape>(await request("GET", "/doc"))),
    sessions: async () => {
      const listed = await json<{ sessions: SessionSummary[] }>(await request("GET", "/sessions"));
      return listed.sessions;
    },
    session: async (id) => {
      const response = await request("GET", `/sessions/${encodeURIComponent(id)}`);
      return response.status === 404 ? undefined : json<SessionDetail>(response);
    },
    createSession: () => request("POST", "/sessions").then(json<SessionSummary>),
    prompt: async (id, text) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/prompt`, {
        text,
      });
      if (response.status === 404) return "missing";
      await json(response);
      return "accepted";
    },
    abort: async (id) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/abort`);
      if (response.status === 404) return "missing";
      const outcome = await json<{ interrupted: boolean }>(response);
      return outcome.interrupted ? "aborted" : "idle";
    },
    events: (options = {}) =>
      resumingEvents(
        options,
        (lastId) =>
          request("GET", "/events", undefined, {
            ...(options.signal !== undefined && { signal: options.signal }),
            headers: lastId === undefined ? {} : { "last-event-id": String(lastId) },
          }),
        readFrames,
        delay,
      ),
  };
}

interface OpenApiShape {
  info: { version: string };
  paths: Record<string, Record<string, { operationId: string }>>;
}

function documentOf(doc: OpenApiShape): ServerDocument {
  const operationIds = Object.values(doc.paths)
    .flatMap((item) => Object.values(item))
    .map((operation) => operation.operationId)
    .sort();
  return { version: doc.info.version, operationIds };
}

async function* resumingEvents(
  options: EventStreamOptions,
  connect: (lastId: number | undefined) => Promise<Response>,
  readFrames: FrameReader,
  delay: Delay,
): AsyncIterable<BusEnvelope> {
  const { signal } = options;
  const aborted = (): boolean => signal?.aborted === true;
  let lastId = options.since;
  let attempt = 0;
  while (!aborted()) {
    const body = await openStream(connect, lastId, aborted);
    if (body !== undefined) {
      options.onOpen?.();
      try {
        for await (const frame of readFrames(body)) {
          for (const notice of noticesOf(frame)) options.onNotice?.(notice);
          const id = frameId(frame);
          if (id !== undefined) lastId = id;
          const envelope = envelopeOf(frame);
          if (envelope === undefined) continue;
          attempt = 0;
          yield envelope;
        }
      } catch {
        if (aborted()) return;
      }
    }
    if (aborted()) return;
    await delay(reconnectDelayMs(attempt), signal);
    attempt += 1;
  }
}

async function openStream(
  connect: (lastId: number | undefined) => Promise<Response>,
  lastId: number | undefined,
  aborted: () => boolean,
): Promise<ReadableStream<Uint8Array> | undefined> {
  let response: Response;
  try {
    response = await connect(lastId);
  } catch {
    return undefined;
  }
  if (response.status === 401) throw new ServerRefusal(401, "the server refused the token");
  if (!response.ok || response.body === null || aborted()) return undefined;
  return response.body;
}

async function json<T = unknown>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  throw new ServerRefusal(response.status, await refusalDetail(response));
}

async function refusalDetail(response: Response): Promise<string> {
  if (response.status === 401) return "the server refused the token";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return `the server answered ${response.status}`;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}
