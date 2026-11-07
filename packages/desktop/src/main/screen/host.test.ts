import type { SignalMessage } from "@keywork-app/screen";
import { describe, expect, it } from "vitest";
import type { ViewerEvent } from "./channels.ts";
import {
  fakeSeams,
  keeperOnSpark,
  lanLine,
  manualTimers,
  primary,
  scriptedConsent,
  secondary,
  settle,
  tailnetLine,
  viewerContents,
} from "./fakes.ts";
import { type ScreenHost, screenHost } from "./host.ts";

const minute = 60_000;

async function viewing(
  script: Array<number | "never"> = [0],
  extra: Parameters<typeof fakeSeams>[0] extends infer O ? Partial<O> : never = {},
) {
  const time = manualTimers();
  const consent = scriptedConsent(script);
  const fake = fakeSeams({
    consent: consent.ask,
    timers: time.timers,
    clock: time.clock,
    ...extra,
  });
  const host = screenHost(fake.seams);
  const stopListening = host.listen();
  const start = await host.viewer.view(viewerContents, { peer: "nSparkStable1" });
  await settle();
  const sessionId = start.ok ? start.sessionId : "";
  return { time, consent, fake, host, start, sessionId, stopListening };
}

function eventsOf(events: readonly ViewerEvent[], kind: ViewerEvent["kind"]) {
  return events.filter((event) => event.kind === kind);
}

async function connect(host: ScreenHost, sessionId: string) {
  await host.sharer.senderSignal(sessionId, { type: "offer", sdp: "v=0\r\noffer" });
  await host.sharer.senderSignal(sessionId, {
    type: "candidate",
    candidate: { candidate: tailnetLine, sdpMid: "0", sdpMLineIndex: 0 },
  });
  await host.sharer.senderSignal(sessionId, {
    type: "candidate",
    candidate: { candidate: lanLine, sdpMid: "0", sdpMLineIndex: 0 },
  });
  await settle();
  await host.viewer.signal(viewerContents, sessionId, { type: "answer", sdp: "v=0\r\nanswer" });
  await host.viewer.signal(viewerContents, sessionId, {
    type: "candidate",
    candidate: { candidate: tailnetLine, sdpMid: "0", sdpMLineIndex: 0 },
  });
  await settle();
  await host.sharer.senderState(sessionId, "connected");
  await host.viewer.state(viewerContents, sessionId, "connected");
}

