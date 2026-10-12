import type { AppAction } from "../keys/actions.ts";
import { arcsPane } from "./arcs/index.tsx";
import { botsPane } from "./bots/index.tsx";
import { browserPane } from "./browser/index.tsx";
import { conversationPane } from "./conversation/index.tsx";
import { diffPane } from "./diff/index.tsx";
import { filePane } from "./file/index.tsx";
import { mcpPane } from "./mcp/index.tsx";
import { memoryPane } from "./memory/index.tsx";
import { permissionsPane } from "./permissions/index.tsx";
import type { PaneDefinition } from "./registry.ts";
import { terminalPane } from "./terminal/index.tsx";
import { themesPane } from "./themes/index.tsx";
import { treePane } from "./tree/index.tsx";
import { workspacesPane } from "./workspaces/index.tsx";

export const paneDefinitions = [
  conversationPane,
  treePane,
  diffPane,
  terminalPane,
  memoryPane,
  mcpPane,
  arcsPane,
  botsPane,
  workspacesPane,
  browserPane,
  filePane,
  themesPane,
  permissionsPane,
] as const;

export type PaneSpec = SpecOf<(typeof paneDefinitions)[number]>;
export type PaneKind = PaneSpec["kind"];
export type PaneSpecOf<Kind extends PaneKind> = Extract<PaneSpec, { kind: Kind }>;

export const paneRegistry: ReadonlyMap<PaneKind, PaneDefinition<PaneSpec>> = new Map(
  paneDefinitions.map((definition) => [definition.kind, definition]),
);

export function definitionOf(kind: PaneKind): PaneDefinition<PaneSpec> {
  const definition = paneRegistry.get(kind);
  if (definition === undefined) throw new Error(`no pane registered as "${kind}"`);
  return definition;
}

export function parsePaneSpec(value: unknown): PaneSpec | undefined {
  for (const definition of paneDefinitions) {
    const parsed = definition.spec.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export const keyboardOwners: readonly PaneKind[] = paneDefinitions
  .filter((definition) => definition.keyboard === "owned")
  .map((definition) => definition.kind);

export const paneActions: Readonly<Record<string, AppAction>> = Object.fromEntries(
  [...paneRegistry.values()].flatMap((definition) => [
    ...summonAction(definition),
    ...localActions(definition),
  ]),
);

export { EmptyState } from "./empty-state.tsx";
export type {
  KeyHints,
  PaneDefinition,
  PaneHome,
  PaneProps,
  PaneSummonVariant,
  PaneView,
  SessionIntents,
  ShellSeams,
} from "./registry.ts";
export { definePane } from "./registry.ts";

type SpecOf<Definition> = Definition extends PaneDefinition<infer Spec> ? Spec : never;

function summonAction(definition: PaneDefinition<PaneSpec>): Array<[string, AppAction]> {
  const summon = definition.summon;
  if (summon === undefined) return [];
  return [
    [
      summon.action,
      {
        chords: summon.chords,
        help: summon.help,
        command: summon.command,
        invoke: (target) => target.summon(definition.kind),
      },
    ],
    ...Object.entries(summon.variants ?? {}).map(([variant, detail]): [string, AppAction] => [
      `${summon.action}.${variant}`,
      {
        chords: detail.chords ?? "none",
        help: detail.help,
        command: detail.command,
        invoke: (target) => target.summon(definition.kind, variant),
      },
    ]),
  ];
}

function localActions(definition: PaneDefinition<PaneSpec>): Array<[string, AppAction]> {
  return Object.entries(definition.localActions ?? {}).map(([name, action]) => [
    name,
    {
      chords: action.chords,
      help: action.help,
      scope: definition.kind,
      ...(action.command !== undefined && { command: action.command }),
      invoke: (target) => target.paneAction(name),
    },
  ]);
}
