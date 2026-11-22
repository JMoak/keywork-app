import {
  type ConsoleClient,
  emptyProjection,
  type ServerFeed,
  type SessionProjection,
} from "@keywork-app/client";
import { defaultHub, type YardSetting } from "@keywork-app/habitat";
import { isSurfaceRefusal } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { FirstRun } from "../chrome/first-run.tsx";
import { gapSeamReach, rootRemPx } from "../chrome/gap.ts";
import { createStripPreference, NeedsYouStrip, stripLine } from "../chrome/needs-you-strip.tsx";
import { hueStop, type LifecycleState, PaneFrame } from "../chrome/pane-frame.tsx";
import { PaneShelf, type ShelfItem } from "../chrome/pane-shelf.tsx";
import { useProductProfile } from "../chrome/product.ts";
import { readingMs } from "../chrome/reading-time.ts";
import { gapCells } from "../chrome/root-attributes.ts";
import { StatusLine } from "../chrome/status-line.tsx";
import { telemetry } from "../chrome/telemetry.ts";
import { createUpdateOffer, updateCommands } from "../chrome/update-offer.ts";
import { followCompanion } from "../companion/console.ts";
import { createCompanionController } from "../companion/floating.ts";
import { followActivations } from "../host/activation.ts";
import { openInEditorWith } from "../host/editor.ts";
import { describeFailure, type HostPort } from "../host/port.ts";
import { hostFetch } from "../host/transport.ts";
import { holdsModifiersOf } from "../keys/held.ts";
import {
  type ActionTarget,
  actionScopes,
  appActions,
  bindingHelp,
  type Chord,
  chordsOfKey,
  formatChord,
  type Keymap,
  type KeymapResult,
  keymapFromConfig,
} from "../keys/index.ts";
import { listenForKeys } from "../keys/listen.ts";
import { createLiveKeymap, followKeybindings, foreignActionsLine } from "../keys/live.ts";
import { isTextField, keyFocusOf, keyTargetOf } from "../keys/typing.ts";
import {
  type Direction,
  type DockSide,
  type DropZone,
  dropZoneRects,
  type PaneId,
  type PointerIntent,
  type Rect,
  type Scene,
  type Screen,
  sameSeam,
  seamZoneRect,
  type Verdict,
} from "../layout/index.ts";
import { OrdinalBadge, ZoomBadge } from "../layout/pane-badges.tsx";
import { createOnboardingController } from "../onboarding/controller.ts";
import type { AskPick } from "../page/ask-card.tsx";
import { actionCommand } from "../palette/action-commands.ts";
import { CommandRegistry, type CommandSpec } from "../palette/commands.ts";
import { markCommand } from "../palette/mark-commands.ts";
import { HelpOverlay, helpSections, Palette } from "../palette/palette.tsx";
import { PaneTray } from "../palette/pane-tray.tsx";
import {
  botJumps,
  type SurfaceCommandSeams,
  surfaceCommands,
} from "../palette/surface-commands.ts";
import { choresOverFetch } from "../panes/chores/port.ts";
import { inferenceWords } from "../panes/conversation/controls.ts";
import { createCreatureNames } from "../panes/creature/names.ts";
import {
  definitionOf,
  type PaneDefinition,
  type PaneKind,
  type PaneSpec,
  parsePaneSpec,
  type ShellSeams,
} from "../panes/index.ts";
import { holdKeysWherePressed, sendStrayKeysHome } from "../panes/keyboard-home.ts";
import { workingSession } from "../panes/overview/working-session.ts";
import { createCloseGate, type PaneActionHandler } from "../panes/registry.ts";
import { kindWorkedIn } from "../panes/setting/index.tsx";
import { type SteadHomeScope, shellForStead } from "../panes/stead/home-scope.ts";
import { steadPane } from "../panes/stead/index.tsx";
import { postureStorageKey } from "../posture/record.ts";
import { createTrustSetup, followTrustArrival } from "../posture/trust-setup.ts";
import { paneOutsideActionId, panesInsideActionId } from "../surfaces/actions.ts";
import { offerSurfacesPerfHook } from "../surfaces/feel/perf-hook.ts";
import type { PaneFacts } from "../surfaces/outside/panes-outside.tsx";
import {
  documentOf,
  everyWindow,
  focusedIn,
  isElement,
  isPageBody,
  listenInEveryDocument,
  listenInEveryWindow,
  restsOnPage,
  windowOf,
} from "../surfaces/runtime/index.ts";
import { attireStorageKey, createAttire, type Outfit } from "../theme/attire.ts";
import { keyworkNight } from "../theme/themes.ts";
import { themeVariables } from "../theme/variables.ts";
import { createWardrobe } from "../theme/wardrobe.ts";
import { yardToggleActionId } from "../yard/actions.ts";
import type { PanelWay } from "../yard/entering.ts";
import { createYardSurface, Yard } from "../yard/index.ts";
import { panelIdAt } from "../yard/panels.ts";
import { answerHeldAsk, askingRun } from "./answer-ask.ts";
import { conversationHub, hubColumn, hubTabsHeight, tabbedOut } from "./conversation-hub.ts";
import { createDraftLedger } from "./drafts.ts";
import {
  creaturesListed,
  recordSteadSummoned,
  steadSummonedAt,
  steadSummonStorageKey,
  steadSummonWanted,
} from "./first-frame.ts";
import {
  createKeyboardScope,
  type KeyboardScope,
  KeyboardScopeProvider,
  paneIdOf,
} from "./keyboard-claim.ts";
import { createRoomMaker, roomNotices } from "./making-room.ts";
import { createPaneMarks } from "./marks.ts";
import { choreAcceptedLine, heldChoresAmong } from "./needs-you.ts";
import { createJumps, type NeedsYouPlace } from "./needs-you-jumps.ts";
import type { NeedsYouQueue } from "./needs-you-queue.ts";
import { connectingPane, OpenFailureCard, type OpenFailureNotice } from "./open-failure.tsx";
import { createOutsidePanes, outsideNotices } from "./outside-panes.ts";
import { decidedAmong, overturnStanding } from "./overturn.ts";
import { bindPointerGestures, type PointerGestures } from "./pointer-gestures.ts";
import { toggleSessionQuiet } from "./quiet.ts";
import {
  backNotice,
  isLost,
  reconnectCommand,
  type ServerStanding,
  serverUp,
  standingLine,
} from "./server-standing.ts";
import { createSessionReads } from "./session-reads.ts";
import type { SessionStore } from "./session-store.ts";
import { createSettingPanes } from "./setting-panes.ts";
import {
  createTiler,
  type PaneSlot,
  parseTilerState,
  refusalNotices,
  type ShelfEntry,
} from "./tiler.ts";
import { createTrustFlow, type TrustFlow } from "./trust.ts";
import { TrustCard } from "./trust-card.tsx";

export interface WorkspaceViewProps {
  home?: boolean | undefined;
  prepareSteadHome?: ((retry?: boolean) => void) | undefined;
  steadHomeFailure?: string | undefined;
  steadHome?: ((shell: ShellSeams) => SteadHomeScope | undefined) | undefined;
  openFailure?: OpenFailureNotice | undefined;
  host: HostPort;
  workspace: string;
  serverLabel: string;
  store: SessionStore;
  client: ConsoleClient;
  feed: ServerFeed;
  needsYou: NeedsYouQueue;
  attached?: boolean | undefined;
  standing?: ServerStanding | undefined;
  keymap?: Keymap | undefined;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
}

type Overlay =
  | { kind: "palette"; query: string | undefined; scope: PaneKind | undefined }
  | { kind: "help" }
  | { kind: "tray"; pane: PaneId; commands: readonly CommandSpec[] }
  | undefined;

export function WorkspaceView(props: WorkspaceViewProps) {
  const keyboard = createKeyboardScope();
  return (
    <KeyboardScopeProvider value={keyboard}>
      <WorkspaceSurface {...props} keyboard={keyboard} />
    </KeyboardScopeProvider>
  );
}

