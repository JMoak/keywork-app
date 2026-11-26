import {
  type BoundProject,
  type ProjectSite,
  pathKey,
  placeKey,
  samePlace,
} from "@keywork-app/habitat/block";
import type { CreatureScene, SceneSetOut, SessionRow, SteadPlace } from "@keywork-app/protocol";
import { isServedRefusal } from "@keywork-app/protocol";
import type { ConversationSpec } from "../../conversation/index.tsx";
import { sceneSetOutLine } from "../../creature/scenes.tsx";
import type { DiffSpec } from "../../diff/index.tsx";
import type { FileSpec } from "../../file/index.tsx";
import type { ShellSeams } from "../../registry.ts";
import type { SteadHomeScope } from "../home-scope.ts";
import { siteAt } from "./block-world.tsx";
import type { ProjectSites } from "./places.ts";
import { directoryInWorkspace, openToSeeIt, outsideTheWorkspace, type Pressed } from "./press.ts";

export type ProjectPlace = Extract<SteadPlace, { kind: "project" }>;

export type ProjectPane = FileSpec | ConversationSpec | DiffSpec;

export interface ProjectPressSeams {
  readonly workspace: string;
  scenes(creature: string): Promise<readonly CreatureScene[]>;
  setOutScene(creature: string, name: string): Promise<SceneSetOut | undefined>;
  conversations(creature: string): readonly SessionRow[];
  cwdOf(sessionId: string): Promise<string | undefined>;
  changedIn(sessionId: string): Promise<readonly string[] | undefined>;
  setOutTogether(panes: readonly ProjectPane[], place: ProjectPlace): void;
  bringForward(place: ProjectPlace): boolean;
  say(line: string | undefined): void;
}

export type ProjectPress = (place: ProjectPlace, site: ProjectSite | undefined) => Promise<void>;

export type ProjectOpener = (pressed: Pressed, otherwise: () => void) => boolean;

export type BoundProjectPress = (
  place: ProjectPlace,
  site: ProjectSite,
  bound: BoundProject,
) => Promise<void>;

export type SceneSeams = Pick<ProjectPressSeams, "scenes" | "setOutScene" | "say">;

export const conversationsLookedAt = 8;

export function projectPressSeamsOf(
  shell: ShellSeams,
  say: (line: string | undefined) => void,
): ProjectPressSeams | undefined {
  const { setOutTogether, bringForward } = shell;
  if (setOutTogether === undefined || bringForward === undefined) return undefined;
  const cwds = new Map<string, Promise<string | undefined>>();
  return {
    workspace: shell.workspace,
    ...sceneSeamsOf(shell, say),
    conversations: (creature) => shell.store.state.summaries.filter((row) => row.bot === creature),
    cwdOf: (sessionId) => {
      const known =
        cwds.get(sessionId) ??
        attempt(() => shell.client.session(sessionId)).then((detail) => detail?.cwd);
      cwds.set(sessionId, known);
      return known;
    },
    changedIn: async (sessionId) => {
      const reading = await attempt(() => shell.client.changes(sessionId));
      return reading === undefined || typeof reading === "string"
        ? undefined
        : reading.files.map((file) => file.path);
    },
    setOutTogether: (panes, place) => setOutTogether(panes, place),
    bringForward: (place) => bringForward(place),
    say,
  };
}

export function sceneSeamsOf(
  shell: Pick<ShellSeams, "client">,
  say: (line: string | undefined) => void,
): SceneSeams {
  return {
    scenes: async (creature) => {
      const listed = await attempt(() => shell.client.creatureScenes(creature));
      return listed === undefined || isServedRefusal(listed) ? [] : listed;
    },
    setOutScene: async (creature, name) => {
      const outcome = await attempt(() => shell.client.setOutScene(creature, name));
      return outcome === undefined || isServedRefusal(outcome) ? undefined : outcome;
    },
    say,
  };
}

export function createProjectOpener(
  shell: ShellSeams,
  say: (line: string | undefined) => void,
  sites: () => ProjectSites,
): ProjectOpener {
  const seams = projectPressSeamsOf(shell, say);
  const press = seams === undefined ? undefined : createProjectPress(seams);
  const pressBound = createBoundProjectPress(shell, say);
  const scenesOnly = shell.setOut === undefined ? sceneSeamsOf(shell, say) : undefined;
  return ({ place, face }, otherwise) => {
    if (place.kind !== "project" || face !== undefined) return false;
    const site = siteAt(sites(), place);
    if (site?.bound !== undefined) void pressBound(place, site, site.bound);
    else if (press !== undefined) void press(place, site);
    else if (scenesOnly === undefined) return false;
    else
      void setOutItsScene(scenesOnly, place).then((setOut) => {
        if (!setOut) otherwise();
      });
    return true;
  };
}

