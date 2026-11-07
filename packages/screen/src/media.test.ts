import { describe, expect, it } from "vitest";
import { chooseDisplay, mapDisplays, nextDisplay, publicDisplays } from "./displays.ts";
import { logLine, parseLog, type SessionLogRow, sessionSummaries } from "./log.ts";
import {
  forcedFieldTrials,
  isDemanding,
  jitterBufferTargetFor,
  megabit,
  mergeFeatureList,
  mergeFieldTrials,
  orderCodecs,
  presetFor,
  webRtcUdpPorts,
} from "./media.ts";
import {
  isHostPair,
  pathClassOf,
  pathOfPair,
  ratesBetween,
  type StatsEntry,
  selectedPathOf,
  summarizeStats,
} from "./stats.ts";
import { keeper } from "./testing.ts";

describe("sender presets", () => {
  it("always caps the bitrate explicitly and keeps text sharp on direct paths", () => {
    expect(presetFor("direct", 1440)).toMatchObject({
      name: "text",
      contentHint: "detail",
      degradationPreference: "maintain-resolution",
      maxBitrate: 8 * megabit,
      maxFramerate: 30,
    });
    expect(presetFor("local", 2160).maxBitrate).toBe(8 * megabit);
    expect(presetFor("unknown", 1080).maxBitrate).toBe(8 * megabit);
    expect(presetFor("peer-relay", 1440).name).toBe("text");
  });

  it("falls back to the low-bandwidth preset on a DERP path", () => {
    expect(presetFor("derp", 1440)).toMatchObject({
      name: "relay",
      maxBitrate: 1.5 * megabit,
      maxFramerate: 15,
      scaleResolutionDownBy: 2,
    });
  });

  it("lowers the jitter buffer only for control sessions", () => {
    expect(jitterBufferTargetFor("view")).toBeNull();
    expect(jitterBufferTargetFor("control")).toBe(0);
  });

  it("pins a narrow UDP range", () => {
    expect(webRtcUdpPorts.max - webRtcUdpPorts.min).toBeLessThan(200);
    expect(webRtcUdpPorts.min).toBeGreaterThan(1024);
  });
});

describe("the disable-features switch", () => {
  it("merges into one comma list without losing what was there", () => {
    expect(mergeFeatureList(undefined, ["WebRtcHideLocalIpsWithMdns"])).toBe(
      "WebRtcHideLocalIpsWithMdns",
    );
    expect(mergeFeatureList("CalculateNativeWinOcclusion, ", ["WebRtcHideLocalIpsWithMdns"])).toBe(
      "CalculateNativeWinOcclusion,WebRtcHideLocalIpsWithMdns",
    );
    expect(mergeFeatureList("WebRtcHideLocalIpsWithMdns", ["WebRtcHideLocalIpsWithMdns"])).toBe(
      "WebRtcHideLocalIpsWithMdns",
    );
  });
});

describe("the forced field trials", () => {
  it("join whatever trials are forced already, each once", () => {
    const [playout, pacing] = forcedFieldTrials;
    expect(mergeFieldTrials("", forcedFieldTrials)).toBe(`${playout}${pacing}`);
    expect(mergeFieldTrials("Other/On/", forcedFieldTrials)).toBe(`Other/On/${playout}${pacing}`);
    expect(mergeFieldTrials(playout, forcedFieldTrials)).toBe(`${playout}${pacing}`);
  });
});

describe("codec choice", () => {
  const codecs = [
    { mimeType: "video/VP8", clockRate: 90000 },
    { mimeType: "video/rtx", clockRate: 90000 },
    { mimeType: "video/H264", clockRate: 90000, sdpFmtpLine: "profile-level-id=42e01f" },
    { mimeType: "video/AV1", clockRate: 90000 },
    { mimeType: "video/VP9", clockRate: 90000 },
  ];

  it("prefers VP9 then AV1 for ordinary desktops and keeps helpers last", () => {
    const ordered = orderCodecs(codecs, [], false).map((codec) => codec.mimeType);
    expect(ordered).toEqual(["video/VP9", "video/AV1", "video/H264", "video/VP8", "video/rtx"]);
  });

  it("puts a power-efficient encoder first when the stream is demanding", () => {
    const efficiency = [
      { mimeType: "video/H264", supported: true, powerEfficient: true },
      { mimeType: "video/VP9", supported: true, powerEfficient: false },
      { mimeType: "video/AV1", supported: false, powerEfficient: false },
    ];
    expect(isDemanding(3840, 2160, 30)).toBe(true);
    expect(isDemanding(2560, 1440, 30)).toBe(false);
    const ordered = orderCodecs(codecs, efficiency, true).map((codec) => codec.mimeType);
    expect(ordered).toEqual(["video/H264", "video/VP9", "video/VP8", "video/AV1", "video/rtx"]);
  });
});

