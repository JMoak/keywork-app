import type { ScreenAuditRecord } from "@keywork-app/protocol";
import type { PeerIdentity } from "@keywork-app/screen";
import { afterEach, describe, expect, it } from "vitest";
import { indicatorZones } from "./control.ts";
import {
  type ConsentScript,
  fakeSeams,
  keeperOnSpark,
  manualTimers,
  primary,
  scriptedConsent,
  settle,
  viewerContents,
} from "./fakes.ts";
import { type HelperPort, type HelperStopped, openHelper } from "./helper/port.ts";
import type { HelperInput, HelperReply } from "./helper/protocol.ts";
import { standInSpawn } from "./helper/stand-in.ts";
import { screenHost } from "./host.ts";
import { agentControlRefusal, noHelperRefusal } from "./sharer.ts";

const workshopAgent: PeerIdentity = {
  node: { stableId: "nWorkshop1", name: "otter-shop" },
  tags: ["tag:workshop"],
};

const center = { x: 0.5, y: 0.5 };
const ports: HelperPort[] = [];

afterEach(async () => {
  await Promise.all(ports.splice(0).map((port) => port.stop()));
});

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function standInHelper() {
  const stops: Array<HelperStopped & { at: number }> = [];
  return {
    stops,
    open: async (): Promise<HelperPort | undefined> => {
      const port = await openHelper(standInSpawn());
      if (port === undefined) return undefined;
      ports.push(port);
      return {
        ...port,
        grant: (grant) => port.grant({ ...grant, expiresAt: Date.now() + 60_000 }),
        stop: async () => {
          const stopped = await port.stop();
          stops.push({ ...stopped, at: performance.now() });
          return stopped;
        },
      };
    },
  };
}

function fakeHelper() {
  const inputs: HelperInput[] = [];
  const listeners = new Set<(reply: HelperReply) => void>();
  let releases = 0;
  let stops = 0;
  const port: HelperPort = {
    impl: "fake",
    grant: async () => true,
    input: (input) => inputs.push(input),
    releaseAll: async () => {
      releases += 1;
      return { keys: [], buttons: [] };
    },
    stop: async () => {
      stops += 1;
      return { released: { keys: [], buttons: [] }, exited: true, ms: 0 };
    },
    onReply: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    inputs,
    releases: () => releases,
    stops: () => stops,
    localInput: () => {
      for (const listener of listeners) listener({ v: 1, kind: "local-input" });
    },
  };
}

async function controlSession(options: {
  helper?: (() => Promise<HelperPort | undefined>) | undefined;
  requester?: PeerIdentity;
  script?: ConsentScript;
}) {
  const time = manualTimers();
  const consent = scriptedConsent(options.script ?? [0]);
  const fake = fakeSeams({
    consent: consent.ask,
    timers: time.timers,
    clock: time.clock,
    ...(options.requester !== undefined && { requester: options.requester }),
  });
  const audits: ScreenAuditRecord[] = [];
  const host = screenHost({
    ...fake.seams,
    helper: options.helper,
    audit: async (record) => {
      audits.push(record);
    },
  });
  host.listen();
  const start = await host.viewer.view(viewerContents, { peer: "nSparkStable1", control: true });
  const sessionId = start.ok ? start.sessionId : "";
  return { time, consent, fake, host, sessionId, audits };
}

const key = (seq: number, code: string, down = true) => ({ kind: "key", seq, code, down });
const press = (seq: number, at: { x: number; y: number }) => ({
  kind: "button",
  seq,
  ...at,
  button: "left",
  down: true,
});

