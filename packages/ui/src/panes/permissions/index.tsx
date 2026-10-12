import { isGrantRefusal, type PermissionRule, type PermissionsView } from "@keywork-app/protocol";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { ruleText } from "../../page/ask-card.tsx";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ConfirmLine, createCursor, NoticeLine, OverviewRow } from "../overview/rows.tsx";
import { definePane, type PaneProps } from "../registry.ts";
import { createPermissionsStore } from "./store.ts";
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
      help: "next workspace grant",
      command: { name: "grant-next", description: "move to the next workspace grant" },
    },
    "permissions.up": {
      chords: ["k", "up"],
      help: "previous workspace grant",
      command: { name: "grant-previous", description: "move to the previous workspace grant" },
    },
    "permissions.revoke": {
      chords: "x",
      help: "revoke the workspace grant",
      command: {
        name: "grant-revoke",
        description: "revoke this workspace grant so the call asks again",
      },
    },
  },
});

export interface SessionGrants {
  readonly sessionId: string;
  readonly title: string;
  readonly rules: readonly PermissionRule[];
}

export function sessionGrantGroups(
  view: PermissionsView,
  titleOf: (sessionId: string) => string | undefined,
): SessionGrants[] {
  return Object.entries(view.session)
    .filter(([, rules]) => rules.length > 0)
    .map(([sessionId, rules]) => ({ sessionId, title: titleOf(sessionId) ?? sessionId, rules }));
}

export function postureWord(view: PermissionsView): "trusted" | "untrusted" {
  return view.trusted ? "trusted" : "untrusted";
}

export function bundleRuleText(rule: PermissionRule): string {
  return rule.effect === "allow" ? ruleText(rule) : `${ruleText(rule)} ${rule.effect}s`;
}

export function hasGrants(view: PermissionsView): boolean {
  return view.workspace.length > 0 || Object.values(view.session).some((rules) => rules.length > 0);
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
  const workspaceGrants = () => view().workspace;
  const cursor = createCursor(() => workspaceGrants().length);
  const [confirming, setConfirming] = createSignal<PermissionRule>();
  const [notice, setNotice] = createSignal<string>();
  const sessionTitle = (sessionId: string) => props.shell.store.summary(sessionId)?.title;

  const revoke = async (rule: PermissionRule): Promise<void> => {
    setConfirming(undefined);
    const outcome = await store.revoke(rule);
    setNotice(
      isGrantRefusal(outcome) ? outcome.detail : `revoked ${ruleText(rule)} · it asks again`,
    );
  };

  props.onAction((action) => {
    switch (action) {
      case "permissions.down":
        return cursor.move(1);
      case "permissions.up":
        return cursor.move(-1);
      case "permissions.revoke":
        return setConfirming(workspaceGrants()[cursor.index()]);
    }
  });

  return (
    <section class="kw-ov kw-perm" aria-label="permissions" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span>bundle · {postureWord(view())}</span>
        <span class="kw-ov-head-detail">x revokes a workspace grant</span>
      </div>
      <Show
        when={view().bundle.length > 0}
        fallback={<p class="kw-perm-quiet">no read posture until the workspace is trusted</p>}
      >
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
        when={hasGrants(view())}
        fallback={<EmptyState line={permissionsPane.emptyState(props.shell.keys)} />}
      >
        <h3 class="kw-perm-heading">workspace grants</h3>
        <ol class="kw-ov-list kw-perm-grants" aria-label="workspace grants">
          <For each={workspaceGrants()}>
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
              <p class="kw-perm-session-title">{group.title}</p>
              <ul class="kw-perm-bundle">
                <For each={group.rules}>
                  {(rule) => <li class="kw-perm-rule">{ruleText(rule)}</li>}
                </For>
              </ul>
            </section>
          )}
        </For>
      </Show>
      <Show when={confirming()}>
        {(rule) => (
          <ConfirmLine
            question={`revoke ${ruleText(rule())} for every session`}
            onConfirm={() => void revoke(rule())}
            onCancel={() => setConfirming(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={store.state.notice} tone="error" />
      <NoticeLine text={notice()} />
    </section>
  );
}
