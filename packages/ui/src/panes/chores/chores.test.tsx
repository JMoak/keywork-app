import type { KeyworkClient, ServerFeed, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import type { HostPort } from "../../host/port.ts";
import { actionScopes, appActions } from "../../keys/actions.ts";
import { Keymap } from "../../keys/keymap.ts";
import type { TrustFlow } from "../../shell/trust.ts";
import type { PaneDefinition, ShellSeams } from "../registry.ts";
import { homeOpeningLine } from "../stead/creature-home.tsx";
import { checkPaneDefinition } from "../testing.ts";
import { settingsPointer, settingsUnservedLine } from "./copy.ts";
import { type ChoresSpec, choresPane, choresPaneWith } from "./index.tsx";
import type { ChoresPort } from "./port.ts";
import {
  type ChoresReading,
  choreFile,
  choreRow,
  heldChoreNeed,
  morningRuns,
  morningTriage,
  nightlyTests,
  nodeSettings,
  reading,
  recordingPort,
  refused,
  runRow,
  type ScriptedAnswers,
  tam,
  testZone,
  thursdayMorning,
  wren,
} from "./testing.ts";

afterEach(cleanup);

const goldenDirectory = "./golden";

describe("the chores pane, listing", () => {
  it("shows each creature's chores: trigger in words, destination, notify, tools, state, next run", async () => {
    const { container } = await mounted(reading());
    expect(rows(container)).toEqual([
      "▾ Wren 5 chores",
      "▒ Morning triage tomorrow 09:00",
      "▓ Docs index running",
      "▒ Nightly tests tomorrow 02:00",
      "░ Storehouse tidy off",
      "× broken unreadable",
      "▾ Tam 0 chores",
    ]);
    const lines = subLines(container);
    expect(lines).toContain(
      "weekdays at 09:00 (America/Chicago), until 2026-12-31 · to the conversation · notify only when it needs you · read-only",
    );
    expect(lines).toContain(
      "every 2 hours · to docs/INDEX.md · notify every run, at the digest · write, 2 grants, accepted",
    );
    expect(lines).toContain(
      "every day at 02:00 (America/Chicago) · to thread nightly · notify never; the log only · act, 1 grant, not accepted",
    );
    expect(lines).toContain("Its act grants wait for you: read and accept them with a.");
    expect(lines).toContain(
      "Off: disabled after 5 failed runs in a row; the last: the runner failed: exit 1. Turn it back on with t.",
    );
    await expect(goldenText(container)).toMatchFileSnapshot(`${goldenDirectory}/list.txt`);
  });

  it("moves with j and k, folds a creature on enter, and narrows to one creature by spec", async () => {
    const { container, act } = await mounted(reading());
    act("chores.down");
    act("chores.down");
    expect(cursorName(container)).toBe("Docs index");
    act("chores.up");
    act("chores.up");
    act("chores.open");
    expect(rows(container)).toEqual(["▸ Wren 5 chores", "▾ Tam 0 chores"]);
    cleanup();
    const narrowed = await mounted(reading(), { spec: { kind: "chores", creature: "tam" } });
    expect(rows(narrowed.container)).toEqual([]);
    expect(empty(narrowed.container)).toBe("No chores · add one with n");
  });

  it("teaches in the voice guide's words with no creature, and passes a refusal through", async () => {
    const none = await mounted(reading({ creatures: [] }));
    expect(empty(none.container)).toBe("No creature yet · make one with ctrl+k 1");
    cleanup();
    const unserved = await mounted(reading({ creatures: "creatures is not served by this host" }));
    expect(empty(unserved.container)).toBe("creatures is not served by this host");
    cleanup();
    const refusing = await mounted(
      reading({ creatures: [wren, tam], chores: { wren: "no creature has that slug", tam: [] } }),
    );
    expect(subLines(refusing.container)).toContain("no creature has that slug");
    expect(choresPane.emptyState(keys)).toBe("No chores · add one with n");
  });

  it("shows the digest schedule and quiet hours read-only with a pointer, or says they are not served", async () => {
    const served = await mounted(reading({ settings: nodeSettings }));
    expect(settings(served.container)).toEqual([
      "digest at 08:30, 12:30, 17:30 · quiet 22:00 to 07:00 (America/Chicago)",
      settingsPointer,
    ]);
    expect(served.container.querySelectorAll(".kw-chores-settings input")).toHaveLength(0);
    cleanup();
    const unserved = await mounted(reading());
    expect(settings(unserved.container)[0]).toBe(settingsUnservedLine);
  });
});

describe("the chores pane, wherever it opens", () => {
  it("reads the creature home's chores from a project window, never the project's", async () => {
    const opened: string[] = [];
    const { portsFor, container } = await mounted(reading(), {
      shell: (project) =>
        ({
          ...project,
          steadHome: {
            workspace: "C:/home/.keywork/home",
            shell: {
              ...project,
              workspace: "C:/home/.keywork/home",
              sessions: { ...project.sessions, openSession: () => undefined },
            },
            openSession: (reference: { session: string }) => void opened.push(reference.session),
          },
        }) as unknown as ShellSeams,
    });
    expect(portsFor).toEqual(["C:/home/.keywork/home"]);
    expect(rows(container)).toContain("▾ Wren 5 chores");
  });

  it("asks for the creature home and says it is opening until the home answers", async () => {
    let prepared = 0;
    const { portsFor, container } = await mounted(reading(), {
      shell: (project) =>
        ({
          ...project,
          prepareSteadHome: () => {
            prepared += 1;
          },
        }) as unknown as ShellSeams,
    });
    expect(prepared).toBe(1);
    expect(portsFor).toEqual([]);
    expect(container.textContent).toContain(homeOpeningLine);
  });
});

describe("the chores pane, runs", () => {
  it("keeps process, delivery and verification as three marks and never says done", async () => {
    const { container, act } = await mounted(reading());
    act("chores.down");
    act("chores.open");
    await settle();
    const table = runTable(container);
    expect(table[0]).toEqual([
      "when",
      "outcome",
      "process",
      "delivery",
      "verified",
      "cost (USD)",
      "minutes",
    ]);
    expect(table.slice(1, 3)).toEqual([
      ["11-05 08:40", "delivered", "completed", "delivered", "verified", "0.04", "3.2"],
      ["11-04 09:00", "completed", "completed", "unknown", "unchecked", "0.03", "2.7"],
    ]);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bdone\b|\bended ok\b/i);
    expect(notes(container)).toEqual([
      "run by hand",
      "caught up: the 09:00 slot ran at 11:42",
      "skipped: missed; only the most recent slot is caught up",
      "blocked: ran past its 10-minute budget · attempt 2",
      "cancelled: stopped by the keeper; stopping does not undo what already ran · run by hand",
      "skipped: this chore already ran 6 times in the last hour (cap 6)",
    ]);
    await expect(goldenText(container)).toMatchFileSnapshot(`${goldenDirectory}/runs.txt`);
  });

  it("opens a run's thread, says so when a run opened none, and goes back to the chore", async () => {
    const harness = await mounted(reading());
    const { container, act, opened } = harness;
    act("chores.down");
    act("chores.open");
    await settle();
    act("chores.open");
    expect(opened).toEqual(["session-r-50"]);
    act("chores.down");
    act("chores.down");
    act("chores.down");
    act("chores.thread");
    expect(notice(container)).toBe("That run opened no thread.");
    act("chores.back");
    expect(cursorName(container)).toBe("Morning triage");
  });

  it("teaches the first run when a chore has none yet", async () => {
    const { container, act } = await mounted(reading({ runs: {} }));
    act("chores.down");
    act("chores.open");
    await settle();
    expect(empty(container)).toBe("No runs yet · run it now with r");
  });
});

