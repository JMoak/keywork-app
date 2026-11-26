import { describe, expect, it } from "vitest";
import { neonKit } from "../kits/index.ts";
import { type Cell, cellKey } from "../model.ts";
import { blockScene } from "../scene.ts";
import { noon, sketchTown } from "../testing.ts";
import {
  type LandMemory,
  landMemoryAfter,
  landsOf,
  type MachineCensus,
  type MachineReading,
  noLands,
} from "./lands.ts";
import { fadedFog, type MapScene, mapScene } from "./scene.ts";

describe("the map of the keeper's machines", () => {
  it("draws each machine as its land with its lane and fade, and a machine that appears later moves none", () => {
    const first: MachineCensus = {
      self: machine("home", "moak-main", "unknown", { version: "1.40" }),
      peers: [
        machine("studio", "studio", "direct", { version: "1.40" }),
        machine("nas", "nas", "derp"),
        machine("laptop", "old-laptop", "peer-relay", { version: "1.39" }),
        { ...machine("pi", "pi", "unknown"), online: false },
      ],
    };
    const memory = landMemoryAfter(noLands, first);
    const drawn = mapOf(first, memory);

    expect(seen(drawn)).toEqual({
      "moak-main": { stands: ["town"], lane: [], faded: false },
      studio: { stands: ["hall"], lane: ["plank"], faded: false },
      nas: { stands: ["signpost"], lane: ["stones"], faded: false },
      "old-laptop": { stands: ["hall"], lane: ["stones"], faded: false },
      pi: { stands: ["signpost"], lane: [], faded: true },
    });

    const later: MachineCensus = {
      ...first,
      peers: [
        machine("aardvark", "aardvark", "direct"),
        ...first.peers.map((peer) =>
          peer.stableId === "studio" ? { ...peer, online: false, node: null } : peer,
        ),
      ],
    };
    const remembered = landMemoryAfter(memory, later);
    const redrawn = mapOf(later, remembered);

    expect(remembered.order).toEqual([...memory.order, "aardvark"]);
    for (const id of memory.order) expect(cellsOf(redrawn, id)).toEqual(cellsOf(drawn, id));
    expect(cellsOf(redrawn, "aardvark")).not.toEqual([]);
    expect(seen(redrawn).studio).toEqual({ stands: ["hall"], lane: [], faded: true });
    expect(seen(redrawn).aardvark).toEqual({ stands: ["signpost"], lane: ["plank"], faded: false });
  });
});

function machine(
  id: string,
  name: string,
  path: "direct" | "derp" | "peer-relay" | "unknown",
  node: { readonly version: string } | null = null,
): MachineReading {
  return {
    stableId: id,
    machine: name,
    os: "linux",
    online: true,
    path: { kind: path, relay: "r1", region: "ord" },
    node,
  };
}

function mapOf(census: MachineCensus, memory: LandMemory): MapScene {
  const town = blockScene(sketchTown(2, noon), { kit: neonKit, appearance: "night", now: noon });
  return mapScene({
    kit: neonKit,
    appearance: "night",
    town: town.world,
    lands: landsOf(census, memory),
  });
}

interface Seen {
  readonly stands: string[];
  readonly lane: string[];
  readonly faded: boolean;
}

function seen(scene: MapScene): Record<string, Seen> {
  return Object.fromEntries(
    scene.lands.map((land) => {
      const cells = ownedBy(scene, land.id);
      const ground = cells.filter((cell) => cell.land);
      const stands =
        land.kind === "home"
          ? ["town"]
          : ground.flatMap((cell) => cell.items.map((item) => item.what));
      const lane = cells
        .filter((cell) => !cell.land)
        .flatMap((cell) => cell.items.map((item) => item.what));
      return [
        land.name ?? land.id,
        { stands, lane, faded: ground.some((cell) => cell.fog === fadedFog) },
      ];
    }),
  );
}

function ownedBy(scene: MapScene, id: string): Cell[] {
  return scene.world.cells.filter((cell) => scene.owners.get(cellKey(cell)) === id);
}

function cellsOf(scene: MapScene, id: string): string[] {
  return ownedBy(scene, id)
    .filter((cell) => cell.land)
    .map((cell) => cellKey(cell))
    .sort();
}
