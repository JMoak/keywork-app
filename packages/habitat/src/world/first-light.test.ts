import { readFile } from "node:fs/promises";
import type { BusEnvelope, SessionRow } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  createCreature,
  poseOf,
  quietContext,
  type StepContext,
  step,
} from "../creature/creature.ts";
import { creatureReading } from "../creature/semantic.ts";
import type { PoseName } from "../pose/skin.ts";
import { coldStart } from "./cold-start.ts";
import { project, projectAll } from "./project.ts";
import { emptyHabitat, type HabitatState } from "./types.ts";

const conversation = "ddfd8239-e062-41b0-883f-9ee7df9aa42e";
const whileAsking = Date.parse("2026-11-06T06:23:10.000Z");
const afterTheTurn = Date.parse("2026-11-06T06:24:10.000Z");

const listedWhileAsking: SessionRow = {
  id: conversation,
  title: "",
  createdAt: "2026-11-06T06:21:41.705Z",
  lastActivityAt: "2026-11-06T06:23:02.050Z",
  messageCount: 1,
  bot: "bea",
  live: true,
  working: true,
  waiting: { asks: 1, tools: ["bash"] },
};

describe("first light on moak-main, replayed", () => {
  it("walks bea to the bench, to the porch with each ask, and back with the crate", async () => {
    const stream = await firstLight();
    const upTo = (id: number): HabitatState =>
      projectAll(
        emptyHabitat(),
        stream.filter((envelope) => envelope.id <= id),
      );
    const bea = (state: HabitatState, now: number) => creatureReading(state, "bea", now);

    expect(bea(upTo(3), whileAsking)).toMatchObject({ state: "working", lamps: 1, asks: 0 });
    expect(bea(upTo(4), whileAsking).carrier?.tool?.name).toBe("bash");
    expect(bea(upTo(5), whileAsking)).toMatchObject({ state: "porch", asks: 1 });
    expect(bea(upTo(6), whileAsking)).toMatchObject({ state: "working", asks: 0 });
    expect(bea(upTo(9), whileAsking)).toMatchObject({ state: "porch", asks: 1 });
    expect(bea(upTo(9), whileAsking).carrier?.thread).toBe(conversation);
    expect(bea(upTo(11), whileAsking)).toMatchObject({ state: "working", asks: 0 });
    expect(bea(upTo(13), afterTheTurn)).toMatchObject({ state: "back", crates: 1, lamps: 0 });
    expect(upTo(14).threads[conversation]?.title).toBe("largest files under docs");
  });

  it("seats the conversation from GET /sessions when the live wire named no creature first", async () => {
    const stream = await firstLight();
    const withoutTheWireTag = stream.filter(
      (envelope) => envelope.type !== "session.state" && envelope.id <= 5,
    );
    const unattributed = projectAll(
      coldStart({ at: "2026-11-06T06:21:00.000Z", sessions: [] }),
      withoutTheWireTag,
    );
    expect(creatureReading(unattributed, "bea", whileAsking).state).toBe("idle");

    const listed = project(unattributed, {
      type: "keeper.sessions",
      ts: "2026-11-06T06:23:03.000Z",
      sessions: [listedWhileAsking],
    });
    expect(creatureReading(listed, "bea", whileAsking)).toMatchObject({
      state: "porch",
      asks: 1,
      lamps: 1,
    });
    expect(Object.keys(listed.threads[conversation]?.asks ?? {})).toEqual([
      "call_nHLqCsCgKId0sO8f5KI3cdWX",
    ]);

    const rest = stream.filter((envelope) => envelope.id > 5);
    expect(creatureReading(projectAll(listed, rest), "bea", afterTheTurn)).toMatchObject({
      state: "back",
      crates: 1,
    });
  });

  it("learns the creature from session.state alone, the one live envelope that carries the bot", async () => {
    const stream = await firstLight();
    const opened = projectAll(
      emptyHabitat(),
      stream.filter((envelope) => envelope.id === 2 || envelope.id === 3),
    );
    expect(opened.threads[conversation]?.creature).toBe("bea");
    expect(creatureReading(opened, "bea", whileAsking).state).toBe("working");
  });
});

