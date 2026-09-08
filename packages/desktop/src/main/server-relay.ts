import type { ServerTicket } from "@keywork-app/client";
import type { RelayEnd, RelayHead, RelayRequest } from "../shared/channels.ts";

export interface RelaySeams {
  ticketFor(workspace: string): ServerTicket | undefined;
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface RelaySink {
  chunk(requestId: number, bytes: Uint8Array): void;
  end(end: RelayEnd): void;
}

export interface ServerRelay {
  start(request: RelayRequest, sink: RelaySink): Promise<RelayHead>;
  abort(requestId: number): void;
  abortAll(): void;
}

export function serverRelay(seams: RelaySeams): ServerRelay {
  const inFlight = new Map<number, AbortController>();
  return {
    start: async (request, sink) => {
      const ticket = seams.ticketFor(request.workspace);
      if (ticket === undefined) return refused(`no server is open for ${request.workspace}`);
      const controller = new AbortController();
      inFlight.set(request.requestId, controller);
      let response: Response;
      try {
        response = await seams.fetch(`${ticket.url}${request.path}`, {
          method: request.method,
          headers: { ...request.headers, authorization: `Bearer ${ticket.token}` },
          ...(request.body !== undefined && { body: request.body }),
          signal: controller.signal,
        });
      } catch (cause) {
        inFlight.delete(request.requestId);
        return unreachable(cause);
      }
      void pump(response, request.requestId, sink, () => inFlight.delete(request.requestId));
      return {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      };
    },
    abort: (requestId) => {
      inFlight.get(requestId)?.abort();
      inFlight.delete(requestId);
    },
    abortAll: () => {
      for (const controller of inFlight.values()) controller.abort();
      inFlight.clear();
    },
  };
}

export const relayRefusedStatus = 503;

async function pump(
  response: Response,
  requestId: number,
  sink: RelaySink,
  done: () => void,
): Promise<void> {
  const body = response.body;
  if (body === null) {
    done();
    sink.end({ requestId });
    return;
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      sink.chunk(requestId, value);
    }
    sink.end({ requestId });
  } catch (cause) {
    sink.end({ requestId, error: cause instanceof Error ? cause.message : String(cause) });
  } finally {
    done();
  }
}

function refused(detail: string): RelayHead {
  return { status: relayRefusedStatus, statusText: detail, headers: [] };
}

function unreachable(cause: unknown): RelayHead {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return {
    status: relayRefusedStatus,
    statusText: `the server did not answer: ${detail}`,
    headers: [],
  };
}
