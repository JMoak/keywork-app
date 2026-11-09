import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  type AttendNotice,
  createAttentionReports,
  interactEveryMs,
  watchInteractions,
} from "./attention.ts";

describe("attention reports", () => {
  it("reports entering and leaving the panel that holds the keyboard", () => {
    const run = reporting();
    run.focus("diff");
    run.focus("file");
    run.focus(undefined);
    expect(run.kinds()).toEqual(["enter diff", "leave diff", "enter file", "leave file"]);
    run.dispose();
  });

  it("reports focus exactly, leaving the console's own absence to the kernel", () => {
    const run = reporting();
    run.focus("diff");
    run.focus("diff");
    expect(run.kinds()).toEqual(["enter diff"]);
    run.dispose();
  });

  it("stamps each notice with the clock it was reported at", () => {
    const run = reporting();
    run.at(Date.UTC(2026, 10, 8, 9, 0, 5));
    run.focus("diff");
    expect(run.notices).toEqual([
      { type: "keeper.attend", ts: "2026-11-08T09:00:05.000Z", id: "diff", kind: "enter" },
    ]);
    run.dispose();
  });

  it("reports one interaction per panel every two seconds, each panel on its own clock", () => {
    const run = reporting();
    run.interact("diff");
    run.interact("file");
    run.later(interactEveryMs - 1);
    run.interact("diff");
    run.later(1);
    run.interact("diff");
    expect(run.kinds()).toEqual(["interact diff", "interact file", "interact diff"]);
    run.dispose();
  });

  it("never reports two interactions closer than two seconds, and never drops one that is due", () => {
    for (const gaps of sequences([0, 1, 1_999, 2_000, 4_500], 6)) {
      const run = reporting();
      const reported: number[] = [];
      for (const gap of gaps) {
        run.later(gap);
        const before = run.notices.length;
        run.interact("diff");
        const last = reported.at(-1);
        if (run.notices.length > before) reported.push(run.clock());
        else expect(last !== undefined && run.clock() - last < interactEveryMs).toBe(true);
      }
      for (const [index, at] of reported.entries()) {
        if (index > 0)
          expect(at - (reported[index - 1] ?? 0)).toBeGreaterThanOrEqual(interactEveryMs);
      }
      run.dispose();
    }
  });
});

describe("watching a panel for interactions", () => {
  it("hears a scroll, an edit and a keypress anywhere inside, and stops when released", () => {
    const panel = document.createElement("div");
    const inner = document.createElement("textarea");
    panel.append(inner);
    document.body.append(panel);
    const heard: string[] = [];
    const release = watchInteractions(panel, () => heard.push("heard"));
    inner.dispatchEvent(new Event("scroll"));
    inner.dispatchEvent(new Event("input", { bubbles: true }));
    inner.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    inner.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    release();
    inner.dispatchEvent(new Event("input", { bubbles: true }));
    expect(heard).toHaveLength(3);
    panel.remove();
  });
});

function reporting() {
  const notices: AttendNotice[] = [];
  let clock = Date.UTC(2026, 10, 8, 9, 0);
  return createRoot((dispose) => {
    const [panel, setPanel] = createSignal<string>();
    const reports = createAttentionReports({
      panel,
      now: () => clock,
      attend: (notice) => notices.push(notice),
    });
    return {
      notices,
      dispose,
      focus: (id: string | undefined) => setPanel(id),
      interact: (id: string) => reports.interacted(id),
      at: (ms: number) => {
        clock = ms;
      },
      later: (ms: number) => {
        clock += ms;
      },
      clock: () => clock,
      kinds: () => notices.map((notice) => `${notice.kind} ${notice.id}`),
    };
  });
}

function sequences<T>(alphabet: readonly T[], length: number): T[][] {
  if (length === 0) return [[]];
  return sequences(alphabet, length - 1).flatMap((held) => alphabet.map((next) => [...held, next]));
}
