import type { Fetch } from "@keywork-app/client";
import type { HostPort, ServerRequestInit } from "./port.ts";

export function hostFetch(host: HostPort, workspace: string): Fetch {
  return async (path, init = {}) => {
    const head = await host.serverFetch(workspace, path, plainInit(init));
    init.signal?.addEventListener("abort", () => head.cancel(), { once: true });
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const chunk = await head.read();
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
      cancel: () => head.cancel(),
    });
    return new Response(bodyless(head.status) ? null : body, {
      status: head.status,
      statusText: head.statusText,
      headers: head.headers,
    });
  };
}

export function plainInit(init: RequestInit): ServerRequestInit {
  return {
    method: init.method ?? "GET",
    headers: headerRecord(init.headers),
    ...(typeof init.body === "string" && { body: init.body }),
  };
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (headers === undefined) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function bodyless(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}
