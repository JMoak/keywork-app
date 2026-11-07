import type {
  CreatureProjectBinding,
  ProjectDiscussionInput,
  ProjectThreadInput,
  ProjectWorkRequest,
  WorkspaceSessionRef,
} from "@keywork-app/protocol";
import type { RanchRequest } from "./ranch.ts";

export interface CreatureProjectsClient {
  receiveCreatureProjectWork(input: ProjectWorkRequest): Promise<{ session: WorkspaceSessionRef }>;
  listCreatureProjects(slug: string): Promise<{ projects: CreatureProjectBinding[] }>;
  bindCreatureProject(slug: string, project: string): Promise<CreatureProjectBinding>;
  unbindCreatureProject(slug: string, project: string): Promise<{ unbound: true }>;
  startCreatureProjectThread(
    slug: string,
    project: string,
    input: ProjectThreadInput,
  ): Promise<{ session: WorkspaceSessionRef }>;
  discussCreatureProjectSession(
    slug: string,
    project: string,
    input: ProjectDiscussionInput,
  ): Promise<{ session: WorkspaceSessionRef }>;
}

export const creatureProjectOperations = {
  receiveCreatureProjectWork: "receiveCreatureProjectWork",
  listCreatureProjects: "listCreatureProjects",
  bindCreatureProject: "bindCreatureProject",
  unbindCreatureProject: "unbindCreatureProject",
  startCreatureProjectThread: "startCreatureProjectThread",
  discussCreatureProjectSession: "discussCreatureProjectSession",
} as const satisfies Record<keyof CreatureProjectsClient, string>;

export class CreatureProjectRefusal extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "CreatureProjectRefusal";
    this.status = status;
    this.code = code;
  }
}

export function creatureProjectClient(request: RanchRequest): CreatureProjectsClient {
  const route = (slug: string, project?: string): string =>
    `/creatures/${encodeURIComponent(slug)}/projects${project === undefined ? "" : `/${encodeURIComponent(project)}`}`;
  const answer = async <T>(response: Response): Promise<T> => {
    const body: unknown = await response.json();
    if (!response.ok) {
      const record = body !== null && typeof body === "object" ? body : {};
      throw new CreatureProjectRefusal(
        response.status,
        "error" in record && typeof record.error === "string"
          ? record.error
          : `the server answered ${response.status}`,
        "code" in record && typeof record.code === "string" ? record.code : undefined,
      );
    }
    return body as T;
  };
  return {
    receiveCreatureProjectWork: async (input) =>
      answer(await request("POST", "/creature-project-work", input)),
    listCreatureProjects: async (slug) => answer(await request("GET", route(slug))),
    bindCreatureProject: async (slug, project) =>
      answer(await request("PUT", route(slug, project))),
    unbindCreatureProject: async (slug, project) =>
      answer(await request("DELETE", route(slug, project))),
    startCreatureProjectThread: async (slug, project, input) =>
      answer(await request("POST", `${route(slug, project)}/threads`, input)),
    discussCreatureProjectSession: async (slug, project, input) =>
      answer(await request("POST", `${route(slug, project)}/discussion`, input)),
  };
}
