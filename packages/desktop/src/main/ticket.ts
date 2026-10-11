import type { ServerTicket } from "@keywork-app/client";

export interface LiveServer {
  version: string;
  identity: string | undefined;
}

export const ticketProbeTimeoutMs = 1500;

export async function probeTicket(
  ticket: ServerTicket,
  transport: typeof fetch,
  timeoutMs = ticketProbeTimeoutMs,
): Promise<LiveServer | undefined> {
  const get = (path: string) =>
    transport(`${ticket.url.replace(/\/+$/, "")}${path}`, {
      headers: { authorization: `Bearer ${ticket.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  try {
    const document = await get("/doc");
    if (!document.ok) return undefined;
    const server = liveServerOf(await document.json());
    if (server === undefined) return undefined;
    const tokenProbe = await get("/asks");
    await tokenProbe.body?.cancel();
    return tokenProbe.ok ? server : undefined;
  } catch {
    return undefined;
  }
}

export function liveServerOf(document: unknown): LiveServer | undefined {
  const info = (document as { info?: unknown } | null)?.info as
    | { title?: unknown; version?: unknown; workspace?: { identity?: unknown } }
    | undefined;
  if (info?.title !== "keywork" || typeof info.version !== "string") return undefined;
  const identity = info.workspace?.identity;
  return { version: info.version, identity: typeof identity === "string" ? identity : undefined };
}
