import type { ConsoleClient, ServerFeed } from "@keywork-app/client";
import type { Accessor } from "solid-js";
import type { OpenedWorkspace } from "../../host/port.ts";
import type { ServerStanding } from "../../shell/server-standing.ts";
import type { SessionStore } from "../../shell/session-store.ts";
import type { TrustFlow } from "../../shell/trust.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import type { SteadHomeScope } from "./home-scope.ts";

export interface HomeConnection {
  readonly client: ConsoleClient;
  readonly feed: ServerFeed;
  readonly store: SessionStore;
  readonly trust?: TrustFlow;
  opened: Accessor<OpenedWorkspace>;
  standing: Accessor<ServerStanding>;
}

export function homeShell(
  surface: ShellSeams,
  home: HomeConnection,
  openPane: (spec: PaneSpecBase) => void,
  openSession: (session: string) => void,
): SteadHomeScope["shell"] {
  return {
    host: surface.host,
    workspace: home.opened().workspace,
    store: home.store,
    feed: home.feed,
    client: home.client,
    keys: surface.keys,
    trust: home.trust ?? surface.trust,
    ...(surface.onboarding !== undefined && { onboarding: surface.onboarding }),
    ...(surface.companion !== undefined && { companion: surface.companion }),
    ...(surface.creatureNames !== undefined && { creatureNames: surface.creatureNames }),
    ...(surface.needsYou !== undefined && { needsYou: surface.needsYou }),
    ...(surface.drafts !== undefined && { drafts: surface.drafts }),
    currentSession: () => undefined,
    focusedPane: surface.focusedPane,
    openPane,
    rebind: (_pane, spec) => openPane(spec),
    unseen: () => false,
    server: home.standing,
    sessions: {
      openSession,
      newSession: async () => openPane({ kind: "conversation" }),
      startSession: async (_pane, text) => {
        const session = await home.store.create();
        openSession(session);
        await home.store.prompt(session, text, "queue");
      },
    },
  };
}
