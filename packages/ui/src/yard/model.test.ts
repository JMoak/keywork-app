import { byDepth, type YardSetting } from "@keywork-app/habitat";
import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import { createYardModel } from "./model.ts";
import { createYardRuleBook } from "./rules.ts";
import { unseenSurroundings } from "./signals.ts";
import { aSetting, proposed, settled } from "./testing.ts";

describe("the yard model", () => {
  it("feeds the keeper's attention into the habitat world, where the kernel measures it", () => {
    const run = yardModel();
    run.emit([proposed(1, aSetting({ id: "diff", rung: "unfold" }))]);
    run.model.attend({ type: "keeper.attend", ts: at(1), id: "diff", kind: "interact" });
    expect(run.attentionOf("diff")?.interactions).toBe(1);
    run.dispose();
  });

  it("ignores attention to a panel the yard does not hold", () => {
    const run = yardModel();
    run.model.attend({ type: "keeper.attend", ts: at(1), id: "gone", kind: "enter" });
    expect(run.model.settings()).toEqual([]);
    run.dispose();
  });
});

describe("when the yard re-sorts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-sorts at a pin, the moment its settle arrives", () => {
    const run = yardModel();
    run.emit([proposed(1, elsewhere("diff", "diff")), proposed(2, elsewhere("note", "note"))]);
    expect(run.railOrder()).toEqual(["diff", "note"]);
    run.emit([settled(3, elsewhere("note", "note"), "pinned")]);
    expect(run.railOrder()).toEqual(["note", "diff"]);
    run.dispose();
  });

  it("re-sorts at the keeper's own attention, the moment the notice arrives", () => {
    const run = yardModel({ focusedThread: "s1" });
    run.emit([proposed(1, aSetting({ id: "panel", sessionId: "s1", rung: "unfold" }))]);
    const before = run.depthOf("panel");
    run.model.attend({ type: "keeper.attend", ts: at(0), id: "panel", kind: "interact" });
    expect(run.depthOf("panel")).toBeGreaterThan(before);
    run.dispose();
  });

  it("holds every depth through a wake, and re-sorts at the yard's next event", () => {
    vi.useFakeTimers({ now: Date.parse(at(0)) });
    const run = yardModel({ focusedThread: "s1", now: () => Date.now() });
    run.emit([
      proposed(1, aSetting({ id: "old-report", sessionId: "s1", what: report, at: hoursAgo(2) })),
      proposed(2, elsewhere("fresh-diff", "diff")),
      proposed(3, aSetting({ id: "delivery", sessionId: "s1", what: diff, rung: "unfold" })),
    ]);
    expect(run.railOrder()).toEqual(["fresh-diff", "old-report"]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(run.shownOf("delivery")).toBe("card");
    expect(run.railOrder()).toEqual(["delivery", "fresh-diff", "old-report"]);
    run.emit([proposed(4, elsewhere("later", "note"))]);
    expect(run.railOrder()).toEqual(["delivery", "old-report", "fresh-diff", "later"]);
    run.dispose();
  });
});

describe("a size the creature named", () => {
  it("reaches the yard with the setting and opens the panel at it", () => {
    const run = yardModel({ focusedThread: "s1" });
    run.emit([proposed(1, delivery({ size: "working" }))]);
    expect(settingOf(run.model.settings(), "delivery")).toMatchObject({
      shown: "unfold",
      size: "working",
    });
    run.dispose();
  });

  it("opens readable when a keeper's own opening names none", () => {
    const run = yardModel({ focusedThread: "s1" });
    run.emit([proposed(1, delivery({ origin: "keeper" }))]);
    expect(settingOf(run.model.settings(), "delivery")?.size).toBeUndefined();
    run.dispose();
  });
});

describe("the gate and the keeper's own words", () => {
  it("hears the keeper first when their words and a setting arrive in one batch", () => {
    const run = yardModel({ focusedThread: "s1" });
    const note = aSetting({
      id: "asked-for",
      sessionId: "s1",
      rung: "unfold",
      what: { kind: "note", ref: "the note the keeper asked for" },
    });
    run.emit([keeperSpoke(1, "s1", note.at), proposed(2, note)]);
    expect(run.shownOf("asked-for")).toBe("unfold");
    run.dispose();
  });
});

