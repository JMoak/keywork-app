import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import {
  type ArcSummary,
  type BotSummary,
  type BusEnvelope,
  isSurfaceRefusal,
  type McpServerStatus,
  type ServerTheme,
  type SurfaceKind,
  type WorkspaceChoice,
} from "@keywork-app/protocol";
import { createStore, produce } from "solid-js/store";

export type SurfaceListings = Pick<
  KeyworkClient,
  "mcpServers" | "arcs" | "bots" | "workspaces" | "themes"
>;

export type SurfaceVerbs = Pick<
  KeyworkClient,
  | "restartMcpServer"
  | "setMcpServerEnabled"
  | "mcpServerTools"
  | "createArc"
  | "closeArc"
  | "abandonArc"
  | "setArcTheme"
  | "bindSessionArc"
  | "createBot"
  | "bindSessionBot"
  | "createWorkspace"
  | "useWorkspace"
  | "focusWorkspaceDir"
  | "unfocusWorkspaceDir"
>;

export type SurfacesClient = SurfaceListings & SurfaceVerbs;

export type SurfaceName = "mcp" | "arcs" | "bots" | "workspaces" | "themes";

export interface SurfacesState {
  readonly mcp: readonly McpServerStatus[];
  readonly arcs: readonly ArcSummary[];
  readonly ordinals: Readonly<Record<string, number>>;
  readonly bots: readonly BotSummary[];
  readonly workspaces: readonly WorkspaceChoice[];
  readonly themes: readonly ServerTheme[];
  readonly activeTheme: string | undefined;
  readonly loaded: Readonly<Partial<Record<SurfaceName, true>>>;
  readonly notices: Readonly<Partial<Record<SurfaceName, string>>>;
}

export interface SurfacesStore {
  readonly state: SurfacesState;
  readonly verbs: SurfaceVerbs;
  load(): Promise<void>;
  refetch(kind: SurfaceKind): Promise<void>;
  arcOrdinal(slug: string | undefined): number | undefined;
  arcTheme(slug: string): string | undefined;
  bot(name: string | undefined): BotSummary | undefined;
  dispose(): void;
}

export interface SurfacesSeams {
  sessionsChanged?: (() => void) | undefined;
}

export const surfaceNames: readonly SurfaceName[] = ["mcp", "arcs", "bots", "workspaces", "themes"];

export function surfacesOfKind(kind: SurfaceKind): readonly SurfaceName[] {
  return kind === "workspaces" ? ["workspaces", "arcs", "bots"] : [kind];
}

export function createSurfacesStore(
  client: SurfacesClient,
  feed: Pick<ServerFeed, "subscribe" | "onNotice">,
  seams: SurfacesSeams = {},
): SurfacesStore {
  const [state, setState] = createStore<MutableSurfacesState>({
    mcp: [],
    arcs: [],
    ordinals: {},
    bots: [],
    workspaces: [],
    themes: [],
    activeTheme: undefined,
    loaded: {},
    notices: {},
  });

  const settle = (name: SurfaceName, write: (draft: MutableSurfacesState) => void): void => {
    setState(
      produce((draft) => {
        write(draft);
        draft.loaded[name] = true;
        delete draft.notices[name];
      }),
    );
  };

  const fetchers: Record<SurfaceName, () => Promise<void>> = {
    mcp: async () => {
      const servers = await client.mcpServers();
      settle("mcp", (draft) => {
        draft.mcp = [...servers];
      });
    },
    arcs: async () => {
      const reading = await client.arcs();
      if (isSurfaceRefusal(reading)) {
        setState(
          produce((draft) => {
            draft.arcs = [];
            draft.ordinals = {};
            draft.loaded.arcs = true;
            draft.notices.arcs = reading.detail;
          }),
        );
        return;
      }
      settle("arcs", (draft) => {
        draft.arcs = [...reading.arcs];
        draft.ordinals = { ...reading.ordinals };
      });
    },
    bots: async () => {
      const bots = await client.bots();
      settle("bots", (draft) => {
        draft.bots = [...bots];
      });
    },
    workspaces: async () => {
      const workspaces = await client.workspaces();
      settle("workspaces", (draft) => {
        draft.workspaces = [...workspaces];
      });
    },
    themes: async () => {
      const listing = await client.themes();
      settle("themes", (draft) => {
        draft.themes = [...listing.themes];
        draft.activeTheme = listing.active;
      });
    },
  };

  const fetchOne = async (name: SurfaceName): Promise<void> => {
    try {
      await fetchers[name]();
    } catch (error) {
      setState("notices", name, error instanceof Error ? error.message : String(error));
    }
  };

  const refetch = async (kind: SurfaceKind): Promise<void> => {
    await Promise.all(surfacesOfKind(kind).map(fetchOne));
    if (kind === "arcs" || kind === "bots") seams.sessionsChanged?.();
  };

  const load = async (): Promise<void> => {
    await Promise.all(surfaceNames.map(fetchOne));
  };

  const stopFollowing = feed.subscribe((envelopes) => {
    for (const kind of changedKinds(envelopes)) void refetch(kind);
  });
  const stopReloading = onReconnected(feed, () => void load());

  return {
    state,
    verbs: client,
    load,
    refetch,
    arcOrdinal: (slug) => (slug === undefined ? undefined : state.ordinals[slug]),
    arcTheme: (slug) => state.arcs.find((arc) => arc.slug === slug)?.theme,
    bot: (name) => (name === undefined ? undefined : state.bots.find((bot) => bot.name === name)),
    dispose: () => {
      stopFollowing();
      stopReloading();
    },
  };
}

export function onReconnected(
  feed: Pick<ServerFeed, "onNotice">,
  listener: () => void,
): () => void {
  let connections = 0;
  return feed.onNotice((notice) => {
    if (notice.kind !== "connected") return;
    connections += 1;
    if (connections > 1) listener();
  });
}

interface MutableSurfacesState {
  mcp: McpServerStatus[];
  arcs: ArcSummary[];
  ordinals: Record<string, number>;
  bots: BotSummary[];
  workspaces: WorkspaceChoice[];
  themes: ServerTheme[];
  activeTheme: string | undefined;
  loaded: Partial<Record<SurfaceName, true>>;
  notices: Partial<Record<SurfaceName, string>>;
}

function changedKinds(envelopes: readonly BusEnvelope[]): Set<SurfaceKind> {
  const kinds = new Set<SurfaceKind>();
  for (const envelope of envelopes) {
    if (envelope.type === "surface.changed") kinds.add(envelope.payload.kind);
  }
  return kinds;
}