describe("a view session end to end through both hosts' signaling", () => {
  it("asks the keeper with the verified identity, grants, negotiates over tailnet candidates only and goes live", async () => {
    const { consent, fake, host, start, sessionId } = await viewing();
    expect(start).toEqual({ ok: true, sessionId: "session-0001" });
    expect(fake.prepared).toEqual([viewerContents]);
    expect(consent.cards[0]?.message).toBe(
      "Jordan (jordan@example.com) on spark-ad4d wants to view this screen",
    );
    expect(eventsOf(fake.events, "granted")).toEqual([
      {
        kind: "granted",
        sessionId,
        displays: [
          {
            id: primary.id,
            label: "Primary",
            width: 2560,
            height: 1440,
            scaleFactor: 1,
            primary: true,
          },
          {
            id: secondary.id,
            label: "Side",
            width: 3840,
            height: 2160,
            scaleFactor: 1.5,
            primary: false,
          },
        ],
        current: primary.id,
        expiresAt: "2026-11-05T10:00:00.000Z",
        path: "direct",
      },
    ]);
    expect(fake.opened).toEqual([sessionId]);
    expect(fake.commands[0]?.command).toMatchObject({
      kind: "start",
      frameRate: 30,
      preset: { name: "text", maxBitrate: 8_000_000, contentHint: "detail" },
    });
    expect(fake.shown).toMatchObject([
      {
        sessionId,
        display: primary.id,
        banner: {
          who: "Jordan (jordan@example.com) on spark-ad4d",
          mode: "view",
          shortcut: "CommandOrControl+Alt+Shift+X",
        },
      },
    ]);
    expect(host.sharer.captureTarget(sessionId)?.sourceId).toBe(primary.sourceId);
    expect(host.sharer.isCapturing(sessionId)).toBe(true);

    await connect(host, sessionId);
    const remote = eventsOf(fake.events, "remote").map(
      (event) => event.kind === "remote" && event.signal,
    );
    expect(remote).toEqual([
      { type: "offer", sdp: "v=0\r\noffer" },
      {
        type: "candidate",
        candidate: {
          candidate: tailnetLine,
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: null,
        },
      },
    ]);
    const toSender = fake.commands.slice(1).map((entry) => entry.command);
    expect(toSender).toEqual([
      { kind: "remote", signal: { type: "answer", sdp: "v=0\r\nanswer" } },
      {
        kind: "remote",
        signal: {
          type: "candidate",
          candidate: {
            candidate: tailnetLine,
            sdpMid: "0",
            sdpMLineIndex: 0,
            usernameFragment: null,
          },
        },
      },
    ]);
    expect(
      fake.relay.traffic.some((message) => JSON.stringify(message).includes("192.168.1.20")),
    ).toBe(false);
    expect(fake.rows.map((row) => row.kind)).toEqual([
      "requested",
      "decided",
      "kill-switch",
      "started",
    ]);
    expect(fake.rows.at(-1)).toMatchObject({
      kind: "started",
      path: "direct",
      preset: "text",
      displays: [primary.id],
    });
  });

  it("ends everything at once on the kill switch and tells the viewer who ended it", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    fake.armed[0]?.();
    await settle();
    expect(fake.closed).toEqual([sessionId]);
    expect(fake.hidden).toEqual([sessionId]);
    expect(fake.disarmed).toHaveLength(1);
    expect(host.sharer.isCapturing(sessionId)).toBe(false);
    expect(host.sharer.captureTarget(sessionId)).toBeUndefined();
    expect(fake.rows.at(-1)).toMatchObject({
      kind: "ended",
      reason: "kill-switch",
      inputs: { pointer: 0, keys: 0 },
      clipboardBytes: { in: 0, out: 0 },
    });
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "kill-switch" },
    ]);
  });

  it("stops from the indicator's own Stop", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    fake.shown[0]?.stop();
    await settle();
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "local-user" },
    ]);
    expect(host.sharer.sessions()).toEqual([]);
  });

  it("ends the sharer's side when the viewer leaves", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    await host.viewer.stop(viewerContents, sessionId);
    await settle();
    expect(fake.closed).toEqual([sessionId]);
    expect(fake.rows.at(-1)).toMatchObject({ kind: "ended", reason: "viewer-left" });
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "viewer-left" },
    ]);
  });
});

