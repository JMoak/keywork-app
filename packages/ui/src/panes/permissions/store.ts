import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  PermissionRule,
  PermissionsView,
  RevokeOutcome,
} from "@keywork-app/protocol";
import { createStore } from "solid-js/store";
import { onReconnected } from "../../shell/surfaces-store.ts";

export type PermissionsClient = Pick<KeyworkClient, "permissions" | "revokeWorkspaceGrant">;

export type PermissionsFeed = Pick<ServerFeed, "subscribe" | "onNotice">;

export interface PermissionsState {
  readonly view: PermissionsView;
  readonly loaded: boolean;
  readonly notice: string | undefined;
}

export interface PermissionsStore {
  readonly state: PermissionsState;
  refetch(): Promise<void>;
  revoke(rule: PermissionRule): Promise<RevokeOutcome>;
  dispose(): void;
}

export const noPermissions: PermissionsView = {
  trusted: false,
  bundle: [],
  workspace: [],
  session: {},
};

export function createPermissionsStore(
  client: PermissionsClient,
  feed: PermissionsFeed,
): PermissionsStore {
  const [state, setState] = createStore<PermissionsState>({
    view: noPermissions,
    loaded: false,
    notice: undefined,
  });

  const refetch = async (): Promise<void> => {
    try {
      const view = await client.permissions();
      setState({ view, loaded: true, notice: undefined });
    } catch (error) {
      setState({ loaded: true, notice: error instanceof Error ? error.message : String(error) });
    }
  };

  const revoke = async (rule: PermissionRule): Promise<RevokeOutcome> => {
    const outcome = await client.revokeWorkspaceGrant(rule);
    await refetch();
    return outcome;
  };

  const stopFollowing = feed.subscribe((envelopes) => {
    if (envelopes.some(recordsGrant)) void refetch();
  });
  const stopReloading = onReconnected(feed, () => void refetch());

  return {
    state,
    refetch,
    revoke,
    dispose: () => {
      stopFollowing();
      stopReloading();
    },
  };
}

export function recordsGrant(envelope: BusEnvelope): boolean {
  if (envelope.type !== "gate.permission") return false;
  const scope = envelope.payload.decision.scope;
  return scope === "session" || scope === "workspace";
}
