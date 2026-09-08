import { describe, expect, it } from "vitest";
import { chunkQueue } from "./chunk-queue.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("chunkQueue", () => {
  it("hands out chunks in order whether they arrive before or after the read", async () => {
    const queue = chunkQueue();
    queue.push(bytes("a"));
    expect(await queue.read()).toEqual(bytes("a"));
    const pending = queue.read();
    queue.push(bytes("b"));
    expect(await pending).toEqual(bytes("b"));
  });

  it("drains buffered chunks before reporting the end", async () => {
    const queue = chunkQueue();
    queue.push(bytes("a"));
    queue.end();
    expect(await queue.read()).toEqual(bytes("a"));
    expect(await queue.read()).toBeUndefined();
  });

  it("rejects a read once the stream ended with an error and ignores late pushes", async () => {
    const queue = chunkQueue();
    queue.end("aborted");
    queue.push(bytes("late"));
    await expect(queue.read()).rejects.toThrow("aborted");
  });
});
