import {
  type KeyworkClient,
  keyworkClientOver,
  type ServerFeed,
  serverFeed,
} from "@keywork-app/client";
import { createSignal, Match, onCleanup, Switch } from "solid-js";
import { reportPendingAsks } from "./host/pending-asks.ts";
import { describeFailure, type HostPort, type OpenedWorkspace } from "./host/port.ts";
import { hostFetch } from "./host/transport.ts";
import { frameTick } from "./shell/frame-tick.ts";
import { notifyOnInbox } from "./shell/needs-you.ts";
import { OpenScreen } from "./shell/open-screen.tsx";
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
  store: SessionStore;
  stopNotifying: () => void;
}

export function App(props: AppProps) {
  wearRememberedTheme({ storage: localStorageOrNone() });
  const [connected, setConnected] = createSignal<Connected>();
  const [opening, setOpening] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();

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
    const feed = serverFeed(client, { tick: frameTick() });
    const store = createSessionStore(client, feed);
    const stopInbox = notifyOnInbox(store.memory, props.host, result.opened.workspace);
    const stopAsks = reportPendingAsks({
      feed,
      asks: () => client.asks(),
      host: props.host,
      workspace: result.opened.workspace,
      titleOf: (sessionId) => store.summary(sessionId)?.title,
    });
    const stopNotifying = (): void => {
      stopInbox();
      stopAsks();
    };
    try {
      await store.refresh();
    } catch (cause) {
      stopNotifying();
      store.dispose();
      feed.close();
      throw cause;
    }
    void store.surfaces.load();
    setConnected({ opened: result.opened, client, feed, store, stopNotifying });
  };

  const stopLoss = props.host.onServerLost((loss) => {
    const live = connected();
    if (live === undefined || loss.workspace !== live.opened.workspace) return;
    setFailure(describeFailure(loss.failure));
  });

  const stopOpenRequests = props.host.onOpenRequested((path) => void open(path));

  onCleanup(() => {
    stopLoss();
    stopOpenRequests();
    const live = connected();
    live?.stopNotifying();
    live?.store.dispose();
    live?.feed.close();
  });

  const host: HostPort = {
    ...props.host,
    restartServer: async (path) => {
      const reopened = await props.host.restartServer(path);
      if (reopened.ok) {
        setConnected((live) => live && { ...live, opened: reopened.opened });
      }
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
            store={live().store}
            client={live().client}
            feed={live().feed}
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
