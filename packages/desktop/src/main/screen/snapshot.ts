import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import type { ScreenGrant } from "@keywork-app/screen";

export interface SnapshotSeams {
  grantFor(token: string): ScreenGrant | undefined;
  frame(sessionId: string, maxWidth: number): Promise<Uint8Array | undefined>;
  onEnded(listener: (sessionId: string) => void): () => void;
  readonly framesPerSecond: number;
  readonly maxWidth: number;
}

export interface SnapshotServer {
  readonly url: string;
  close(): Promise<void>;
}

export type SnapshotRoute = { sessionId: string; kind: "snapshot" | "mjpeg" | "ws" };

export const mjpegBoundary = "keywork-frame";

export async function startSnapshotServer(seams: SnapshotSeams): Promise<SnapshotServer> {
  const endings = new Map<string, Set<() => void>>();
  const stopListening = seams.onEnded((sessionId) => {
    for (const close of endings.get(sessionId) ?? []) close();
    endings.delete(sessionId);
  });
  const track = (sessionId: string, close: () => void): (() => void) => {
    const set = endings.get(sessionId) ?? new Set();
    set.add(close);
    endings.set(sessionId, set);
    return () => set.delete(close);
  };
  const server = createServer((request, response) => void serve(request, response, seams, track));
  server.on("upgrade", (request, socket) => upgrade(request, socket, seams, track));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => closeServer(server, stopListening, endings),
  };
}

export function routeOf(path: string | undefined): SnapshotRoute | undefined {
  const match = /^\/screen\/([A-Za-z0-9_-]{8,64})\/(snapshot|mjpeg|ws)$/.exec(
    path?.split("?")[0] ?? "",
  );
  if (match === null) return undefined;
  return { sessionId: match[1] as string, kind: match[2] as SnapshotRoute["kind"] };
}

export function authorize(
  request: Pick<IncomingMessage, "headers" | "method">,
  route: SnapshotRoute,
  grantFor: (token: string) => ScreenGrant | undefined,
): 200 | 401 | 403 | 405 {
  if (request.method !== "GET") return 405;
  if (request.headers.origin !== undefined) return 403;
  const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "")?.[1];
  if (token === undefined) return 401;
  return grantFor(token)?.sessionId === route.sessionId ? 200 : 403;
}

export function websocketAccept(key: string): string {
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

export function websocketFrame(opcode: number, payload: Uint8Array): Buffer {
  const length = payload.length;
  const head = Buffer.alloc(length < 126 ? 2 : length < 65_536 ? 4 : 10);
  head[0] = 0x80 | opcode;
  if (length < 126) head[1] = length;
  else if (length < 65_536) {
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([head, payload]);
}

export function mjpegPart(jpeg: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${mjpegBoundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`,
    ),
    jpeg,
    Buffer.from("\r\n"),
  ]);
}

const guardedHeaders = {
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

type Track = (sessionId: string, close: () => void) => () => void;

async function serve(
  request: IncomingMessage,
  response: ServerResponse,
  seams: SnapshotSeams,
  track: Track,
): Promise<void> {
  const route = routeOf(request.url);
  if (route === undefined || route.kind === "ws") return refuse(response, 404);
  const verdict = authorize(request, route, seams.grantFor);
  if (verdict !== 200) return refuse(response, verdict);
  if (route.kind === "snapshot") {
    const jpeg = await seams.frame(route.sessionId, seams.maxWidth);
    if (jpeg === undefined) return refuse(response, 503);
    response.writeHead(200, { ...guardedHeaders, "content-type": "image/jpeg" }).end(jpeg);
    return;
  }
  response.writeHead(200, {
    ...guardedHeaders,
    "content-type": `multipart/x-mixed-replace; boundary=${mjpegBoundary}`,
  });
  const untrack = track(route.sessionId, () => response.end());
  response.on("close", untrack);
  await pump(
    route.sessionId,
    seams,
    () => response.writableEnded || response.destroyed,
    (jpeg) => response.write(mjpegPart(jpeg)),
  );
}

function upgrade(
  request: IncomingMessage,
  socket: Duplex,
  seams: SnapshotSeams,
  track: Track,
): void {
  const route = routeOf(request.url);
  const key = request.headers["sec-websocket-key"];
  const verdict = route?.kind === "ws" ? authorize(request, route, seams.grantFor) : 404;
  if (route === undefined || verdict !== 200 || typeof key !== "string") {
    socket.end(`HTTP/1.1 ${verdict === 200 ? 400 : verdict} Refused\r\nConnection: close\r\n\r\n`);
    return;
  }
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
      "",
      "",
    ].join("\r\n"),
  );
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    socket.end(websocketFrame(0x8, new Uint8Array()));
  };
  const untrack = track(route.sessionId, close);
  socket.on("data", (chunk: Buffer) => {
    if (((chunk[0] ?? 0) & 0x0f) === 0x8) close();
  });
  socket.on("close", () => {
    open = false;
    untrack();
  });
  socket.on("error", () => {
    open = false;
  });
  void pump(
    route.sessionId,
    seams,
    () => !open,
    (jpeg) => socket.write(websocketFrame(0x2, jpeg)),
  );
}

async function pump(
  sessionId: string,
  seams: SnapshotSeams,
  stopped: () => boolean,
  write: (jpeg: Uint8Array) => void,
): Promise<void> {
  const interval = 1000 / seams.framesPerSecond;
  while (!stopped()) {
    const started = Date.now();
    const jpeg = await seams.frame(sessionId, seams.maxWidth);
    if (stopped()) return;
    if (jpeg !== undefined) write(jpeg);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, interval - (Date.now() - started))),
    );
  }
}

function refuse(response: ServerResponse, status: number): void {
  response.writeHead(status, guardedHeaders).end();
}

async function closeServer(
  server: Server,
  stopListening: () => void,
  endings: Map<string, Set<() => void>>,
): Promise<void> {
  stopListening();
  for (const closers of endings.values()) for (const close of closers) close();
  endings.clear();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