describe("path classes", () => {
  it("reads direct, peer relay and DERP from the peer status", () => {
    expect(pathClassOf({ curAddr: "203.0.113.4:41641", relay: "nyc" })).toBe("direct");
    expect(pathClassOf({ curAddr: "", peerRelay: "100.64.0.9:7777:3", relay: "nyc" })).toBe(
      "peer-relay",
    );
    expect(pathClassOf({ curAddr: "", relay: "nyc" })).toBe("derp");
    expect(pathClassOf({ self: true })).toBe("local");
    expect(pathClassOf({})).toBe("unknown");
    expect(pathClassOf(undefined)).toBe("unknown");
  });
});

describe("stream stats", () => {
  const report = (frames: number, bytes: number): StatsEntry[] => [
    { type: "transport", id: "T01", selectedCandidatePairId: "CP1" },
    {
      type: "candidate-pair",
      id: "CP1",
      localCandidateId: "L1",
      remoteCandidateId: "R1",
      state: "succeeded",
      nominated: true,
      currentRoundTripTime: 0.004,
    },
    {
      type: "local-candidate",
      id: "L1",
      address: "100.101.102.103",
      port: 47101,
      candidateType: "host",
    },
    {
      type: "remote-candidate",
      id: "R1",
      address: "100.101.102.103",
      port: 47102,
      candidateType: "host",
    },
    { type: "codec", id: "C1", mimeType: "video/VP9" },
    {
      type: "inbound-rtp",
      id: "IT1",
      kind: "video",
      codecId: "C1",
      framesDecoded: frames,
      bytesReceived: bytes,
      frameWidth: 2560,
      frameHeight: 1440,
      jitterBufferDelay: 3,
      jitterBufferEmittedCount: 60,
    },
  ];

  it("summarizes the selected pair, frames, codec and jitter buffer", () => {
    const stats = summarizeStats(report(60, 1_000_000), "inbound", 1000);
    expect(stats).toEqual({
      at: 1000,
      frames: 60,
      bytes: 1_000_000,
      pair: {
        local: { address: "100.101.102.103", port: 47101, type: "host" },
        remote: { address: "100.101.102.103", port: 47102, type: "host" },
        rttMs: 4,
      },
      width: 2560,
      height: 1440,
      codec: "video/VP9",
      jitterBufferMs: 50,
    });
    expect(isHostPair(stats)).toBe(true);
    expect(isHostPair(summarizeStats([], "inbound", 0))).toBe(false);
  });

  it("derives bitrate and frame rate between two samples", () => {
    const first = summarizeStats(report(60, 1_000_000), "inbound", 1000);
    const second = summarizeStats(report(90, 2_000_000), "inbound", 2000);
    expect(ratesBetween(first, second)).toEqual({ bitrateKbps: 8000, framesPerSecond: 30 });
    expect(ratesBetween(undefined, second)).toEqual({ bitrateKbps: 0, framesPerSecond: 0 });
  });
});

describe("displays", () => {
  const displays = [
    { id: 1, label: "", size: { width: 1920, height: 1080 }, scaleFactor: 1.5 },
    { id: 2, label: "DELL U2720Q", size: { width: 2560, height: 1440 }, scaleFactor: 1 },
  ];
  const sources = [
    { id: "screen:2:0", name: "Screen 2", display_id: "2" },
    { id: "screen:1:0", name: "Screen 1", display_id: "1" },
    { id: "screen:9:0", name: "Ghost", display_id: "9" },
  ];

  it("maps capture sources to displays in physical pixels and drops sources without one", () => {
    const targets = mapDisplays(sources, displays, 1);
    expect(targets).toEqual([
      {
        id: "2",
        sourceId: "screen:2:0",
        label: "DELL U2720Q",
        width: 2560,
        height: 1440,
        scaleFactor: 1,
        primary: false,
      },
      {
        id: "1",
        sourceId: "screen:1:0",
        label: "Screen 1",
        width: 2880,
        height: 1620,
        scaleFactor: 1.5,
        primary: true,
      },
    ]);
    expect(chooseDisplay(targets)?.id).toBe("1");
    expect(chooseDisplay(targets, "2")?.id).toBe("2");
    expect(chooseDisplay(targets, "gone")?.id).toBe("1");
    expect(nextDisplay(targets, "1")?.id).toBe("2");
    expect(nextDisplay(targets, "2")?.id).toBe("1");
    expect(publicDisplays(targets)[0]).not.toHaveProperty("sourceId");
  });

  it("keeps a lone PipeWire source even when it names no display", () => {
    const targets = mapDisplays(
      [{ id: "screen:0:0", name: "Entire screen", display_id: "" }],
      displays,
      1,
    );
    expect(targets).toMatchObject([{ id: "source-0", sourceId: "screen:0:0", primary: true }]);
  });
});

