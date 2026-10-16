import { describe, expect, it } from "vitest";
import { factsWith, mcpServer } from "./facts.test.ts";
import {
  differenceNotice,
  type Fingerprint,
  factsBeyond,
  fingerprintOf,
  sameFingerprint,
} from "./fingerprint.ts";

const settled: Fingerprint = {
  version: "0.2.0",
  manifests: ["bun.lock", "package.json"],
  mcp: ["filesystem"],
  bots: ["reviewer"],
};

describe("the posture's fingerprint", () => {
  it("is the set of facts the posture was built from, sorted so order never reads as change", () => {
    const facts = factsWith({
      manifests: ["package.json", "bun.lock"],
      mcp: [mcpServer("playwright"), mcpServer("filesystem")],
      bots: ["scribe", "reviewer"],
    });
    expect(fingerprintOf(facts)).toEqual({
      version: "0.2.0",
      manifests: ["bun.lock", "package.json"],
      mcp: ["filesystem", "playwright"],
      bots: ["reviewer", "scribe"],
    });
  });

  it("carries a fact it could not read from the settled fingerprint, so a failed read is no change", () => {
    const facts = factsWith({ version: undefined, mcp: undefined, bots: undefined });
    expect(fingerprintOf(facts, settled)).toEqual(settled);
  });

  it("names only what was added, plus a new keywork version", () => {
    const current: Fingerprint = {
      version: "0.3.0",
      manifests: ["bun.lock", "Cargo.toml", "package.json"],
      mcp: ["playwright"],
      bots: ["reviewer"],
    };
    expect(factsBeyond(settled, current)).toEqual([
      { kind: "manifest", name: "Cargo.toml" },
      { kind: "mcp", name: "playwright" },
      { kind: "version", name: "0.3.0" },
    ]);
  });

  it("treats every fact as new when nothing was ever settled", () => {
    expect(factsBeyond(undefined, settled).map((fact) => fact.kind)).toEqual([
      "manifest",
      "manifest",
      "mcp",
      "bot",
      "version",
    ]);
  });

  it("compares fingerprints by their facts and never matches a missing one", () => {
    expect(sameFingerprint({ ...settled }, settled)).toBe(true);
    expect(sameFingerprint({ ...settled, bots: [] }, settled)).toBe(false);
    expect(sameFingerprint(undefined, settled)).toBe(false);
  });
});

describe("the one quiet notice", () => {
  it("names what is different and how many rules trust-setup proposes", () => {
    expect(differenceNotice([{ kind: "mcp", name: "playwright" }], 1, false)).toBe(
      "new mcp server: playwright · trust-setup proposes 1 rule",
    );
  });

  it("groups several differences by kind, plurals included, version last", () => {
    expect(
      differenceNotice(
        [
          { kind: "version", name: "0.3.0" },
          { kind: "manifest", name: "Cargo.toml" },
          { kind: "manifest", name: "go.mod" },
          { kind: "bot", name: "scribe" },
        ],
        9,
        false,
      ),
    ).toBe(
      "new manifests: Cargo.toml, go.mod · new bot: scribe · keywork now 0.3.0 · trust-setup proposes 9 rules",
    );
  });

  it("says plainly that a workspace was never set up instead of listing everything as new", () => {
    expect(differenceNotice([{ kind: "manifest", name: "package.json" }], 3, true)).toBe(
      "no trust setup for this workspace yet · trust-setup proposes 3 rules",
    );
  });
});