describe("the chores pane, verbs", () => {
  it("runs now, stops a run, and switches the schedule through the routes", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.run");
    await settle();
    expect(notice(container)).toBe("Morning triage · running");
    act("chores.down");
    act("chores.cancel");
    await settle();
    expect(notice(container)).toBe(
      "Docs index · stop requested. Stopping does not undo what already ran.",
    );
    act("chores.down");
    act("chores.down");
    act("chores.toggle");
    await settle();
    expect(notice(container)).toBe("Storehouse tidy is on.");
    act("chores.up");
    act("chores.toggle");
    await settle();
    expect(notice(container)).toBe(
      "Nightly tests is off. A run in progress keeps going; c stops it.",
    );
    expect(recorded.writes).toEqual([
      "run wren/morning-triage",
      "cancel wren/docs-index",
      "put wren/storehouse-tidy",
      "put wren/nightly-tests",
    ]);
    expect(recorded.puts.map((file) => file.enabled)).toEqual([true, false]);
  });

  it("cancels a creature's waiting wakeup on c: a one-shot goes, a paced one turns off", async () => {
    const waiting = {
      enabled: true,
      disabled: null,
      nextRunAt: "2026-11-06T16:23:04.496Z",
      consecutiveErrors: 0,
      retryAt: null,
    };
    const once = choreRow(
      choreFile({
        id: "wake-mw55yisw",
        title: "Wake: Check notes/largest.md",
        trigger: { kind: "at", at: "2026-11-06T16:23:04.496Z" },
        wake: { requestedAt: "2026-11-06T16:03:04.496Z" },
      }),
      { schedule: waiting },
    );
    const paced = choreRow(
      choreFile({
        id: "wake-paced",
        title: "Wake: Look again",
        trigger: { kind: "interval", minutes: 30, until: "2026-11-13T16:03:04.496Z" },
        wake: { requestedAt: "2026-11-06T16:03:04.496Z" },
      }),
      { schedule: waiting },
    );
    const served = reading({ chores: { wren: [once, paced], tam: [] } });
    const { container, act, recorded } = await mounted(served, {
      answers: {
        remove: (creature, id) => {
          served.chores[creature] = [paced];
          return { ok: true, value: id === once.id ? once : paced };
        },
      },
    });
    act("chores.down");
    expect(cursorName(container)).toBe("Wake: Check notes/largest.md");
    act("chores.cancel");
    await settle();
    expect(notice(container)).toBe(
      "Wake: Check notes/largest.md · wakeup cancelled. It will not run.",
    );
    expect(rows(container).some((row) => row.includes("Check notes/largest.md"))).toBe(false);

    while (cursorName(container) !== "Wake: Look again") act("chores.down");
    act("chores.cancel");
    await settle();
    expect(notice(container)).toBe(
      "Wake: Look again · wakeups cancelled. The schedule is off; t turns it back on.",
    );
    expect(recorded.writes).toEqual(["remove wren/wake-mw55yisw", "put wren/wake-paced"]);
    expect(recorded.puts.map((file) => [file.id, file.enabled, file.wake])).toEqual([
      ["wake-paced", false, { requestedAt: "2026-11-06T16:03:04.496Z" }],
    ]);
  });

  it("stops a wakeup's run in progress on c rather than cancelling the wakeup", async () => {
    const running = choreRow(
      choreFile({
        id: "wake-running",
        title: "Wake: Running now",
        trigger: { kind: "at", at: "2026-11-06T16:23:04.496Z" },
        wake: { requestedAt: "2026-11-06T16:03:04.496Z" },
      }),
      { activeRunId: "r-90" },
    );
    const { act, recorded } = await mounted(reading({ chores: { wren: [running], tam: [] } }));
    act("chores.down");
    act("chores.cancel");
    await settle();
    expect(recorded.writes).toEqual(["cancel wren/wake-running"]);
  });

  it("says a blocked or skipped run by hand in the outcome words", async () => {
    const blocked = runRow({
      runId: "r-61",
      routineId: "nightly-tests",
      trigger: "manual",
      firedAt: "2026-11-05T15:00:00.000Z",
      process: "blocked",
      delivery: "none",
      reason: "the act grants are not accepted; read and accept them first",
      cost: null,
    });
    const { container, act } = await mounted(reading(), {
      answers: { run: () => ({ ok: true, value: blocked }) },
    });
    act("chores.down");
    act("chores.down");
    act("chores.down");
    act("chores.run");
    await settle();
    expect(notice(container)).toBe(
      "Nightly tests · blocked: the act grants are not accepted; read and accept them first",
    );
  });

  it("removes a chore only after the confirm keystroke", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.remove");
    const ask = container.querySelector("[data-tone='ask']") as HTMLElement;
    expect(ask.textContent).toBe(
      "remove Morning triage? Its file and schedule go; its runs stay in the journal · y confirms · any other key cancels",
    );
    fireEvent.keyDown(ask, { key: "n" });
    expect(recorded.writes).toEqual([]);
    act("chores.remove");
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(recorded.writes).toEqual(["remove wren/morning-triage"]);
    expect(notice(container)).toBe("Morning triage removed. A run in progress was not stopped.");
  });

  it("applies routine.finished to the open runs list even while the node still lists the run as running", async () => {
    const stale = reading();
    const running = runRow({
      runId: "r-62",
      firedAt: "2026-11-05T15:00:00.000Z",
      status: "running",
      process: null,
      delivery: null,
    });
    stale.chores.wren = [{ ...morningTriage, activeRunId: "r-62" }];
    stale.runs["wren/morning-triage"] = [running];
    const { container, act, feed } = await mounted(stale);
    act("chores.down");
    act("chores.open");
    await settle();
    expect(runTable(container)[1]?.slice(1, 4)).toEqual(["running", "running", "pending"]);
    const ended = runRow({
      runId: "r-62",
      firedAt: "2026-11-05T15:00:00.000Z",
      endedAt: "2026-11-05T15:00:41.000Z",
      trigger: "manual",
    });
    feed.emit("routine.finished", { run: ended, disabled: null });
    await settle();
    expect(runTable(container)[1]?.slice(1, 4)).toEqual(["delivered", "completed", "delivered"]);
    expect(runTable(container)).toHaveLength(2);
  });

  it("finishes the open run when routine.finished arrives in the same burst as creature.changed", async () => {
    const changing = reading();
    const running = runRow({
      runId: "r-62",
      firedAt: "2026-11-05T15:00:00.000Z",
      status: "running",
      process: null,
      delivery: null,
    });
    changing.chores.wren = [{ ...morningTriage, activeRunId: "r-62" }];
    changing.runs["wren/morning-triage"] = [running];
    const { container, act, feed } = await mounted(changing);
    act("chores.down");
    act("chores.open");
    await settle();
    expect(runTable(container)[1]?.slice(1, 3)).toEqual(["running", "running"]);
    const ended = runRow({
      runId: "r-62",
      firedAt: "2026-11-05T15:00:00.000Z",
      endedAt: "2026-11-05T15:00:41.000Z",
      trigger: "manual",
    });
    changing.chores.wren = [{ ...morningTriage, activeRunId: null, lastRun: ended }];
    changing.runs["wren/morning-triage"] = [ended];
    feed.emitTogether([
      ["creature.changed", { slug: "wren", change: "updated" }],
      ["routine.finished", { run: ended, disabled: null }],
    ]);
    await settle();
    expect(runTable(container)[1]?.slice(1, 3)).toEqual(["delivered", "completed"]);
  });

  it("reads the open runs again whenever it reads everything again", async () => {
    const changing = reading();
    const running = runRow({
      runId: "r-62",
      firedAt: "2026-11-05T15:00:00.000Z",
      status: "running",
      process: null,
      delivery: null,
    });
    changing.runs["wren/morning-triage"] = [running];
    const { container, act, feed } = await mounted(changing);
    act("chores.down");
    act("chores.open");
    await settle();
    expect(runTable(container)[1]?.[1]).toBe("running");
    changing.runs["wren/morning-triage"] = [
      runRow({
        runId: "r-62",
        firedAt: "2026-11-05T15:00:00.000Z",
        endedAt: "2026-11-05T15:00:41.000Z",
        trigger: "manual",
      }),
    ];
    feed.emit("creature.changed", { slug: "tam", change: "updated" });
    await settle();
    expect(runTable(container)[1]?.[1]).toBe("delivered");
  });

  it("names a write chore parked on its grants as needing you from the wire item alone, in the head and on its row, until routine.needs clears it", async () => {
    const parked = runRow({
      runId: "r-70",
      firedAt: "2026-11-06T06:35:25.000Z",
      routineId: "stamp-note",
      trigger: "manual",
      status: "parked",
      process: null,
      delivery: null,
      reason:
        "this chore asks for write tools (grant set c972c8df8a92d543); it waits until the keeper accepts that grant set",
    });
    const stampNote = choreRow(
      choreFile({
        id: "stamp-note",
        title: "Stamp note",
        trigger: { kind: "manual" },
        tools: "write",
        grants: [{ action: "write", resource: "notes/stamp.md" }],
      }),
      { lastRun: parked, activeRunId: "r-70" },
    );
    const quiet = await mounted(reading({ chores: { wren: [stampNote], tam: [] } }));
    expect(head(quiet.container)).not.toContain("needs you");
    expect(quiet.container.querySelector(".kw-chores-needs-you")).toBeNull();
    cleanup();

    const held = heldChoreNeed();
    const { container, feed } = await mounted(
      reading({ chores: { wren: [stampNote], tam: [] }, needs: [held] }),
    );
    expect(head(container)).toContain("1 needs you");
    expect(head(container)).not.toContain("running");
    expect(rows(container)).toContain("▓ Stamp note needs you");
    expect(container.querySelector(".kw-chores-needs-you")?.textContent).toBe(
      "Its run is parked until you accept its grants: read and accept them with a, and the run proceeds.",
    );
    feed.emit("routine.needs", { creature: "wren", routineId: "stamp-note", items: [] });
    await settle();
    expect(head(container)).not.toContain("needs you");
    expect(container.querySelector(".kw-chores-needs-you")).toBeNull();
    feed.emit("routine.needs", { creature: "wren", routineId: "stamp-note", items: [held] });
    await settle();
    expect(head(container)).toContain("1 needs you");
  });

  it("re-reads the chores on routine.fired, routine.finished, creature.changed and a reconnect", async () => {
    const changing = reading();
    const harness = await mounted(changing);
    const { container, act, feed } = harness;
    act("chores.down");
    act("chores.open");
    await settle();
    changing.chores.wren = [{ ...morningTriage, activeRunId: "r-62" }];
    changing.runs["wren/morning-triage"] = [
      runRow({
        runId: "r-62",
        firedAt: "2026-11-05T15:00:00.000Z",
        status: "running",
        process: null,
        delivery: null,
      }),
    ];
    feed.emit("routine.fired", { creature: "wren", routineId: "morning-triage", runId: "r-62" });
    await settle();
    expect(runTable(container)[1]?.slice(0, 5)).toEqual([
      "11-05 09:00",
      "running",
      "running",
      "pending",
      "unchecked",
    ]);
    expect(head(container)).toContain("running");
    changing.runs["wren/morning-triage"] = morningRuns;
    feed.emit("routine.finished", { run: morningRuns[0], disabled: null });
    await settle();
    expect(runTable(container)[1]?.[1]).toBe("delivered");
    act("chores.back");
    changing.creatures = [wren];
    feed.emit("creature.changed", { slug: "tam", change: "removed" });
    await settle();
    expect(rows(container)).toEqual(["▾ Wren 1 chore", "▓ Morning triage running"]);
    changing.creatures = [wren, tam];
    feed.connect();
    feed.connect();
    await settle();
    expect(rows(container)).toContain("▾ Tam 0 chores");
  });
});

