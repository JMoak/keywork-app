import { emptyHabitat, type HabitatState, withCreatures } from "@keywork-app/habitat";
import { describe, expect, it, vi } from "vitest";
import { loadSkin } from "./habitat-render.ts";
import { coatOf, emptyHerd, gatherHerd } from "./herd.ts";

const at = "2026-11-17T12:00:00.000Z";
const now = Date.parse(at);

describe("a living herd's appearance", () => {
  it("keeps identity and pose history while refreshing name, coat, and skin", () => {
    const first = gatherHerd(emptyHerd, world("cairn"), now);
    const member = first.members[0];
    expect(member).toBeDefined();
    expect(gatherHerd(first, world("cairn"), now + 1000)).toBe(first);
    const renamed = gatherHerd(first, world("cairn", "Pebble", 97), now + 1000);
    expect(renamed.members[0]?.name).toBe("Pebble");
    expect(renamed.members[0]?.hueStop).toBe(coatOf({ seed: 97 }, 0));
    expect(renamed.members[0]?.creature).toBe(member?.creature);
    expect(renamed.members[0]?.render).toBe(member?.render);
    const changed = gatherHerd(renamed, world("tessera", "Pebble", 97), now + 2000);
    expect(changed.members[0]?.skin.id).toBe("tessera");
    expect(changed.members[0]?.creature.rows).toBe(changed.members[0]?.skin.rows);
    expect(changed.members[0]?.creature.body).toBe(member?.creature.body);
    expect(changed.members[0]?.creature.needs).toBe(member?.creature.needs);
    expect(changed.members[0]?.render).not.toBe(member?.render);
  });

  it("recovers from an unavailable design when the persisted skin changes", () => {
    const load = vi.fn((id: string) => (id === "cairn" ? unavailable(id) : loadSkin(id)));
    const refused = gatherHerd(emptyHerd, world("cairn"), now, load);
    expect(refused.members).toHaveLength(0);
    expect(refused.refused[0]?.id).toBe("cairn");
    expect(gatherHerd(refused, world("cairn"), now + 1, load)).toBe(refused);
    expect(load).toHaveBeenCalledTimes(1);
    const recovered = gatherHerd(refused, world("tessera"), now + 2, load);
    expect(recovered.refused).toHaveLength(0);
    expect(recovered.members[0]?.skin.id).toBe("tessera");
  });

  it("removes absent creatures and refuses changed invalid art without drawing the former skin", () => {
    const load = (id: string) => (id === "tessera" ? unavailable(id) : loadSkin(id));
    const first = gatherHerd(emptyHerd, world("cairn"), now, load);
    expect(gatherHerd(first, emptyHabitat(), now, load).members).toHaveLength(0);
    const changed = gatherHerd(first, world("tessera"), now, load);
    expect(changed.members).toHaveLength(0);
    expect(changed.refused.map((each) => each.slug)).toEqual(["stone"]);
    expect(gatherHerd(changed, emptyHabitat(), now, load).refused).toHaveLength(0);
  });
});

function unavailable(id: string) {
  return { ok: false as const, id, faults: ["its art did not load"] };
}

function world(skin: string, name = "Stone", seed = 3): HabitatState {
  return withCreatures(emptyHabitat(), [{ slug: "stone", name, skin, seed }], at);
}
