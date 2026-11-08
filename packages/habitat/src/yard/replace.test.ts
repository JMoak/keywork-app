import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { decisionLogLimit } from "../creature/gate.ts";
import { project, projectAll } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import { ruleFromHand } from "./gate.ts";
import { moveByHand, withYardStep } from "./step.ts";
import { aSetting, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import { thingOf, type YardContext, type YardRule, yardOf } from "./types.ts";

const notes = (id: string, at = noon): Setting =>
  aSetting({ id, at: isoAt(at), what: { kind: "file", ref: "notes.md" } });

const lowered: YardRule = {
  creature: "bea",
  kind: "file",
  rung: "lantern",
  lasts: "while-present",
};
const present: YardContext = { ...calm, rules: [lowered] };
const away: YardContext = { ...present, visible: false };

function replaced(state: HabitatState, by: "creature" | "keeper" | "time", next: Setting) {
  const at = next.at;
  const outcome = by === "keeper" ? "seen" : "withdrawn";
  return projectAll(state, [settled(90, at, "s1", { id: "a", outcome, by }), proposed(91, next)]);
}

function shownOf(state: HabitatState, id: string): string | undefined {
  return yardOf(state).settings[id]?.shown;
}

const shaped = withYardStep(project(emptyHabitat(), proposed(1, notes("a"))), present, noon);

describe("a keeper's while-present rule and the replacement of the same thing", () => {
  it("marks a setting the keeper's rule shaped", () => {
    expect(yardOf(shaped).settings.a).toMatchObject({ shown: "lantern", ruled: true });
  });

  it("carries the rule to the replacement even while the keeper is away", () => {
    const later = replaced(shaped, "creature", notes("b", noon + minute));
    const stepped = withYardStep(later, away, noon + minute);
    expect(shownOf(stepped, "b")).toBe("lantern");
    expect(yardOf(stepped).decisions.at(-1)).toMatchObject({ id: "b", reason: "your rule" });
    expect(yardOf(later).ruledThings).toEqual([]);
    const other = project(
      stepped,
      proposed(
        92,
        aSetting({ id: "c", at: isoAt(noon + minute), what: { kind: "file", ref: "x" } }),
      ),
    );
    expect(shownOf(withYardStep(other, away, noon + minute), "c")).toBe("card");
  });

  it("keeps carrying it across every later replacement", () => {
    const once = withYardStep(replaced(shaped, "creature", notes("b", noon + minute)), away, noon);
    const twice = projectAll(once, [
      settled(95, isoAt(noon + 2 * minute), "s1", {
        id: "b",
        outcome: "withdrawn",
        by: "creature",
      }),
      proposed(96, notes("c", noon + 2 * minute)),
    ]);
    expect(shownOf(withYardStep(twice, away, noon + 2 * minute), "c")).toBe("lantern");
  });

  it("carries a rung the keeper chose by hand, with the rule the console records for it", () => {
    const unruled = withYardStep(project(emptyHabitat(), proposed(1, notes("a"))), calm, noon);
    const byHand = moveByHand(yardOf(unruled), "a", "lantern", noon + second);
    expect(byHand.settings.a).toMatchObject({ shown: "lantern", ruled: true });
    const handRule = ruleFromHand(notes("a"), "lantern");
    const later = replaced({ ...unruled, yard: byHand }, "creature", notes("b", noon + minute));
    const stepped = withYardStep(later, { ...away, rules: [handRule] }, noon + minute);
    expect(shownOf(stepped, "b")).toBe("lantern");
  });

  it("forgets the thing when the keeper or the clock settles it", () => {
    for (const by of ["keeper", "time"] as const) {
      const later = replaced(shaped, by, notes("b", noon + minute));
      expect(yardOf(later).ruledThings ?? []).toEqual([]);
      expect(shownOf(withYardStep(later, away, noon + minute), "b")).toBe("card");
    }
  });

  it("carries nothing for a setting no rule shaped", () => {
    const plain = withYardStep(project(emptyHabitat(), proposed(1, notes("a"))), calm, noon);
    const later = replaced(plain, "creature", notes("b", noon + minute));
    expect(yardOf(later).ruledThings).toBeUndefined();
    expect(shownOf(withYardStep(later, away, noon + minute), "b")).toBe("card");
  });

  it("remembers no more things than the decision log keeps", () => {
    const things = Array.from({ length: decisionLogLimit + 4 }, (_, index) =>
      aSetting({ id: `t${index}`, what: { kind: "file", ref: `f${index}` } }),
    );
    const out = withYardStep(
      projectAll(
        emptyHabitat(),
        things.map((setting, index) => proposed(index + 1, setting)),
      ),
      present,
      noon,
    );
    const withdrawals: BusEnvelope[] = things.map((setting, index) =>
      settled(100 + index, isoAt(noon + minute), "s1", {
        id: setting.id,
        outcome: "withdrawn",
        by: "creature",
      }),
    );
    const kept = yardOf(projectAll(out, withdrawals)).ruledThings ?? [];
    expect(kept).toHaveLength(decisionLogLimit);
    expect(kept.at(-1)).toBe(thingOf(things.at(-1) ?? notes("z")));
  });

  it("keeps a setting's slot and mark when its proposal is replayed", () => {
    const unfolded = {
      ...shaped,
      yard: moveByHand(yardOf(shaped), "a", "unfold", noon + second),
    };
    const replayed = project(unfolded, proposed(1, notes("a")));
    expect(yardOf(replayed).settings.a).toMatchObject({
      shown: "unfold",
      ruled: true,
      unfolded: { slot: 0, byHand: true },
    });
  });
});