export function createBoundProjectPress(
  home: Pick<ShellSeams, "client" | "steadHome">,
  say: (line: string | undefined) => void,
): BoundProjectPress {
  const scenes = sceneSeamsOf(home, say);
  const threadsThere = new Map<string, ReadonlySet<string>>();
  let held: { readonly shell: ShellSeams; readonly press: ProjectPress } | undefined;

  const pressServedBy = (shell: ShellSeams): ProjectPress | undefined => {
    if (held?.shell === shell) return held.press;
    const seams = projectPressSeamsOf(shell, say);
    if (seams === undefined) return undefined;
    const theirs = (creature: string) => (row: SessionRow) =>
      row.bot === creature || threadsThere.get(creature)?.has(row.id) === true;
    const press = createProjectPress({
      ...seams,
      ...scenes,
      conversations: (creature) => shell.store.state.summaries.filter(theirs(creature)),
    });
    held = { shell, press };
    return press;
  };
  const learnThreads = async (scope: SteadHomeScope, place: ProjectPlace, project: string) => {
    const bindings = await scope.projects.list(place.creature).catch(() => []);
    const binding = bindings.find((each) => each.project === project);
    const links = [...(binding?.threads ?? []), ...(binding?.discussions ?? [])];
    threadsThere.set(place.creature, new Set(links.map((link) => link.session.session)));
  };

  return async (place, site, bound) => {
    const scope = home.steadHome;
    const open = scope?.activeProject();
    if (scope === undefined) return say(openToSeeIt(lastPart(bound.root)));
    if (open?.workspace !== bound.project) {
      if (scope.openBoundProject === undefined) return say(openToSeeIt(lastPart(bound.root)));
      return scope.openBoundProject(bound.root, place);
    }
    const press = open.shell === undefined ? undefined : pressServedBy(open.shell);
    if (press === undefined) return;
    await learnThreads(scope, place, bound.project);
    await press(place, site);
  };
}

export function createProjectPress(seams: ProjectPressSeams): ProjectPress {
  const pressing = new Set<string>();
  return async (place, site) => {
    if (seams.bringForward(place)) return seams.say(undefined);
    const key = placeKey(place);
    if (pressing.has(key)) return;
    pressing.add(key);
    try {
      if (await setOutItsScene(seams, place)) return;
      const { panes, line } = await theDefaultSet(seams, place, site);
      seams.say(line);
      if (panes.length > 0) seams.setOutTogether(panes, place);
    } finally {
      pressing.delete(key);
    }
  };
}

export async function latestConversationThere(
  seams: Pick<ProjectPressSeams, "conversations" | "cwdOf" | "changedIn">,
  place: ProjectPlace,
  site: ProjectSite | undefined,
): Promise<{ readonly id: string; readonly changed: boolean } | undefined> {
  const root = site?.root ?? site?.bound?.root ?? place.directory;
  const itsRoot = pathKey(place.directory) === pathKey(root);
  let startedThere: { id: string; changed: boolean } | undefined;
  for (const row of newestFirst(seams.conversations(place.creature))) {
    const cwd = await seams.cwdOf(row.id);
    if (cwd === undefined || pathKey(cwd) !== pathKey(root)) continue;
    const changed = await seams.changedIn(row.id);
    const touched = changed?.filter((path) => isWithin(resolvedFrom(cwd, path), place.directory));
    if (itsRoot) return { id: row.id, changed: (changed?.length ?? row.changes?.files ?? 0) > 0 };
    if (touched !== undefined && touched.length > 0) return { id: row.id, changed: true };
    if (changed === undefined) startedThere ??= { id: row.id, changed: false };
  }
  return startedThere;
}

async function setOutItsScene(seams: SceneSeams, place: ProjectPlace): Promise<boolean> {
  const kept = (await seams.scenes(place.creature)).find((scene) =>
    samePlace(scene.place ?? undefined, place),
  );
  if (kept === undefined) return false;
  const outcome = await seams.setOutScene(place.creature, kept.name);
  if (outcome === undefined) return false;
  seams.say(sceneSetOutLine(kept.name, outcome));
  return true;
}

async function theDefaultSet(
  seams: ProjectPressSeams,
  place: ProjectPlace,
  site: ProjectSite | undefined,
): Promise<{ readonly panes: readonly ProjectPane[]; readonly line: string | undefined }> {
  const folder = directoryInWorkspace(place.directory, seams.workspace);
  const talk = await latestConversationThere(seams, place, site);
  const panes: ProjectPane[] = [
    ...(folder === undefined ? [] : [{ kind: "file", path: folder } as const]),
    ...(talk === undefined ? [] : [{ kind: "conversation", sessionId: talk.id } as const]),
    ...(talk?.changed === true ? [{ kind: "diff", sessionId: talk.id } as const] : []),
  ];
  return { panes, line: folder === undefined ? outsideTheWorkspace(place.directory) : undefined };
}

function newestFirst(rows: readonly SessionRow[]): readonly SessionRow[] {
  return [...rows]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .slice(0, conversationsLookedAt);
}

function lastPart(directory: string): string {
  return (
    directory
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) ?? directory
  );
}

function resolvedFrom(cwd: string, path: string): string {
  return /^(?:[a-z]:)?[\\/]/i.test(path) ? path : `${cwd.replace(/[\\/]+$/, "")}/${path}`;
}

function isWithin(path: string, directory: string): boolean {
  const inner = pathKey(path);
  const outer = pathKey(directory);
  return inner === outer || inner.startsWith(`${outer}/`);
}

function attempt<Answer>(ask: () => Promise<Answer>): Promise<Answer | undefined> {
  return Promise.resolve()
    .then(ask)
    .catch(() => undefined);
}
