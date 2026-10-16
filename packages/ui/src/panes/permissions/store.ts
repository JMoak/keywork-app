import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  PermissionRule,
  PermissionsView,
  RevokeOutcome,
} from "@keywork-app/protocol";
import { createStore } from "solid-js/store";
import { onReconnected } from "../../shell/surfaces-store.ts";

export type PermissionsClient = Pick<
  KeyworkClient,
  "permissions" | "revokeWorkspaceGrant" | "revokeSessionGrant"
>;

export type PermissionsFeed = Pick<ServerFeed, "subscribe" | "onNotice">;

export type Grant =
  | { readonly layer: "workspace"; readonly rule: PermissionRule }
  | { readonly layer: "session"; readonly rule: PermissionRule; readonly sessionId: string };

export interface PermissionsState {
  readonly view: PermissionsView;
  readonly loaded: boolean;
  readonly notice: string | undefined;
}

export interface PermissionsStore {
  readonly state: PermissionsState;
  refetch(): Promise<void>;
  revoke(grant: Grant): Promise<RevokeOutcome>;
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

  const revoke = async (grant: Grant): Promise<RevokeOutcome> => {
    const outcome =
      grant.layer === "workspace"
        ? await client.revokeWorkspaceGrant(grant.rule)
        : await client.revokeSessionGrant(grant.sessionId, grant.rule);
    await refetch();
    return outcome;
  };

  const stopFollowing = feed.subscribe((envelopes) => {
    if (envelopes.some(changesPermissions)) void refetch();
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

export function changesPermissions(envelope: BusEnvelope): boolean {
  if (envelope.type === "surface.changed") return envelope.payload.kind === "permissions";
  return recordsGrant(envelope);
}

export function recordsGrant(envelope: BusEnvelope): boolean {
  if (envelope.type !== "gate.permission") return false;
  const scope = envelope.payload.decision.scope;
  return scope === "session" || scope === "workspace";
}