describe("the chores pane, consent", () => {
  it("accepts exactly the grant set the keeper read, only after the confirm keystroke", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.down");
    act("chores.down");
    act("chores.accept");
    const card = container.querySelector(".kw-chores-accept") as HTMLElement;
    expect(blockLines(card)).toEqual([
      "Nightly tests asks for act with 1 grant:",
      "bash bun run verify",
      "grant set a1b2c3d4e5f60718 · accepting covers exactly these; anything outside them still asks",
      "accept this grant? · y confirms · any other key cancels",
    ]);
    fireEvent.keyDown(card.querySelector("[data-tone='ask']") as HTMLElement, { key: "Escape" });
    expect(recorded.writes).toEqual([]);
    act("chores.accept");
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(recorded.writes).toEqual(["accept wren/nightly-tests a1b2c3d4e5f60718"]);
    expect(notice(container)).toBe(
      "Accepted 1 grant for Nightly tests. Anything outside them still asks.",
    );
  });

  it("refuses to accept what is read-only or already accepted, and shows a stale digest plainly", async () => {
    const stale =
      "the grant set changed: it is now 0f0f0f0f0f0f0f0f; read it again before accepting";
    const harness = await mounted(reading(), { answers: { accept: () => refused(400, stale) } });
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.accept");
    expect(notice(container)).toBe("Morning triage is read-only: it has no grants to accept.");
    act("chores.down");
    act("chores.accept");
    expect(notice(container)).toBe(
      "Docs index's grants were accepted on 11-04 10:02. Changing them voids the acceptance.",
    );
    act("chores.down");
    act("chores.accept");
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(notice(container)).toBe(stale);
    expect(recorded.writes).toEqual(["accept wren/nightly-tests a1b2c3d4e5f60718"]);
  });

  it("grants nothing by running, switching, editing or saving: only the accept keystroke sends a digest", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.down");
    act("chores.down");
    act("chores.run");
    await settle();
    act("chores.toggle");
    await settle();
    act("chores.edit");
    submit(container);
    await settle();
    expect(recorded.writes).toEqual([
      "run wren/nightly-tests",
      "put wren/nightly-tests",
      "put wren/nightly-tests",
    ]);
    expect(recorded.puts.map((file) => file.grants)).toEqual([
      nightlyTests.routine?.grants,
      nightlyTests.routine?.grants,
    ]);
    expect(notice(container)).toBe(
      "Nightly tests saved. Saving accepts nothing: read and accept its act grants with a.",
    );
    expect(recorded.writes.some((call) => call.startsWith("accept"))).toBe(false);
  });
});

