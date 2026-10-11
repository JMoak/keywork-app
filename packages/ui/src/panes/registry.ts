import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { JSX } from "solid-js";
import type { z } from "zod";
import type { LifecycleState } from "../chrome/pane-frame.tsx";
import type { HostPort } from "../host/port.ts";
import type { ContextLevel } from "../instruments/context.ts";
import type { BindingSpec } from "../keys/keymap.ts";
import type { DockSide, PaneId } from "../layout/index.ts";
import type { SessionStore } from "../shell/session-store.ts";
import type { TrustFlow } from "../shell/trust.ts";

export type PaneHome = "main" | DockSide;

export interface PaneSpecBase {
  readonly kind: string;
}

export interface PaneDefinition<Spec extends PaneSpecBase> {
  readonly kind: Spec["kind"];
  readonly spec: z.ZodType<Spec>;
  readonly home: PaneHome;
  readonly keyboard?: "shared" | "owned";
  title(spec: Spec, shell: ShellSeams): string;
  emptyState(keys: KeyHints): string;
  component(props: PaneProps<Spec>): JSX.Element;
  readonly summon?: PaneSummon<Spec>;
  readonly localActions?: Readonly<Record<string, PaneLocalAction>>;
  adornments?(spec: Spec, shell: ShellSeams): PaneAdornments;
  lifecycle?(view: PaneView<Spec>, shell: ShellSeams): LifecycleState;
  onRestore?(spec: Spec, shell: ShellSeams): void;
}

export interface PaneSummon<Spec extends PaneSpecBase> {
  readonly action: string;
  readonly chords: BindingSpec;
  readonly help: string;
  readonly command: {
    readonly name: string;
    readonly description: string;
    readonly aliases?: readonly string[];
  };
  readonly variants?: Readonly<Record<string, PaneSummonVariant>>;
  spec(shell: ShellSeams, variant?: string): Spec | Promise<Spec>;
}

export interface PaneSummonVariant {
  readonly help: string;
  readonly command: {
    readonly name: string;
    readonly description: string;
    readonly aliases?: readonly string[];
  };
}

export interface PaneLocalAction {
  readonly chords: BindingSpec;
  readonly help: string;
  readonly command?: {
    readonly name: string;
    readonly description: string;
    readonly aliases?: readonly string[];
  };
}

export interface PaneAdornments {
  readonly telemetry?: string | undefined;
  readonly context?: ContextLevel | undefined;
  readonly modeWord?: string | undefined;
  readonly bot?: string | undefined;
  readonly inference?: string | undefined;
  readonly hueRank?: number | undefined;
}

export interface PaneView<Spec extends PaneSpecBase> {
  readonly id: PaneId;
  readonly spec: Spec;
  readonly focused: boolean;
}

export interface PaneProps<Spec extends PaneSpecBase> extends PaneView<Spec> {
  readonly shell: ShellSeams;
  onAction(handler: (action: string) => void): void;
}

export interface KeyHints {
  chord(action: string): string;
  leader(): string;
}

export interface SessionIntents {
  openSession(sessionId: string): void;
  newSession(): Promise<void>;
  startSession(paneId: PaneId, text: string): Promise<void>;
}

export interface ShellSeams {
  readonly store: SessionStore;
  readonly keys: KeyHints;
  readonly sessions: SessionIntents;
  readonly host: HostPort;
  readonly workspace: string;
  currentSession(): string | undefined;
  rebind<Spec extends PaneSpecBase>(paneId: PaneId, spec: Spec): void;
  unseen(view: PaneView<PaneSpecBase>, completed: number): boolean;
  readonly client: KeyworkClient;
  readonly feed: ServerFeed;
  readonly trust: TrustFlow;
  openPane<Spec extends PaneSpecBase>(spec: Spec): void;
  openInEditor?(path: string, line: number): Promise<void>;
}

export function definePane<Spec extends PaneSpecBase>(
  definition: PaneDefinition<Spec>,
): PaneDefinition<Spec> {
  return definition;
}
