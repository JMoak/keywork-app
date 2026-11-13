import type { Setting } from "@keywork-app/protocol";
import type { PaneSpec } from "../panes/index.ts";

export type Satellite =
  | { readonly kind: "pane"; readonly spec: PaneSpec }
  | { readonly kind: "note"; readonly text: string }
  | { readonly kind: "link"; readonly url: string };

export function satelliteOf(setting: Setting): Satellite {
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
  }
}

export function satellitePaneId(setting: Pick<Setting, "id">): string {
  return `yard:${setting.id}`;
}

export function titleOfSetting(setting: Setting): string {
  return setting.what.title ?? shortRef(setting.what.ref);
}

export const wholeSessionScope = "every change in the session";

export function panelTitleOf(setting: Setting): string {
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

export function showsSubject(setting: Setting, spec: PaneSpec): boolean {
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
