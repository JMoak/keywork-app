import type {
  KeeperShowOutcome,
  PlacementsReport,
  ServedRefusal,
  Setting,
  ShowAnswer,
  ShowListing,
  ShowOpened,
  ShowOpening,
} from "@keywork-app/protocol";
import { type RanchRequest, servedRefusalOf } from "./ranch.ts";

export interface ShowClient {
  settings(): Promise<readonly Setting[] | ServedRefusal>;
  answerSetting(id: string, outcome: KeeperShowOutcome): Promise<ServedRefusal | undefined>;
  clearSignal(id: string): Promise<ServedRefusal | undefined>;
  openSetting(opening: ShowOpening): Promise<Setting | ServedRefusal>;
  reportPlacements(sessionId: string, report: PlacementsReport): Promise<ServedRefusal | undefined>;
}

export const showOperations = {
  settings: "listSettings",
  answerSetting: "answerSetting",
  clearSignal: "clearSignal",
  openSetting: "openSetting",
  reportPlacements: "reportPlacements",
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
    clearSignal: async (id) =>
      servedRefusalOf(await request("DELETE", `/show/${encodeURIComponent(id)}/signal`)),
    openSetting: async (opening) => {
      const response = await request("POST", "/show", opening);
      return (await servedRefusalOf(response)) ?? ((await response.json()) as ShowOpened).setting;
    },
    reportPlacements: async (sessionId, report) =>
      servedRefusalOf(
        await request(
          "PUT",
          `/sessions/${encodeURIComponent(sessionId)}/settings/placements`,
          report,
        ),
      ),
  };
}
