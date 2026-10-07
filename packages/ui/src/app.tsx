import {
  type KeyworkClient,
  keyworkClientOver,
  type ServerFeed,
  serverFeed,
} from "@keywork-app/client";
import { createSignal, Match, onCleanup, Switch } from "solid-js";
import { describeFailure, type HostPort, type OpenedWorkspace } from "./host/port.ts";
import { hostFetch } from "./host/transport.ts";
import { frameTick } from "./shell/frame-tick.ts";
import { OpenScreen } from "./shell/open-screen.tsx";
import { notifyOnInbox } from "./shell/needs-you.ts";
import { createSessionStore, type SessionStore } from "./shell/session-store.ts";
import { WorkspaceView } from "./shell/workspace-view.tsx";
import "./shell/shell.css";

export interface AppProps {
  host: HostPort;
  connect?: ((host: HostPort, workspace: string) => KeyworkClient) | undefined;
}

interface Connected {
  opened: OpenedWorkspace;
  feed: ServerFeed;
  store: SessionStore;
  stopNotifying: () => void;
}

export function App(props: AppProps) {
  const [connected, setConnected] = createSignal<Connected>();
  const [opening, setOpening] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();

  const connect =
    props.connect ??
    ((host: HostPort, workspace: string) => keyworkClientOver(hostFetch(host, workspace)));

  const open = async (path: string): Promise<void> => {
    setFailure(undefined);
    setOpening(path);
    const result = await props.host.openWorkspace(path);
    setOpening(undefined);
    if (!result.ok) {
      setFailure(describeFailure(result.failure));
      return;
    }
    const client = connect(props.host, result.opened.workspace);
    const feed = serverFeed(client, { tick: frameTick() });
    const store = createSessionStore(client, feed);
    const stopNotifying = notifyOnInbox(store.memory, props.host, result.opened.workspace);
    await store.refresh();
    void store.surfaces.load();
    setConnected({ opened: result.opened, feed, store, stopNotifying });
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

  return (
    <Switch>
      <Match when={connected()}>
        {(live) => (
          <WorkspaceView
            host={props.host}
            workspace={live().opened.workspace}
            serverLabel={serverLabel(live().opened)}
            store={live().store}
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
