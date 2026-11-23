import { type Setting, type SettingKind, settingPanes } from "@keywork-app/protocol";
import type { PaneSpec } from "../panes/index.ts";

export type Satellite =
  | { readonly kind: "pane"; readonly spec: PaneSpec }
  | { readonly kind: "note"; readonly text: string }
  | { readonly kind: "link"; readonly url: string };

export interface Shown {
  readonly what: {
    readonly kind: SettingKind;
    readonly ref: string;
    readonly title?: string | undefined;
  };
  readonly sessionId: string;
  readonly creature: string | null;
}

export function satelliteOf(setting: Shown): Satellite {
  const { kind, ref } = setting.what;
  switch (kind) {
    case "file":
      return { kind: "pane", spec: { kind: "file", path: ref } };
    case "diff":
      return { kind: "pane", spec: diffSpecOf(setting.sessionId, ref) };
    case "report":
      return setting.creature === null
        ? { kind: "pane", spec: { kind: "conversation", sessionId: setting.sessionId } }
        : { kind: "pane", spec: { kind: "creature", slug: setting.creature } };
    case "thread":
      return { kind: "pane", spec: { kind: "conversation", sessionId: ref } };
    case "chore":
      return {
        kind: "pane",
        spec:
          setting.creature === null
            ? { kind: "chores" }
            : { kind: "chores", creature: setting.creature },
      };
    case "url":
      return { kind: "link", url: ref };
    case "note":
      return { kind: "note", text: ref };
    case "pane":
      return ownPaneOf(ref, setting);
  }
}

// One of the console's own panes, by the name the engine keeps it under. A name this console
// does not know (a newer engine's) is said in words, where a pane would have stood.
function ownPaneOf(name: string, setting: Shown): Satellite {
  const known = settingPanes.find((pane) => pane === name);
  if (known === undefined) return { kind: "note", text: unknownPaneWords(name) };
  const { sessionId, creature } = setting;
  switch (known) {
    case "sessions":
      return { kind: "pane", spec: { kind: "tree" } };
    case "arcs":
      return { kind: "pane", spec: { kind: "arcs" } };
    case "files":
      return { kind: "pane", spec: { kind: "browser" } };
    case "context":
      return { kind: "pane", spec: { kind: "context", sessionId } };
    case "workshop":
      return {
        kind: "pane",
        spec: creature === null ? { kind: "workshop" } : { kind: "workshop", creature },
      };
    case "terminal":
      return { kind: "pane", spec: { kind: "terminal", mode: "mirror", sessionId } };
    case "memory":
    case "needs-you":
    case "permissions":
    case "mcp":
    case "workspaces":
    case "mills":
    case "parcels":
    case "bots":
    case "campaigns":
    case "themes":
    case "posture":
    case "stead":
      return { kind: "pane", spec: { kind: known } };
  }
}

export function unknownPaneWords(name: string): string {
  return `This console has no pane called ${JSON.stringify(name)}.`;
}

export function satellitePaneId(setting: Pick<Setting, "id">): string {
  return `yard:${setting.id}`;
}

export function titleOfSetting(setting: Pick<Shown, "what">): string {
  const { kind, ref, title } = setting.what;
  if (title !== undefined) return title;
  return kind === "pane" ? ref.replaceAll("-", " ") : shortRef(ref);
}

export const wholeSessionScope = "every change in the session";

export function panelTitleOf(setting: Shown): string {
  const title = titleOfSetting(setting);
  const shown = satelliteOf(setting);
  const wholeSession = shown.kind === "pane" && shown.spec.kind === "diff" && !shown.spec.path;
  return wholeSession ? `${title} · ${wholeSessionScope}` : title;
}

export function namesAPath(ref: string): boolean {
  return !/\s/.test(ref) && /[./]/.test(ref) && !/^[a-z]+:\/\//i.test(ref);
}

function diffSpecOf(sessionId: string, ref: string): PaneSpec {
  return namesAPath(ref) ? { kind: "diff", sessionId, path: ref } : { kind: "diff", sessionId };
}

export function showsSubject(setting: Shown, spec: PaneSpec): boolean {
  const satellite = satelliteOf(setting);
  if (satellite.kind !== "pane" || satellite.spec.kind !== spec.kind) return false;
  return JSON.stringify(subjectOf(satellite.spec)) === JSON.stringify(subjectOf(spec));
}

const shortRefLength = 60;

function shortRef(ref: string): string {
  const line = ref.split("\n")[0] ?? ref;
  return line.length <= shortRefLength ? line : `${line.slice(0, shortRefLength - 1)}…`;
}

function subjectOf(spec: PaneSpec): unknown {
  switch (spec.kind) {
    case "file":
      return spec.path;
    case "diff":
    case "conversation":
      return spec.sessionId;
    case "creature":
      return spec.slug;
    case "chores":
      return spec.creature;
    default:
      return undefined;
  }
}
