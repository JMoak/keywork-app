import { describe, expect, it } from "vitest";
import {
  frameSpreads,
  receiverAverages,
  senderAverages,
  spreadOf,
  stageReport,
  stagesOf,
} from "./latency.ts";

const window = { from: 1000, to: 6000 };

const sender = [
  { at: 500, framesEncoded: 10, totalEncodeTime: 0.5, packetsSent: 100, totalPacketSendDelay: 9 },
  { at: 1000, framesEncoded: 20, totalEncodeTime: 0.6, packetsSent: 200, totalPacketSendDelay: 9 },
  {
    at: 6000,
    framesEncoded: 170,
    totalEncodeTime: 2.55,
    packetsSent: 1200,
    totalPacketSendDelay: 11,
    encoderImplementation: "MediaFoundationVideoEncodeAccelerator (NVIDIA HEVC Encoder MFT)",
  },
  { at: 9000, framesEncoded: 260, totalEncodeTime: 9, packetsSent: 2000, totalPacketSendDelay: 90 },
];

const receiver = [
  {
    at: 1200,
    framesDecoded: 20,
    totalDecodeTime: 0.01,
    jitterBufferDelay: 0.2,
    jitterBufferEmittedCount: 20,
    jitterBufferTargetDelay: 1,
  },
  {
    at: 5800,
    framesDecoded: 170,
    totalDecodeTime: 0.085,
    jitterBufferDelay: 1.85,
    jitterBufferEmittedCount: 170,
    jitterBufferTargetDelay: 4,
  },
];

describe("the glass-to-glass stages", () => {
  it("splits one frame's age at capture, receipt, presentation and glass into four stages", () => {
    expect(stagesOf({ captured: 79, received: 96, presented: 97, displayed: 114 })).toEqual({
      glassToCapture: 79,
      captureToReceive: 17,
      receiveToPresent: 1,
      presentToGlass: 17,
    });
    expect(stagesOf({ presented: 90, displayed: 107 })).toEqual({ presentToGlass: 17 });
  });

  it("spreads each stage over the probes, leaving out a stage no frame reported", () => {
    const spreads = frameSpreads([
      { captured: 80, received: 100, presented: 101, displayed: 118 },
      { captured: 78, received: 90, presented: 150, displayed: 167 },
      { presented: 120, displayed: 137 },
    ]);
    expect(spreads.glassToCapture).toEqual({ p50: 80, p95: 80, count: 2 });
    expect(spreads.receiveToPresent).toEqual({ p50: 60, p95: 60, count: 2 });
    expect(spreads.presentToGlass).toEqual({ p50: 17, p95: 17, count: 3 });
    expect(spreadOf([])).toMatchObject({ count: 0 });
  });

  it("averages the sender's encode and pacer time over the measured window only, never the warm-up", () => {
    expect(senderAverages(sender, window)).toEqual({
      encodeMs: 13,
      sendDelayMs: 2,
      encoder: "MediaFoundationVideoEncodeAccelerator (NVIDIA HEVC Encoder MFT)",
    });
    expect(senderAverages(sender.slice(0, 1), window)).toEqual({
      encodeMs: undefined,
      sendDelayMs: undefined,
      encoder: undefined,
    });
  });

  it("averages the receiver's jitter buffer and decode time per emitted frame", () => {
    expect(receiverAverages(receiver, window)).toEqual({
      jitterBufferMs: 11,
      jitterTargetMs: 20,
      decodeMs: 0.5,
      decoder: undefined,
    });
  });

  it("names the network as what capture-to-receive leaves after encode and pacer", () => {
    const report = stageReport(
      [{ captured: 79, received: 96, presented: 97, displayed: 114 }],
      sender,
      receiver,
      window,
    );
    expect(report.networkMs).toBe(2);
    expect(report.frames.captureToReceive?.p50).toBe(17);
  });
});
