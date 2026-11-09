import fc from "fast-check";
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

  it("reports an interaction exactly when that panel's last report is two seconds old, so none is too close and none due is dropped", () => {
    fc.assert(
      fc.property(fc.array(pressArb, { maxLength: 24 }), (presses) => {
        const run = reporting();
        const lastReported = new Map<string, number>();
        for (const { panel, gap } of presses) {
          run.later(gap);
          const before = run.notices.length;
          run.interact(panel);
          const last = lastReported.get(panel);
          const due = last === undefined || run.clock() - last >= interactEveryMs;
          expect(run.kinds().slice(before)).toEqual(due ? [`interact ${panel}`] : []);
          if (due) lastReported.set(panel, run.clock());
        }
        run.dispose();
      }),
      { numRuns: 1_000 },
    );
  });
});

const gapArb = fc.oneof(
  fc.constantFrom(0, 1, interactEveryMs - 1, interactEveryMs),
  fc.integer({ min: 0, max: 3 * interactEveryMs }),
);

const pressArb = fc.record({ panel: fc.constantFrom("diff", "file"), gap: gapArb });

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
