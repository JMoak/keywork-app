import { type EndReason, parseSignal, type SignalMessage, signalingVersion } from "./messages.ts";
import type { PeerSignal } from "./peer.ts";
import {
  connected,
  type Direction,
  ended,
  newSession,
  type Role,
  type SignalSession,
  step,
} from "./session.ts";
import { isTailnetCandidate, tailnetOnlySdp } from "./tailnet.ts";

export interface SignalingEndpoint {
  readonly url: string;
  readonly token: string;
}

export interface SignalingListener {
  message(raw: unknown): void;
  closed(problem?: string): void;
}

export interface SignalingTransport {
  send(message: SignalMessage): Promise<void>;
  listen(listener: SignalingListener): () => void;
}

export type Delivery =
  | { kind: "accepted"; message: SignalMessage; session: SignalSession }
  | { kind: "dropped"; reason: string }
  | { kind: "rejected"; problem: string };

export interface Signaler {
  session(): SignalSession;
  send(message: SignalMessage): Promise<Delivery>;
  receive(raw: unknown): Delivery;
  connected(): void;
  end(reason: EndReason): Promise<void>;
}

export function signaler(role: Role, sessionId: string, transport: SignalingTransport): Signaler {
  let current = newSession(role, sessionId);

  const admit = (direction: Direction, message: SignalMessage): Delivery => {
    const filtered = tailnetOnly(message);
    if (filtered === undefined) return { kind: "dropped", reason: "candidate outside the tailnet" };
    const next = step(current, direction, filtered);
    if (!next.ok) return { kind: "rejected", problem: next.problem };
    current = next.session;
    return { kind: "accepted", message: filtered, session: current };
  };

  return {
    session: () => current,
    send: async (message) => {
      const parsed = parseSignal(message);
      if (!parsed.ok) return { kind: "rejected", problem: parsed.problem };
      const delivery = admit("out", parsed.message);
      if (delivery.kind === "accepted") await transport.send(delivery.message);
      return delivery;
    },
    receive: (raw) => {
      const parsed = parseSignal(raw);
      return parsed.ok
        ? admit("in", parsed.message)
        : { kind: "rejected", problem: parsed.problem };
    },
    connected: () => {
      current = connected(current);
    },
    end: async (reason) => {
      if (current.phase === "ended") return;
      const grantId = current.grantId;
      const closing = ended(current, reason);
      if (closing.ok) current = closing.session;
      await transport
        .send({ v: signalingVersion, kind: "end", sessionId, reason, ...(grantId && { grantId }) })
        .catch(() => undefined);
    },
  };
}

export function peerSignalMessage(
  sessionId: string,
  grantId: string,
  signal: PeerSignal,
): SignalMessage {
  const base = { v: signalingVersion, sessionId, grantId } as const;
  if (signal.type !== "candidate") return { ...base, kind: signal.type, sdp: signal.sdp };
  const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = signal.candidate;
  return {
    ...base,
    kind: "candidate",
    candidate,
    sdpMid,
    sdpMLineIndex,
    usernameFragment: usernameFragment ?? null,
  };
}

export function peerSignalOf(message: SignalMessage): PeerSignal | undefined {
  switch (message.kind) {
    case "offer":
    case "answer":
      return { type: message.kind, sdp: message.sdp };
    case "candidate":
      return {
        type: "candidate",
        candidate: {
          candidate: message.candidate,
          sdpMid: message.sdpMid,
          sdpMLineIndex: message.sdpMLineIndex,
          usernameFragment: message.usernameFragment,
        },
      };
    default:
      return undefined;
  }
}

export function tailnetOnly(message: SignalMessage): SignalMessage | undefined {
  switch (message.kind) {
    case "candidate":
      return isTailnetCandidate(message.candidate) ? message : undefined;
    case "offer":
    case "answer":
      return { ...message, sdp: tailnetOnlySdp(message.sdp) };
    default:
      return message;
  }
}

export function httpSignalingTransport(
  endpoint: SignalingEndpoint,
  fetchImpl: typeof fetch = fetch,
): SignalingTransport {
  const headers = { authorization: `Bearer ${endpoint.token}` };
  let previous: Promise<unknown> = Promise.resolve();
  const post = async (message: SignalMessage): Promise<void> => {
    const response = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok)
      throw new Error(`signaling refused ${message.kind}: ${await refusalOf(response)}`);
    await response.body?.cancel();
  };
  return {
    send: (message) => {
      const sent = previous.catch(() => undefined).then(() => post(message));
      previous = sent;
      return sent;
    },
    listen: (listener) => {
      const abort = new AbortController();
      void follow(endpoint.url, headers, fetchImpl, abort.signal, listener);
      return () => abort.abort();
    },
  };
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffered += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const events = buffered.split("\n\n");
    buffered = events.pop() ?? "";
    for (const event of events) {
      const data = dataOf(event);
      if (data !== undefined) onData(data);
    }
  }
}

async function follow(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  listener: SignalingListener,
): Promise<void> {
  try {
    const response = await fetchImpl(url, {
      headers: { ...headers, accept: "text/event-stream" },
      signal,
    });
    if (!response.ok || response.body === null) {
      listener.closed(`signaling stream refused: ${await refusalOf(response)}`);
      return;
    }
    await readEventStream(response.body, (data) => listener.message(parseJson(data)));
    listener.closed();
  } catch (error) {
    listener.closed(signal.aborted ? undefined : String(error));
  }
}

async function refusalOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);
  const error = (body as { error?: unknown } | undefined)?.error;
  return typeof error === "string" ? error : String(response.status);
}

function dataOf(event: string): string | undefined {
  const lines = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return lines.length === 0 ? undefined : lines.join("\n");
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
