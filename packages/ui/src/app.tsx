import {
  type KeyworkClient,
  keyworkClientOver,
  type RetryWaker,
  retryWaker,
  type ServerFeed,
  serverFeed,
} from "@keywork-app/client";
import { createSignal, Match, onCleanup, Switch } from "solid-js";
import { sessionName } from "./chrome/session-name.ts";
import { reportNeedsYou } from "./host/needs-you-report.ts";
import { describeFailure, type HostPort, type OpenedWorkspace } from "./host/port.ts";
import { hostFetch } from "./host/transport.ts";
import { frameTick } from "./shell/frame-tick.ts";
import { createNeedsYouQueue, createWaiting } from "./shell/needs-you-queue.ts";
import { OpenScreen } from "./shell/open-screen.tsx";
import {
  type ServerStanding,
  serverUp,
  standingAfterFailure,
  standingAfterLoss,
} from "./shell/server-standing.ts";
import { createSessionStore, type SessionStore } from "./shell/session-store.ts";
import { WorkspaceView } from "./shell/workspace-view.tsx";
import { wearRememberedTheme } from "./theme/wardrobe.ts";
import "./shell/shell.css";

export interface AppProps {
  host: HostPort;
  connect?: ((host: HostPort, workspace: string) => KeyworkClient) | undefined;
}

interface Connected {
  opened: OpenedWorkspace;
  client: KeyworkClient;
  feed: ServerFeed;
  waker: RetryWaker;
  store: SessionStore;
  stopWaiting: () => void;
}

export function App(props: AppProps) {
  wearRememberedTheme({ storage: localStorageOrNone() });
  const needsYou = createNeedsYouQueue();
  onCleanup(reportNeedsYou(needsYou, props.host));
  const [connected, setConnected] = createSignal<Connected>();
  const [opening, setOpening] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();
  const [standing, setStanding] = createSignal<ServerStanding>(serverUp);

  const connect =
    props.connect ??
    ((host: HostPort, workspace: string) => keyworkClientOver(hostFetch(host, workspace)));

  const open = async (path: string): Promise<void> => {
    setFailure(undefined);
    setOpening(path);
    try {
      await attach(path);
    } catch (cause) {
      setFailure(`could not open ${path} · ${messageOf(cause)}`);
    } finally {
      setOpening(undefined);
    }
  };

  const attach = async (path: string): Promise<void> => {
    const result = await props.host.openWorkspace(path);
    if (!result.ok) {
      setFailure(describeFailure(result.failure));
      return;
    }
    const client = connect(props.host, result.opened.workspace);
    const waker = retryWaker();
    const feed = serverFeed(client, { tick: frameTick(), retry: waker });
    const store = createSessionStore(client, feed);
    const stopWaiting = needsYou.attach(
      createWaiting({
        workspace: result.opened.workspace,
        feed,
        asks: () => client.asks(),
        memory: store.memory,
        sessionName: (sessionId) =>
          sessionName(store.summary(sessionId), store.projection(sessionId)),
      }),
    );
    try {
      await store.refresh();
    } catch (cause) {
      stopWaiting();
      store.dispose();
      feed.close();
      throw cause;
    }
    void store.surfaces.load();
    const previous = connected();
    setStanding(serverUp);
    setConnected({ opened: result.opened, client, feed, waker, store, stopWaiting });
    previous?.stopWaiting();
  };

  const liveFor = (workspace: string): Connected | undefined => {
    const live = connected();
    return live?.opened.workspace === workspace ? live : undefined;
  };
  const regain = (live: Connected, opened: OpenedWorkspace): void => {
    setConnected({ ...live, opened });
    setStanding(serverUp);
    live.waker.wake();
  };

  const stopLoss = props.host.onServerLost((loss) => {
    if (liveFor(loss.workspace) !== undefined) setStanding(standingAfterLoss(loss));
  });
  const stopRegain = props.host.onServerRegained((regained) => {
    const live = liveFor(regained.workspace);
    if (live !== undefined) regain(live, regained.opened);
  });

  const stopOpenRequests = props.host.onOpenRequested((path) => void open(path));

  onCleanup(() => {
    stopLoss();
    stopRegain();
    stopOpenRequests();
    const live = connected();
    live?.stopWaiting();
    live?.store.dispose();
    live?.feed.close();
  });

  const host: HostPort = {
    ...props.host,
    restartServer: async (path) => {
      const reopened = await props.host.restartServer(path);
      const live = liveFor(path);
      if (live === undefined) return reopened;
      if (reopened.ok) regain(live, reopened.opened);
      else setStanding(standingAfterFailure(reopened.failure));
      return reopened;
    },
  };

  return (
    <Switch>
      <Match when={connected()}>
        {(live) => (
          <WorkspaceView
            host={host}
            workspace={live().opened.workspace}
            serverLabel={serverLabel(live().opened)}
            attached={live().opened.attached}
            standing={standing()}
            store={live().store}
            client={live().client}
            feed={live().feed}
            needsYou={needsYou}
          />
        )}
      </Match>
      <Match when={connected() === undefined}>
        <OpenScreen host={props.host} failure={failure()} opening={opening()} onOpen={open} />
      </Match>
    </Switch>
  );
}

function serverLabel(opened: OpenedWorkspace): string {
  return opened.attached ? `attached · ${opened.serverLabel}` : opened.serverLabel;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function localStorageOrNone(): Storage | undefined {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
