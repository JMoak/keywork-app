import { describe, expect, it } from "vitest";
import { envelopeOf, frameId, noticesOf, parseFrame, sseFrames } from "./sse.ts";

function bodyOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

const envelope = {
  id: 42,
  ts: "2026-09-06T12:00:00.000Z",
  sessionId: "s1",
  type: "session.mode",
  payload: { mode: "plan" },
};

describe("sseFrames", () => {
  it("yields frames split across arbitrary chunk boundaries", async () => {
    const text = `: connected\n\nid: 42\nevent: session.mode\ndata: ${JSON.stringify(envelope)}\n\n`;
    const frames = await collect(
      sseFrames(bodyOf([text.slice(0, 7), text.slice(7, 30), text.slice(30)])),
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      id: undefined,
      event: undefined,
      data: "",
      comments: ["connected"],
    });
    expect(frames[1]?.id).toBe("42");
    expect(frames[1]?.event).toBe("session.mode");
    expect(envelopeOf(frames[1] as never)).toEqual(envelope);
  });

  it("joins multi-line data and keeps comments beside fields", () => {
    const frame = parseFrame(": note\nid: 3\ndata: {\ndata: }");
    expect(frame).toEqual({ id: "3", event: undefined, data: "{\n}", comments: ["note"] });
  });

  it("ignores an empty block", () => {
    expect(parseFrame("")).toBeUndefined();
  });
});

describe("envelopeOf", () => {
  it("rejects malformed and non-envelope data", () => {
    const frame = { id: "1", event: "x", comments: [] };
    expect(envelopeOf({ ...frame, data: "" })).toBeUndefined();
    expect(envelopeOf({ ...frame, data: "not json" })).toBeUndefined();
    expect(envelopeOf({ ...frame, data: '{"id":"1"}' })).toBeUndefined();
  });
});

describe("noticesOf and frameId", () => {
  it("types the connected and gap comments and ignores others", () => {
    const frame = parseFrame(": connected\n: resumed with a gap, events 12 to 41 are gone\n: hum");
    expect(noticesOf(frame as never)).toEqual([
      { kind: "connected" },
      { kind: "gap", from: 12, to: 41 },
    ]);
  });

  it("reads only decimal ids", () => {
    expect(frameId({ id: "17", event: undefined, data: "", comments: [] })).toBe(17);
    expect(frameId({ id: "abc", event: undefined, data: "", comments: [] })).toBeUndefined();
    expect(frameId({ id: undefined, event: undefined, data: "", comments: [] })).toBeUndefined();
  });
});
