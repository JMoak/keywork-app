import { type Setting, type SettingSubject, settingKinds } from "@keywork-app/protocol";
import { createMemo, createSignal, Show } from "solid-js";
import { z } from "zod";
import { arcHueRank } from "../../chrome/identity.ts";
import { sessionName } from "../../chrome/session-name.ts";
import type { OutsideKind } from "../../surfaces/feel/arrange.ts";
import { yardRailActionId } from "../../yard/actions.ts";
import { agentMarkLabel, setOutLine } from "../../yard/copy.ts";
import { linkOpened, panelShell } from "../../yard/openings.ts";
import { panelTitleOf, satelliteOf } from "../../yard/satellites.ts";
import { SettingBody } from "../../yard/setting-body.tsx";
import { EmptyState } from "../empty-state.tsx";
import type { PaneKind, PaneSpec } from "../index.ts";
import { definePane, type KeyHints, type PaneProps, type ShellSeams } from "../registry.ts";

const settingSpec = z.object({
  kind: z.literal("setting"),
  setting: z
    .object({
      id: z.string(),
      creature: z.string().nullable(),
      sessionId: z.string(),
      what: z.object({
        kind: z.enum(settingKinds),
        ref: z.string(),
        title: z.string().optional(),
      }),
      agent: z.object({ name: z.string().optional(), color: z.string().optional() }).optional(),
      mark: z.string().optional(),
    })
    .optional(),
});

export type SettingSpec = z.output<typeof settingSpec>;

export type SetOut = NonNullable<SettingSpec["setting"]>;

export const settingPaneWords = {
  heading: "in something set out for you",
  title: "set out for you",
  help: "the newest thing set out for you, as a pane of its own",
  command: "open the newest thing set out for you as a pane of its own",
  empty: (keys: KeyHints) =>
    `nothing is set out · ${keys.chord(yardRailActionId)} reaches the rail`,
} as const;

export const settingPane = definePane<SettingSpec>({
  kind: "setting",
  heading: settingPaneWords.heading,
  spec: settingSpec,
  home: "main",
  attire: "house",
  title: ({ setting }) => (setting === undefined ? settingPaneWords.title : panelTitleOf(setting)),
  emptyState: settingPaneWords.empty,
  component: SettingPane,
  summon: {
    action: "setting.summon",
    chords: "none",
    help: settingPaneWords.help,
    command: { name: "set-out", description: settingPaneWords.command },
    spec: async (shell) => settingSpecOf(newestOf(await stillOut(shell))),
  },
  subject: (spec) => spec.setting?.id,
  adornments: ({ setting }, shell) =>
    setting === undefined
      ? {}
      : {
          hueRank: arcHueRank(
            shell.store.summary(setting.sessionId),
            shell.store.surfaces.state.ordinals,
          ),
          ribbon: setOutLine(setting, ownerOf(setting, shell)),
          agent: setting.agent === undefined ? undefined : agentMarkLabel(setting.agent),
          agentColor: setting.agent?.color,
          tag: setting.mark,
        },
});

export function settingSpecOf(setting: SetOut | undefined): SettingSpec {
  if (setting === undefined) return { kind: "setting" };
  const { id, creature, sessionId, agent, mark } = setting;
  const { kind, ref, title } = setting.what;
  const what = title === undefined ? { kind, ref } : { kind, ref, title };
  const shown = { id, creature, sessionId, what };
  return {
    kind: "setting",
    setting: {
      ...shown,
      ...(agent !== undefined && { agent }),
      ...(mark !== undefined && { mark }),
    },
  };
}

export function settingShownBy(spec: PaneSpec | undefined): SetOut | undefined {
  return spec?.kind === "setting" ? spec.setting : undefined;
}

export function paneShownBy(setting: SetOut): PaneSpec | undefined {
  const shown = satelliteOf(setting);
  return shown.kind === "pane" ? shown.spec : undefined;
}

export function kindWorkedIn(spec: PaneSpec): PaneKind {
  const setting = settingShownBy(spec);
  return setting === undefined ? spec.kind : (paneShownBy(setting)?.kind ?? spec.kind);
}

export function outsideKindOfSetting(setting: SetOut | undefined): OutsideKind {
  const kind = setting === undefined ? undefined : paneShownBy(setting)?.kind;
  return kind === "file" || kind === "diff" || kind === "conversation" ? kind : "note";
}

function SettingPane(props: PaneProps<SettingSpec>) {
  return (
    <Show
      when={props.spec.setting}
      fallback={<EmptyState line={settingPane.emptyState(props.shell.keys)} />}
    >
      {(setting) => <SetOutPane {...props} setting={setting()} />}
    </Show>
  );
}

function SetOutPane(props: PaneProps<SettingSpec> & { setting: SetOut }) {
  const [navigated, setNavigated] = createSignal<PaneSpec>();
  const shown = createMemo(() => satelliteOf(props.setting).kind);
  const pane = createMemo(
    (): PaneSpec | undefined => navigated() ?? paneShownBy(props.setting),
    undefined,
    { equals: sameValue },
  );
  const open = (what: SettingSubject): void => {
    const openBeside = props.shell.openFromSetting;
    if (openBeside !== undefined) openBeside(props.setting.id, what);
    else if (what.kind === "url") void props.shell.host.openExternal(what.ref);
  };
  const shell = createMemo(() =>
    panelShell(props.shell, { paneId: props.id, open, rebind: setNavigated }),
  );
  const openLink = (event: MouseEvent): void => {
    const what = linkOpened(event);
    if (what === undefined) return;
    event.preventDefault();
    open(what);
  };

  return (
    <div
      class="kw-setting"
      data-setting={props.setting.id}
      // Solid delegates onClick to the document its bundle loaded in; a pane outside lives in another.
      on:click={openLink}
    >
      <SettingBody
        paneId={props.id}
        setting={props.setting}
        shown={shown()}
        pane={pane()}
        focused={props.focused}
        shell={shell()}
        onAction={(handler) => props.onAction(handler)}
      />
    </div>
  );
}

async function stillOut(shell: ShellSeams): Promise<readonly Setting[]> {
  const listed = await Promise.resolve()
    .then(() => shell.client.settings())
    .catch(() => undefined);
  return Array.isArray(listed) ? listed : [];
}

function newestOf(settings: readonly Setting[]): Setting | undefined {
  return settings
    .filter((setting) => setting.state === "live" || setting.state === "pinned")
    .toSorted((one, other) => Date.parse(other.at) - Date.parse(one.at))[0];
}

function ownerOf(setting: SetOut, shell: ShellSeams): string {
  const { creature, sessionId } = setting;
  if (creature !== null) return shell.creatureNames?.nameOf(creature) ?? creature;
  return sessionName(shell.store.summary(sessionId), shell.store.projection(sessionId));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
