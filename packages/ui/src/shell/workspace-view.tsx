import {
  emptyProjection,
  type KeyworkClient,
  type ServerFeed,
  type SessionProjection,
} from "@keywork-app/client";
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
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { FirstRun } from "../chrome/first-run.tsx";
import { gapSeamReach, rootRemPx } from "../chrome/gap.ts";
import { createStripPreference, NeedsYouStrip, stripLine } from "../chrome/needs-you-strip.tsx";
import { type LifecycleState, PaneFrame } from "../chrome/pane-frame.tsx";
import { gapCells } from "../chrome/root-attributes.ts";
import { StatusLine } from "../chrome/status-line.tsx";
import { telemetry } from "../chrome/telemetry.ts";
import { followActivations } from "../host/activation.ts";
import type { HostPort } from "../host/port.ts";
import {
  type ActionTarget,
  appActions,
  bindingHelp,
  chordsOfKey,
  type Keymap,
  keymapFromConfig,
} from "../keys/index.ts";
import { keyFocusOf } from "../keys/typing.ts";
import {
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
import type { AskPick } from "../page/ask-card.tsx";
import { CommandRegistry } from "../palette/commands.ts";
import { markCommands } from "../palette/mark-commands.ts";
import { HelpOverlay, helpRows, Palette } from "../palette/palette.tsx";
import { fileUrlOf } from "../panes/file/range.ts";
import {
  definitionOf,
  type PaneDefinition,
  type PaneSpec,
  parsePaneSpec,
  type ShellSeams,
} from "../panes/index.ts";
import { returnKeyboardHome } from "../panes/keyboard-home.ts";
import { postureStorageKey } from "../posture/record.ts";
import { createTrustSetup, followTrustArrival } from "../posture/trust-setup.ts";
import { attireStorageKey, createAttire, type Outfit } from "../theme/attire.ts";
import { createWardrobe } from "../theme/wardrobe.ts";
import { answerHeldAsk } from "./answer-ask.ts";
import { createPaneMarks } from "./marks.ts";
import { createJumps, type NeedsYouPlace } from "./needs-you-jumps.ts";
import type { NeedsYouQueue } from "./needs-you-queue.ts";
import { bindPointerGestures, type PointerGestures } from "./pointer-gestures.ts";
import { createQuietSessions, toggleSessionQuiet } from "./quiet.ts";
import { createSessionReads } from "./session-reads.ts";
import type { SessionStore } from "./session-store.ts";
import { createTiler, type PaneSlot, parseTilerState } from "./tiler.ts";
import { createTrustFlow, type TrustFlow } from "./trust.ts";
import { TrustCard } from "./trust-card.tsx";

export interface WorkspaceViewProps {
  host: HostPort;
  workspace: string;
  serverLabel: string;
  store: SessionStore;
  client: KeyworkClient;
  feed: ServerFeed;
  needsYou: NeedsYouQueue;
  keymap?: Keymap | undefined;
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
}

type Overlay = { kind: "palette"; query: string | undefined } | { kind: "help" } | undefined;

export function WorkspaceView(props: WorkspaceViewProps) {
  const storage = props.storage ?? localStorageOrNone();
  const storageKey = `keywork.layout:${props.workspace}`;
  const tiler = createTiler(restoredState(storage, storageKey));
  const keymap = props.keymap ?? keymapFromConfig();
  const registry = new CommandRegistry();
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
  const quiet = createQuietSessions();
  const strip = createStripPreference(storage);
  const [screen, setScreen] = createSignal<Screen>({ width: 1280, height: 800 });
  const [overlay, setOverlay] = createSignal<Overlay>();
  createEffect(
    on(overlay, (open, wasOpen) => {
      if (open === undefined && wasOpen !== undefined) returnKeyboardHome();
    }),
  );
  const [leaderArmed, setLeaderArmed] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [seen, setSeen] = createSignal<Record<PaneId, number>>({});
  const localHandlers = new Map<PaneId, (action: string) => void>();
  const [gestures, setGestures] = createSignal<PointerGestures>();
  let stage: HTMLDivElement | undefined;

  const say = (text: string): void => {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? undefined : current)), 2400);
  };
  const recordArcTheme = async (slug: string, theme: string | null): Promise<void> => {
    const answer = await props.client.setArcTheme(slug, theme);
    if (isSurfaceRefusal(answer)) say(`${answer.detail} · worn in this window only`);
  };
  const act = (verdict: Verdict): void => {
    if (!verdict.ok && verdict.notice !== undefined) say(verdict.notice);
  };
  const focusedSession = (): string | undefined => {
    const spec = tiler.focusedSpec();
    return spec?.kind === "conversation" ? spec.sessionId : undefined;
  };

  const trust = createTrustFlow({
    client: props.client,
    feed: props.feed,
    restart: async () => {
      await props.host.restartServer(props.workspace);
      await props.store.refresh();
    },
  });
  onCleanup(() => trust.dispose());
  const trustSetup = createTrustSetup({
    client: props.client,
    storage,
    storageKey: postureStorageKey(props.workspace),
  });

  const paneShowing = (sessionId: string): PaneId | undefined => {
    tiler.version();
    return tiler.findPane((spec) => spec.kind === "conversation" && spec.sessionId === sessionId);
  };
  const showPlace = (place: NeedsYouPlace): void => {
    if (place.workspace !== props.workspace) {
      void props.host.switchWorkspace(place.workspace);
      return;
    }
    if (place.kind === "memory") {
      act(tiler.summon({ kind: "memory" }, screen()));
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
  const reads = createSessionReads();
  createEffect(() => reads.sight(props.store.state.summaries));
  createEffect(() => {
    const looking = props.store.summary(focusedSession());
    if (looking !== undefined) reads.read(looking);
  });

  const shell: ShellSeams = {
    store: props.store,
    client: props.client,
    feed: props.feed,
    trust,
    trustSetup,
    wardrobe,
    attire,
    marks,
    quiet,
    needsYou: {
      queue: props.needsYou,
      reads,
      revealing: jumps.revealing,
      jump: jumps.to,
      visit: (sessionId) =>
        jumps.toPlace({ kind: "session", workspace: props.workspace, sessionId }),
      dressed: dressedSession,
    },
    openPane: (spec) => {
      const parsed = parsePaneSpec(spec);
      if (parsed !== undefined) act(tiler.summon(parsed, screen()));
    },
    closePane: (paneId) => act(tiler.close(paneId)),
    openInEditor: (path, line) =>
      props.host.openExternal(fileUrlOf(props.workspace, path, line)).catch((cause: unknown) => {
        say(cause instanceof Error ? cause.message : String(cause));
        throw cause;
      }),
    keys: {
      chord: (action) => keymap.describe(action) ?? "an unbound key",
      leader: () => keymap.leader,
    },
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
        const focused = tiler.focused();
        const spec = tiler.focusedSpec();
        if (
          focused !== undefined &&
          spec?.kind === "conversation" &&
          spec.sessionId === undefined
        ) {
          tiler.bind(focused, { kind: "conversation", sessionId });
        } else {
          act(tiler.open({ kind: "conversation", sessionId }, screen()));
        }
        void props.store.open(sessionId);
      },
      newSession: async () => shell.sessions.openSession(await props.store.create()),
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
    act(tiler.summon(await definition.summon.spec(shell, variant), screen()));
  };
  followTrustArrival(trust.state, {
    granted: () => void summon(definitionOf("posture")),
    found: () =>
      void trustSetup.launchNotice().then((line) => {
        if (line !== undefined) say(line);
      }),
  });
  const answerFocusedAsk = (pick: AskPick): void => {
    const answering = { store: props.store, quiet, approveKey: shell.keys.chord("ask.approve") };
    void answerHeldAsk(answering, { sessionId: focusedSession() }, pick).then((line) => {
      if (line !== undefined) say(line);
    });
  };
  const toggleFocusedQuiet = async (): Promise<void> => {
    const chords = {
      approve: shell.keys.chord("ask.approve"),
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

  const target: ActionTarget = {
    closePane: () => act(tiler.closeFocused()),
    zoomPane: () => act(tiler.zoom()),
    rotatePane: () => act(tiler.rotate()),
    focusToward: (direction) => act(tiler.focusToward(direction, screen())),
    focusOrdinal: (ordinal) => act(tiler.focusOrdinal(ordinal)),
    movePane: (direction) => act(tiler.move(direction, screen())),
    cyclePane: () => act(tiler.cycle(screen())),
    dockPane: (side) => act(tiler.dock(side, screen())),
    resizeDock: (delta) => act(tiler.resizeDock(delta, screen())),
    resizePane: (delta) => act(tiler.resizePane(delta, screen())),
    summon: (kind, variant) => void summon(definitionOf(kind), variant),
    paneAction: (action) => {
      const id = tiler.focused();
      if (id !== undefined) localHandlers.get(id)?.(action);
    },
    cycleMode: () => say("modes arrive with the server's mode route"),
    answerAsk: answerFocusedAsk,
    toggleQuiet: () => void toggleFocusedQuiet(),
    toggleHelp: () =>
      setOverlay((current) => (current?.kind === "help" ? undefined : { kind: "help" })),
    openPalette: (query) => setOverlay({ kind: "palette", query }),
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
          : stripHiddenNotice(keymap.describe("needs-you.summon")),
      ),
  };

  onCleanup(followActivations(props.host, { workspace: props.workspace, show: jumps.toTrigger }));

  for (const [name, action] of Object.entries(appActions)) {
    if (action.command === undefined) continue;
    registry.register({
      ...action.command,
      shortcut: keymap.describe(name),
      run: () => action.invoke(target),
    });
  }
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
    tiler.slots(screen()).map((slot) => ({
      name: `go-${slot.id}`,
      label: titleOf(slot),
      description: "jump to this pane",
      jump: true as const,
      run: () => act(tiler.focus(slot.id)),
    })),
  );
  registry.addSource(() =>
    markCommands(
      tiler
        .slots(screen())
        .flatMap((slot) =>
          attire.dressable(slot.id) ? [{ id: slot.id, title: titleOf(slot) }] : [],
        ),
      { marked: marks.has, toggle: (paneId) => say(toggleMark(paneId)) },
    ),
  );

  const onKeyDown = (event: KeyboardEvent): void => {
    if (overlay() !== undefined) return;
    const chords = chordsOfKey(event);
    if (chords.length === 0) return;
    const focus = keyFocusOf(tiler.focusedSpec()?.kind, event.target, keymap);
    const result = keymap.press(chords, performance.now(), focus.scope, focus.typing);
    setLeaderArmed(result.type === "leader-pending");
    if (result.type === "pass") return;
    event.preventDefault();
    event.stopPropagation();
    if (result.type === "action") appActions[result.action]?.invoke(target);
  };

  const applyGesture = (intent: PointerIntent): void => {
    if (intent.type === "focus") act(tiler.focus(intent.id));
    else if (intent.type === "resize") act(tiler.resizeSeam(intent.handle, intent.ratio, screen()));
    else act(tiler.send(intent.id, intent.zone, screen()));
  };

  onMount(() => {
    document.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
    if (stage === undefined) return;
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
  });

  const firstLayout = (): void => {
    tiler.summon({ kind: "tree" }, screen());
    const sessionId = props.store.state.summaries[0]?.id;
    act(tiler.open({ kind: "conversation", sessionId }, screen()));
    if (sessionId !== undefined) void props.store.open(sessionId);
  };
  const restorePanes = (): void => {
    for (const id of tiler.panes()) {
      const spec = tiler.spec(id);
      if (spec !== undefined) definitionOf(spec.kind).onRestore?.(spec, shell);
    }
  };

  createEffect(() => {
    tiler.version();
    storage?.setItem(storageKey, JSON.stringify(tiler.snapshot()));
  });

  const titleOf = (slot: PaneSlot): string => paneTitle(slot.spec);
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

  const slots = createMemo(() => tiler.slots(screen()));
  const scene = createMemo(
    (): Scene => ({
      ...tiler.scene(screen()),
      seamReach: gapSeamReach(gapCells(), rootRemPx()),
    }),
  );
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
  const paneIds = createMemo(() => slots().map((slot) => slot.id));
  const slotOf = (id: PaneId): PaneSlot | undefined => slots().find((slot) => slot.id === id);
  const needsYouPaneOpen = () => slots().some((slot) => slot.spec.kind === "needs-you");
  const focusedProjection = (): SessionProjection =>
    tiler.focusedSpec()?.kind === "conversation"
      ? props.store.projection(focusedSession())
      : emptyProjection;

  const PaneSlotView = (view: { slot: PaneSlot }) => {
    const slot = () => view.slot;
    return (
      <div class="kw-slot" style={rectStyle(slot().rect)}>
        <PaneFrame
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
          quiet={adornmentsOf(slot()).quiet}
          onGauge={gaugeOpener(slot())}
          ribbon={adornmentsOf(slot()).ribbon}
        >
          <Dynamic
            component={definitionOf(slot().spec.kind).component}
            id={slot().id}
            spec={slot().spec}
            focused={slot().focused}
            shell={shell}
            onAction={(handler) => {
              localHandlers.set(slot().id, handler);
              onCleanup(() => localHandlers.delete(slot().id));
            }}
          />
        </PaneFrame>
      </div>
    );
  };

  return (
    <div class="kw-workspace">
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
        <Show when={tiler.emptyMain(screen())}>
          {(rect) => (
            <div class="kw-slot kw-empty-main" style={rectStyle(rect())}>
              <p class="kw-empty">{keymap.describe("pane.split")} opens a session here</p>
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
      <TrustCard trust={trust} chord={shell.keys.chord("trust.workspace")} />
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
        serverLabel={props.serverLabel}
        projection={focusedProjection()}
        usage={telemetry(focusedProjection(), props.store.controls.readings(focusedSession()).cost)}
        preset={props.store.controls.state.preset}
        trust={trustStatusItem(trust, shell.keys.chord("trust.workspace"))}
        leader={leaderArmed() ? keymap.leader : undefined}
        notice={notice()}
        gap={props.store.state.gap}
        lost={props.store.state.lost}
      />
      <Show when={overlay()}>
        {(open) => (
          <Switch>
            <Match when={open().kind === "palette"}>
              <Palette
                registry={registry}
                initialQuery={
                  open().kind === "palette" ? (open() as { query?: string }).query : undefined
                }
                onDismiss={() => setOverlay(undefined)}
              />
            </Match>
            <Match when={open().kind === "help"}>
              <HelpOverlay
                rows={helpRows(keymap, bindingHelp)}
                onDismiss={() => setOverlay(undefined)}
              />
            </Match>
          </Switch>
        )}
      </Show>
    </div>
  );
}

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

function trustStatusItem(trust: TrustFlow, chord: string): string | undefined {
  const state = trust.state();
  if (state.kind === "restarting") return "restarting keywork serve with trust recorded";
  return trust.untrusted() ? `untrusted · ${chord} trusts` : undefined;
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
