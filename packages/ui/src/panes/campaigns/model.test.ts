import { describe, expect, it } from "vitest";
import { campaignFixture, usageFixture } from "../../../../protocol/src/campaign-testing.ts";
import { campaignSpending, campaignSpendTrend } from "./model.ts";

describe("campaign spending projection", () => {
  it("revises cost history after reconciliation and marks purpose changes without interpolating quality", () => {
    const campaign = campaignFixture({
      usage: [
        usageFixture({ id: "second", recordedAt: 3_000, state: "estimated", costMicros: 300_000 }),
        usageFixture({ id: "first", recordedAt: 2_000, state: "reported", costMicros: 200_000 }),
      ],
    });
    const purpose = campaign.purposes[0];
    if (purpose === undefined) throw new Error("Missing purpose");
    campaign.purposes.push({ ...purpose, revision: 2, createdAt: 2_500 });
    expect(campaignSpendTrend(campaign)).toEqual([
      { at: 1_000, settledMicros: 0, estimatedMicros: 0, milestones: ["Purpose revision 1"] },
      { at: 2_000, settledMicros: 200_000, estimatedMicros: 0, milestones: [] },
      { at: 2_500, settledMicros: 200_000, estimatedMicros: 0, milestones: ["Purpose revision 2"] },
      { at: 3_000, settledMicros: 200_000, estimatedMicros: 300_000, milestones: [] },
    ]);
    campaign.usage[0] = usageFixture({
      id: "second",
      recordedAt: 3_000,
      state: "reconciled",
      costMicros: 250_000,
    });
    expect(campaignSpendTrend(campaign).at(-1)).toMatchObject({
      settledMicros: 450_000,
      estimatedMicros: 0,
    });
  });
  it("separates reported spend from pending estimates without double counting reservations", () => {
    const campaign = campaignFixture({
      usage: [
        usageFixture({
          id: "settled",
          state: "reconciled",
          costMicros: 200_000,
          reservedMicros: 500_000,
        }),
        usageFixture({
          id: "estimate",
          state: "estimated",
          costMicros: 400_000,
          reservedMicros: 500_000,
        }),
        usageFixture({ id: "unknown", state: "unknown", reservedMicros: 700_000 }),
        usageFixture({ id: "released", state: "released", reservedMicros: 1_000_000 }),
      ],
    });
    expect(campaignSpending(campaign)).toEqual({
      settledMicros: 200_000,
      estimatedMicros: 400_000,
      outstandingMicros: 1_200_000,
      remainingMicros: 3_600_000,
      unknown: 1,
    });
    campaign.usage[1] = usageFixture({ id: "estimate", state: "reported", costMicros: 350_000 });
    expect(campaignSpending(campaign)).toMatchObject({
      settledMicros: 550_000,
      outstandingMicros: 700_000,
      estimatedMicros: 0,
      remainingMicros: 3_750_000,
    });
  });
});
