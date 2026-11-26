import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type { AnswerOutcome, AskScope, AskVerdict, BusEnvelope } from "@keywork-app/protocol";
import type { ShellSeams } from "../registry.ts";
import type { ProjectStore, SteadHomeScope, SteadSessionReference } from "./home-scope.ts";

export interface ProjectOpenHere {
  readonly scope: SteadHomeScope;
  readonly answered: [string, AskVerdict, AskScope | undefined][];
  readonly loaded: string[];
  readonly went: SteadSessionReference[];
}

export interface OpenProject {
  readonly workspace: string;
  readonly label: string;
  readonly sessions: Readonly<Record<string, { title: string; projection: SessionProjection }>>;
}

export function projectOpenHere(
  home: Omit<ShellSeams, "steadHome">,
  project: OpenProject,
): ProjectOpenHere {
  const answered: ProjectOpenHere["answered"] = [];
  const loaded: string[] = [];
  const went: SteadSessionReference[] = [];
  const store: ProjectStore = {
    projection: (id) =>
      (id === undefined ? undefined : project.sessions[id]?.projection) ?? emptyProjection,
    answerAsk: async (callId, verdict, scope): Promise<AnswerOutcome> => {
      answered.push([callId, verdict, scope]);
      return "settled";
    },
    open: async (id) => void loaded.push(id),
  };
  const scope: SteadHomeScope = {
    shell: home,
    workspace: "home-identity",
    activeProject: () => ({
      workspace: project.workspace,
      label: project.label,
      store,
      session: (reference) => {
        const held = project.sessions[reference.session];
        return held === undefined ? undefined : { label: held.title };
      },
    }),
    openSession: (reference) => void went.push(reference),
    projects: {
      list: async () => [],
      bind: async () => undefined,
      unbind: async () => undefined,
      start: async () => ({ workspace: project.workspace, session: "unused" }),
      discuss: async () => ({ workspace: "home-identity", session: "unused" }),
    },
  };
  return { scope, answered, loaded, went };
}

export function askingToRun(callId: string, command: string): SessionProjection {
  const ask = {
    tool: "bash",
    callId,
    arguments: { command },
    rule: "default",
    rules: [{ action: "bash", resource: `${command.split(" ")[0]} *`, effect: "allow" }],
  };
  return projectAll(emptyProjection, [
    envelope(1, "turn.started", { userText: "go" }),
    envelope(2, "gate.ask", { ask }),
  ]);
}

function envelope(id: number, type: string, payload: unknown): BusEnvelope {
  return { id, ts: new Date().toISOString(), sessionId: "s", type, payload } as BusEnvelope;
}