describe("the control grant over a live view", () => {
  it("asks with Allow control, View only and Ignore, grants control over view and tells the viewer", async () => {
    const helper = fakeHelper();
    const { consent, fake, sessionId, audits } = await controlSession({
      helper: async () => helper.port,
    });
    await until(() => fake.opened.includes(sessionId));
    expect(consent.cards[0]?.buttons).toEqual(["Allow control", "View only", "Ignore"]);
    expect(fake.events.find((event) => event.kind === "granted")).toMatchObject({
      control: { grantId: expect.stringMatching(/^grant-/) },
    });
    expect(fake.rows.find((row) => row.kind === "control")).toMatchObject({
      state: "granted",
      reason: "the keeper allowed control",
    });
    expect(audits[0]).toMatchObject({ kind: "control", decision: "allow", controller: "human" });
    expect(fake.shown.at(-1)?.banner).toMatchObject({ mode: "control", controller: "human" });
  });

  it("carries sequenced, normalized ctl and ptr input to the helper port and drops stale input", async () => {
    const helper = fakeHelper();
    const { fake, host, sessionId } = await controlSession({ helper: async () => helper.port });
    await until(() => fake.opened.includes(sessionId));
    expect(host.sharer.senderInput(sessionId, "ptr", { kind: "move", seq: 2, ...center })).toBe(
      "applied",
    );
    expect(host.sharer.senderInput(sessionId, "ptr", { kind: "move", seq: 1, ...center })).toBe(
      "stale",
    );
    expect(host.sharer.senderInput(sessionId, "ctl", key(1, "KeyA"))).toBe("applied");
    expect(host.sharer.senderInput(sessionId, "ctl", { kind: "key", seq: 2 })).toBe("malformed");
    expect(helper.inputs).toEqual([
      { kind: "ptr", grantId: expect.any(String), seq: 1, action: "move", x: 0.5, y: 0.5 },
      { kind: "key", grantId: expect.any(String), seq: 2, code: "KeyA", down: true },
    ]);
  });

  it("drops an injected click on the indicator or its Stop, and lets one beside it through", async () => {
    const helper = fakeHelper();
    const { fake, host, sessionId } = await controlSession({ helper: async () => helper.port });
    await until(() => fake.opened.includes(sessionId));
    const geometry = {
      bounds: { x: 0, y: 0, width: primary.width, height: primary.height },
      workArea: { x: 0, y: 0, width: primary.width, height: primary.height },
      scaleFactor: 1,
    };
    const [top, , , , banner] = indicatorZones(geometry);
    if (banner === undefined || top === undefined) throw new Error("no banner");
    const onStop = {
      x: (banner.x + banner.width - 10) / primary.width,
      y: (banner.y + banner.height / 2) / primary.height,
    };
    expect(host.sharer.senderInput(sessionId, "ctl", press(1, onStop))).toBe("on-indicator");
    expect(host.sharer.senderInput(sessionId, "ctl", press(2, { x: 0.5, y: 1 / 1440 }))).toBe(
      "on-indicator",
    );
    expect(host.sharer.senderInput(sessionId, "ctl", press(3, center))).toBe("applied");
    expect(helper.inputs).toHaveLength(1);
  });

  it("is revocable without ending the view", async () => {
    const helper = fakeHelper();
    const { fake, host, sessionId } = await controlSession({ helper: async () => helper.port });
    await until(() => fake.opened.includes(sessionId));
    await host.sharer.dropControl(sessionId, "the keeper took control back");
    await settle();
    expect(host.sharer.sessions()).toEqual([sessionId]);
    expect(helper.stops()).toBe(1);
    expect(host.sharer.senderInput(sessionId, "ctl", key(1, "KeyA"))).toBe("no-control");
    expect(fake.events.filter((event) => event.kind === "control")).toEqual([
      { kind: "control", sessionId, state: "revoked", reason: "the keeper took control back" },
    ]);
    expect(fake.shown.at(-1)?.banner.mode).toBe("view");
  });

  it("pauses on physical input, says so in the overlay, and resumes only when the keeper does", async () => {
    const helper = fakeHelper();
    const { fake, host, sessionId } = await controlSession({ helper: async () => helper.port });
    await until(() => fake.opened.includes(sessionId));
    helper.localInput();
    await settle();
    expect(helper.releases()).toBe(1);
    expect(host.sharer.senderInput(sessionId, "ctl", key(1, "KeyA"))).toBe("paused");
    const paused = fake.shown.at(-1);
    expect(paused?.banner).toMatchObject({ mode: "control", paused: true });
    expect(fake.events.at(-1)).toMatchObject({ kind: "control", state: "paused" });
    expect(paused?.resume).toBeTypeOf("function");
    paused?.resume?.();
    await settle();
    expect(fake.events.at(-1)).toMatchObject({ kind: "control", state: "resumed" });
    expect(host.sharer.senderInput(sessionId, "ctl", key(2, "KeyA"))).toBe("applied");
    expect(fake.rows.filter((row) => row.kind === "control").map((row) => row.state)).toEqual([
      "granted",
      "paused",
      "resumed",
    ]);
  });

  it("refuses an agent control of this keeper desktop, in words", async () => {
    const helper = fakeHelper();
    const { fake, audits, consent } = await controlSession({
      helper: async () => helper.port,
      requester: workshopAgent,
    });
    await settle();
    expect(consent.cards).toEqual([]);
    expect(fake.events.at(-1)).toMatchObject({
      kind: "ended",
      reason: "denied",
      detail: "agent-control",
    });
    expect(fake.rows.at(-1)).toMatchObject({ kind: "decided", reason: agentControlRefusal });
    expect(audits).toEqual([
      expect.objectContaining({ kind: "control", controller: "agent", decision: "deny" }),
    ]);
  });

  it("shares for viewing only, and says why, when this machine has no input helper", async () => {
    const { consent, fake, sessionId } = await controlSession({ helper: undefined });
    await until(() => fake.opened.includes(sessionId));
    expect(consent.cards[0]?.buttons).toEqual(["View only", "Ignore"]);
    expect(fake.rows.find((row) => row.kind === "control")).toMatchObject({
      state: "refused",
      reason: noHelperRefusal,
    });
  });
});