describe("consent", () => {
  it("denies when the card times out after 30 seconds and opens nothing", async () => {
    const { time, consent, fake, sessionId } = await viewing(["never"]);
    expect(fake.opened).toEqual([]);
    await time.advance(29_999);
    expect(eventsOf(fake.events, "ended")).toEqual([]);
    await time.advance(1);
    expect(consent.signals[0]?.aborted).toBe(true);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "denied", detail: "timed-out" },
    ]);
    expect(fake.opened).toEqual([]);
    expect(fake.shown).toEqual([]);
    expect(fake.rows.map((row) => [row.kind, "reason" in row ? row.reason : undefined])).toEqual([
      ["requested", undefined],
      ["decided", "timed-out"],
    ]);
  });

  it("denies on Ignore", async () => {
    const { fake, sessionId } = await viewing([1]);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "denied", detail: "ignored" },
    ]);
  });

  it("never asks about a requester without a human identity", async () => {
    const { consent, fake, sessionId } = await viewing([0], {
      requester: { node: { stableId: "nTagged", name: "workshop" }, tags: ["tag:stead-host"] },
    });
    expect(consent.cards).toEqual([]);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "denied", detail: "unverified" },
    ]);
  });

  it("refuses without asking when macOS has not granted screen recording", async () => {
    const { consent, fake, sessionId } = await viewing([0], { access: "needs-onboarding" });
    expect(consent.cards).toEqual([]);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "denied", detail: "needs-permission" },
    ]);
  });

  it("asks to keep sharing at 30 minutes and stops when the keeper does not answer", async () => {
    const { time, consent, fake, host, sessionId } = await viewing([0, "never"]);
    await connect(host, sessionId);
    host.startTicking();
    await time.advance(30 * minute);
    expect(consent.cards.map((card) => card.title)).toEqual([
      "Screen sharing request",
      "Keep sharing your screen?",
    ]);
    await time.advance(29_000);
    expect(host.sharer.sessions()).toEqual([sessionId]);
    await time.advance(2000);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "not-reconfirmed" },
    ]);
    expect(fake.rows.filter((row) => row.kind === "reconfirmed")).toMatchObject([
      { answer: "timed-out" },
    ]);
  });

  it("keeps sharing when the keeper says so, until the grant's hour is up", async () => {
    const { time, fake, host, sessionId } = await viewing([0, 0]);
    await connect(host, sessionId);
    host.startTicking();
    await time.advance(59 * minute);
    expect(host.sharer.sessions()).toEqual([sessionId]);
    expect(fake.rows.filter((row) => row.kind === "reconfirmed")).toMatchObject([
      { answer: "allow" },
    ]);
    await time.advance(2 * minute);
    expect(eventsOf(fake.events, "ended")).toEqual([
      { kind: "ended", sessionId, reason: "expired" },
    ]);
  });
});

describe("grant limits", () => {
  it("keeps a session alive while the viewer sends keepalives", async () => {
    const { time, fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    host.startTicking();
    await time.advance(10 * minute);
    expect(host.sharer.sessions()).toEqual([sessionId]);
    const keepalives = fake.relay.traffic.filter(
      (message: SignalMessage) => message.kind === "keepalive",
    );
    expect(keepalives).toHaveLength(40);
  });

  it("ends as idle five minutes after keepalives stop arriving", async () => {
    const { time, fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    fake.relay.blocked.add("keepalive");
    host.startTicking();
    await time.advance(5 * minute - 1000);
    expect(host.sharer.sessions()).toEqual([sessionId]);
    await time.advance(2000);
    expect(host.sharer.sessions()).toEqual([]);
    expect(eventsOf(fake.events, "ended")).toEqual([{ kind: "ended", sessionId, reason: "idle" }]);
    expect(fake.rows.at(-1)).toMatchObject({ kind: "ended", reason: "idle" });
  });
});

describe("displays", () => {
  it("cycles to the next granted display with a recapture and tells the viewer", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    await host.viewer.cycleDisplay(viewerContents, sessionId);
    await settle();
    expect(fake.commands.map((entry) => entry.command.kind).slice(-2)).toEqual([
      "recapture",
      "preset",
    ]);
    expect(fake.commands.at(-1)?.command).toMatchObject({
      kind: "preset",
      preset: { maxBitrate: 8_000_000, scaleResolutionDownBy: 1.5 },
    });
    expect(host.sharer.captureTarget(sessionId)?.id).toBe(secondary.id);
    expect(fake.shown.at(-1)?.display).toBe(secondary.id);
    expect(eventsOf(fake.events, "displays").at(-1)).toMatchObject({ current: secondary.id });
    expect(fake.rows.at(-1)).toMatchObject({ kind: "switched", displayId: secondary.id });
  });

  it("moves to a remaining display when the captured one goes away and ends when none is left", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    fake.setDisplays([secondary]);
    await host.sharer.displaysChanged();
    await settle();
    expect(host.sharer.captureTarget(sessionId)?.id).toBe(secondary.id);
    fake.setDisplays([]);
    await host.sharer.displaysChanged();
    await settle();
    expect(eventsOf(fake.events, "ended")).toMatchObject([{ reason: "display-lost" }]);
  });

  it("keeps the capture when a display event leaves every display as it was", async () => {
    const { fake, host, sessionId } = await viewing();
    await connect(host, sessionId);
    const commandsBefore = fake.commands.length;
    const rowsBefore = fake.rows.length;
    fake.setDisplays([{ ...primary }, { ...secondary }]);
    await host.sharer.displaysChanged();
    await settle();
    expect(fake.commands.slice(commandsBefore)).toEqual([]);
    expect(fake.rows.slice(rowsBefore)).toEqual([]);
    fake.setDisplays([{ ...primary, scaleFactor: 2 }, secondary]);
    await host.sharer.displaysChanged();
    await settle();
    expect(fake.commands.slice(commandsBefore).map((entry) => entry.command.kind)).toContain(
      "recapture",
    );
  });

  it("asks for no capture sources on a display change while nothing is captured", async () => {
    const time = manualTimers();
    const fake = fakeSeams({
      consent: scriptedConsent([0]).ask,
      timers: time.timers,
      clock: time.clock,
    });
    let asked = 0;
    const host = screenHost({
      ...fake.seams,
      displays: async () => {
        asked += 1;
        return fake.seams.displays();
      },
    });
    await host.sharer.displaysChanged();
    expect(asked).toBe(0);
  });
});