function WorkspaceSurface(props: WorkspaceViewProps & { keyboard: KeyboardScope }) {
  const keyboard = props.keyboard;
  const onboarding = createOnboardingController();
  const companion = createCompanionController();
  const storage = props.storage ?? localStorageOrNone();
  const profile = useProductProfile();
  const storageKey = `${profile.id}.layout:${props.workspace}`;
  const tiler = createTiler(restoredState(storage, storageKey));
  const keymap = props.keymap ?? keymapFromConfig();
  const live = createLiveKeymap(keymap);
  const keys = live.keys;
  const registry = new CommandRegistry();
  const update = createUpdateOffer(props.host);
  registry.addSource(() => updateCommands(update, profile));
  const wardrobe = createWardrobe({
    serverThemes: () => props.store.surfaces.state.themes,
    storage,
  });
  const paneTitle = (spec: PaneSpec): string => definitionOf(spec.kind).title(spec, shell);
  const sessionOfPane = (paneId: PaneId): string | undefined => {
    const spec = tiler.spec(paneId);
    return spec !== undefined && "sessionId" in spec ? spec.sessionId : undefined;
  };
  const attire = createAttire({
    wardrobe,
    storage,
    storageKey: attireStorageKey(props.workspace),
    arcOf: (paneId) => props.store.summary(sessionOfPane(paneId))?.arc,
    dressable: (paneId) => {
      const spec = tiler.spec(paneId);
      return spec !== undefined && definitionOf(spec.kind).attire === "work";
    },
    titleOf: (paneId) => {
      const spec = tiler.spec(paneId);
      return spec === undefined ? paneId : paneTitle(spec);
    },
    arcTheme: (slug) => props.store.surfaces.arcTheme(slug),
    onArcWorn: (slug, theme) => recordArcTheme(slug, theme),
  });
  const marks = createPaneMarks((paneId) => tiler.spec(paneId) !== undefined);
  const quiet = props.store.quiet;
  const drafts = createDraftLedger({ storage, key: `${profile.id}.drafts:${props.workspace}` });
  const strip = createStripPreference(storage);
  const [screen, setScreen] = createSignal<Screen>({ width: 1280, height: 800 });
  const [overlay, setOverlay] = createSignal<Overlay>();
  let overlayLeftPanel: string | undefined;
  let leftOutside: PaneId | undefined;
  let pressedIn: Node = document;
  const openOverlay = (next: Overlay): void => {
    if (overlay() === undefined) overlayLeftPanel = yard.panels.inside();
    if (next?.kind !== "tray") leaveForTheConsole();
    setOverlay(next);
  };
  const leaveForTheConsole = (): void => {
    const pressedOutside = outsidePanes.paneAt(pressedIn);
    if (pressedOutside === undefined) return;
    leftOutside ??= pressedOutside;
    outsidePanes.focusConsole();
  };
  const returnOutside = (): void => {
    if (overlay() !== undefined || yard.control.railActive()) return;
    const pane = leftOutside;
    leftOutside = undefined;
    if (pane !== undefined && tiler.focused() === pane) outsidePanes.focus(pane);
  };
  createEffect(
    on(overlay, (open, wasOpen) => {
      if (open !== undefined || wasOpen === undefined) return;
      const panel = overlayLeftPanel;
      overlayLeftPanel = undefined;
      returnOutside();
      if (panel !== undefined && yard.panels.focus(panel)) return;
      if (!keyboard.restore()) keyboard.returnHome();
      settleKeyboardSoon();
    }),
  );
  const [leaderArmed, setLeaderArmed] = createSignal(false);
  const [ordinalsShown, setOrdinalsShown] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [seen, setSeen] = createSignal<Record<PaneId, number>>({});
  const [changingLayer, setChangingLayer] = createSignal<PaneId>();
  const floatFocused = (): Verdict => {
    const pane = tiler.focused();
    setChangingLayer(pane);
    setTimeout(() => setChangingLayer((held) => (held === pane ? undefined : held)), layerChangeMs);
    return tiler.float(screen());
  };
  const localHandlers = new Map<PaneId, PaneActionHandler>();
  const awaitingHandlers = new Map<PaneId, () => void>();
  const closeGate = createCloseGate();
  const [gestures, setGestures] = createSignal<PointerGestures>();
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  let workspaceRoot: HTMLDivElement | undefined;
  let stage: HTMLDivElement | undefined;

  const say = (text: string): void => {
    setNotice(text);
    setTimeout(
      () => setNotice((current) => (current === text ? undefined : current)),
      readingMs(text),
    );
  };
  const recordArcTheme = async (slug: string, theme: string | null): Promise<void> => {
    const answer = await props.client.setArcTheme(slug, theme);
    if (isSurfaceRefusal(answer)) say(`${answer.detail} · worn in this window only`);
  };
  const act = (verdict: Verdict, otherwise?: string): void => {
    const line = verdict.ok ? verdict.notice : (verdict.notice ?? refusalLine(verdict, otherwise));
    if (line !== undefined) say(line);
  };
  const refusalLine = (
    verdict: Extract<Verdict, { ok: false }>,
    otherwise: string | undefined,
  ): string | undefined =>
    verdict.refused === "outside"
      ? outsideNotices.isOutside(keys.describe(paneOutsideActionId))
      : otherwise;

  const paneBodies = new Map<PaneId, HTMLElement>();
  const groundOf = (pane: PaneId | undefined): HTMLElement | undefined =>
    (pane === undefined ? undefined : paneBodies.get(pane))?.closest<HTMLElement>(
      "[data-pane-id]",
    ) ?? undefined;
  const focusStrayedFrom = (ground: HTMLElement): boolean => {
    if (restsOnPage(ground)) return true;
    const active = focusedIn(ground);
    return active !== null && stage?.contains(active) === true && !ground.contains(active);
  };
  const settleKeyboard = (): void => {
    if (disposed || overlay() !== undefined || keyboard.restore()) return;
    const ground = groundOf(tiler.focused());
    if (ground === undefined || !focusStrayedFrom(ground)) return;
    keyboard.returnHome();
    if (!ground.contains(focusedIn(ground))) ground.focus({ preventScroll: true });
  };
  const settleKeyboardSoon = (): void => queueMicrotask(settleKeyboard);
  const catchFallingFocus = (event: FocusEvent): void => {
    if (event.relatedTarget !== null || !isElement(event.target)) return;
    const fellFrom = event.target;
    const panel = panelIdAt(fellFrom);
    queueMicrotask(() => {
      if (!restsOnPage(fellFrom)) return;
      if (panel === undefined || !yard.panels.focus(panel)) settleKeyboard();
    });
  };
  const strayedInto = (ground: HTMLElement, target: Element): boolean =>
    isPageBody(target) ? documentOf(target) === documentOf(ground) : ground.contains(target);
  const takeStrayKeyHome = (target: Element): HTMLElement | undefined => {
    const pane = tiler.focused();
    const ground = groundOf(pane);
    if (pane === undefined || ground === undefined || overlay() !== undefined) return undefined;
    if (!strayedInto(ground, target)) return undefined;
    const home = keyboard.homeOf(pane);
    if (home?.contains(target)) return undefined;
    if (home !== undefined) home.focus({ preventScroll: true });
    else keyboard.returnHome();
    const landed = focusedIn(ground);
    return isElement(landed) && landed !== target && ground.contains(landed)
      ? (landed as HTMLElement)
      : undefined;
  };
  const focusedSession = (): string | undefined => {
    const spec = tiler.focusedSpec();
    return spec?.kind === "conversation" ? spec.sessionId : undefined;
  };
  const focusedKind = (): PaneKind | undefined => {
    const spec = tiler.focusedSpec();
    return spec === undefined ? undefined : kindWorkedIn(spec);
  };

  const trust = createTrustFlow({
    client: props.client,
    feed: props.feed,
    restart: async () => {
      await props.host.restartServer(props.workspace);
      await props.store.refresh();
    },
    attached: () => props.attached === true,
    composedTrusted: async () => (await props.client.permissions()).trusted,
    folder: props.workspace,
    say: (line) => say(line),
  });
  onCleanup(() => trust.dispose());
  const standing = (): ServerStanding => props.standing ?? serverUp;
  createEffect(
    on(standing, (now, before) => {
      if (before?.kind !== "lost" || now.kind !== "up") return;
      say(backNotice(props.serverLabel));
      void trust.refresh();
      void props.store.refresh();
    }),
  );
  const reconnect = async (): Promise<void> => {
    say("looking for the server again");
    const reopened = await props.host.restartServer(props.workspace);
    if (!reopened.ok) say(`still no server · ${describeFailure(reopened.failure)}`);
  };
  const projectTrusted = createMemo(() => trust.state().kind === "trusted");
  createEffect(
    on(projectTrusted, (trusted) => {
      const scope = { workspace: props.workspace, projectTrusted: trusted };
      onCleanup(followKeybindings(props.host, scope, live, say));
    }),
  );
  const trustSetup = createTrustSetup({
    client: props.client,
    storage,
    storageKey: postureStorageKey(props.workspace),
  });

  const paneShowing = (sessionId: string): PaneId | undefined => {
    tiler.version();
    return tiler.findPane((spec) => spec.kind === "conversation" && spec.sessionId === sessionId);
  };
  const focusedFreshConversation = (): PaneId | undefined => {
    const spec = tiler.focusedSpec();
    return spec?.kind === "conversation" && spec.sessionId === undefined
      ? tiler.focused()
      : undefined;
  };
  const showPlace = (place: NeedsYouPlace): void => {
    if (place.workspace !== props.workspace) {
      const scope = steadHome();
      if (scope?.shell.workspace === place.workspace) {
        const shown = tiler.summon({ kind: steadPane.kind }, screen());
        act(shown);
        if (!shown.ok) return;
        if (place.kind === "session")
          scope.openSession({ workspace: scope.workspace, session: place.sessionId });
        else scope.shell.openPane({ kind: place.kind });
      } else {
        void props.host.switchWorkspace(place.workspace);
      }
      return;
    }
    if (place.kind === "memory") {
      act(tiler.summon({ kind: "memory" }, screen()));
      return;
    }
    if (place.kind === "chores") {
      act(tiler.summon({ kind: "chores" }, screen()));
      return;
    }
    const showing = paneShowing(place.sessionId);
    if (showing === undefined) shell.sessions.openSession(place.sessionId);
    else act(tiler.focus(showing));
  };
  const jumps = createJumps({
    items: () => props.needsYou.items(),
    focused: () => tiler.focused(),
    show: showPlace,
    refocus: (pane) => tiler.spec(pane) !== undefined && tiler.focus(pane).ok,
  });
  const arcOutfit = (slug: string | undefined): Outfit | undefined => {
    const name = slug === undefined ? undefined : attire.worn({ kind: "arc", slug });
    const fitting = wardrobe.fittings().find((candidate) => candidate.name === name);
    return fitting === undefined || !("theme" in fitting)
      ? undefined
      : { theme: fitting.theme, source: "arc", arc: slug };
  };
  const dressedSession = (sessionId: string): Outfit | undefined => {
    const pane = paneShowing(sessionId);
    const outfit =
      pane === undefined ? arcOutfit(props.store.summary(sessionId)?.arc) : attire.outfit(pane);
    return outfit?.source === "window" ? undefined : outfit;
  };
  const [lastIdeSession, setLastIdeSession] = createSignal<string>();
  const [hubConversation, setHubConversation] = createSignal<PaneId>();
  createEffect(() => {
    const spec = tiler.focusedSpec();
    if (spec?.kind !== "conversation") return;
    setLastIdeSession(spec.sessionId);
    setHubConversation(tiler.focused());
  });
  const hubThread = (): string | undefined => {
    const pane = hubConversation();
    const spec = pane === undefined ? undefined : tiler.spec(pane);
    return spec?.kind === "conversation" ? spec.sessionId : undefined;
  };
  const reads = createSessionReads();
  createEffect(() => reads.sight(props.store.state.summaries));
  createEffect(() => {
    const looking = props.store.summary(focusedSession());
    if (looking !== undefined) reads.read(looking);
  });

  const shell: ShellSeams = {
    get steadHome() {
      return steadHome();
    },
    get prepareSteadHome() {
      return props.prepareSteadHome;
    },
    get steadHomeFailure() {
      return props.steadHomeFailure;
    },
    currentIdeSession: lastIdeSession,
    companion,
    onboarding,
    creatureNames: createCreatureNames(),
    store: props.store,
    client: props.client,
    feed: props.feed,
    trust,
    trustSetup,
    wardrobe,
    attire,
    marks,
    quiet,
    drafts,
    needsYou: {
      queue: props.needsYou,
      reads,
      revealing: jumps.revealing,
      jump: jumps.to,
      visit: (sessionId) =>
        jumps.toPlace({ kind: "session", workspace: props.workspace, sessionId }),
      dressed: dressedSession,
    },
    server: standing,
    openPane: (spec) => {
      const parsed = parsePaneSpec(spec);
      if (parsed !== undefined) act(tiler.summon(parsed, screen()));
    },
    closePane: (paneId) => act(closePane(paneId)),
    openFromSetting: (settingId, what) => {
      const from = yard.settings().find((setting) => setting.id === settingId);
      if (from !== undefined) yard.open(from, what);
    },
    openInEditor: async (path, line) => {
      try {
        say(await openInEditorWith(props.host, props.workspace, path, line));
      } catch (cause) {
        say(cause instanceof Error ? cause.message : String(cause));
        throw cause;
      }
    },
    keys: {
      chord: (action) => keys.describe(action) ?? "an unbound key",
      leader: () => keys.leader(),
    },
    commands: registry,
    host: props.host,
    workspace: props.workspace,
    currentSession: focusedSession,
    focusedPane: () => tiler.focused(),
    rebind: (paneId, spec) => {
      const parsed = parsePaneSpec(spec);
      if (parsed !== undefined) tiler.bind(paneId, parsed);
    },
    unseen: (view, completed) => {
      const unseen = (seen()[view.id] ?? 0) < completed;
      if (!view.focused) return unseen && completed > 0;
      if (unseen) setSeen((current) => ({ ...current, [view.id]: completed }));
      return false;
    },
    sessions: {
      openSession: (sessionId) => {
        const fresh = focusedFreshConversation();
        const spec = { kind: "conversation", sessionId } as const;
        if (fresh !== undefined && paneShowing(sessionId) === undefined) tiler.bind(fresh, spec);
        else show(spec);
      },
      newSession: () => summon(definitionOf("conversation")),
      startSession: async (paneId, text) => {
        const sessionId = await props.store.create();
        tiler.bind(paneId, { kind: "conversation", sessionId });
        await props.store.open(sessionId);
        await props.store.prompt(sessionId, text, "queue");
      },
    },
  };

  const summon = async (definition: PaneDefinition<PaneSpec>, variant?: string): Promise<void> => {
    if (definition.summon === undefined) return;
    const spec = await definition.summon.spec(shell, variant);
    if (yard.openFromPanel(spec)) return;
    show(spec, variant);
    if (!keyboard.restore()) keyboard.returnHome();
  };
  const show = (spec: PaneSpec, variant?: string): void => {
    const full = spec.kind === "conversation" && tiler.crowds(spec, screen(), variant);
    const lastUsed = full ? tiler.lastFocusedOf("conversation") : undefined;
    if (lastUsed === undefined) act(tiler.summon(spec, screen(), variant));
    else showInPlaceOf(lastUsed, spec);
  };
  const showInPlaceOf = (pane: PaneId, spec: PaneSpec): void => {
    const left = tiler.spec(pane);
    tiler.bind(pane, spec);
    act(tiler.focus(pane));
    if (left?.kind === "conversation" && left.sessionId !== undefined)
      say(
        refusalNotices.shownInstead(paneTitle(spec), paneTitle(left), keys.describe("tree.summon")),
      );
  };
  followTrustArrival(trust.state, {
    granted: () => void summon(definitionOf("posture")),
    found: () =>
      void trustSetup.launchNotice().then((line) => {
        if (line !== undefined) say(line);
      }),
  });
  const presentedHome = (): PaneSpec | undefined => {
    if (tiler.focusedSpec()?.kind !== "stead") return undefined;
    return parsePaneSpec(steadHome()?.presentedPane?.());
  };
  const askHolder = () => {
    const presented = presentedHome();
    const home = presented?.kind === "conversation" ? steadHome()?.shell : undefined;
    return {
      store: home?.store ?? props.store,
      sessionId: presented?.kind === "conversation" ? presented.sessionId : focusedSession(),
    };
  };
  const askWaitsInReach = (): boolean => {
    const holder = askHolder();
    return askingRun(holder.store.projection(holder.sessionId)) !== undefined;
  };
  const answerFocusedAsk = (pick: AskPick): void => {
    const holder = askHolder();
    const answering = { store: holder.store, approveKey: shell.keys.chord("ask.approve") };
    void answerHeldAsk(answering, { sessionId: holder.sessionId }, pick).then((line) => {
      if (line !== undefined) say(line);
    });
  };
  const toggleFocusedQuiet = async (): Promise<void> => {
    const chords = {
      quiet: shell.keys.chord("session.quiet"),
      permissions: shell.keys.chord("permissions.summon"),
    };
    say(await toggleSessionQuiet({ quiet, client: props.client, chords }, focusedSession()));
  };
  const toggleMark = (paneId: PaneId): string => {
    if (!marks.has(paneId) && !attire.dressable(paneId))
      return `${attire.describe({ kind: "pane", id: paneId })} always wears the window's theme`;
    marks.toggle(paneId);
    return marks.has(paneId) ? markedNotice(marks.all().length) : "unmarked";
  };
  const toggleFocusedMark = (): void => {
    const focused = tiler.focused();
    say(focused === undefined ? "no pane is focused · nothing to mark" : toggleMark(focused));
  };
  const clearMarks = (): void => {
    const count = marks.all().length;
    marks.clear();
    say(count === 0 ? "no panes are marked" : `unmarked ${paneCount(count)}`);
  };
  const deliverToPane = (paneId: PaneId, action: string, argument?: string): void => {
    const handler = localHandlers.get(paneId);
    if (handler !== undefined) handler(action, argument);
    else awaitingHandlers.set(paneId, () => localHandlers.get(paneId)?.(action, argument));
  };
  const summonThen = (kind: PaneKind, action?: string, argument?: string): void => {
    void summon(definitionOf(kind)).then(() => {
      const pane = tiler.focused();
      if (action === undefined || pane === undefined || tiler.spec(pane)?.kind !== kind) return;
      deliverToPane(pane, action, argument);
    });
  };
  const trays = new Map<PaneKind, readonly CommandSpec[]>();
  const trayOf = (kind: PaneKind): readonly CommandSpec[] => {
    const built = trays.get(kind) ?? registry.ownedBy(kind);
    trays.set(kind, built);
    return built;
  };
  const openPaneCommands = (): void => {
    const pane = tiler.focused();
    const spec = tiler.focusedSpec();
    const commands = spec === undefined ? [] : trayOf(spec.kind);
    if (pane !== undefined && commands.length > 0) openOverlay({ kind: "tray", pane, commands });
    else if (spec === undefined) say("no pane is focused · nothing to list");
    else say(`${paneTitle(spec)} has no commands of its own`);
  };

  const steadHome = createMemo(() => props.steadHome?.(shell));
  const homeApart = createMemo(() => {
    const scope = steadHome();
    return scope === undefined || scope.shell.workspace === props.workspace
      ? undefined
      : shellForStead(shell, scope);
  });
  const yard = createYardSurface({
    firstFrame: profile.firstFrame,
    shell,
    home: homeApart,
    leavesTheYard: (setting) => settingPanes.leavesTheYard(setting),
    host: props.host,
    focusedThread: () =>
      focusedSession() ?? (profile.startup === "creature" ? undefined : hubThread()),
    storage,
    chord: shell.keys.chord,
    say,
    returnHome: () => {
      if (!keyboard.restore()) keyboard.returnHome();
    },
  });
  const focusedPaneHub = (): boolean => yard.control.on() && profile.startup !== "creature";
  const room = createRoomMaker({
    port: props.host.surfaces,
    storage,
    storageKey: `${profile.id}.room:${props.workspace}`,
    motion: () => ({ reducedMotion: yard.reducedMotion(), tier: "interact" }),
    panesOutside: () => tiler.outside().length,
    say,
  });
  const standsAsHub = (): boolean => room.standsAsHub() && !focusedPaneHub();
  const arrangesItself = (): boolean => focusedPaneHub() || standsAsHub();
  const actBesideTheHub = (verdict: Verdict): void =>
    act(standsAsHub() && verdict.ok ? { ok: true } : verdict);
  const outsidePanes = createOutsidePanes({
    tiler,
    port: props.host.surfaces,
    screen,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    shownOnPage: () => shownOnPage(),
    bodyOf: (pane) => paneBodies.get(pane),
    factsOf: (pane) => paneFacts(pane),
    motion: () => ({ reducedMotion: yard.reducedMotion(), tier: "interact" }),
    backdrop: () => (wardrobe.wearing() ?? keyworkNight).tokens.background,
    chord: (action) => keys.describe(action),
    say,
    act: actBesideTheHub,
    placesChanged: (what) => settingPanes.placesChanged(what),
    makeRoom: room.makeRoom,
    backOnTheRail: (pane, why) => settingPanes.backOnTheRail(pane, why),
    putAway: (pane) => settingPanes.putAway(pane),
    setOutAgain: (seats) => settingPanes.setOutAgain(seats),
  });
  onCleanup(offerSurfacesPerfHook(window, () => ({ popOutside: outsidePanes.popOutside })));
  const waitingForRoom = (onto: Screen): number =>
    tiler.shelf(onto).filter((entry) => entry.why === "tucked").length;
  const unfoldingWouldCrowd = (): boolean => {
    const field = workspaceRoot?.querySelector<HTMLElement>(".kw-yard");
    if (field == null || field.clientWidth === 0 || focusedPaneHub()) return false;
    const hub = defaultHub({ x: 0, y: 0, width: field.clientWidth, height: field.clientHeight });
    return waitingForRoom(hub) > waitingForRoom(screen());
  };
  const feedsHeard = createMemo(() => {
    const apart = homeApart();
    return apart === undefined ? [props.feed] : [props.feed, apart.feed];
  });
  const settingsStillOut = async () => {
    const apart = homeApart();
    const listings = await Promise.all(
      [shell, ...(apart === undefined ? [] : [apart])].map((held) =>
        Promise.resolve()
          .then(() => held.client.settings())
          .catch(() => undefined),
      ),
    );
    return listings.every(Array.isArray) ? listings.flat() : undefined;
  };
  const settingPanes = createSettingPanes({
    tiler,
    outside: outsidePanes,
    settings: yard.settings,
    feeds: feedsHeard,
    listed: settingsStillOut,
    clientOf: (setting) => yard.shellOf(setting).client,
    answer: yard.answer,
    unfoldsBeside: yard.control.on,
    crowds: unfoldingWouldCrowd,
    opensOutside: () => standsAsHub(),
    storage,
    storageKey: `${profile.id}.put-away:${props.workspace}`,
  });
  const closePane = (pane: PaneId): Verdict => {
    settingPanes.closing(pane);
    return tiler.close(pane);
  };
  const enterFromTheYard = (setting: YardSetting, way: PanelWay): void => {
    if (way === "unfold" && standsAsHub() && settingPanes.setOutByHand(setting)) return;
    yard.enter(setting, way);
  };
  createEffect(on(yard.control.railActive, returnOutside, { defer: true }));
  const reshape = (verb: () => Verdict, otherwise?: string): void => {
    if (focusedPaneHub()) say(refusalNotices.yardArranges(keys.describe(yardToggleActionId)));
    else if (standsAsHub()) say(roomNotices.arrangesItself(keys.describe(panesInsideActionId)));
    else act(verb(), otherwise);
  };
  const focusToward = (direction: Direction): void => {
    const verdict = arrangesItself()
      ? tiler.focusShownToward(direction, screen(), shownRects())
      : tiler.focusToward(direction, screen());
    if (verdict.ok) act(verdict);
    else
      outsidePanes.focusAcross(direction, () =>
        act(verdict, refusalNotices.nothingToward(direction)),
      );
  };
  const focusedDockSide = (): DockSide | undefined => {
    const pane = tiler.focused();
    return pane === undefined ? undefined : tiler.layout.dockSideOf(pane);
  };
  const resizeRefusal = (delta: number): string => {
    if (focusedDockSide() !== undefined)
      return refusalNotices.resizesWithItsDock(keys.describe("dock.grow"));
    return tiler.layout.mainCount() > 1
      ? refusalNotices.atItsLimit(delta)
      : refusalNotices.fillsTheMain;
  };
  const closeAgainLine = (reason: string): string =>
    refusalNotices.closeAgain(reason, keys.describe("pane.close"));
  const closeGuardedPane = async (pane: PaneId): Promise<void> => {
    const held = await closeGate.holdBack(pane, (reason) => readingMs(closeAgainLine(reason)));
    if (held === undefined) act(closePane(pane));
    else say(closeAgainLine(held));
  };
  const closeFocusedPane = (): void => {
    const pane = tiler.focused();
    if (pane !== undefined && closeGate.guards(pane)) void closeGuardedPane(pane);
    else if (pane !== undefined) act(closePane(pane));
    else act(tiler.closeFocused());
  };

  const target: ActionTarget = {
    requestOnboarding: () => (steadHome()?.shell.onboarding ?? onboarding).request(),
    toggleCompanion: () => void companion.toggle()?.toggle(),
    switchCompanion: companion.switchTo,
    closePane: closeFocusedPane,
    zoomPane: () => reshape(() => tiler.zoom(), refusalNotices.nothingFocused),
    floatPane: () => reshape(floatFocused, refusalNotices.nothingFocused),
    shelvePane: () => reshape(() => tiler.shelve(), refusalNotices.nothingFocused),
    returnFromShelf: () => reshape(() => tiler.returnFromShelf(screen())),
    pinPane: () => reshape(() => tiler.pin(), refusalNotices.nothingFocused),
    toggleConsoleRoom: room.toggle,
    togglePaneOutside: outsidePanes.togglePaneOutside,
    bringPanesInside: outsidePanes.bringPanesInside,
    toggleOutsideSpread: outsidePanes.toggleOutsideSpread,
    toggleOutsideHints: outsidePanes.toggleOutsideHints,
    sendPaneBehind: outsidePanes.sendPaneBehind,
    dealPanesOutside: outsidePanes.dealPanesOutside,
    focusAcrossLayers: () => reshape(() => tiler.focusAcrossLayers(screen())),
    rotatePane: () => reshape(() => tiler.rotate(screen()), refusalNotices.nothingToRotate),
    focusToward,
    focusOrdinal: (ordinal) =>
      act(tiler.focusOrdinal(ordinal), refusalNotices.noPaneNumbered(ordinal)),
    movePane: (direction) => {
      if (outsidePanes.stepFocused(direction)) return;
      reshape(() => tiler.move(direction, screen()), refusalNotices.cannotMove(direction));
    },
    cyclePane: () => reshape(() => tiler.cycle(screen())),
    dockPane: (side) =>
      reshape(() => tiler.dock(side, screen()), refusalNotices.alreadyDocked(side)),
    resizeDock: (delta) =>
      reshape(
        () => tiler.resizeDock(delta, screen()),
        refusalNotices.notDocked(keys.describe(delta > 0 ? "pane.grow" : "pane.shrink")),
      ),
    resizePane: (delta) => {
      if (outsidePanes.resizeFocused(delta)) return;
      reshape(() => tiler.resizePane(delta, screen()), resizeRefusal(delta));
    },
    summon: (kind, argument) => void summon(definitionOf(kind), argument),
    paneAction: (action, argument) => {
      if (yard.panels.deliver(action, argument)) return;
      const id = tiler.focused();
      if (id !== undefined) deliverToPane(id, action, argument);
    },
    openPaneCommands,
    answerAsk: answerFocusedAsk,
    toggleQuiet: () => void toggleFocusedQuiet(),
    toggleHelp: () =>
      overlay()?.kind === "help" ? setOverlay(undefined) : openOverlay({ kind: "help" }),
    openPalette: (query) =>
      openOverlay({
        kind: "palette",
        query,
        scope: yard.panels.kindAt(focusedIn(pressedIn)) ?? focusedKind(),
      }),
    trustWorkspace: () => void trust.accept(),
    toggleMark: toggleFocusedMark,
    clearMarks,
    nextNeedsYou: () => {
      if (jumps.next() === undefined) say("nothing needs you");
    },
    returnFromNeedsYou: () => {
      if (!jumps.back()) say("no needs-you jump to go back from");
    },
    toggleNeedsYouStrip: () =>
      say(
        strip.toggle()
          ? "needs-you strip shown"
          : stripHiddenNotice(keys.describe("needs-you.summon")),
      ),
    focusYardRail: () => {
      leaveForTheConsole();
      yard.control.focusRail();
    },
    toggleYard: yard.control.toggle,
    toggleYardTrail: yard.control.toggleView,
    walkYardTrail: yard.walk,
  };

  onCleanup(followActivations(props.host, { workspace: props.workspace, show: jumps.toTrigger }));
  createEffect(
    on(steadHome, (scope) => {
      if (scope !== undefined && scope.shell.workspace !== props.workspace) {
        onCleanup(
          followActivations(props.host, {
            workspace: scope.shell.workspace,
            show: jumps.toTrigger,
          }),
        );
      }
    }),
  );
  const companionHost = props.host.companion;
  if (companionHost !== undefined) {
    createEffect(
      on(steadHome, (scope) => {
        if (scope === undefined && props.prepareSteadHome !== undefined) return;
        const resident = scope === undefined ? shell : shellForStead(shell, scope);
        const waiting = () =>
          props.needsYou.items().filter((item) => item.workspace === resident.workspace);
        followCompanion({
          controller: companion,
          onboarding: () => onboarding.active() !== undefined,
          host: companionHost,
          store: resident.store,
          feed: resident.feed,
          currentSession: resident.currentSession,
          approveKey: () => resident.keys.chord("ask.approve"),
          openSession: (sessionId) => resident.sessions.openSession(sessionId),
          chores: () => heldChoresAmong(waiting()),
          decided: () => decidedAmong(waiting()),
          needsYou: waiting,
          creatures: () => resident.client.creatures(),
          openChores: () => resident.openPane({ kind: "chores" }),
          overturn: (recordId) => overturnStanding(resident.client, props.needsYou, recordId),
          acceptChore: async (chore) => {
            const chores = choresOverFetch(hostFetch(resident.host, resident.workspace));
            const answer = await chores.accept(chore.creature, chore.routineId, chore.digest);
            return answer.ok ? choreAcceptedLine(chore.routineId) : answer.error;
          },
          say,
        });
      }),
    );
  }

  const surfaceSeams: SurfaceCommandSeams = {
    store: props.store,
    keys: shell.keys,
    workingSession: workingSession(shell, focusedSession()),
    summon: summonThen,
    showBotSession: (name) => {
      const pane = tiler.findPane(
        (spec) => spec.kind === "conversation" && props.store.summary(spec.sessionId)?.bot === name,
      );
      if (pane !== undefined) act(tiler.focus(pane));
      return pane !== undefined;
    },
    openSession: (sessionId) => shell.sessions.openSession(sessionId),
    reopen: () => props.host.restartServer(props.workspace),
    say,
  };
  for (const [name, action] of Object.entries(appActions)) {
    const command = actionCommand(name, action, { shell, target, keys });
    if (command !== undefined) registry.register(command);
  }
  for (const command of surfaceCommands(surfaceSeams)) registry.register(command);
  registry.register({
    name: reconnectCommand,
    description: "find this workspace's server again, or start one",
    run: () => void reconnect(),
  });
  registry.addSource(() => botJumps(surfaceSeams));
  registry.addSource(() =>
    wardrobe.choices().map((choice) => ({
      name: `theme-${choice.name}`,
      description: `wear ${choice.name} (${choice.source} theme)`,
      run: () => {
        const refusal = wardrobe.wear(choice.name);
        if (refusal !== undefined) say(refusal);
      },
    })),
  );
  registry.addSource(() =>
    [...tiler.slots(screen()), ...away()].map((slot) => ({
      name: `go-${slot.id}`,
      label: titleOf(slot),
      description: "jump to this pane",
      jump: true as const,
      run: () => act(tiler.focus(slot.id)),
    })),
  );
  registry.register(
    markCommand({
      panes: () =>
        [...tiler.slots(screen()), ...away()].flatMap((slot) =>
          attire.dressable(slot.id) ? [{ id: slot.id, title: titleOf(slot) }] : [],
        ),
      marked: marks.has,
      toggle: (paneId) => say(toggleMark(paneId)),
      toggleFocused: toggleFocusedMark,
      shortcut: () => keys.describe("pane.mark"),
      say,
    }),
  );

  const onKeyDown = (event: KeyboardEvent): void => {
    if (outsidePanes.heardWhileLettered(event)) return;
    if (overlay() !== undefined || event.defaultPrevented) return;
    const eventTarget = keyTargetOf(event);
    if (
      (event.key === "Enter" || event.key === " ") &&
      isElement(eventTarget) &&
      eventTarget.closest("[data-native-activation] button") !== null
    )
      return;
    if (isElement(eventTarget) && !workspaceOwnsKey(workspaceRoot, eventTarget)) return;
    if (isElement(eventTarget) && eventTarget.closest("[data-keys-owned]") !== null) return;
    const chords = chordsOfKey(event);
    if (chords.length === 0) return;
    const panel = yard.panels.kindAt(eventTarget);
    const presented = presentedHome()?.kind;
    const focus = keyFocusOf(
      panel ?? presented ?? focusedKind(),
      event.target,
      keymap,
      panel !== undefined || presented !== undefined || focusedSlotHolds(eventTarget),
    );
    const result = keymap.press(chords, performance.now(), focus.scope, focus.typing);
    showLeader(result.type === "leader-pending");
    if (result.type === "pass" || leftToThePlatform(result, event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (result.type === "action") invokePressed(result.action, eventTarget);
    else if (result.type === "cancelled") sayLeaderMissed(chords[0]);
  };
  const invokePressed = (action: string, pressed: EventTarget | null): void => {
    pressedIn = isElement(pressed) ? pressed : document;
    try {
      appActions[action]?.invoke(target);
    } finally {
      pressedIn = document;
    }
  };
  const focusedSlotHolds = (element: EventTarget | null): boolean =>
    isElement(element) && groundOf(tiler.focused())?.contains(element) === true;
  const leftToThePlatform = (result: KeymapResult, typedInto: EventTarget | null): boolean =>
    result.type === "action" &&
    result.action === "ask.approve" &&
    isTextField(typedInto) &&
    !askWaitsInReach();
  let leaderLapse: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(leaderLapse));
  const showLeader = (armed: boolean): void => {
    clearTimeout(leaderLapse);
    setLeaderArmed(armed);
    if (!armed) return;
    leaderLapse = setTimeout(
      () => setLeaderArmed(keymap.armed(performance.now())),
      keymap.timeoutMs + 1,
    );
  };
  const sayLeaderMissed = (pressed: Chord | undefined): void => {
    if (pressed === undefined || pressed.name === "escape") return;
    const help = keys.describe("help.toggle");
    const missed = `${keys.leader()} ${formatChord(pressed)} does nothing here`;
    say(help === undefined ? missed : `${missed} · ${help} lists every key`);
  };
  const showOrdinalsWhileHeld = (event: KeyboardEvent): void => {
    setOrdinalsShown(holdsModifiersOf(event, keys.describeAll("focus.pane1")));
  };

  const focusPaneHolding = (element: Element): void => {
    const pane = paneIdOf(element);
    if (pane === undefined || pane === tiler.focused() || tiler.spec(pane) === undefined) return;
    act(tiler.focus(pane));
  };
  const followKeyboard = (event: FocusEvent): void => {
    if (isElement(event.target)) focusPaneHolding(event.target);
  };

  const applyGesture = (intent: PointerIntent): void => {
    if (intent.type === "focus") act(tiler.focus(intent.id));
    else if (intent.type === "resize") act(tiler.resizeSeam(intent.handle, intent.ratio, screen()));
    else if (intent.type === "place") act(tiler.placeFloat(intent.id, intent.rect, screen()));
    else act(tiler.send(intent.id, intent.zone, screen()));
  };

  onMount(() => {
    onCleanup(listenForKeys(onKeyDown));
    onCleanup(listenInEveryDocument("keydown", showOrdinalsWhileHeld, true));
    onCleanup(listenInEveryDocument("keyup", showOrdinalsWhileHeld, true));
    onCleanup(listenInEveryWindow("blur", () => setOrdinalsShown(false), true));
    onCleanup(listenInEveryDocument("focusout", catchFallingFocus, true));
    onCleanup(sendStrayKeysHome({ takeHome: takeStrayKeyHome }));
    if (workspaceRoot !== undefined) onCleanup(holdKeysWherePressed(workspaceRoot));
    onCleanup(keyboard.routeToPanes(focusPaneHolding));
    if (stage === undefined) return;
    onCleanup(followKeyboardInPanes(stage, followKeyboard));
    setGestures(bindPointerGestures(stage, { scene: () => scene(), apply: applyGesture }));
    const measure = (): void => {
      if (stage === undefined || stage.clientWidth === 0 || stage.clientHeight === 0) return;
      setScreen({ width: stage.clientWidth, height: stage.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(measure);
      observer.observe(stage);
      onCleanup(() => observer.disconnect());
    }
    if (tiler.panes().length === 0) firstLayout();
    else restorePanes();
    void settingPanes
      .restore()
      .catch(() => undefined)
      .then(room.restored);
  });

  const firstLayout = (): void => {
    if (profile.startup === "creature") {
      if (!props.home) tiler.summon({ kind: "tree" }, screen());
      act(tiler.summon({ kind: "stead" }, screen()));
      if (props.home) void openFirstHomeConversation();
      return;
    }
    tiler.summon({ kind: "tree" }, screen());
    const sessionId = props.store.state.summaries[0]?.id;
    act(tiler.open({ kind: "conversation", sessionId }, screen()));
  };
  const openFirstHomeConversation = async (): Promise<void> => {
    const creatures = await creaturesListed(props.client);
    const conversation = creatures?.find((creature) => creature.conversation)?.conversation;
    if (!disposed && conversation != null) shell.sessions.openSession(conversation);
  };
  const restorePanes = (): void => {
    for (const id of tiler.panes()) {
      const spec = tiler.spec(id);
      if (spec !== undefined) definitionOf(spec.kind).onRestore?.(spec, shell);
    }
    if (profile.startup === "creature") void summonSteadOnce();
  };
  const summonSteadOnce = async (): Promise<void> => {
    const key = steadSummonStorageKey(props.workspace);
    const facts = () => ({
      steadShowing: tiler.findPane((spec) => spec.kind === "stead") !== undefined,
      summonedAt: steadSummonedAt(storage, key),
    });
    if (!steadSummonWanted({ ...facts(), creatures: [] })) return;
    const creatures = await creaturesListed(props.client);
    if (disposed || !steadSummonWanted({ ...facts(), creatures })) return;
    const outcome = tiler.summon({ kind: "stead" }, screen());
    if (outcome.ok) recordSteadSummoned(storage, key, new Date().toISOString());
    act(outcome);
  };

  createEffect(() => {
    tiler.version();
    tiler.placements();
    storage?.setItem(storageKey, JSON.stringify(tiler.snapshot()));
  });
  createEffect(on(tiler.version, settleKeyboardSoon, { defer: true }));

  const titleOf = (slot: Pick<PaneSlot, "spec">): string => paneTitle(slot.spec);
  const titleOfPane = (id: PaneId): string => {
    const slot = slots().find((held) => held.id === id);
    return slot === undefined ? "" : titleOf(slot);
  };
  const lifecycleOf = (slot: PaneSlot): LifecycleState =>
    definitionOf(slot.spec.kind).lifecycle?.(slot, shell) ?? "idle";
  const adornmentsOf = (slot: PaneSlot) =>
    definitionOf(slot.spec.kind).adornments?.(slot.spec, shell) ?? {};
  const showContext = (sessionId: string): void => {
    const spec = { kind: "context", sessionId } as const;
    act(tiler.summon(spec, screen()));
    const shown = tiler.findPane((candidate) => candidate.kind === "context");
    if (shown !== undefined) tiler.bind(shown, spec);
  };
  const gaugeOpener = (slot: PaneSlot): (() => void) | undefined => {
    const sessionId = sessionOfPane(slot.id);
    if (sessionId === undefined || slot.spec.kind === "context") return undefined;
    return () => showContext(sessionId);
  };

  const insideSlots = (): PaneSlot[] => {
    tiler.version();
    const focused = tiler.focused();
    return tiler
      .panes()
      .filter((id) => !tiler.isOutside(id))
      .flatMap((id) => {
        const spec = tiler.spec(id);
        const spawnRank = tiler.layout.spawnRank(id);
        const rect = { x: 0, y: 0, ...screen() };
        return spec === undefined ? [] : [{ id, spec, rect, focused: id === focused, spawnRank }];
      });
  };
  const standingInTheHub = (): PaneSlot[] =>
    insideSlots().filter((slot) => !tiler.layout.isShelved(slot.id));
  const hubThreadPane = (): PaneId | undefined => {
    const thread = room.thread();
    return (thread === undefined ? undefined : paneShowing(thread)) ?? hubConversation();
  };
  const hub = createMemo(() => {
    if (focusedPaneHub()) {
      return conversationHub(tiler.slots(screen()), screen(), hubConversation());
    }
    return standsAsHub() ? hubColumn(standingInTheHub(), screen(), hubThreadPane()) : undefined;
  });
  const slots = createMemo(() => hub()?.slots ?? tiler.slots(screen()));
  const hubTabs = () => hub()?.tabs ?? [];
  const tabbedAway = (id: PaneId): boolean => {
    const shown = hub();
    return shown !== undefined && tabbedOut(shown, id);
  };
  const scene = createMemo((): Scene => {
    const tiled = { ...tiler.scene(screen()), seamReach: gapSeamReach(gapCells(), rootRemPx()) };
    if (!arrangesItself()) return tiled;
    return { ...tiled, rects: new Map(slots().map((slot) => [slot.id, slot.rect])), seams: [] };
  });
  const pointer = () => gestures()?.state() ?? { phase: "idle" };
  const activeSeam = () => {
    const state = pointer();
    return state.phase === "resizing" ? state.seam : undefined;
  };
  const dragging = () => {
    const state = pointer();
    return state.phase === "dragging" ? state : undefined;
  };
  const dropZones = () => Object.entries(dropZoneRects(scene())) as [DropZone, Rect][];
  const restingOutOfTheWay = (): PaneSlot[] => {
    const shown = slots().map((slot) => slot.id);
    return insideSlots()
      .filter((slot) => !shown.includes(slot.id))
      .map((slot) => ({ ...slot, focused: false }));
  };
  const benched = createMemo((): PaneSlot[] => {
    if (focusedPaneHub()) return [];
    if (standsAsHub()) return restingOutOfTheWay();
    return tiler.shelf(screen()).map(({ id, spec, spawnRank }) => ({
      id,
      spec,
      spawnRank,
      focused: false,
      rect: { x: 0, y: 0, ...screen() },
    }));
  });
  const waitingOnTheShelf = (): ShelfEntry[] => {
    const entries = tiler.shelf(screen());
    return standsAsHub() ? entries.filter((entry) => entry.why === "shelved") : entries;
  };
  const onShelf = (id: PaneId): boolean => benched().some((slot) => slot.id === id);
  const away = createMemo((): PaneSlot[] => {
    tiler.version();
    return untrack(() => tiler.outside()).map(({ id, spec, spawnRank, focused }) => ({
      id,
      spec,
      spawnRank,
      focused,
      rect: { x: 0, y: 0, ...screen() },
    }));
  });
  const standsOutside = (id: PaneId): boolean => away().some((slot) => slot.id === id);
  const hiddenFromTheStage = (id: PaneId): boolean =>
    tabbedAway(id) || onShelf(id) || standsOutside(id);
  const paneFacts = (pane: PaneId): PaneFacts => {
    const slot = slotOf(pane);
    if (slot === undefined) return { title: "", hueRank: 0, state: "idle" };
    const hueRank = adornmentsOf(slot).hueRank ?? slot.spawnRank;
    return {
      title: titleOf(slot),
      hueRank,
      state: lifecycleOf(slot),
      ordinal: ordinalsShown() ? ordinalChord(slot) : undefined,
      frame: inksWorn()[`--kw-ramp-${hueStop(hueRank)}`],
    };
  };
  const inksWorn = createMemo(() => themeVariables(wardrobe.wearing() ?? keyworkNight));
  const shelfItems = createMemo((): ShelfItem[] =>
    focusedPaneHub()
      ? []
      : waitingOnTheShelf().map((entry) => {
          const slot = benched().find((held) => held.id === entry.id);
          return {
            id: entry.id,
            name: titleOf(entry),
            ordinal: entry.spawnRank + 1,
            why: entry.why,
            pinned: entry.pinned,
            state: slot === undefined ? "idle" : lifecycleOf(slot),
          };
        }),
  );
  const paneIds = createMemo<readonly PaneId[]>(
    (shown) =>
      keptInPlace(
        shown,
        [...slots(), ...benched(), ...away()].map((slot) => slot.id),
      ),
    [],
  );
  const shownRects = (): Map<PaneId, Rect> =>
    new Map(slots().flatMap((slot) => (tabbedAway(slot.id) ? [] : [[slot.id, slot.rect]])));
  const shownOnPage = (): Map<PaneId, Rect> => {
    const { left, top } = stage?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return new Map(
      [...shownRects()].map(([id, rect]) => [id, { ...rect, x: rect.x + left, y: rect.y + top }]),
    );
  };
  const ordinalChord = (slot: PaneSlot): string | undefined =>
    slot.spawnRank < 9 ? keys.describe(`focus.pane${slot.spawnRank + 1}`) : undefined;
  const hiddenByZoom = (): number =>
    tiler.zoomed() === undefined
      ? 0
      : tiler.panes().length - slots().length - benched().length - away().length;
  const slotOf = (id: PaneId): PaneSlot | undefined =>
    slots().find((slot) => slot.id === id) ??
    benched().find((slot) => slot.id === id) ??
    away().find((slot) => slot.id === id);
  const needsYouPaneOpen = () => slots().some((slot) => slot.spec.kind === "needs-you");
  const focusedProjection = (): SessionProjection =>
    tiler.focusedSpec()?.kind === "conversation"
      ? props.store.projection(focusedSession())
      : emptyProjection;
  const trayIn = (pane: PaneId) => {
    const open = overlay();
    return open?.kind === "tray" && open.pane === pane ? open : undefined;
  };
  const paletteOpen = () => {
    const open = overlay();
    return open?.kind === "palette" ? open : undefined;
  };
  const helpFooter = (): string[] => {
    const foreign = foreignActionsLine(keys.foreignActions());
    return [
      "rebind any of these in the keybindings section of ~/.keywork/keywork.json",
      ...(foreign === undefined ? [] : [foreign]),
    ];
  };

  const PaneSlotView = (view: { slot: PaneSlot }) => {
    const slot = () => view.slot;
    const pane = view.slot.id;
    const spec = createMemo(() => slot().spec);
    const focused = createMemo(() => slot().focused);
    const travels = (body: HTMLElement): void => {
      paneBodies.set(pane, body);
      onCleanup(() => {
        outsidePanes.closed(pane);
        if (paneBodies.get(pane) === body) paneBodies.delete(pane);
      });
    };
    return (
      <div
        class="kw-slot"
        data-pane-id={slot().id}
        data-lantern={yard.lanternOn(slot().spec) ? "" : undefined}
        data-floating={slot().floating === undefined ? undefined : ""}
        data-changing-layer={changingLayer() === slot().id ? "" : undefined}
        hidden={hiddenFromTheStage(slot().id) ? true : undefined}
        tabIndex={-1}
        style={{
          ...rectStyle(slot().rect),
          outline: "none",
          "--kw-float-z": slot().floating?.z,
        }}
      >
        <Show when={ordinalsShown()}>
          <OrdinalBadge chord={ordinalChord(slot())} />
        </Show>
        <PaneFrame
          ref={travels}
          name={titleOf(slot())}
          state={lifecycleOf(slot())}
          focused={slot().focused}
          spawnRank={slot().spawnRank}
          telemetry={adornmentsOf(slot()).telemetry}
          context={adornmentsOf(slot()).context}
          modeWord={adornmentsOf(slot()).modeWord}
          arc={adornmentsOf(slot()).arc}
          bot={adornmentsOf(slot()).bot}
          inference={adornmentsOf(slot()).inference}
          hueRank={adornmentsOf(slot()).hueRank}
          outfit={attire.outfit(slot().id)}
          marked={marks.has(slot().id)}
          pinned={slot().pinned}
          quiet={adornmentsOf(slot()).quiet}
          onGauge={gaugeOpener(slot())}
          ribbon={adornmentsOf(slot()).ribbon}
          agent={adornmentsOf(slot()).agent}
          agentColor={adornmentsOf(slot()).agentColor}
          tag={adornmentsOf(slot()).tag}
        >
          <Dynamic
            component={definitionOf(spec().kind).component}
            id={pane}
            spec={spec()}
            focused={focused()}
            shell={shell}
            onAction={(handler) => {
              const id = slot().id;
              localHandlers.set(id, handler);
              awaitingHandlers.get(id)?.();
              awaitingHandlers.delete(id);
              onCleanup(() => localHandlers.delete(id));
            }}
            guardClose={(guard) => onCleanup(closeGate.guard(slot().id, guard))}
          />
          <Show when={trayIn(slot().id)}>
            {(tray) => (
              <PaneTray
                paneName={titleOf(slot())}
                commands={tray().commands}
                onDismiss={() => setOverlay(undefined)}
              />
            )}
          </Show>
        </PaneFrame>
        <Show when={slot().floating !== undefined}>
          <div class="kw-float-grip" aria-hidden="true" />
        </Show>
      </div>
    );
  };

  const stageView = (
    <div class="kw-stage" ref={stage} data-gesture={pointer().phase}>
      <For each={paneIds()}>
        {(id) => {
          const lastSlot = createMemo((previous) => slotOf(id) ?? previous, slotOf(id));
          return (
            <Show when={slotOf(id) !== undefined}>
              <PaneSlotView slot={lastSlot() as PaneSlot} />
            </Show>
          );
        }}
      </For>
      <Show when={hubTabs().length > 0}>
        <div
          class="kw-hub-tabs"
          role="tablist"
          aria-label="the hub's tiles"
          style={rectStyle({ x: 0, y: 0, width: screen().width, height: hubTabsHeight })}
        >
          <For each={hubTabs()}>
            {(tab) => (
              <button
                type="button"
                role="tab"
                class="kw-hub-tab"
                aria-selected={tab.active}
                onClick={() => act(tiler.focus(tab.id))}
              >
                {titleOfPane(tab.id)}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={hiddenByZoom() > 0 && !focusedPaneHub()}>
        <ZoomBadge hidden={hiddenByZoom()} restore={keys.describe("pane.zoom")} />
      </Show>
      <Show when={arrangesItself() ? undefined : tiler.emptyMain(screen())}>
        {(rect) => (
          <div class="kw-slot kw-empty-main" style={rectStyle(rect())}>
            <p class="kw-empty">{keys.describe("pane.split")} opens a session here</p>
            <Show when={props.store.state.summaries.length === 0}>
              <FirstRun keys={shell.keys} />
            </Show>
          </div>
        )}
      </Show>
      <For each={scene().seams}>
        {(seam) => (
          <div
            class="kw-seam"
            data-axis={seam.axis}
            data-active={sameSeam(activeSeam(), seam) ? "" : undefined}
            style={rectStyle(seamZoneRect(seam, scene().seamReach))}
          />
        )}
      </For>
      <Show when={dragging()}>
        {(drag) => (
          <For each={dropZones()}>
            {([zone, rect]) => (
              <div
                class="kw-drop"
                data-zone={zone}
                data-hot={drag().over === zone ? "" : undefined}
                style={rectStyle(rect)}
              />
            )}
          </For>
        )}
      </Show>
    </div>
  );

  return (
    <div class="kw-workspace" ref={workspaceRoot}>
      <Yard
        on={yard.control.on()}
        settings={settingPanes.beside()}
        heldBack={yard.heldBack()}
        foldedAway={yard.foldedAway()}
        inside={yard.inside()}
        withdrawn={yard.withdrawn}
        card={yard.card()}
        railActive={yard.control.railActive()}
        reducedMotion={yard.reducedMotion()}
        shell={shell}
        ownerOf={yard.ownerOf}
        panels={yard.panels}
        lineage={yard.lineage}
        view={yard.control.view()}
        railAt={yard.control.railAt()}
        onEnter={enterFromTheYard}
        opensOutside={standsAsHub()}
        onAnswer={yard.answer}
        onOpen={yard.open}
        onInteract={yard.interacted}
        onToggleView={yard.control.toggleView}
        onWalk={yard.walkFrom}
        onRestore={yard.restore}
        onRailLeft={yard.control.railLeftFor}
        onReturn={yard.control.leaveRail}
      >
        {stageView}
      </Yard>
      <PaneShelf
        items={shelfItems()}
        hint={keys.describe("pane.unshelve")}
        onReturn={(id) => act(tiler.focus(id))}
      />
      <TrustCard trust={trust} chord={shell.keys.chord("trust.workspace")} />
      <OpenFailureCard
        notice={props.openFailure}
        onConnect={() => shell.openPane(connectingPane)}
      />
      <NeedsYouStrip
        line={stripLine({
          shown: strip.shown(),
          count: props.needsYou.count(),
          head: props.needsYou.head(),
          paneOpen: needsYouPaneOpen(),
          hint: shell.keys.chord("needs-you.next"),
          where: props.needsYou.where,
        })}
      />
      <StatusLine
        serverLabel={standingLine(props.standing, props.serverLabel)}
        serverLost={isLost(props.standing)}
        folder={props.workspace}
        model={inferenceWords(props.store.controlsOf(focusedSession()))}
        projection={focusedProjection()}
        usage={telemetry(focusedProjection(), props.store.controls.readings(focusedSession()).cost)}
        preset={props.store.controls.state.preset}
        trust={trustStatusItem(trust, shell.keys.chord("trust.workspace"))}
        leader={leaderArmed() ? keys.leader() : undefined}
        notice={notice()}
        gap={props.store.state.gap}
        lost={props.store.state.lost}
        update={update}
      />
      <Switch>
        <Match when={paletteOpen()}>
          {(open) => (
            <Palette
              registry={registry}
              scope={open().scope}
              initialQuery={open().query}
              onDismiss={() => setOverlay(undefined)}
            />
          )}
        </Match>
        <Match when={overlay()?.kind === "help"}>
          <HelpOverlay
            sections={helpSections(keys, bindingHelp, actionScopes)}
            footer={helpFooter()}
            onDismiss={() => setOverlay(undefined)}
          />
        </Match>
      </Switch>
    </div>
  );
}

export const layerChangeMs = 160;

function markedNotice(count: number): string {
  const carry = count === 1 ? "carries" : "carry";
  return `marked · ${paneCount(count)} ${carry} the mark · theme-marked dresses them`;
}

function stripHiddenNotice(paneChord: string | undefined): string {
  return paneChord === undefined
    ? "needs-you strip hidden"
    : `needs-you strip hidden · ${paneChord} still lists everything`;
}

function paneCount(count: number): string {
  return `${count} ${count === 1 ? "pane" : "panes"}`;
}

function followKeyboardInPanes(
  stage: HTMLElement,
  follow: (event: FocusEvent) => void,
): () => void {
  return everyWindow((realm) => {
    const panes = realm === windowOf(stage) ? stage : realm.document;
    panes.addEventListener("focusin", follow as EventListener);
    return () => panes.removeEventListener("focusin", follow as EventListener);
  });
}

function workspaceOwnsKey(workspace: HTMLElement | undefined, target: Element): boolean {
  const owner = target.closest(".kw-workspace");
  return owner === null || owner === workspace;
}

function trustStatusItem(trust: TrustFlow, chord: string): string | undefined {
  const state = trust.state();
  if (state.kind === "restarting") {
    return state.attached === true
      ? "trust recorded · waiting on the attached server"
      : "restarting the server with trust recorded";
  }
  if (state.kind === "stale") return "trust recorded · the attached server needs a restart";
  return trust.untrusted() ? `untrusted · ${chord} trusts` : undefined;
}

function keptInPlace(shown: readonly PaneId[], now: readonly PaneId[]): readonly PaneId[] {
  const kept = shown.filter((id) => now.includes(id));
  const added = now.filter((id) => !kept.includes(id));
  return added.length === 0 && kept.length === shown.length ? shown : [...kept, ...added];
}

function rectStyle(rect: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function restoredState(storage: Pick<Storage, "getItem"> | undefined, key: string) {
  const raw = storage?.getItem(key);
  if (raw === null || raw === undefined) return undefined;
  try {
    return parseTilerState(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function localStorageOrNone(): Storage | undefined {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