describe("the chores pane, the new-chore form", () => {
  it("writes the routine file shape through PUT for the creature at the cursor", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.new");
    expect(container.querySelector(".kw-chores-form .kw-chores-heading")?.textContent).toBe(
      "new chore for Wren",
    );
    type(container, "title", "Weekly digest");
    type(container, "instructions", "List the open work items.");
    choose(container, "every n minutes");
    type(container, "every (minutes)", "10080");
    choose(container, "a file");
    type(container, "file", "outputs/weekly.md");
    choose(container, "every run, at the digest");
    choose(container, "write");
    expect(container.querySelector(".kw-chores-consent")?.textContent).toBe(
      "Saving accepts nothing: once saved, you read and accept these with a.",
    );
    type(container, "grants", "write outputs/weekly.md\nbash git log --oneline");
    type(container, "budget (USD)", "0.25");
    type(container, "budget (minutes)", "5");
    submit(container);
    await settle();
    expect(recorded.writes).toEqual(["put wren/weekly-digest"]);
    expect(recorded.puts[0]).toEqual({
      id: "weekly-digest",
      title: "Weekly digest",
      instructions: "List the open work items.",
      trigger: { kind: "interval", minutes: 10080 },
      destination: { kind: "file", path: "outputs/weekly.md" },
      notify: "always",
      tools: "write",
      grants: [
        { action: "write", resource: "outputs/weekly.md" },
        { action: "bash", resource: "git log --oneline" },
      ],
      budget: { usd: 0.25, minutes: 5 },
      enabled: true,
    });
    expect(container.querySelector(".kw-chores-form")).toBeNull();
    expect(notice(container)).toBe(
      "Weekly digest saved. Saving accepts nothing: read and accept its write grants with a.",
    );
  });

  it("reads a cron in words as it is typed and writes the zone and the end date", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.new");
    type(container, "title", "Morning brief");
    type(container, "instructions", "Summarize the night.");
    type(container, "cron", "30 6 * * 1,3,5");
    expect(container.querySelector(".kw-chores-preview")?.textContent).toBe(
      "Mon, Wed and Fri at 06:30",
    );
    type(container, "until", "2027-03-31");
    submit(container);
    await settle();
    expect(recorded.puts[0]?.trigger).toEqual({
      kind: "cron",
      expr: "30 6 * * 1,3,5",
      tz: testZone,
      until: "2027-03-31",
    });
    expect(notice(container)).toBe("Morning brief added.");
  });

  it("keeps the form open with the problem, from the draft or from the node, and cancels on escape", async () => {
    const harness = await mounted(reading(), {
      answers: { put: () => refused(400, "trigger.tz: not an IANA time zone") },
    });
    const { container, act, recorded } = harness;
    act("chores.new");
    submit(container);
    expect(alert(container)).toBe("A chore needs a title.");
    type(container, "title", "Bad zone");
    type(container, "instructions", "Anything.");
    type(container, "time zone", "Mars/Olympus");
    submit(container);
    await settle();
    expect(alert(container)).toBe("trigger.tz: not an IANA time zone");
    act("chores.down");
    expect(container.querySelector(".kw-chores-form")).not.toBeNull();
    fireEvent.keyDown(container.querySelector(".kw-chores-form") as HTMLElement, { key: "Escape" });
    expect(container.querySelector(".kw-chores-form")).toBeNull();
    expect(recorded.writes).toEqual(["put wren/bad-zone"]);
  });

  it("edits a chore under its own id", async () => {
    const harness = await mounted(reading());
    const { container, act, recorded } = harness;
    act("chores.down");
    act("chores.edit");
    expect(field(container, "id").readOnly).toBe(true);
    type(container, "title", "Morning triage, short");
    fireEvent.keyDown(field(container, "title"), { key: "Enter", ctrlKey: true });
    await settle();
    expect(recorded.puts[0]).toEqual({
      ...morningTriage.routine,
      title: "Morning triage, short",
    });
  });
});