describe("snapshot frames", () => {
  it("asks the sender for a frame only while capturing and gives up after two seconds", async () => {
    const { time, fake, host, sessionId } = await viewing();
    const asked = host.frame(sessionId, 1280);
    const request = fake.commands.at(-1)?.command;
    expect(request).toMatchObject({ kind: "frame", maxWidth: 1280 });
    host.frameArrived(sessionId, {
      requestId: request?.kind === "frame" ? request.requestId : 0,
      jpeg: new Uint8Array([255, 216]),
    });
    await expect(asked).resolves.toEqual(new Uint8Array([255, 216]));
    const slow = host.frame(sessionId, 640);
    await time.advance(2000);
    await expect(slow).resolves.toBeUndefined();
    await expect(host.frame("session-unknown", 640)).resolves.toBeUndefined();
  });
});

describe("the viewer side", () => {
  it("refuses a peer it has no route to and sessions it does not own", async () => {
    const time = manualTimers();
    const fake = fakeSeams({
      consent: scriptedConsent([0]).ask,
      timers: time.timers,
      clock: time.clock,
    });
    const host = screenHost(fake.seams);
    await expect(host.viewer.view(viewerContents, { peer: "nowhere" })).resolves.toEqual({
      ok: false,
      problem: "no signaling route to nowhere",
    });
    expect(keeperOnSpark.user?.loginName).toBe("jordan@example.com");
    await host.viewer.stop(99, "session-0001");
    expect(fake.events).toEqual([]);
  });

  it("reads the session history back as summaries", async () => {
    const { host, sessionId } = await viewing([1]);
    expect(await host.history()).toMatchObject([
      { sessionId, verdict: "denied", deniedBecause: "ignored" },
    ]);
  });
});

describe("the path class of a live session", () => {
  it("records the selected candidate pair's class on started, and each change after it", async () => {
    const { fake, host, sessionId } = await viewing([0], { path: "unknown" });
    await host.sharer.senderPath(sessionId, "direct");
    await connect(host, sessionId);
    expect(fake.rows.at(-1)).toMatchObject({ kind: "started", path: "direct", preset: "text" });

    await host.sharer.senderPath(sessionId, "direct");
    await host.sharer.senderPath(sessionId, "relayed");
    expect(fake.rows.filter((row) => row.kind === "path")).toEqual([
      { kind: "path", at: expect.any(String), sessionId, grantId: "grant-0002", path: "relayed" },
    ]);
    expect(fake.commands.at(-1)?.command).toMatchObject({
      kind: "preset",
      preset: { name: "relay" },
    });
  });
});
