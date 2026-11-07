import {
  type ConsoleClient,
  keyworkClientOver,
  retryWaker,
  type ServerFeed,
  serverFeed,
} from "@keywork-app/client";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { WorkspaceView as WorkspaceReading } from "@keywork-app/protocol";
import { type Accessor, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { ProductProvider, useProductProfile } from "./chrome/product.ts";
import { sessionName } from "./chrome/session-name.ts";
import { reportNeedsYou } from "./host/needs-you-report.ts";
import { describeFailure, type HostPort, type OpenedWorkspace } from "./host/port.ts";
import { hostFetch } from "./host/transport.ts";
import { type PaneSpec, parsePaneSpec } from "./panes/index.ts";
import type { PaneSpecBase, ShellSeams } from "./panes/registry.ts";
import type {
  CreatureProjectsPort,
  SteadHomeScope,
  SteadProjectContext,
  SteadSessionReference,
} from "./panes/stead/home-scope.ts";
import { frameTick } from "./shell/frame-tick.ts";
import {
  createNeedsYouQueue,
  createWaiting,
  type NeedsYouQueue,
  sessionVerdicts,
} from "./shell/needs-you-queue.ts";
import { OpenScreen } from "./shell/open-screen.tsx";
import {
  type ServerStanding,
  serverUp,
  standingAfterFailure,
  standingAfterLoss,
} from "./shell/server-standing.ts";
import { createSessionStore, type SessionStore } from "./shell/session-store.ts";
import { createTrustFlow, type TrustFlow } from "./shell/trust.ts";
import { WorkspaceView } from "./shell/workspace-view.tsx";
import { wearRememberedTheme } from "./theme/wardrobe.ts";
import "./shell/shell.css";

export interface AppProps {
  host: HostPort;
  profile?: ProductProfile;
  connect?: ((host: HostPort, workspace: string) => ConsoleClient) | undefined;
}

export function App(props: AppProps) {
  return (
    <ProductProvider value={props.profile ?? keyworkProfile}>
      <ConnectedApp {...props} />
    </ProductProvider>
  );
}

interface Connection {
  readonly client: ConsoleClient;
  readonly feed: ServerFeed;
  readonly store: SessionStore;
  readonly trust?: TrustFlow;
  identity: Accessor<WorkspaceReading | undefined>;
  opened: Accessor<OpenedWorkspace>;
  standing: Accessor<ServerStanding>;
  mark(standing: ServerStanding): void;
  regain(opened: OpenedWorkspace): void;
  close(): void;
}

function ConnectedApp(props: AppProps) {
  const profile = useProductProfile();
  const startsAtHome = profile.startup === "creature" && props.host.openHome !== undefined;
  wearRememberedTheme({ storage: localStorageOrNone() });
  const needsYou = createNeedsYouQueue();
  onCleanup(reportNeedsYou(needsYou, props.host));
  const [project, setProject] = createSignal<Connection>();
  const [home, setHome] = createSignal<Connection>();
  const [homePane, setHomePane] = createSignal<PaneSpec>();
  const [opening, setOpening] = createSignal<string>();
  const [failure, setFailure] = createSignal<string>();
  const [homeFailure, setHomeFailure] = createSignal<string>();
  const active = () => project() ?? (startsAtHome ? home() : undefined);
  const connect =
    props.connect ?? ((host: HostPort, path: string) => keyworkClientOver(hostFetch(host, path)));
  let disposed = false;
  let openingHome = false;
  let openingProject = Promise.resolve();
  let newestOpen = 0;
  let lastRequestedProject: string | undefined;

  const liveFor = (path: string): Connection | undefined => {
    const focused = project();
    if (focused?.opened().workspace === path) return focused;
    const resident = home();
    return resident?.opened().workspace === path ? resident : undefined;
  };

  const host: HostPort = {
    ...props.host,
    restartServer: async (path) => {
      const result = await props.host.restartServer(path);
      const connection = liveFor(path);
      if (result.ok) connection?.regain(result.opened);
      else connection?.mark(standingAfterFailure(result.failure));
      return result;
    },
  };

  const open = (path: string): Promise<void> => {
    const request = ++newestOpen;
    lastRequestedProject = path;
    setFailure(undefined);
    setOpening(path);
    const run = async (): Promise<void> => {
      if (disposed || request !== newestOpen) return;
      try {
        const result = await props.host.openWorkspace(path);
        if (disposed || request !== newestOpen) return;
        if (!result.ok) {
          setFailure(describeFailure(result.failure));
          return;
        }
        const connection = await attach(result.opened, false, host, connect, needsYou);
        if (disposed || request !== newestOpen) {
          connection.close();
          return;
        }
        const previous = project();
        setProject(connection);
        previous?.close();
      } catch (cause) {
        if (!disposed && request === newestOpen)
          setFailure(`could not open ${path} · ${messageOf(cause)}`);
      } finally {
        if (!disposed && request === newestOpen) setOpening(undefined);
      }
    };
    openingProject = openingProject.then(run);
    return openingProject;
  };

  const attachHome = async (retry: boolean): Promise<void> => {
    let failure: string | undefined;
    try {
      if (retry) await props.host.enableRuntime?.();
      if (disposed) return;
      const result = await props.host.openHome?.();
      if (result === undefined || disposed) return;
      if (!result.ok) {
        failure = describeFailure(result.failure);
        return;
      }
      const connection = await attach(result.opened, true, host, connect, needsYou);
      if (disposed) connection.close();
      else setHome(connection);
    } catch (cause) {
      failure = messageOf(cause);
    } finally {
      openingHome = false;
      if (!disposed) setHomeFailure(failure);
    }
  };

  const ensureHome = (retry = false): void => {
    if (props.host.openHome === undefined || home() !== undefined || openingHome) return;
    openingHome = true;
    setHomeFailure(undefined);
    void attachHome(retry);
  };
  const enableProjectRuntime = async (): Promise<void> => {
    try {
      await props.host.enableRuntime?.();
      if (lastRequestedProject !== undefined) await open(lastRequestedProject);
    } catch (cause) {
      if (!disposed) setFailure(messageOf(cause));
    }
  };
  const chooseProject = async (): Promise<void> => {
    const chosen = await props.host.pickFolder();
    if (chosen !== undefined) await open(chosen);
  };

  const steadHome = (surface: ShellSeams): SteadHomeScope | undefined => {
    const resident = home();
    const identity = resident?.identity()?.identity;
    if (resident === undefined || identity === undefined) return undefined;
    const homeIsActive = resident === active();
    const openPane = (spec: PaneSpecBase): void => {
      if (homeIsActive) surface.openPane(spec);
      else setHomePane(parsePaneSpec(spec));
    };
    const openSession = (reference: SteadSessionReference): void => {
      if (reference.workspace === identity) {
        if (homeIsActive) surface.sessions.openSession(reference.session);
        else {
          void resident.store.open(reference.session);
          setHomePane({ kind: "conversation", sessionId: reference.session });
        }
      } else if (reference.workspace === project()?.identity()?.identity) {
        setHomePane(undefined);
        surface.sessions.openSession(reference.session);
      }
    };
    return {
      shell: homeIsActive
        ? surface
        : homeShell(surface, resident, openPane, (session) =>
            openSession({ workspace: identity, session }),
          ),
      workspace: identity,
      projects: creatureProjects(resident.client),
      activeProject: () => activeProject(project(), surface),
      openSession,
      openProject: () => void chooseProject(),
      openMemory: () => openPane({ kind: "memory" }),
      projectFailure: failure,
      presentedPane: homePane,
      dismissPane: () => setHomePane(undefined),
    };
  };

  onMount(() => {
    if (startsAtHome) ensureHome();
  });
  onCleanup(props.host.onOpenRequested((path) => void open(path)));
  onCleanup(
    props.host.onServerLost((loss) => liveFor(loss.workspace)?.mark(standingAfterLoss(loss))),
  );
  onCleanup(
    props.host.onServerRegained((regained) => liveFor(regained.workspace)?.regain(regained.opened)),
  );
  onCleanup(() => {
    disposed = true;
    project()?.close();
    home()?.close();
  });

  return (
    <Switch>
      <Match when={active()} keyed>
        {(connection) => (
          <WorkspaceView
            host={host}
            workspace={connection.opened().workspace}
            serverLabel={serverLabel(connection.opened())}
            attached={connection.opened().attached}
            standing={connection.standing()}
            store={connection.store}
            client={connection.client}
            feed={connection.feed}
            needsYou={needsYou}
            home={connection === home()}
            steadHome={steadHome}
            prepareSteadHome={props.host.openHome === undefined ? undefined : ensureHome}
            steadHomeFailure={homeFailure()}
          />
        )}
      </Match>
      <Match when={startsAtHome}>
        <main class="kw-open">
          <div class="kw-open-sheet">
            <h1 class="kw-open-name">{profile.name}</h1>
            <Show
              when={homeFailure()}
              fallback={<p role="status">Opening your creature’s home…</p>}
            >
              {(reason) => (
                <>
                  <p class="kw-open-failure" role="status">
                    {reason()}
                  </p>
                  <button type="button" class="kw-open-pick" onClick={() => ensureHome(true)}>
                    Retry home
                  </button>
                </>
              )}
            </Show>
          </div>
        </main>
      </Match>
      <Match when={true}>
        <OpenScreen
          host={host}
          failure={failure()}
          opening={opening()}
          onOpen={open}
          onEnableRuntime={
            props.host.enableRuntime === undefined ? undefined : () => void enableProjectRuntime()
          }
        />
      </Match>
    </Switch>
  );
}

async function attach(
  firstOpen: OpenedWorkspace,
  isHome: boolean,
  host: HostPort,
  connect: NonNullable<AppProps["connect"]>,
  needsYou: NeedsYouQueue,
): Promise<Connection> {
  const path = firstOpen.workspace;
  const client = connect(host, path);
  const waker = retryWaker();
  const feed = serverFeed(client, { tick: frameTick(), retry: waker });
  const store = createSessionStore(client, feed);
  const [opened, setOpened] = createSignal(firstOpen);
  const [standing, mark] = createSignal<ServerStanding>(serverUp);
  const [identity, setIdentity] = createSignal<WorkspaceReading>();
  const readIdentity = async (): Promise<void> => {
    if (host.openHome === undefined) return;
    const workspace = await client.workspace().catch(() => undefined);
    if (workspace !== undefined) setIdentity(workspace);
  };
  try {
    await Promise.all([readIdentity(), store.refresh()]);
    if (isHome && identity()?.identity === undefined)
      throw new Error("Could not read your creature home identity.");
  } catch (cause) {
    store.dispose();
    feed.close();
    throw cause;
  }
  const trust = isHome
    ? createTrustFlow({
        client,
        feed,
        folder: path,
        restart: async () => {
          await host.restartServer(path);
        },
        attached: () => opened().attached,
        composedTrusted: async () => (await client.permissions()).trusted,
      })
    : undefined;
  const stopWaiting = needsYou.attach(
    createWaiting({
      workspace: path,
      feed,
      asks: () => client.asks(),
      chores: () => client.routineNeeds(),
      reviews: () => sessionVerdicts(client),
      memory: store.memory,
      sessionName: (sessionId) =>
        sessionName(store.summary(sessionId), store.projection(sessionId)),
    }),
  );
  void store.surfaces.load();
  return {
    client,
    feed,
    store,
    opened,
    standing,
    mark,
    identity,
    ...(trust !== undefined && { trust }),
    regain: (next) => {
      setOpened(next);
      mark(serverUp);
      waker.wake();
      void readIdentity();
      if (isHome) void store.refresh().catch(() => undefined);
      void trust?.refresh();
    },
    close: () => {
      stopWaiting();
      trust?.dispose();
      store.dispose();
      feed.close();
    },
  };
}

function homeShell(
  surface: ShellSeams,
  home: Connection,
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
    currentSession: () => undefined,
    focusedPane: surface.focusedPane,
    openPane,
    rebind: (_pane, spec) => openPane(spec),
    unseen: () => false,
    server: home.standing,
    sessions: {
      openSession,
      newSession: async () => openSession(await home.store.create()),
      startSession: async (_pane, text) => {
        const session = await home.store.create();
        await home.store.prompt(session, text, "queue");
        openSession(session);
      },
    },
  };
}