describe("the chores pane, registration", () => {
  it("binds its keys without colliding with any action the app already binds", () => {
    const local = Object.entries(choresPane.localActions ?? {});
    const summon = choresPane.summon;
    expect(summon?.command.name).toBe("chores");
    expect(
      () =>
        new Keymap({
          bindings: {
            ...Object.fromEntries(
              Object.entries(appActions).map(([name, action]) => [name, action.chords]),
            ),
            ...Object.fromEntries(local.map(([name, action]) => [name, action.chords])),
            [summon?.action ?? ""]: summon?.chords ?? "none",
          },
          scopes: {
            ...actionScopes,
            ...Object.fromEntries(local.map(([name]) => [name, "chores"])),
          },
        }),
    ).not.toThrow();
    for (const [name, action] of local) {
      expect(appActions[name]?.scope, name).toBe("chores");
      const claimants = Object.entries(appActions).flatMap(([other, held]) =>
        held.command !== undefined && held.command.name === action.command?.name ? [other] : [],
      );
      expect(claimants, name).toEqual(action.command === undefined ? [] : [name]);
    }
  });

  it("T7: names exactly one next action with exactly one bound chord", () => {
    const marked = { chord: (action: string) => `⟦${action}⟧`, leader: () => "⟦leader⟧" };
    const [state, next, ...extra] = choresPane.emptyState(marked).split(" · ");
    expect(extra).toEqual([]);
    expect(state).toBe("No chores");
    expect(next).toBe("add one with ⟦chores.new⟧");
    expect(choresPane.localActions?.["chores.new"]?.chords).toBe("n");
    expect(choresPane.spec.safeParse({ kind: "chores", creature: "wren" }).success).toBe(true);
    expect(choresPane.title({ kind: "chores", creature: "wren" }, {} as ShellSeams)).toBe(
      "chores · wren",
    );
  });
});

