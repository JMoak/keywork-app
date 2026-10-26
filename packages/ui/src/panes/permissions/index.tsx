import { isGrantRefusal, type PermissionRule, type PermissionsView } from "@keywork-app/protocol";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { sessionName } from "../../chrome/session-name.ts";
import { quietMark } from "../../chrome/title-row.tsx";
import { ruleText } from "../../page/ask-card.tsx";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ConfirmLine, createCursor, NoticeLine, OverviewRow } from "../overview/rows.tsx";
import { definePane, type KeyHints, type PaneProps, type ShellSeams } from "../registry.ts";
import { createPermissionsStore, type Grant } from "./store.ts";
import "../overview/overview.css";
import "./permissions.css";

const permissionsSpec = z.object({ kind: z.literal("permissions") });

export type PermissionsSpec = z.output<typeof permissionsSpec>;

export const permissionsPane = definePane<PermissionsSpec>({
  kind: "permissions",
  spec: permissionsSpec,
  home: "right",
  attire: "house",
  title: () => "permissions",
  emptyState: (keys) =>
    `no grants yet · ${keys.chord("ask.workspace")} answers an ask and remembers it for the workspace`,
  component: PermissionsList,
  summon: {
    action: "permissions.summon",
    chords: "leader shift+p",
    help: "permissions pane",
    command: {
      name: "permissions",
      description: "see the trusted reads and every grant beyond the configured rules",
    },
    spec: () => ({ kind: "permissions" }),
  },
  localActions: {
    "permissions.down": {
      chords: ["j", "down"],
      help: "next grant",
      command: { name: "grant-next", description: "move to the next grant" },
    },
    "permissions.up": {
      chords: ["k", "up"],
      help: "previous grant",
      command: { name: "grant-previous", description: "move to the previous grant" },
    },
    "permissions.revoke": {
      chords: "x",
      help: "revoke the grant",
      command: {
        name: "grant-revoke",
        description: "revoke this workspace or session grant so the call asks again",
      },
    },
    "permissions.bundle": {
      chords: "b",
      help: "show or fold the trusted reads",
      command: {
        name: "trusted-reads",
        description: "show or fold the read rules a trusted workspace allows without asking",
      },
    },
  },
});

export interface SessionGrants {
  readonly sessionId: string;
  readonly title: string;
  readonly rules: readonly PermissionRule[];
  readonly quiet: boolean;
  readonly firstRow: number;
}

export function grantRows(view: PermissionsView): Grant[] {
  return [
    ...view.workspace.map((rule): Grant => ({ layer: "workspace", rule })),
    ...grantingSessions(view).flatMap(([sessionId, rules]) =>
      rules.map((rule): Grant => ({ layer: "session", rule, sessionId })),
    ),
  ];
}

export type SessionTitles = (sessionId: string) => string | undefined;

export function sessionGrantGroups(view: PermissionsView, titleOf: SessionTitles): SessionGrants[] {
  const sessions = sessionsShown(view);
  return sessions.map(([sessionId, rules], index) => ({
    sessionId,
    title: sessionNamed(sessionId, titleOf),
    rules,
    quiet: isQuiet(view, sessionId),
    firstRow: view.workspace.length + rowsBefore(sessions, index),
  }));
}

export const quietGrantedNothing = "quiet has granted nothing here yet";

export function revokeQuestion(grant: Grant, titleOf: SessionTitles): string {
  const reach =
    grant.layer === "workspace" ? "every session" : sessionNamed(grant.sessionId, titleOf);
  return `revoke ${ruleText(grant.rule)} for ${reach}`;
}

export function revokedNotice(grant: Grant, titleOf: SessionTitles): string {
  const again =
    grant.layer === "workspace"
      ? "it asks again"
      : `it asks again in ${sessionNamed(grant.sessionId, titleOf)}`;
  return `revoked ${ruleText(grant.rule)} · ${again}`;
}

export function postureWord(view: PermissionsView): "trusted" | "untrusted" {
  return view.trusted ? "trusted" : "untrusted";
}

export function bundleHead(view: PermissionsView, open: boolean, keys: KeyHints): string {
  const head = `bundle · ${postureWord(view)}`;
  const count = view.bundle.length;
  if (count === 0) return head;
  const rules = count === 1 ? "1 read rule" : `${count} read rules`;
  const toggle = keys.chord("permissions.bundle");
  return `${head} · ${rules} · ${toggle} ${open ? "folds them" : "shows them"}`;
}

export function sessionTitleIn(shell: Pick<ShellSeams, "store">): SessionTitles {
  return (sessionId) => {
    const summary = shell.store.summary(sessionId);
    if (summary === undefined) return undefined;
    const name = sessionName(summary, shell.store.projection(sessionId));
    return name === "session" ? `session ${sessionId.slice(0, 8)}` : name;
  };
}

export function bundleRuleText(rule: PermissionRule): string {
  return rule.effect === "allow" ? ruleText(rule) : `${ruleText(rule)} ${rule.effect}s`;
}