describe("a creature's withdrawal", () => {
  it("takes the setting off the yard through the ordinary settle, leaving no card behind", () => {
    const run = yardModel({ focusedThread: "s1" });
    run.emit([proposed(1, delivery())]);
    run.emit([withdrawnByItsOwner(2, delivery())]);
    expect(run.model.settings()).toEqual([]);
    expect(run.model.plots()).toEqual([]);
    expect(run.model.withdrawn("delivery")).toBe(true);
    run.dispose();
  });

  it("folds what grew from it into a card instead of orphaning it", () => {
    const run = yardModel({ focusedThread: "s1" });
    const opened = aSetting({
      id: "opened",
      sessionId: "s1",
      from: "delivery",
      origin: "keeper",
      rung: "unfold",
      what: { kind: "file", ref: "src/app.ts" },
    });
    run.emit([proposed(1, delivery()), proposed(2, opened)]);
    run.emit([withdrawnByItsOwner(3, delivery())]);
    expect(run.model.settings().map((setting) => setting.id)).toEqual(["opened"]);
    expect(run.model.plots().map((plot) => plot.id)).toEqual(["plot:delivery"]);
    run.dispose();
  });

  it("closes the keeper's visit when they leave the panel it took back", () => {
    const run = yardModel({ focusedThread: "s1" });
    run.emit([proposed(1, delivery())]);
    run.model.attend({ type: "keeper.attend", ts: at(1), id: "delivery", kind: "enter" });
    run.emit([withdrawnByItsOwner(2, delivery())]);
    expect(run.model.inside()).toBe("delivery");
    run.model.attend({ type: "keeper.attend", ts: at(2), id: "delivery", kind: "leave" });
    expect(run.model.inside()).toBeUndefined();
    run.dispose();
  });
});

const report = { kind: "report", ref: "the weekly report" } as const;
const diff = { kind: "diff", ref: "change-1" } as const;

function delivery(overrides: Partial<Setting> = {}): Setting {
  return aSetting({ id: "delivery", sessionId: "s1", what: diff, rung: "unfold", ...overrides });
}

function keeperSpoke(id: number, sessionId: string, ts: string): BusEnvelope {
  return { id, ts, sessionId, type: "turn.started", payload: { userText: "show me" } };
}

function withdrawnByItsOwner(id: number, setting: Setting): BusEnvelope {
  return {
    id,
    ts: setting.at,
    sessionId: setting.sessionId,
    type: "show.settled",
    payload: { id: setting.id, outcome: "withdrawn", by: "creature" },
  };
}

function elsewhere(id: string, kind: "diff" | "note"): Setting {
  return aSetting({ id, sessionId: "s2", what: { kind, ref: id } });
}

function hoursAgo(hours: number): string {
  return new Date(Date.parse(at(0)) - hours * 3_600_000).toISOString();
}

interface YardModelOptions {
  readonly focusedThread?: string | undefined;
  readonly now?: (() => number) | undefined;
}

function yardModel(options: YardModelOptions = {}) {
  const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
  const shell = {
    feed: {
      subscribe: (listener: (batch: readonly BusEnvelope[]) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    store: { state: { summaries: [] }, surfaces: { state: { bots: [] } } },
    client: { creatures: async () => [], settings: async () => [] },
  } as unknown as ShellSeams;
  return createRoot((dispose) => {
    const model = createYardModel({
      shell,
      home: () => undefined,
      focusedThread: () => options.focusedThread,
      windowFocused: () => true,
      reducedMotion: () => true,
      signals: () => ({
        ...unseenSurroundings,
        visible: true,
        draftOpen: false,
        streaming: false,
        railFocused: false,
        returnedAt: undefined,
        doNotDisturb: false,
        quietHours: false,
      }),
      rules: createYardRuleBook(undefined),
      now: options.now ?? (() => Date.parse(at(0))),
    });
    return {
      model,
      dispose,
      emit: (batch: readonly BusEnvelope[]) => {
        for (const listener of listeners) listener(batch);
      },
      attentionOf: (id: string) => settingOf(model.settings(), id)?.attention,
      depthOf: (id: string) => settingOf(model.settings(), id)?.depth ?? 0,
      shownOf: (id: string) => settingOf(model.settings(), id)?.shown,
      railOrder: () =>
        model
          .settings()
          .filter((setting) => setting.shown === "card")
          .toSorted(byDepth)
          .map((setting) => setting.id),
    };
  });
}

function settingOf(settings: readonly YardSetting[], id: string): YardSetting | undefined {
  return settings.find((setting) => setting.id === id);
}

function at(second: number): string {
  return new Date(Date.UTC(2026, 10, 8, 9, 0, second)).toISOString();
}