const keys = {
  chord: (action: string): string => {
    if (action === "onboarding.start") return "ctrl+k 1";
    const chords = choresPane.localActions?.[action]?.chords;
    return (Array.isArray(chords) ? chords[0] : chords) ?? `⟨${action}⟩`;
  },
  leader: () => "ctrl+k",
};

interface FakeFeed {
  readonly feed: ServerFeed;
  emit(type: string, payload: unknown): void;
  emitTogether(events: readonly (readonly [type: string, payload: unknown])[]): void;
  connect(): void;
}

function fakeFeed(): FakeFeed {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  const notices = new Set<(notice: StreamNotice) => void>();
  let id = 0;
  const feed: ServerFeed = {
    open: async () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSession: () => () => undefined,
    onNotice: (listener) => {
      notices.add(listener);
      return () => notices.delete(listener);
    },
    whenLost: () => () => undefined,
    close: () => undefined,
  };
  const envelopeOf = (type: string, payload: unknown): BusEnvelope => {
    id += 1;
    return { id, ts: "t", sessionId: "", type, payload } as unknown as BusEnvelope;
  };
  return {
    feed,
    emit: (type, payload) => {
      const envelope = envelopeOf(type, payload);
      for (const listener of listeners) listener([envelope]);
    },
    emitTogether: (events) => {
      const batch = events.map(([type, payload]) => envelopeOf(type, payload));
      for (const listener of listeners) listener(batch);
    },
    connect: () => {
      for (const listener of notices) listener({ kind: "connected" });
    },
  };
}