export function hasGrants(view: PermissionsView): boolean {
  return view.workspace.length > 0 || Object.values(view.session).some((rules) => rules.length > 0);
}

export function isQuiet(view: PermissionsView, sessionId: string): boolean {
  return view.quiet?.includes(sessionId) === true;
}

function grantingSessions(view: PermissionsView): Array<[string, PermissionRule[]]> {
  return Object.entries(view.session).filter(([, rules]) => rules.length > 0);
}

function sessionsShown(view: PermissionsView): Array<[string, PermissionRule[]]> {
  const granting = grantingSessions(view);
  const granted = new Set(granting.map(([sessionId]) => sessionId));
  const quietOnly = (view.quiet ?? [])
    .filter((sessionId) => !granted.has(sessionId))
    .map((sessionId): [string, PermissionRule[]] => [sessionId, []]);
  return [...granting, ...quietOnly];
}

function rowsBefore(sessions: Array<[string, PermissionRule[]]>, index: number): number {
  return sessions.slice(0, index).reduce((rows, [, rules]) => rows + rules.length, 0);
}

function sessionNamed(sessionId: string, titleOf: SessionTitles): string {
  return titleOf(sessionId) ?? `session ${sessionId.slice(0, 8)}`;
}

function PermissionsList(props: PaneProps<PermissionsSpec>) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused && confirming() === undefined,
  );
  const store = createPermissionsStore(props.shell.client, props.shell.feed);
  onMount(() => void store.refetch());
  onCleanup(() => store.dispose());

  const view = () => store.state.view;
  const rows = createMemo(() => grantRows(view()));
  const cursor = createCursor(() => rows().length);
  const [confirming, setConfirming] = createSignal<Grant>();
  const [notice, setNotice] = createSignal<string>();
  const [bundleOpen, setBundleOpen] = createSignal(false);
  const sessionTitle = sessionTitleIn(props.shell);

  const revoke = async (grant: Grant): Promise<void> => {
    setConfirming(undefined);
    const outcome = await store.revoke(grant);
    setNotice(isGrantRefusal(outcome) ? outcome.detail : revokedNotice(grant, sessionTitle));
  };

  props.onAction((action) => {
    switch (action) {
      case "permissions.down":
        return cursor.move(1);
      case "permissions.up":
        return cursor.move(-1);
      case "permissions.revoke":
        return setConfirming(rows()[cursor.index()]);
      case "permissions.bundle":
        return setBundleOpen((open) => !open);
    }
  });

  return (
    <section class="kw-ov kw-perm" aria-label="permissions" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span>{bundleHead(view(), bundleOpen(), props.shell.keys)}</span>
        <span class="kw-ov-head-detail">x revokes a grant</span>
      </div>
      <Show when={view().bundle.length === 0}>
        <p class="kw-perm-quiet">no read posture until the workspace is trusted</p>
      </Show>
      <Show when={bundleOpen() && view().bundle.length > 0}>
        <ul class="kw-perm-bundle" aria-label="bundle">
          <For each={view().bundle}>
            {(rule) => (
              <li class="kw-perm-rule" data-effect={rule.effect}>
                {bundleRuleText(rule)}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show
        when={hasGrants(view()) || (view().quiet?.length ?? 0) > 0}
        fallback={<EmptyState line={permissionsPane.emptyState(props.shell.keys)} />}
      >
        <h3 class="kw-perm-heading">workspace grants</h3>
        <Show when={view().workspace.length === 0}>
          <p class="kw-perm-quiet">none yet</p>
        </Show>
        <ol class="kw-ov-list kw-perm-grants" aria-label="workspace grants">
          <For each={view().workspace}>
            {(rule, index) => (
              <OverviewRow
                cursor={index() === cursor.index()}
                aside="every session"
                onClick={() => cursor.set(index())}
              >
                {ruleText(rule)}
              </OverviewRow>
            )}
          </For>
        </ol>
        <h3 class="kw-perm-heading">session grants</h3>
        <For each={sessionGrantGroups(view(), sessionTitle)}>
          {(group) => (
            <section class="kw-perm-session" aria-label={group.title}>
              <p class="kw-perm-session-title">
                {group.title}
                <Show when={group.quiet}>
                  <span class="kw-perm-session-quiet">{quietMark} quiet</span>
                </Show>
              </p>
              <Show when={group.rules.length === 0}>
                <p class="kw-perm-quiet">{quietGrantedNothing}</p>
              </Show>
              <ol class="kw-ov-list kw-perm-grants">
                <For each={group.rules}>
                  {(rule, index) => (
                    <OverviewRow
                      cursor={group.firstRow + index() === cursor.index()}
                      onClick={() => cursor.set(group.firstRow + index())}
                    >
                      {ruleText(rule)}
                    </OverviewRow>
                  )}
                </For>
              </ol>
            </section>
          )}
        </For>
      </Show>
      <Show when={confirming()}>
        {(grant) => (
          <ConfirmLine
            question={revokeQuestion(grant(), sessionTitle)}
            onConfirm={() => void revoke(grant())}
            onCancel={() => setConfirming(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={store.state.notice} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}
