export type McpServerState = "connected" | "connecting" | "down";

export type McpTransport = "stdio" | "http";

export interface McpServerStatus {
  name: string;
  state: McpServerState;
  enabled: boolean;
  toolCount: number;
  transport?: McpTransport;
  lastError?: string;
}

export type ArcStatus = "active" | "archived";

export interface ArcSummary {
  slug: string;
  status: ArcStatus;
  created: string;
  sessions: number;
  theme?: string;
}

export interface ArcThemeRequest {
  theme: string | null;
}

export type ArcThemeAnswer = ArcSummary;

export interface ArcsView {
  arcs: readonly ArcSummary[];
  ordinals: Readonly<Record<string, number>>;
}

export type ArcCloseOutcome =
  | { kind: "closed"; delivered: number; released: number; notice?: string }
  | { kind: "pending"; candidates: number; questions: number; wedged: number; notice?: string };

export interface SessionBinding {
  arc?: string;
  bot?: string;
}

export type BotScope = "project" | "user";

export interface BotEntry {
  name: string;
  sigil: string;
  source: BotScope;
  description?: string;
  model?: string;
  learning?: string;
}

export interface BotSummary extends BotEntry {
  sessions: number;
  lastUsed?: string;
  costNanos?: number;
}

export interface BotDraft {
  slug: string;
  scope: BotScope;
  purpose?: string;
}

export interface WorkspaceChoice {
  slug: string | undefined;
  name: string;
  declared: boolean;
  current: boolean;
  notes: number;
  focusDirs: readonly string[];
  sessions: number;
  lastUsed: number | undefined;
}

export interface WorkspaceUse {
  slug: string | null;
  reopens: boolean;
}

export interface FocusedDir {
  dir: string;
}

export interface ServerTheme {
  name: string;
  appearance: "dark" | "light";
  tokens: Record<string, string | readonly string[]>;
  density: Record<string, string>;
  gap: number;
  chromeWeight: string;
  instruments: string;
  terminal?: Record<string, string>;
  syntax?: Record<string, string>;
  diff?: Record<string, string>;
  selection?: { background: string; text?: string };
  cursor?: string;
  pair?: string;
}

export interface ThemesView {
  themes: readonly ServerTheme[];
  active: string;
  placeholders: readonly string[];
}

export const systemThemeName = "system";

export interface SurfaceRefusal {
  refused: "not-ready" | "invalid" | "missing" | "archived" | "exists" | "busy";
  detail: string;
}

export type SurfaceRefusalKind = SurfaceRefusal["refused"];

export function isSurfaceRefusal(value: unknown): value is SurfaceRefusal {
  return typeof value === "object" && value !== null && "refused" in value;
}

export const surfaceSlug = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
