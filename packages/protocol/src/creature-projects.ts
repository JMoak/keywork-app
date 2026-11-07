export interface CreatureHandle {
  workspace: string;
  slug: string;
}

export interface WorkspaceSessionRef {
  workspace: string;
  session: string;
}

export interface ProjectThreadInput {
  requestId: string;
  text: string;
  source?: WorkspaceSessionRef;
}

export interface ProjectDiscussionInput extends ProjectThreadInput {
  source: WorkspaceSessionRef;
}

export interface ProjectWorkRequest extends ProjectThreadInput {
  creature: CreatureHandle;
  project: string;
}

export interface CreatureProjectLink {
  requestId: string;
  session: WorkspaceSessionRef;
  source?: WorkspaceSessionRef;
}

export interface CreatureProjectBinding {
  project: string;
  threads: readonly CreatureProjectLink[];
  discussions: readonly CreatureProjectLink[];
}

export const projectThreadBody = [
  "requestId",
  "text",
  "source",
  "source.workspace",
  "source.session",
] as const;

export const creatureProjectRoutes = [
  { method: "GET", path: "/creatures/{slug}/projects", operationId: "listCreatureProjects" },
  {
    method: "PUT",
    path: "/creatures/{slug}/projects/{project}",
    operationId: "bindCreatureProject",
  },
  {
    method: "DELETE",
    path: "/creatures/{slug}/projects/{project}",
    operationId: "unbindCreatureProject",
  },
  {
    method: "POST",
    path: "/creatures/{slug}/projects/{project}/threads",
    operationId: "startCreatureProjectThread",
  },
  {
    method: "POST",
    path: "/creatures/{slug}/projects/{project}/discussion",
    operationId: "discussCreatureProjectSession",
  },
  { method: "POST", path: "/creature-project-work", operationId: "receiveCreatureProjectWork" },
] as const;
