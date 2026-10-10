import {
  emptyProjection,
  type KeyworkClient,
  type ServerFeed,
  type SessionProjection,
} from "@keywork-app/client";
import type { AskVerdict } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { FirstRun } from "../chrome/first-run.tsx";
import { type LifecycleState, PaneFrame } from "../chrome/pane-frame.tsx";
import { createWardrobe } from "../flavor/wardrobe.ts";
import type { HostPort } from "../host/port.ts";
import { usageLine } from "../instruments/cost.ts";
import {
  type ActionTarget,
  appActions,
  bindingHelp,
  chordOfKey,
  type Keymap,
  keymapFromConfig,
} from "../keys/index.ts";
import { scopeWhileTyping } from "../keys/typing.ts";
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
} from "../layout/index.ts";
import { CommandRegistry } from "../palette/commands.ts";
import { HelpOverlay, helpRows, Palette } from "../palette/palette.tsx";
import { fileUrlOf } from "../panes/file/range.ts";
import {
  definitionOf,
  type PaneDefinition,
  type PaneSpec,
  parsePaneSpec,
  type ShellSeams,
} from "../panes/index.ts";
import { bindPointerGestures, type PointerGestures } from "./pointer-gestures.ts";
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
    serverFlavors: () => props.store.surfaces.state.flavors,
    storage,
  });
  const [screen, setScreen] = createSignal<Screen>({ width: 1280, height: 800 });
  const [overlay, setOverlay] = createSignal<Overlay>();
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
  const act = (verdict: { ok: boolean; refused?: string }): void => {
    if (!verdict.ok && verdict.refused === "no-room") say("no room for that here");
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

  const shell: ShellSeams = {
    store: props.store,
    client: props.client,
    feed: props.feed,
    trust,
    openPane: (spec) => {
      const parsed = parsePaneSpec(spec);
      if (parsed !== undefined) act(tiler.open(parsed, screen()));
    },
    openInEditor: (path, line) => {
      void props.host.openExternal(fileUrlOf(props.workspace, path, line));
    },
    keys: {
      chord: (action) => keymap.describe(action) ?? "an unbound key",
      leader: () => keymap.leader,
    },
    host: props.host,
    workspace: props.workspace,
    currentSession: focusedSession,
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
        await props.store.prompt(sessionId, text);
      },
    },
  };

  const summon = async (definition: PaneDefinition<PaneSpec>, variant?: string): Promise<void> => {
    if (definition.summon === undefined) return;
    act(tiler.summon(await definition.summon.spec(shell, variant), screen()));
  };
  const answerFocusedAsk = (verdict: AskVerdict): void => {
    const asking = props.store
      .projection(focusedSession())
      .entries.find((entry) => entry.kind === "tool" && entry.run.phase === "asking");
    if (asking?.kind !== "tool") {
      say("nothing is waiting for an answer here");
      return;
    }
    void props.store.answerAsk(asking.run.callId, verdict);
  };

  const target: ActionTarget = {
    closePane: () => {
      const id = tiler.focused();
      if (id !== undefined) act(tiler.close(id));
    },
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
    approveAsk: () => answerFocusedAsk("granted"),
    denyAsk: () => answerFocusedAsk("denied"),
    toggleHelp: () =>
      setOverlay((current) => (current?.kind === "help" ? undefined : { kind: "help" })),
    openPalette: (query) => setOverlay({ kind: "palette", query }),
    trustWorkspace: () => void trust.accept(),
  };

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
      name: `flavor-${choice.name}`,
      description: `wear ${choice.name} (${choice.source} flavor)`,
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

  const onKeyDown = (event: KeyboardEvent): void => {
    if (overlay() !== undefined) return;
    const chord = chordOfKey(event);
    if (chord === undefined) return;
    const scope = scopeWhileTyping(tiler.focusedSpec()?.kind, event.target, keymap);
    const result = keymap.press(chord, performance.now(), scope);
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

  const titleOf = (slot: PaneSlot): string => definitionOf(slot.spec.kind).title(slot.spec, shell);
  const lifecycleOf = (slot: PaneSlot): LifecycleState =>
    definitionOf(slot.spec.kind).lifecycle?.(slot, shell) ?? "idle";
  const adornmentsOf = (slot: PaneSlot) =>
    definitionOf(slot.spec.kind).adornments?.(slot.spec, shell) ?? {};

  const slots = createMemo(() => tiler.slots(screen()));
  const scene = createMemo((): Scene => tiler.scene(screen()));
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
          bot={adornmentsOf(slot()).bot}
          hueRank={adornmentsOf(slot()).hueRank}
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
              style={rectStyle(seamZoneRect(seam))}
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
      <StatusLine
        serverLabel={props.serverLabel}
        projection={focusedProjection()}
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

interface StatusLineProps {
  serverLabel: string;
  projection: SessionProjection;
  trust: string | undefined;
  leader: string | undefined;
  notice: string | undefined;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
}

function StatusLine(props: StatusLineProps) {
  const items = () =>
    [
      "keywork",
      props.serverLabel,
      props.trust,
      props.projection.preset,
      props.projection.mode,
      usageLine(props.projection.usage),
    ].filter((item): item is string => item !== undefined && item !== "");
  return (
    <footer class="kw-status" data-lost={props.lost !== undefined ? "" : undefined}>
      <span class="kw-status-items">{items().join(" · ")}</span>
      <Show when={props.leader}>
        {(leader) => <span class="kw-status-leader">{leader()} …</span>}
      </Show>
      <Show when={props.notice}>{(text) => <span class="kw-status-notice">{text()}</span>}</Show>
      <Show when={props.lost}>{(reason) => <span class="kw-status-lost">{reason()}</span>}</Show>
      <Show when={props.gap}>
        {(gap) => (
          <span class="kw-status-gap">
            events {gap().from} to {gap().to} were missed while disconnected
          </span>
        )}
      </Show>
    </footer>
  );
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
