import type { BusEnvelope } from "@keywork-app/protocol";

export interface SseFrame {
  id: string | undefined;
  event: string | undefined;
  data: string;
  comments: string[];
}

export type StreamNotice = { kind: "connected" } | { kind: "gap"; from: number; to: number };

export type FrameReader = (body: ReadableStream<Uint8Array>) => AsyncIterable<SseFrame>;

export async function* sseFrames(body: ReadableStream<Uint8Array>): AsyncIterable<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffered += decoder.decode(value, { stream: true });
      for (;;) {
        const end = buffered.indexOf("\n\n");
        if (end === -1) break;
        const frame = parseFrame(buffered.slice(0, end));
        buffered = buffered.slice(end + 2);
        if (frame !== undefined) yield frame;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export function parseFrame(block: string): SseFrame | undefined {
  const frame: SseFrame = { id: undefined, event: undefined, data: "", comments: [] };
  const data: string[] = [];
  let fields = 0;
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      frame.comments.push(line.slice(1).replace(/^ /, ""));
      continue;
    }
    if (line === "") continue;
    fields += 1;
    const separator = line.indexOf(":");
    const name = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (name === "id") frame.id = value;
    else if (name === "event") frame.event = value;
    else if (name === "data") data.push(value);
  }
  if (fields === 0 && frame.comments.length === 0) return undefined;
  frame.data = data.join("\n");
  return frame;
}

export function envelopeOf(frame: SseFrame): BusEnvelope | undefined {
  if (frame.data === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(frame.data);
    return isEnvelope(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function noticesOf(frame: SseFrame): StreamNotice[] {
  return frame.comments.flatMap((comment): StreamNotice[] => {
    if (comment === "connected") return [{ kind: "connected" }];
    const gap = comment.match(/^resumed with a gap, events (\d+) to (\d+) are gone$/);
    if (gap?.[1] !== undefined && gap[2] !== undefined) {
      return [{ kind: "gap", from: Number(gap[1]), to: Number(gap[2]) }];
    }
    return [];
  });
}

export function frameId(frame: SseFrame): number | undefined {
  return frame.id !== undefined && /^\d+$/.test(frame.id) ? Number(frame.id) : undefined;
}

function isEnvelope(value: unknown): value is BusEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.ts === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}
