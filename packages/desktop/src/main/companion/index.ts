export {
  type AnswerPick,
  type AnswerRequest,
  type CompanionConditions,
  type CompanionSnapshot,
  companionChannels,
  companionGlobal,
  type HitMask,
  type NeedsYouBubble,
  type Presence,
  type PresenceMode,
  type SemanticState,
  type Tier,
} from "./channels.ts";
export {
  type CompanionPorts,
  type CompanionService,
  startCompanion,
} from "./companion.ts";
export {
  type ElectronCompanionSeams,
  electronCompanionPorts,
  startElectronCompanion,
} from "./electron.ts";
export {
  type CompanionPreferences,
  companionPreferencesSchema,
  type PreferencePatch,
  preferenceBook,
} from "./preferences.ts";
export { derivePresence, type PresenceInputs } from "./presence.ts";
export { tierBudgets } from "./tiers.ts";
