import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { JSX } from "solid-js";
import type { z } from "zod";
import type { TitleBot } from "../chrome/identity.ts";
import type { LifecycleState } from "../chrome/pane-frame.tsx";
import type { HostPort } from "../host/port.ts";
import type { ContextLevel } from "../instruments/context.ts";
import type { BindingSpec } from "../keys/keymap.ts";
import type { DockSide, PaneId } from "../layout/index.ts";
import type { ArgumentChoice, CommandRegistry } from "../palette/commands.ts";
import type { TrustSetup } from "../posture/trust-setup.ts";
import type { NeedsYouItem } from "../shell/needs-you.ts";
import type { Reveal } from "../shell/needs-you-jumps.ts";
import type { NeedsYouQueue } from "../shell/needs-you-queue.ts";
import type { QuietPosture } from "../shell/quiet.ts";
import type { ServerStanding } from "../shell/server-standing.ts";
import type { SessionReads } from "../shell/session-reads.ts";
import type { SessionStore } from "../shell/session-store.ts";
import type { TrustFlow } from "../shell/trust.ts";
import type { Attire, Outfit } from "../theme/attire.ts";
import type { Wardrobe } from "../theme/wardrobe.ts";

export type PaneHome = "main" | DockSide;

export type PaneAttire = "house" | "work";

export interface PaneSpecBase {
  readonly kind: string;
}

export interface PaneDefinition<Spec extends PaneSpecBase> {
  readonly kind: Spec["kind"];
  readonly spec: z.ZodType<Spec>;
  readonly home: PaneHome;
  readonly attire: PaneAttire;
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
  readonly command: ActionCommand;
  readonly variants?: Readonly<Record<string, PaneSummonVariant>>;
  spec(shell: ShellSeams, argument?: string): Spec | Promise<Spec>;
}

export interface PaneSummonVariant {
  readonly chords?: BindingSpec;
  readonly help: string;
  readonly command: ActionCommand;
}

export interface PaneLocalAction {
  readonly chords: BindingSpec;
  readonly help: string;
  readonly command?: ActionCommand;
}

export interface ActionCommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
  readonly argument?: ActionArgument;
}

export interface ActionArgument {
  readonly hint: string;
  readonly required?: true;
  choices?(shell: ShellSeams): readonly ArgumentChoice[];
}

export interface PaneAdornments {
  readonly telemetry?: string | undefined;
  readonly context?: ContextLevel | undefined;
  readonly modeWord?: string | undefined;
  readonly arc?: string | undefined;
  readonly bot?: TitleBot | undefined;
  readonly inference?: string | undefined;
  readonly hueRank?: number | undefined;
  readonly quiet?: boolean | undefined;
  readonly ribbon?: string | undefined;
}

export interface PaneView<Spec extends PaneSpecBase> {
  readonly id: PaneId;
  readonly spec: Spec;
  readonly focused: boolean;
}

export interface PaneProps<Spec extends PaneSpecBase> extends PaneView<Spec> {
  readonly shell: ShellSeams;
  onAction(handler: PaneActionHandler): void;
}

export type PaneActionHandler = (action: string, argument?: string) => void;

export interface KeyHints {
  chord(action: string): string;
  leader(): string;
}

export interface PaneMarks {
  toggle(paneId: PaneId): void;
  has(paneId: PaneId): boolean;
  all(): readonly PaneId[];
  clear(): void;
}

export interface NeedsYouSeams {
  readonly queue: NeedsYouQueue;
  readonly reads: SessionReads;
  revealing(): Reveal | undefined;
  jump(item: NeedsYouItem): void;
  visit(sessionId: string): void;
  dressed(sessionId: string): Outfit | undefined;
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
  focusedPane(): PaneId | undefined;
  rebind<Spec extends PaneSpecBase>(paneId: PaneId, spec: Spec): void;
  unseen(view: PaneView<PaneSpecBase>, completed: number): boolean;
  readonly client: KeyworkClient;
  readonly feed: ServerFeed;
  readonly trust: TrustFlow;
  readonly trustSetup?: TrustSetup;
  readonly wardrobe?: Wardrobe;
  readonly attire?: Attire;
  readonly marks?: PaneMarks;
  readonly quiet?: QuietPosture;
  readonly needsYou?: NeedsYouSeams;
  readonly commands?: CommandRegistry;
  openPane<Spec extends PaneSpecBase>(spec: Spec): void;
  closePane?(paneId: PaneId): void;
  openInEditor?(path: string, line?: number): Promise<void>;
  server?(): ServerStanding;
}

export function definePane<Spec extends PaneSpecBase>(
  definition: PaneDefinition<Spec>,
): PaneDefinition<Spec> {
  return definition;
}
