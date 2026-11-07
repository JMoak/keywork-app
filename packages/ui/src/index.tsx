export { App, type AppProps } from "./app.tsx";
export { ProductProvider, useProductProfile } from "./chrome/product.ts";
export { Composer } from "./composer/composer.tsx";
export type { HostPort } from "./host/port.ts";
export { ConversationPane } from "./page/pane.tsx";
export { tierOf, type WidthTier } from "./page/tiers.ts";
export type { ShellSeams } from "./panes/registry.ts";
export type {
  CreatureDiscussionDraft,
  CreatureProjectActivity,
  CreatureProjectBinding,
  CreatureProjectDraft,
  CreatureProjectsPort,
  SteadHomeScope,
  SteadProjectContext,
  SteadProjectSessionView,
  SteadSessionReference,
} from "./panes/stead/home-scope.ts";
export * from "./theme/index.ts";