interface Mounted {
  readonly container: HTMLElement;
  readonly act: (action: string) => void;
  readonly opened: string[];
  readonly recorded: ReturnType<typeof recordingPort>;
  readonly feed: FakeFeed;
  readonly portsFor: readonly string[];
}

interface Mounting {
  readonly spec?: ChoresSpec | undefined;
  readonly answers?: Partial<ScriptedAnswers> | undefined;
  readonly shell?: (shell: ShellSeams) => ShellSeams;
}

async function mounted(served: ChoresReading, mounting: Mounting = {}): Promise<Mounted> {
  const spec = mounting.spec ?? { kind: "chores" };
  const recorded = recordingPort(served, mounting.answers);
  const feed = fakeFeed();
  const opened: string[] = [];
  const portsFor: string[] = [];
  const pane: PaneDefinition<ChoresSpec> = choresPaneWith({
    port: (shell): ChoresPort => {
      portsFor.push(shell.workspace);
      return recorded.port;
    },
    clock: { now: () => thursdayMorning, zone: () => testZone },
  });
  const plain = {
    store: {},
    keys,
    sessions: {
      openSession: (id: string) => void opened.push(id),
      newSession: async () => undefined,
      startSession: async () => undefined,
    },
    host: {} as HostPort,
    workspace: "C:/work",
    currentSession: () => undefined,
    focusedPane: () => undefined,
    rebind: () => undefined,
    unseen: () => false,
    client: {} as KeyworkClient,
    feed: feed.feed,
    trust: {} as TrustFlow,
    openPane: () => undefined,
  } as unknown as ShellSeams;
  const shell = mounting.shell?.(plain) ?? plain;
  let handle: (action: string) => void = () => undefined;
  const { container } = render(() => (
    <pane.component
      id="p1"
      spec={spec}
      focused
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  await settle();
  return { container, act: (action) => handle(action), opened, recorded, feed, portsFor };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function rows(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-row > .kw-ov-button")].map(textOfButton);
}

function textOfButton(button: Element): string {
  return [".kw-ov-mark", ".kw-ov-name", ".kw-ov-aside"]
    .map((part) => textOf(button.querySelector(part)))
    .filter((part) => part !== "")
    .join(" ");
}

function cursorName(container: HTMLElement): string {
  return textOf(container.querySelector(".kw-ov-row[data-cursor] .kw-ov-name"));
}

function subLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-ov-sub")].map(textOf);
}

function empty(container: HTMLElement): string {
  return textOf(container.querySelector(".kw-empty"));
}

function notice(container: HTMLElement): string {
  const lines = [...container.querySelectorAll(".kw-chores > .kw-ov-line")];
  return textOf(lines.at(-1));
}

function head(container: HTMLElement): string {
  return textOf(container.querySelector(".kw-ov-head"));
}

function settings(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-chores-settings p")].map(textOf);
}

function alert(container: HTMLElement): string {
  return textOf(container.querySelector(".kw-chores-form [role='alert']"));
}

function runTable(container: HTMLElement): string[][] {
  return [...container.querySelectorAll(".kw-chores-runs thead tr, .kw-chores-run")].map((row) =>
    [...row.children].map(textOf),
  );
}

function notes(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-chores-note")].map(textOf);
}

function blockLines(element: HTMLElement): string[] {
  return [...element.querySelectorAll(".kw-chores-heading, li, .kw-ov-sub, .kw-ov-line")].map(
    textOf,
  );
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  const found = container.querySelector(`[aria-label='${label}']`);
  if (found === null) throw new Error(`no field labelled ${label}`);
  return found as HTMLInputElement;
}

function type(container: HTMLElement, label: string, value: string): void {
  fireEvent.input(field(container, label), { target: { value } });
}

function choose(container: HTMLElement, words: string): void {
  const option = [...container.querySelectorAll(".kw-chores-choice label")].find(
    (label) => textOf(label) === words,
  );
  const input = option?.querySelector("input");
  if (input === null || input === undefined) throw new Error(`no choice reading ${words}`);
  fireEvent.click(input);
}

function submit(container: HTMLElement): void {
  fireEvent.submit(container.querySelector(".kw-chores-form") as HTMLFormElement);
}

function goldenText(container: HTMLElement): string {
  const blocks = container.querySelectorAll(
    [
      ".kw-ov-head",
      ".kw-ov-row > .kw-ov-button",
      ".kw-ov-sub",
      ".kw-empty",
      ".kw-chores-heading",
      ".kw-chores-facts",
      ".kw-chores-grants li",
      ".kw-chores-runs",
      ".kw-chores-settings p",
    ].join(", "),
  );
  return `${[...blocks].flatMap(goldenLines).join("\n")}\n`;
}

function goldenLines(block: Element): string[] {
  if (block.matches(".kw-ov-head")) return [[...block.children].map(textOf).join("  ")];
  if (block.matches(".kw-ov-button")) return [rowLine(block)];
  if (block.matches(".kw-chores-facts")) return factLines(block);
  if (block.matches(".kw-chores-runs")) return tableLines(block);
  if (block.matches(".kw-chores-grants li")) return [`    ${textOf(block)}`];
  const nested = block.closest("[data-indent]") !== null;
  return [`${nested ? "      " : "  "}${textOf(block)}`];
}

function rowLine(button: Element): string {
  const indent = button.closest("[data-indent]") === null ? "" : "  ";
  const mark = textOf(button.querySelector(".kw-ov-mark"));
  const name = textOf(button.querySelector(".kw-ov-name"));
  const aside = textOf(button.querySelector(".kw-ov-aside"));
  return `${indent}${mark} ${name.padEnd(24)} ${aside}`.trimEnd();
}

function factLines(list: Element): string[] {
  const terms = [...list.querySelectorAll("dt")];
  return terms.map((term) => `  ${textOf(term).padEnd(14)}${textOf(term.nextElementSibling)}`);
}

function tableLines(table: Element): string[] {
  const grid = [...table.querySelectorAll("tr")].map((row) => ({
    note: row.classList.contains("kw-chores-note"),
    cells: [...row.children].map(textOf),
  }));
  const widths = grid
    .filter((row) => !row.note)
    .reduce<number[]>(
      (most, row) => row.cells.map((cell, index) => Math.max(most[index] ?? 0, cell.length)),
      [],
    );
  return grid.map((row) =>
    row.note
      ? `        ${row.cells[0] ?? ""}`
      : `  ${row.cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}`.trimEnd(),
  );
}

describe("the chores pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(choresPane);
  });
});
