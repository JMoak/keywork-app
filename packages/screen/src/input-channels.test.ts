import { describe, expect, it } from "vitest";
import { openInputChannels } from "./peer.ts";

function fakeChannels() {
  const created: Array<{ label: string; init: RTCDataChannelInit; sent: string[] }> = [];
  const listeners = new Map<string, (event: { data: unknown }) => void>();
  const connection = {
    createDataChannel: (label: string, init: RTCDataChannelInit) => {
      const sent: string[] = [];
      created.push({ label, init, sent });
      return {
        readyState: "open",
        send: (data: string) => sent.push(data),
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) =>
          listeners.set(label, listener),
      } as unknown as RTCDataChannel;
    },
  };
  return { connection, created, listeners };
}

describe("the ctl and ptr data channels", () => {
  it("are negotiated on both peers with fixed ids, ctl ordered and ptr unordered without retransmits", () => {
    const { connection, created } = fakeChannels();
    openInputChannels(connection);
    expect(created.map(({ label, init }) => ({ label, init }))).toEqual([
      { label: "ctl", init: { id: 1, ordered: true, negotiated: true } },
      { label: "ptr", init: { id: 2, ordered: false, maxRetransmits: 0, negotiated: true } },
    ]);
  });

  it("send on the named channel and hand text that arrives to the receiver with its channel", () => {
    const { connection, created, listeners } = fakeChannels();
    const received: Array<[string, string]> = [];
    const link = openInputChannels(connection, (channel, data) => received.push([channel, data]));
    expect(link.send("ptr", '{"kind":"move"}')).toBe(true);
    expect(created[1]?.sent).toEqual(['{"kind":"move"}']);
    listeners.get("ctl")?.({ data: '{"kind":"release-all","seq":1}' });
    listeners.get("ctl")?.({ data: new ArrayBuffer(2) });
    expect(received).toEqual([["ctl", '{"kind":"release-all","seq":1}']]);
  });
});