const runTwo = {
  conversation: "cef74bb7-95ad-4da7-a098-2f5d3fc61b9c",
  whileWorking: Date.parse("2026-11-06T08:45:20.000Z"),
  settling: Date.parse("2026-11-06T08:45:46.000Z"),
  later: Date.parse("2026-11-06T08:50:00.000Z"),
};

function veyListed(extra: Partial<SessionRow>): SessionRow {
  return {
    id: runTwo.conversation,
    title: "",
    createdAt: "2026-11-06T08:44:12.740Z",
    lastActivityAt: "2026-11-06T08:45:45.862Z",
    messageCount: 6,
    bot: "vey",
    live: true,
    working: false,
    waiting: { asks: 0, tools: [] },
    ...extra,
  };
}

describe("first light on moak-main, the second run, replayed", () => {
  const vey = (state: HabitatState, now: number) => creatureReading(state, "vey", now);

  it("leaves working when the introduction turn completes, although the refresh sent on turn.completed still listed the settling turn as working", async () => {
    const stream = await recorded("first-light-run-2");
    const working = projectAll(
      emptyHabitat(),
      stream.filter((envelope) => envelope.id <= 11),
    );
    expect(vey(working, runTwo.whileWorking)).toMatchObject({ state: "working", lamps: 1 });

    const completed = projectAll(
      working,
      stream.filter((envelope) => envelope.id > 11),
    );
    expect(vey(completed, runTwo.settling)).toMatchObject({ state: "back", lamps: 0, crates: 1 });

    const echoed = project(completed, {
      type: "keeper.sessions",
      ts: "2026-11-06T08:45:45.930Z",
      sessions: [veyListed({ working: true })],
    });
    expect(vey(echoed, runTwo.settling)).toMatchObject({ state: "back", lamps: 0 });

    const listed = project(echoed, {
      type: "keeper.sessions",
      ts: "2026-11-06T08:45:46.400Z",
      sessions: [veyListed({})],
    });
    expect(vey(listed, runTwo.later)).toMatchObject({ state: "back", lamps: 0 });

    const viewed = project(listed, {
      type: "keeper.viewed",
      ts: "2026-11-06T08:50:01.000Z",
      sessionId: runTwo.conversation,
    });
    expect(vey(viewed, runTwo.later)).toMatchObject({ state: "idle", lamps: 0 });
  });

  it("ends a turn it knew only from GET /sessions once a listing no older than that turn says the row stopped working", () => {
    const seated = coldStart({
      at: "2026-11-06T08:45:00.000Z",
      sessions: [veyListed({ working: true, lastActivityAt: "2026-11-06T08:44:59.105Z" })],
    });
    expect(vey(seated, runTwo.whileWorking)).toMatchObject({ state: "working", lamps: 1 });

    const stale = project(seated, {
      type: "keeper.sessions",
      ts: "2026-11-06T08:45:01.000Z",
      sessions: [veyListed({ lastActivityAt: "2026-11-06T08:44:12.755Z" })],
    });
    expect(vey(stale, runTwo.whileWorking)).toMatchObject({ state: "working", lamps: 1 });

    const stopped = project(stale, {
      type: "keeper.sessions",
      ts: "2026-11-06T08:45:46.400Z",
      sessions: [veyListed({})],
    });
    expect(vey(stopped, runTwo.later)).toMatchObject({ state: "idle", lamps: 0 });
  });
});

const runFour = {
  conversation: "fef0d967-4166-4ed0-aa06-55d3bca732a6",
  turnStarted: Date.parse("2026-11-06T13:22:16.500Z"),
  completed: Date.parse("2026-11-06T13:22:44.695Z"),
  report: "Wrote notes/largest.md: no docs folder was found, so the note says so.",
};

