import type { OverturnOutcome, ServedRefusal } from "@keywork-app/protocol";
import { isServedRefusal } from "@keywork-app/protocol";
import type { DecidedForYou, NeedsYouItem } from "./needs-you.ts";

export interface DecisionOverturning {
  overturnCreatureDecision(
    slug: string,
    recordId: string,
  ): Promise<OverturnOutcome | ServedRefusal>;
}

export interface OverturnAnswer {
  readonly overturned: boolean;
  readonly line: string;
}

export interface StandingDecisions {
  items(): readonly NeedsYouItem[];
  dismiss(item: NeedsYouItem): unknown;
}

export const nothingDecidedStands = "nothing decided for you stands under that id";

export async function overturnDecided(
  client: DecisionOverturning,
  decided: DecidedForYou,
): Promise<OverturnAnswer> {
  if (decided.creature === undefined) {
    return {
      overturned: false,
      line: "this decision names no creature · overturn it from the ledger",
    };
  }
  const outcome = await client.overturnCreatureDecision(decided.creature, decided.recordId);
  if (isServedRefusal(outcome))
    return { overturned: false, line: `not overturned · ${outcome.detail}` };
  if (!outcome.overturned) return { overturned: false, line: overturnRefusals[outcome.reason] };
  return {
    overturned: true,
    line: `overturned · every ${outcome.ruleClass} ask waits for you again`,
  };
}

export async function overturnStanding(
  client: DecisionOverturning,
  standing: StandingDecisions | undefined,
  recordId: string,
): Promise<string> {
  const decided = decidedAmong(standing?.items() ?? []).find((item) => item.recordId === recordId);
  if (decided === undefined) return nothingDecidedStands;
  const answer = await overturnDecided(client, decided);
  if (answer.overturned) standing?.dismiss(decided);
  return answer.line;
}

export function decidedAmong(items: readonly NeedsYouItem[]): DecidedForYou[] {
  return items.flatMap((item) => (item.kind === "decided" ? [item] : []));
}

const overturnRefusals: Readonly<Record<"not-decided-for-you" | "already-overturned", string>> = {
  "not-decided-for-you": "not overturned · the ledger holds no decision made for you under that id",
  "already-overturned": "already overturned · its class already waits for you",
};
