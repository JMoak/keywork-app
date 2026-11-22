import { describe, expect, it } from "vitest";
import {
  type Construction,
  type GroundSpec,
  type ProjectSpec,
  projectStages,
  type RoadGrade,
  type WorkshopSpec,
} from "./kit.ts";
import { decoKit, kits } from "./kits/index.ts";
import { type Part, topTexel } from "./model.ts";
import { wallsAround } from "./scene.ts";

const plainWorkshop: WorkshopSpec = {
  seed: 3,
  order: 2,
  walls: wallsAround("pz"),
  door: "pz",
  storeys: 2,
  lit: false,
  loft: false,
  delivered: 0,
  chores: 0,
  notes: 0,
  gates: 0,
  ivy: 0,
  boarded: false,
  night: true,
  garland: false,
  banner: 0,
  star: false,
};

const noChildAtWork = new Set(["neon", "terrace"]);

describe("what every architecture supplies", () => {
  for (const kit of kits) {
    it(`${kit.id}: shows a creature at work in its windows, at its door and above its roof`, () => {
      const working = kit.workshop({ ...plainWorkshop, lit: true });
      expect(fingerprint(working)).not.toBe(fingerprint(kit.workshop(plainWorkshop)));
      expect(rolesOf(working)).toContain(working.lightColour);
    });

    it(`${kit.id}: paints the workshop in its creature's colour, kept, chores and earnings each in their own place`, () => {
      const plain = fingerprint(kit.workshop(plainWorkshop));
      expect(rolesOf(kit.workshop(plainWorkshop)).some((role) => role.startsWith("hue."))).toBe(
        true,
      );
      for (const change of [
        { storeys: 3 },
        { delivered: 6 },
        { chores: 3 },
        { garland: true },
        { banner: 2 as const },
        { star: true },
        { gates: 2 },
        { boarded: true },
      ] satisfies Partial<WorkshopSpec>[]) {
        expect(
          fingerprint(kit.workshop({ ...plainWorkshop, ...change })),
          JSON.stringify(change),
        ).not.toBe(plain);
      }
    });

    it(`${kit.id}: lights a child at work${noChildAtWork.has(kit.id) ? ", a gap the sheet names" : ""}`, () => {
      const child = fingerprint(kit.workshop({ ...plainWorkshop, loft: true }));
      const none = fingerprint(kit.workshop(plainWorkshop));
      if (noChildAtWork.has(kit.id)) expect(child).toBe(none);
      else expect(child).not.toBe(none);
    });

    it(`${kit.id}: grades its roads, lights a paved one, rings the bell and turns the sails`, () => {
      const grounds = ([0, 1, 2, 3] as const).map((grade) =>
        fingerprint(kit.ground(groundWith(grade))),
      );
      expect(new Set(grounds).size).toBe(4);
      expect(spritesOf(kit.prop({ kind: "road-lamp", lit: true })).length).toBe(1);
      expect(fingerprint(kit.house(house(true)))).not.toBe(fingerprint(kit.house(house(false))));
      const still = kit.mill({ turning: "still", busy: false });
      const quick = kit.mill({ turning: "quick", busy: true });
      expect(Math.max(...spritesOf(quick).map((sprite) => sprite.sequence.length))).toBeGreaterThan(
        Math.max(...spritesOf(still).map((sprite) => sprite.sequence.length)),
      );
    });

    it(`${kit.id}: builds six project stages, each taller than the last, lit floors when in use`, () => {
      const reaches = projectStages.map((stage) => kit.project(project(stage, true)).reach);
      expect(reaches.slice(1)).toEqual([...reaches.slice(1)].sort((a, b) => a - b));
      expect(new Set(reaches.slice(1)).size).toBe(5);
      for (const stage of projectStages) {
        const lit = kit.project(project(stage, true));
        if (stage !== "shack" || kit.id === "deco") {
          expect(fingerprint(lit), stage).not.toBe(fingerprint(kit.project(project(stage, false))));
        }
        expectTexturesFit([
          ...lit.parts,
          ...(lit.crown ?? []).map((crowned) => crowned.part),
          ...(lit.annexes ?? []).flatMap((annex) => annex.parts),
        ]);
      }
    });
  }

  it("deco: carries the creature's colour on the door fan, the blade sign, the sunburst and the pennant, and smoke from its crown", () => {
    const built = decoKit.workshop({ ...plainWorkshop, lit: true });
    expect(spritesOf(built).length).toBe(spritesOf(decoKit.workshop(plainWorkshop)).length + 1);
    expect(built.annexes?.map((annex) => annex.what)).toEqual(["blade"]);
    expect(rolesOf({ parts: built.annexes?.[0]?.parts ?? [], reach: 0 })).toEqual(
      expect.arrayContaining(["trim", "hue.b", "hue.h"]),
    );
    const crown = { parts: (built.crown ?? []).map((crowned) => crowned.part), reach: 0 };
    expect(rolesOf(crown)).toEqual(expect.arrayContaining(["hue.l", "hue.b", "trim"]));
  });

  it("deco: lays a brass inlay into paved roads only, and builds each stage with a cornice at each setback", () => {
    expect(rolesOf(decoKit.ground(groundWith(3)))).toContain("cobbleInlay");
    expect(rolesOf(decoKit.ground(groundWith(2)))).not.toContain("cobbleInlay");
    const skyscraper = decoKit.project(project("skyscraper", true));
    const cornices = skyscraper.parts.filter(
      (part) => "box" in part && part.box.y1 - part.box.y0 === 4,
    );
    expect(cornices).toHaveLength(3);
  });
});