describe("first light on moak-main, the fourth run, replayed", () => {
  const osk = (state: HabitatState, now: number) => creatureReading(state, "osk", now);

  it("comes back with a crate although no file change reached the workspace, labels it with the report once one comes, and shelves it when viewed", async () => {
    const stream = await recorded("first-light-run-4");
    const completed = projectAll(emptyHabitat(), stream);
    const settling = runFour.completed + 1_000;
    expect(osk(completed, settling)).toMatchObject({ state: "back", lamps: 0, crates: 1 });
    expect(osk(completed, settling).carrier?.back).toMatchObject({
      preview: expect.stringMatching(
        /^Done — I wrote notes\/largest\.md\. I couldn't find a docs directory .*…$/,
      ),
      report: undefined,
    });

    const reported = project(completed, {
      id: stream.length + 1,
      ts: "2026-11-06T13:22:44.900Z",
      sessionId: runFour.conversation,
      type: "extension.notice",
      payload: {
        extension: "creature",
        level: "info",
        message: runFour.report,
        detail: {
          origin: { kind: "creature", creature: "osk", thread: runFour.conversation },
          entryId: "e-report",
        },
      },
    } as BusEnvelope);
    expect(osk(reported, settling).carrier?.back?.report).toBe(runFour.report);

    const viewed = project(reported, {
      type: "keeper.viewed",
      ts: "2026-11-06T13:23:30.000Z",
      sessionId: runFour.conversation,
    });
    expect(osk(viewed, settling + 60_000)).toMatchObject({ state: "idle", crates: 0 });
    expect(viewed.storehouse.shelves).toMatchObject([
      { thread: runFour.conversation, creature: "osk", changes: 0 },
    ]);
  });

  it("carries, delivers and celebrates on the stead, hammers and carves as the tools run, and keeps the crate until viewed", async () => {
    const stream = await recorded("first-light-run-4");
    const worldAt = (now: number): HabitatState =>
      projectAll(
        emptyHabitat(),
        stream.filter((envelope) => Date.parse(envelope.ts) <= now),
      );
    const prefs = { reducedMotion: false, tier: "ambient" } as const;
    const onlyAgentBeats: StepContext = { ...quietContext, doNotDisturb: true };
    let creature = createCreature("osk", runFour.turnStarted - 1, { place: "bench" });
    const clips: PoseName[] = [];
    const afterCompletion: PoseName[] = [];
    for (let now = runFour.turnStarted; now <= runFour.completed + 12_000; now += 50) {
      creature = step(creature, worldAt(now), now, onlyAgentBeats);
      const pose = poseOf(creature, prefs);
      if (clips.at(-1) !== pose.clip) clips.push(pose.clip);
      if (now >= runFour.completed) {
        if (afterCompletion.at(-1) !== pose.clip) afterCompletion.push(pose.clip);
        expect(pose, new Date(now).toISOString()).toMatchObject({ state: "back", glyph: "check" });
      }
    }
    expect(clips).toContain("hammer");
    expect(clips).toContain("carve");
    const ceremony = afterCompletion.slice(afterCompletion.indexOf("carry"));
    expect(afterCompletion.indexOf("carry")).toBeLessThanOrEqual(1);
    expect(ceremony.slice(0, 4)).toEqual(["carry", "deliver", "celebrate", "idle"]);
    expect(creature.reading.crates).toBe(1);

    const viewedAt = runFour.completed + 13_000;
    const viewed = project(worldAt(viewedAt), {
      type: "keeper.viewed",
      ts: new Date(viewedAt).toISOString(),
      sessionId: runFour.conversation,
    });
    const after = step(creature, viewed, viewedAt + 1, onlyAgentBeats);
    expect(after.reading).toMatchObject({ state: "idle", crates: 0 });
  });
});

function firstLight(): Promise<BusEnvelope[]> {
  return recorded("first-light");
}

async function recorded(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(new URL(`./fixtures/${name}.jsonl`, import.meta.url), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}