describe("the session log", () => {
  const rows: SessionLogRow[] = [
    {
      kind: "requested",
      at: "2026-11-05T09:00:00.000Z",
      sessionId: "s1",
      peer: keeper,
      scope: "view",
    },
    {
      kind: "decided",
      at: "2026-11-05T09:00:04.000Z",
      sessionId: "s1",
      verdict: "granted",
      grantId: "g1",
    },
    {
      kind: "started",
      at: "2026-11-05T09:00:05.000Z",
      sessionId: "s1",
      grantId: "g1",
      displays: ["1"],
      path: "direct",
      preset: "text",
    },
    {
      kind: "switched",
      at: "2026-11-05T09:01:00.000Z",
      sessionId: "s1",
      grantId: "g1",
      displayId: "2",
    },
    {
      kind: "ended",
      at: "2026-11-05T09:10:05.000Z",
      sessionId: "s1",
      grantId: "g1",
      reason: "kill-switch",
      inputs: { pointer: 0, keys: 0 },
      clipboardBytes: { in: 0, out: 0 },
    },
    {
      kind: "requested",
      at: "2026-11-05T10:00:00.000Z",
      sessionId: "s2",
      peer: keeper,
      scope: "view",
    },
    {
      kind: "decided",
      at: "2026-11-05T10:00:30.000Z",
      sessionId: "s2",
      verdict: "denied",
      reason: "timed-out",
    },
    {
      kind: "kill-switch",
      at: "2026-11-05T10:00:31.000Z",
      chord: "CommandOrControl+Alt+Shift+X",
      registered: true,
    },
  ];

  it("round-trips through JSON lines and skips lines it cannot read", () => {
    const text = `${rows.map(logLine).join("")}not json\n{"kind":"mystery"}\n`;
    expect(parseLog(text)).toEqual(rows);
    expect(() => logLine({ kind: "decided" } as unknown as SessionLogRow)).toThrow();
  });

  it("folds rows into one summary per session, newest first, for the machines pane", () => {
    expect(sessionSummaries(rows)).toEqual([
      {
        sessionId: "s2",
        peer: keeper,
        requestedAt: "2026-11-05T10:00:00.000Z",
        verdict: "denied",
        deniedBecause: "timed-out",
        displays: [],
      },
      {
        sessionId: "s1",
        peer: keeper,
        requestedAt: "2026-11-05T09:00:00.000Z",
        verdict: "granted",
        deniedBecause: undefined,
        startedAt: "2026-11-05T09:00:05.000Z",
        displays: ["1", "2"],
        path: "direct",
        endedAt: "2026-11-05T09:10:05.000Z",
        endReason: "kill-switch",
        durationMs: 600_000,
      },
    ]);
  });
});

describe("the selected candidate pair's path class", () => {
  const end = (type: "host" | "srflx" | "prflx" | "relay" | "unknown") => ({
    address: "100.64.0.1",
    port: 47100,
    type,
  });

  it("calls host and server-reflexive pairs direct, any relay end relayed, and an unread pair nothing", () => {
    expect(pathOfPair({ local: end("host"), remote: end("host"), rttMs: 0 })).toBe("direct");
    expect(pathOfPair({ local: end("srflx"), remote: end("prflx") })).toBe("direct");
    expect(pathOfPair({ local: end("host"), remote: end("relay") })).toBe("relayed");
    expect(pathOfPair({ local: end("unknown"), remote: end("host") })).toBeUndefined();
    expect(pathOfPair(undefined)).toBeUndefined();
  });

  it("reads the pair the transport selected out of a stats report", () => {
    const report: StatsEntry[] = [
      { type: "transport", id: "T01", selectedCandidatePairId: "CP2" },
      { type: "candidate-pair", id: "CP1", localCandidateId: "L1", remoteCandidateId: "R1" },
      { type: "candidate-pair", id: "CP2", localCandidateId: "L2", remoteCandidateId: "R1" },
      { type: "local-candidate", id: "L1", candidateType: "host", address: "100.64.0.1" },
      { type: "local-candidate", id: "L2", candidateType: "relay", address: "100.64.0.3" },
      { type: "remote-candidate", id: "R1", candidateType: "host", address: "100.64.0.2" },
    ];
    expect(selectedPathOf(report)).toBe("relayed");
    expect(selectedPathOf([])).toBeUndefined();
  });

  it("logs a path change and folds it into the session summary", () => {
    const changed: SessionLogRow[] = [
      {
        kind: "requested",
        at: "2026-11-06T09:00:00.000Z",
        sessionId: "s3",
        peer: keeper,
        scope: "view",
      },
      {
        kind: "started",
        at: "2026-11-06T09:00:05.000Z",
        sessionId: "s3",
        grantId: "g3",
        displays: ["1"],
        path: "direct",
        preset: "text",
      },
      {
        kind: "path",
        at: "2026-11-06T09:02:00.000Z",
        sessionId: "s3",
        grantId: "g3",
        path: "relayed",
      },
    ];
    expect(parseLog(changed.map(logLine).join(""))).toEqual(changed);
    expect(sessionSummaries(changed)[0]?.path).toBe("relayed");
  });
});
