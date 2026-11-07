import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asideOf,
  auditLine,
  chainWord,
  codeLine,
  emptyStateLine,
  expiryWord,
  gateLine,
  headLine,
  identityWord,
  laneWord,
  listenerWord,
  pairingWord,
  policyWord,
  sasWord,
  undeliveredLine,
  whenWord,
} from "./copy.ts";
import {
  at,
  auditRows,
  begunBuild,
  census,
  fixtureClock,
  fixtureNow,
  grantList,
  ids,
  mossGate,
  pairsReading,
  wrenGate,
} from "./fixtures.ts";
import { type ParcelRow, parcelRows, quietListener } from "./parcels.ts";

const rows = parcelRows({
  census,
  pairs: pairsReading,
  grants: grantList,
  audit: auditRows,
  attempts: [{ ...begunBuild, peer: ids.build }],
  now: fixtureNow,
});

const rowOf = (id: string): ParcelRow => rows.find((row) => row.id === id) as ParcelRow;

const context = {
  names: new Map(rows.map((row) => [row.id, row.machine])),
  selfId: ids.house,
  clock: fixtureClock,
};

describe("the parcels pane's words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/ui/src/panes/parcels/copy.ts"),
      "utf8",
    );
    const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
      ([, plain, template]) => plain ?? template ?? "",
    );
    expect(literals.length).toBeGreaterThan(30);
    for (const literal of literals) {
      expect(literal, literal).not.toMatch(/!/);
      expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("teaches from the empty state in two parts with the one chord in the action", () => {
    const [state, action, ...rest] = emptyStateLine("r").split(" · ");
    expect(state).toBe("No other parcels yet");
    expect(action).toBe("run the node on another tailnet machine, then look again with r");
    expect(rest).toEqual([]);
  });

  it("counts parcels, pairs, pairings and open gates in the head", () => {
    expect(headLine({ parcels: 1, paired: 0, pairing: 0, gates: 0 })).toBe("1 parcel");
    expect(headLine({ parcels: 5, paired: 1, pairing: 2, gates: 1 })).toBe(
      "5 parcels · 1 paired · 2 pairing · 1 gate open",
    );
  });

  it("names each lane and marks a relayed one with fog", () => {
    expect(rows.map((row) => laneWord(row.lane))).toEqual([
      "here",
      "░ DERP ord",
      "░ peer relay",
      "offline",
      "direct",
    ]);
    expect(laneWord({ kind: "unknown" })).toBe("lane unknown");
    expect(laneWord({ kind: "unlisted" })).toBe("not listed");
  });

  it("names each pairing state, a claim-code pair as a claimed host", () => {
    expect(rows.map((row) => pairingWord(row.pairing))).toEqual([
      "claimed",
      "pairing",
      "pairing",
      "no node",
      "claimed host",
    ]);
    const pair = pairsReading.pairs[0];
    if (pair === undefined) throw new Error("fixture pair");
    expect(pairingWord({ kind: "paired", pair: { ...pair, confirmedBy: "on-device" } })).toBe(
      "paired",
    );
    expect(pairingWord({ kind: "unpaired", claimed: false })).toBe("unpaired");
    expect(pairingWord({ kind: "unpaired", claimed: true })).toBe("claimed elsewhere");
    expect(pairingWord({ kind: "here", claim: undefined })).toBe("this machine");
    expect(pairingWord({ kind: "unlisted" })).toBe("not paired");
  });

  it("joins identity, lane and pairing into the row", () => {
    expect(rows.map((row) => [row.machine, identityWord(row), asideOf(row)])).toEqual([
      ["moak-main", "Jordan Moak · windows", "here · claimed"],
      ["build-box", "tag:ci · linux", "░ DERP ord · pairing"],
      ["lab-mac", "Jordan Moak · macOS", "░ peer relay · pairing"],
      ["old-laptop", "Jordan Moak · windows", "offline · no node"],
      ["spark-ad4d", "Jordan Moak · linux", "direct · claimed host"],
    ]);
  });

  it("shows the six-digit code with what to compare it against", () => {
    expect(sasWord("482913")).toBe("482 913");
    expect(sasWord("12")).toBe("12");
    expect(codeLine(rowOf(ids.build), "c")).toBe(
      "code 482 913 · if build-box shows the same code, c confirms",
    );
    expect(codeLine(rowOf(ids.lab), "c")).toBe(
      "code 105 377 · the console on lab-mac asks to pair; if it shows the same code, c confirms here",
    );
    expect(codeLine(rowOf(ids.spark), "c")).toBeUndefined();
  });

  it("renders a gate as creature, caps and expiry, naming the creature's parcel when it is elsewhere", () => {
    expect(gateLine(wrenGate, context)).toBe(
      "gate wren · exec bun, git status · files:read ~/src/** · until 18:00",
    );
    expect(gateLine(mossGate, context)).toBe(
      "gate moss from spark-ad4d · screen:view · until 13:30",
    );
    expect(gateLine({ ...mossGate, expiresAt: at(-5) }, context)).toBe(
      "gate moss from spark-ad4d · screen:view · expired 11:55",
    );
  });

  it("renders an audit row with its actor when the actor is not the parcel itself", () => {
    const [first, , third] = auditRows;
    if (first === undefined || third === undefined) throw new Error("fixture rows");
    expect(auditLine(third, context, ids.spark)).toBe(
      "audit 11:35 deny exec · rm outside the grant",
    );
    expect(auditLine(first, context, ids.house)).toBe(
      "audit 09:02 spark-ad4d allow pair.confirm · paired by claim code",
    );
    expect(auditLine({ ...third, reason: "" }, context, ids.spark)).toBe("audit 11:35 deny exec");
  });

  it("dates a time that is not today and says when an expiry is unreadable", () => {
    expect(whenWord(at(-60 * 13), fixtureClock)).toBe("11-04 23:00");
    expect(whenWord("garbage", fixtureClock)).toBe("an unknown time");
    expect(expiryWord("garbage", fixtureClock)).toBe("expiry unknown");
    expect(whenWord(at(-60 * 11), { ...fixtureClock, offsetMinutes: () => 13 * 60 })).toBe(
      "11-05 14:00",
    );
  });

  it("reports the listener, the policy and the audit chain plainly", () => {
    expect(listenerWord(quietListener)).toBeUndefined();
    expect(
      listenerWord({ ...quietListener, bound: { "100.124.48.125": 47800, "fd7a::1": 47800 } }),
    ).toBe("listening on 100.124.48.125, fd7a::1 · port 47800");
    expect(listenerWord({ ...quietListener, bound: { a: 1, b: 2 } })).toBe(
      "listening on a port 1, b port 2",
    );
    expect(listenerWord({ ...quietListener, idle: "funnel-enabled" })).toBe(
      "not listening: funnel-enabled",
    );
    expect(listenerWord({ ...quietListener, unreadable: "exit 1" })).toBe(
      "tailscale status unreadable: exit 1",
    );
    expect(policyWord({ checkedAt: at(-20), findings: [] }, fixtureClock)).toBe(
      "policy verified 11:40",
    );
    expect(
      policyWord({ checkedAt: at(-20), findings: ["tag:ci has no owner"] }, fixtureClock),
    ).toBe("policy: 1 finding · tag:ci has no owner");
    expect(chainWord({ intact: true, head: "h", rows: 5 })).toBe("audit chain intact · 5 rows");
    expect(chainWord({ intact: false, index: 2, reason: "prev-hash" })).toBe(
      "audit chain broken at row 3: prev-hash",
    );
    expect(
      undeliveredLine(
        {
          change: "undelivered",
          revocation: { kind: "pair", id: "pair-spark", target: ids.spark },
          attempts: 1,
          error: "connect ETIMEDOUT",
        },
        "spark-ad4d",
      ),
    ).toBe(
      "the pair revocation for spark-ad4d is not delivered yet after 1 attempt: connect ETIMEDOUT",
    );
  });
});
