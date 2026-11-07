import { request } from "node:http";
import type { ScreenGrant } from "@keywork-app/screen";
import { afterEach, describe, expect, it } from "vitest";
import { keeperOnSpark } from "./fakes.ts";
import {
  authorize,
  mjpegBoundary,
  routeOf,
  type SnapshotServer,
  startSnapshotServer,
  websocketAccept,
  websocketFrame,
} from "./snapshot.ts";

const sessionId = "session-0001";
const token = "token-snapshot-0123456789abcdef0123456789";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const grant: ScreenGrant = {
  id: "grant-0002",
  sessionId,
  token,
  scope: "view",
  grantee: keeperOnSpark,
  displays: ["1"],
  issuedAt: 0,
  expiresAt: 1,
  idleTimeoutMs: 1,
  maxDurationMs: 1,
  reconfirmEveryMs: 1,
};

let server: SnapshotServer | undefined;
const ended = new Set<(sessionId: string) => void>();
let live = true;

afterEach(async () => {
  await server?.close();
  server = undefined;
  live = true;
});

async function start(): Promise<string> {
  server = await startSnapshotServer({
    grantFor: (presented) => (live && presented === token ? grant : undefined),
    frame: async () => (live ? jpeg : undefined),
    onEnded: (listener) => {
      ended.add(listener);
      return () => ended.delete(listener);
    },
    framesPerSecond: 50,
    maxWidth: 640,
  });
  return server.url;
}

function endSession(): void {
  live = false;
  for (const listener of ended) listener(sessionId);
}

describe("the snapshot endpoint", () => {
  it("serves one JPEG to the grant's bearer and refuses everyone else", async () => {
    const url = await start();
    const ok = await fetch(`${url}/screen/${sessionId}/snapshot`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(ok.headers.get("x-frame-options")).toBe("DENY");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(jpeg);
    expect((await fetch(`${url}/screen/${sessionId}/snapshot`)).status).toBe(401);
    const wrong = await fetch(`${url}/screen/${sessionId}/snapshot`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.status).toBe(403);
    const other = await fetch(`${url}/screen/session-9999/snapshot`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(other.status).toBe(403);
    const cross = await fetch(`${url}/screen/${sessionId}/snapshot`, {
      headers: { authorization: `Bearer ${token}`, origin: "https://evil.example" },
    });
    expect(cross.status).toBe(403);
    expect((await fetch(`${url}/elsewhere`)).status).toBe(404);
  });

  it("streams MJPEG parts until the session ends", async () => {
    const url = await start();
    const response = await fetch(`${url}/screen/${sessionId}/mjpeg`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.headers.get("content-type")).toBe(
      `multipart/x-mixed-replace; boundary=${mjpegBoundary}`,
    );
    const reader = response.body?.getReader();
    let text = "";
    while ((text.match(/--keywork-frame/g) ?? []).length < 2) {
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) break;
      text += Buffer.from(chunk.value).toString("latin1");
    }
    expect(text).toContain(
      `--${mjpegBoundary}\r\nContent-Type: image/jpeg\r\nContent-Length: 4\r\n\r\n`,
    );
    endSession();
    for (;;) {
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) break;
    }
  });

  it("pushes binary frames over a WebSocket behind the same grant and closes when the session ends", async () => {
    const url = await start();
    const socketUrl = `${url.replace("http", "ws")}/screen/${sessionId}/ws`;
    const refused = await upgradeStatus(socketUrl.replace("ws://", "http://"), undefined);
    expect(refused).toBe(401);
    const frames: Uint8Array[] = [];
    const closed = new Promise<void>((resolve) => {
      const socket = new WebSocket(socketUrl, {
        headers: { authorization: `Bearer ${token}` },
      } as never);
      socket.binaryType = "arraybuffer";
      socket.addEventListener("message", (event) => {
        frames.push(new Uint8Array(event.data as ArrayBuffer));
        if (frames.length === 2) endSession();
      });
      socket.addEventListener("close", () => resolve());
    });
    await closed;
    expect(frames.slice(0, 2)).toEqual([jpeg, jpeg]);
  });
});

describe("the snapshot helpers", () => {
  it("routes only the three session paths", () => {
    expect(routeOf(`/screen/${sessionId}/mjpeg?x=1`)).toEqual({ sessionId, kind: "mjpeg" });
    expect(routeOf("/screen/short/ws")).toBeUndefined();
    expect(routeOf("/screen/session-0001/../ws")).toBeUndefined();
  });

  it("only answers GET", () => {
    const route = { sessionId, kind: "snapshot" as const };
    expect(
      authorize(
        { method: "POST", headers: { authorization: `Bearer ${token}` } },
        route,
        () => grant,
      ),
    ).toBe(405);
  });

  it("computes the RFC 6455 accept key and frames payloads of every length class", () => {
    expect(websocketAccept("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect([...websocketFrame(0x2, new Uint8Array(3)).subarray(0, 2)]).toEqual([0x82, 3]);
    expect([...websocketFrame(0x2, new Uint8Array(300)).subarray(0, 4)]).toEqual([
      0x82, 126, 1, 44,
    ]);
    expect([...websocketFrame(0x2, new Uint8Array(70_000)).subarray(0, 2)]).toEqual([0x82, 127]);
  });
});

function upgradeStatus(url: string, authorization: string | undefined): Promise<number> {
  return new Promise((resolve) => {
    const req = request(url, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        ...(authorization !== undefined && { authorization }),
      },
    });
    req.on("response", (response) => resolve(response.statusCode ?? 0));
    req.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    req.on("error", () => resolve(0));
    req.end();
  });
}
