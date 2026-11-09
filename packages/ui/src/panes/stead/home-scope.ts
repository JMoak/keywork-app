import type {
  CreatureProjectBinding,
  ProjectDiscussionInput,
  ProjectThreadInput,
  WorkspaceSessionRef,
} from "@keywork-app/protocol";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";

export type {
  CreatureProjectBinding,
  CreatureProjectLink as CreatureProjectActivity,
} from "@keywork-app/protocol";

export interface SteadHomeScope {
  readonly shell: Omit<ShellSeams, "steadHome">;
  readonly workspace: string;
  readonly projects: CreatureProjectsPort;
  activeProject(): SteadProjectContext | undefined;
  openSession(reference: SteadSessionReference): void;
  openProject?(): void;
  openMemory?(): void;
  presentedPane?(): PaneSpecBase | undefined;
  dismissPane?(): void;
}

export type SteadSessionReference = WorkspaceSessionRef;

export interface SteadProjectContext {
  readonly workspace: string;
  readonly label: string;
  readonly ideSession?: SteadSessionReference;
  session?(reference: SteadSessionReference): SteadProjectSessionView | undefined;
}

export interface SteadProjectSessionView {
  readonly label: string;
  readonly status?: string;
}

export type CreatureProjectDraft = ProjectThreadInput;
export type CreatureDiscussionDraft = ProjectDiscussionInput;

export interface CreatureProjectsPort {
  list(slug: string): Promise<readonly CreatureProjectBinding[]>;
  bind(slug: string, workspace: string): Promise<void>;
  unbind(slug: string, workspace: string): Promise<void>;
  start(
    slug: string,
    workspace: string,
    draft: CreatureProjectDraft,
  ): Promise<SteadSessionReference>;
  discuss(
    slug: string,
    workspace: string,
    draft: CreatureDiscussionDraft,
  ): Promise<SteadSessionReference>;
}

export function shellForStead(host: ShellSeams, scope: SteadHomeScope): ShellSeams {
  const onboarding = scope.shell.onboarding ?? host.onboarding;
  return {
    ...scope.shell,
    steadHome: scope,
    keys: host.keys,
    ...(onboarding !== undefined && { onboarding }),
    sessions: {
      ...scope.shell.sessions,
      openSession: (session) => scope.openSession({ workspace: scope.workspace, session }),
    },
  };
}