function project(stage: ProjectSpec["stage"], lit: boolean): ProjectSpec {
  return { stage, seed: 4, order: 5, lit };
}

function house(ringing: boolean) {
  return { lit: true, ringing, vane: true, tree: true, smoke: true, night: true };
}

function groundWith(grade: RoadGrade): GroundSpec {
  return {
    cx: 0,
    cz: 0,
    worn: undefined,
    roads: {
      north: 0,
      south: grade,
      west: 0,
      east: 0,
      northWest: 0,
      northEast: 0,
      southWest: grade,
      southEast: grade,
    },
    glow: [],
    night: true,
    pooled: true,
    shadow: 0.2,
  };
}

function partsOf(built: Construction): Part[] {
  return [
    ...built.parts,
    ...(built.crown ?? []).map((crowned) => crowned.part),
    ...(built.annexes ?? []).flatMap((annex) => annex.parts),
  ];
}

function fingerprint(built: Construction): string {
  return JSON.stringify(
    partsOf(built).map((part) =>
      "box" in part
        ? {
            ...part.box,
            faces: Object.fromEntries(
              Object.entries(part.box.faces).map(([face, paint]) => [
                face,
                "texture" in paint ? paint.texture.key : paint.fill,
              ]),
            ),
          }
        : { ...part.sprite, frames: part.sprite.frames.map((frame) => frame.key) },
    ),
  );
}

function rolesOf(built: Construction): string[] {
  return [
    ...new Set(
      partsOf(built).flatMap((part) =>
        "box" in part
          ? Object.values(part.box.faces).flatMap((paint) =>
              "texture" in paint ? paint.texture.roles : [paint.fill],
            )
          : part.sprite.frames.flatMap((frame) => frame.roles),
      ),
    ),
  ];
}

function spritesOf(built: Construction) {
  return partsOf(built).flatMap((part) => ("sprite" in part ? [part.sprite] : []));
}

function expectTexturesFit(parts: readonly Part[]): void {
  for (const part of parts) {
    if (!("box" in part)) continue;
    const { x0, x1, y0, y1, z0, z1, faces } = part.box;
    const sizes: Record<string, readonly [number, number]> = {
      pz: [x1 - x0, y1 - y0],
      nz: [x1 - x0, y1 - y0],
      px: [z1 - z0, y1 - y0],
      nx: [z1 - z0, y1 - y0],
      top: [(x1 - x0) / topTexel, (z1 - z0) / topTexel],
    };
    for (const [face, paint] of Object.entries(faces)) {
      if ("texture" in paint)
        expect([paint.texture.width, paint.texture.height], face).toEqual(sizes[face]);
    }
  }
}
