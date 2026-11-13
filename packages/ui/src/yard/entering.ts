import type { YardSetting } from "@keywork-app/habitat";
import { reaches } from "./layout.ts";
import { satelliteOf } from "./satellites.ts";

export type PanelWay = "focus" | "unfold" | "tile";

export type EnterWay = PanelWay | "read";

export interface EnterSight {
  readonly yardOn: boolean;
  drawnAsPanel(id: string): boolean;
  roomBeside(setting: YardSetting): boolean;
}

export function wayInto(setting: YardSetting, sight: EnterSight): EnterWay {
  if (sight.yardOn && sight.drawnAsPanel(setting.id)) return "focus";
  if (sight.yardOn && sight.roomBeside(setting)) return "unfold";
  return satelliteOf(setting).kind === "note" ? "read" : "tile";
}

export function raisedByHand(setting: YardSetting): YardSetting {
  return reaches(setting.shown, "unfold") ? setting : { ...setting, shown: "unfold" };
}

export function asCard(setting: YardSetting): YardSetting {
  return reaches(setting.shown, "unfold") ? { ...setting, shown: "card" } : setting;
}