describe("control re-confirmation", () => {
  async function thirtyMinutesOfControl(script: ConsentScript) {
    const helper = fakeHelper();
    const session = await controlSession({ helper: async () => helper.port, script });
    const { time, fake, host, sessionId } = session;
    await until(() => fake.opened.includes(sessionId));
    host.startTicking();
    let seq = 0;
    for (let elapsed = 0; elapsed < 30; elapsed += 3) {
      seq += 1;
      expect(host.sharer.senderInput(sessionId, "ptr", { kind: "move", seq, ...center })).toBe(
        "applied",
      );
      await time.advance(3 * 60_000);
    }
    return session;
  }

  it("asks one card every 30 minutes, and View only drops control and keeps the view", async () => {
    const { consent, fake, host, sessionId } = await thirtyMinutesOfControl([0, 1]);
    expect(consent.cards.map((card) => card.title)).toEqual([
      "Screen control request",
      "Keep allowing control?",
    ]);
    await settle();
    expect(fake.rows.find((row) => row.kind === "reconfirmed")).toMatchObject({
      answer: "view-only",
    });
    expect(fake.events.at(-1)).toMatchObject({
      kind: "control",
      state: "revoked",
      reason: "the keeper chose view only",
    });
    expect(host.sharer.sessions()).toEqual([sessionId]);
  });

  it("stops sharing when nobody answers within 30 s", async () => {
    const { time, fake, host } = await thirtyMinutesOfControl([0, "never"]);
    await time.advance(31_000);
    await settle();
    expect(fake.rows.find((row) => row.kind === "reconfirmed")).toMatchObject({
      answer: "timed-out",
    });
    expect(fake.rows.at(-1)).toMatchObject({ kind: "ended", reason: "not-reconfirmed" });
    expect(host.sharer.sessions()).toEqual([]);
  });
});

describe("the kill switch under control", () => {
  it("releases every held key and button and the stand-in is gone within 200 ms", async () => {
    const helper = standInHelper();
    const { fake, host, sessionId, audits } = await controlSession({ helper: helper.open });
    await until(() => fake.opened.includes(sessionId), 5000);
    expect(host.sharer.senderInput(sessionId, "ctl", key(1, "ShiftLeft"))).toBe("applied");
    expect(host.sharer.senderInput(sessionId, "ctl", key(2, "KeyA"))).toBe("applied");
    expect(host.sharer.senderInput(sessionId, "ctl", press(3, center))).toBe("applied");
    expect(host.sharer.senderInput(sessionId, "ptr", { kind: "move", seq: 1, ...center })).toBe(
      "applied",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const killedAt = performance.now();
    fake.armed[0]?.();
    await until(() => helper.stops.length === 1, 1000);
    const stopped = helper.stops[0];
    const elapsed = (stopped?.at ?? Number.POSITIVE_INFINITY) - killedAt;
    expect(stopped).toMatchObject({
      released: { keys: ["KeyA", "ShiftLeft"], buttons: ["left"] },
      exited: true,
    });
    expect(elapsed).toBeLessThan(200);
    await until(() => fake.rows.some((row) => row.kind === "ended"));
    expect(fake.rows.find((row) => row.kind === "ended")).toMatchObject({
      reason: "kill-switch",
      scopes: ["view", "control"],
      inputs: { pointer: 2, keys: 2 },
    });
    expect(audits.at(-1)).toMatchObject({
      kind: "session",
      scopes: ["view", "control"],
      reason: "kill-switch",
      inputs: { pointer: 2, keys: 2 },
    });
    expect(fake.hidden).toContain(sessionId);
    console.info(`kill switch: released and stand-in gone in ${elapsed.toFixed(1)} ms`);
  });

  it("is the same model for a keeper who stops from the overlay", async () => {
    const helper = standInHelper();
    const { fake, sessionId } = await controlSession({ helper: helper.open });
    await until(() => fake.opened.includes(sessionId), 5000);
    fake.shown.at(-1)?.stop();
    await until(() => helper.stops.length === 1, 1000);
    expect(helper.stops[0]).toMatchObject({ exited: true });
    expect(keeperOnSpark.user?.loginName).toBe("jordan@example.com");
  });
});
