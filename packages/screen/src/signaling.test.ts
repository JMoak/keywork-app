import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { SignalMessage } from "./messages.ts";
import {
  type Delivery,
  httpSignalingTransport,
  readEventStream,
  type SignalingTransport,
  signaler,
} from "./signaling.ts";
import { grantA, lanCandidate, signal, tailnetCandidate } from "./testing.ts";

function recordingTransport() {
  const sent: SignalMessage[] = [];
  const transport: SignalingTransport = {
    send: async (message) => {
      sent.push(message);
    },
    listen: () => () => {},
  };
  return { sent, transport };
}

describe("the signaler", () => {
  it("drops candidates outside the tailnet in both directions and never sends them", async () => {
    const { sent, transport } = recordingTransport();
    const viewer = signaler("viewer", signal.request().sessionId, transport);
    await viewer.send(signal.request());
    viewer.receive(signal.granted());
    viewer.receive(signal.offer());
    const lan = lanCandidate;
    expect(viewer.receive(signal.candidate({ candidate: lan }))).toEqual({
      kind: "dropped",
      reason: "candidate outside the tailnet",
    });
    expect(viewer.receive(signal.candidate()).kind).toBe("accepted");
    await viewer.send(signal.answer());
    const outgoing = await viewer.send(signal.candidate({ candidate: lan }));
    expect(outgoing.kind).toBe("dropped");
    expect(sent.map((message) => message.kind)).toEqual(["request", "answer"]);
  });

  it("strips non-tailnet candidates from descriptions before they leave", async () => {
    const { sent, transport } = recordingTransport();
    const sharer = signaler("sharer", signal.request().sessionId, transport);
    sharer.receive(signal.request());
    await sharer.send(signal.granted());
    const sdp = ["v=0", `a=${tailnetCandidate}`, `a=${lanCandidate}`].join("\r\n");
    await sharer.send(signal.offer({ sdp }));
    expect(sent.at(-1)).toMatchObject({
      kind: "offer",
      sdp: ["v=0", `a=${tailnetCandidate}`].join("\r\n"),
    });
  });

  it("rejects malformed and out-of-order messages without moving", () => {
    const { transport } = recordingTransport();
    const sharer = signaler("sharer", signal.request().sessionId, transport);
    const malformed = sharer.receive({ v: 1, kind: "offer", sessionId: "x" });
    expect(malformed.kind).toBe("rejected");
    expect(sharer.receive(signal.answer()).kind).toBe("rejected");
    expect(sharer.session().phase).toBe("idle");
  });

  it("says goodbye once with the grant and stays ended", async () => {
    const { sent, transport } = recordingTransport();
    const sharer = signaler("sharer", signal.request().sessionId, transport);
    sharer.receive(signal.request());
    await sharer.send(signal.granted());
    await sharer.end("kill-switch");
    await sharer.end("kill-switch");
    expect(sent.at(-1)).toEqual(signal.end({ grantId: grantA, reason: "kill-switch" }));
    expect(sent.filter((message) => message.kind === "end")).toHaveLength(1);
    expect(sharer.session()).toMatchObject({ phase: "ended", endReason: "kill-switch" });
    expect((await sharer.send(signal.offer())).kind).toBe("rejected");
  });
});

describe("the HTTP signaling transport against a fake listener", () => {
  const servers: Array<{ close(): void }> = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  async function fakeListener(
    onRequest: (request: IncomingMessage, response: ServerResponse) => void,
  ) {
    const server = createServer(onRequest);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push({ close: () => server.close() });
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/mesh/screen/signal`;
  }

  it("posts messages with the bearer token and reads the event stream in any chunking", async () => {
    const posted: Array<{ auth: string | undefined; body: unknown }> = [];
    const url = await fakeListener((request, response) => {
      if (request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          posted.push({ auth: request.headers.authorization, body: JSON.parse(body) });
          response.writeHead(204).end();
        });
        return;
      }
      response.writeHead(request.headers.authorization === "Bearer secret" ? 200 : 401, {
        "content-type": "text/event-stream",
      });
      const stream = `data: ${JSON.stringify(signal.granted())}\r\n\r\n: comment\n\ndata: ${JSON.stringify(signal.offer())}\n\n`;
      for (let index = 0; index < stream.length; index += 7)
        response.write(stream.slice(index, index + 7));
      response.end();
    });
    const transport = httpSignalingTransport({ url, token: "secret" });
    await transport.send(signal.request());
    expect(posted).toEqual([{ auth: "Bearer secret", body: signal.request() }]);

    const received: unknown[] = [];
    const closed = new Promise<string | undefined>((resolve) => {
      transport.listen({ message: (raw) => received.push(raw), closed: resolve });
    });
    await expect(closed).resolves.toBeUndefined();
    expect(received).toEqual([signal.granted(), signal.offer()]);
  });

  it("keeps posts in the order they were sent even when the listener answers out of order", async () => {
    const arrived: string[] = [];
    let first = true;
    const url = await fakeListener((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        arrived.push((JSON.parse(body) as SignalMessage).kind);
        const delay = first ? 30 : 0;
        first = false;
        setTimeout(() => response.writeHead(204).end(), delay);
      });
    });
    const transport = httpSignalingTransport({ url, token: "t" });
    await Promise.all([
      transport.send(signal.answer()),
      transport.send(signal.candidate()),
      transport.send(signal.keepalive()),
    ]);
    expect(arrived).toEqual(["answer", "candidate", "keepalive"]);
  });

  it("reports a refused stream and a refused post", async () => {
    const url = await fakeListener((_request, response) => response.writeHead(403).end());
    const transport = httpSignalingTransport({ url, token: "wrong" });
    await expect(transport.send(signal.request())).rejects.toThrow("403");
    const problem = await new Promise<string | undefined>((resolve) =>
      transport.listen({ message: () => {}, closed: resolve }),
    );
    expect(problem).toBe("signaling stream refused: 403");
  });

  it("feeds a viewer signaler from the stream end to end", async () => {
    const url = await fakeListener((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`data: ${JSON.stringify(signal.granted())}\n\n`);
    });
    const transport = httpSignalingTransport({ url, token: "t" });
    const viewer = signaler("viewer", signal.request().sessionId, recordingTransport().transport);
    await viewer.send(signal.request());
    const deliveries: Delivery[] = [];
    await new Promise<void>((resolve) =>
      transport.listen({
        message: (raw) => deliveries.push(viewer.receive(raw)),
        closed: () => resolve(),
      }),
    );
    expect(deliveries.map((delivery) => delivery.kind)).toEqual(["accepted"]);
    expect(viewer.session()).toMatchObject({ phase: "awaiting-offer", grantId: grantA });
  });

  it("parses multi-line data fields", async () => {
    const lines: string[] = [];
    const body = new Blob(["data: a\ndata: b\n\n"]).stream();
    await readEventStream(body, (data) => lines.push(data));
    expect(lines).toEqual(["a\nb"]);
  });
});
