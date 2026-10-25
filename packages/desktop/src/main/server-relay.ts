import type { ServerTicket } from "@keywork-app/client";
import type { RelayEnd, RelayHead, RelayRequest } from "../shared/channels.ts";

export interface RelaySeams {
  ticketFor(workspace: string): ServerTicket | undefined;
  fetch(input: string, init: RequestInit): Promise<Response>;
  suspect?: ((workspace: string) => void) | undefined;
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
      if (ticket === undefined) {
        return refused(request, sink, `no server is open for ${request.workspace}`);
      }
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
        if (!controller.signal.aborted) seams.suspect?.(request.workspace);
        return refused(request, sink, `the server did not answer: ${messageOf(cause)}`);
      }
      const broken = (): void => {
        if (!controller.signal.aborted) seams.suspect?.(request.workspace);
      };
      void pump(response, request.requestId, sink, broken, () =>
        inFlight.delete(request.requestId),
      );
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
  broken: () => void,
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
    broken();
    sink.end({ requestId, error: messageOf(cause) });
  } finally {
    done();
  }
}

function refused(request: RelayRequest, sink: RelaySink, detail: string): RelayHead {
  sink.chunk(request.requestId, refusalBody(detail));
  sink.end({ requestId: request.requestId });
  return {
    status: relayRefusedStatus,
    statusText: detail,
    headers: [["content-type", "application/json"]],
  };
}

function refusalBody(detail: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ error: detail }));
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
