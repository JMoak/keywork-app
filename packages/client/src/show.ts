import type {
  KeeperShowOutcome,
  ServedRefusal,
  Setting,
  ShowAnswer,
  ShowListing,
} from "@keywork-app/protocol";
import { type RanchRequest, servedRefusalOf } from "./ranch.ts";

export interface ShowClient {
  settings(): Promise<readonly Setting[] | ServedRefusal>;
  answerSetting(id: string, outcome: KeeperShowOutcome): Promise<ServedRefusal | undefined>;
}

export const showOperations = {
  settings: "listSettings",
  answerSetting: "answerSetting",
} as const satisfies Record<keyof ShowClient, string>;

export function showRoutes(request: RanchRequest): ShowClient {
  return {
    settings: async () => {
      const response = await request("GET", "/show");
      return (await servedRefusalOf(response)) ?? ((await response.json()) as ShowListing).settings;
    },
    answerSetting: async (id, outcome) => {
      const answer: ShowAnswer = { outcome };
      return servedRefusalOf(
        await request("POST", `/show/${encodeURIComponent(id)}/answer`, answer),
      );
    },
  };
}
