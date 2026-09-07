export type ServeLine =
  | { kind: "listening"; url: string }
  | { kind: "token"; token: string }
  | { kind: "ticket"; path: string }
  | { kind: "other"; text: string };

export interface ServeTicket {
  url: string;
  token: string;
}

export function parseServeLine(line: string): ServeLine {
  const text = line.trim();
  const listening = text.match(/^listening on (\S+)$/);
  if (listening?.[1] !== undefined) return { kind: "listening", url: listening[1] };
  const token = text.match(/^token (\S+)$/);
  if (token?.[1] !== undefined) return { kind: "token", token: token[1] };
  const ticket = text.match(/^ticket (.+)$/);
  if (ticket?.[1] !== undefined) return { kind: "ticket", path: ticket[1] };
  return { kind: "other", text };
}

export function serveTicket(lines: readonly ServeLine[]): ServeTicket | undefined {
  const url = lines.find((line) => line.kind === "listening")?.url;
  const token = lines.find((line) => line.kind === "token")?.token;
  return url !== undefined && token !== undefined ? { url, token } : undefined;
}