function activeProject(
  connection: Connection | undefined,
  surface: ShellSeams,
): SteadProjectContext | undefined {
  const project = connection?.identity();
  if (connection === undefined || project === undefined) return undefined;
  const focused = surface.currentIdeSession?.();
  const selected = focused === undefined ? undefined : connection.store.summary(focused);
  return {
    workspace: project.identity,
    label: project.name ?? project.anchor.root,
    ...(selected !== undefined && {
      ideSession: { workspace: project.identity, session: selected.id },
    }),
    session: (reference) => {
      if (reference.workspace !== project.identity) return undefined;
      const row = connection.store.summary(reference.session);
      if (row === undefined) return undefined;
      const status =
        (row.waiting?.asks ?? 0) > 0 ? "Waiting for approval" : row.working ? "Working" : "Ready";
      return { label: sessionName(row, connection.store.projection(reference.session)), status };
    },
  };
}

function creatureProjects(client: ConsoleClient): CreatureProjectsPort {
  return {
    list: async (slug) => (await client.listCreatureProjects(slug)).projects,
    bind: async (slug, workspace) => {
      await client.bindCreatureProject(slug, workspace);
    },
    unbind: async (slug, workspace) => {
      await client.unbindCreatureProject(slug, workspace);
    },
    start: async (slug, workspace, draft) =>
      (await client.startCreatureProjectThread(slug, workspace, draft)).session,
    discuss: async (slug, workspace, draft) =>
      (await client.discussCreatureProjectSession(slug, workspace, draft)).session,
  };
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
