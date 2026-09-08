import { emptyProjection, type SessionProjection } from "@keywork-app/client";
import type { AskVerdict, SessionSummary } from "@keywork-app/protocol";
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
import { type LifecycleState, PaneFrame } from "../chrome/pane-frame.tsx";
import { relativeAge, sessionName, telemetry } from "../chrome/telemetry.ts";
import { Composer } from "../composer/composer.tsx";
import {
  type ActionTarget,
  appActions,
  bindingHelp,
  chordOfKey,
  type Keymap,
  keymapFromConfig,
} from "../keys/index.ts";
import type { PaneId, Screen } from "../layout/index.ts";
import { ConversationPane } from "../page/pane.tsx";
import { CommandRegistry } from "../palette/commands.ts";
import { HelpOverlay, helpRows, Palette } from "../palette/palette.tsx";
import type { SessionStore } from "./session-store.ts";
import {
  createTiler,
  type PaneSlot,
  parseTilerState,
  sessionsPaneId,
  type Tiler,
} from "./tiler.ts";

export interface WorkspaceViewProps {
  workspace: string;
  serverLabel: string;
  store: SessionStore;
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
  const [screen, setScreen] = createSignal<Screen>({ width: 1280, height: 800 });
  const [overlay, setOverlay] = createSignal<Overlay>();
  const [leaderArmed, setLeaderArmed] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  const [seen, setSeen] = createSignal<Record<PaneId, number>>({});
  let stage: HTMLDivElement | undefined;

  const say = (text: string): void => {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? undefined : current)), 2400);
  };
  const act = (verdict: { ok: boolean; refused?: string }): void => {
    if (!verdict.ok && verdict.refused === "no-room") say("no room for that here");
  };
  const projectionOf = (sessionId: string | undefined): SessionProjection =>
    sessionId === undefined
      ? emptyProjection
      : (props.store.state.projections[sessionId] ?? emptyProjection);
  const summaryOf = (sessionId: string | undefined): SessionSummary | undefined =>
    props.store.state.summaries.find((item) => item.id === sessionId);

  const openSession = (sessionId: string | undefined): void => {
    const focused = tiler.focused();
    const spec = tiler.focusedSpec();
    if (focused !== undefined && spec?.kind === "conversation" && spec.sessionId === undefined) {
      if (sessionId !== undefined) tiler.bindSession(focused, sessionId);
    } else {
      act(tiler.openConversation(sessionId, screen()));
    }
    if (sessionId !== undefined) void props.store.open(sessionId);
  };
  const newSession = async (): Promise<void> => {
    const id = await props.store.create();
    openSession(id);
  };
  const startSession = async (paneId: PaneId, text: string): Promise<void> => {
    const id = await props.store.create();
    tiler.bindSession(paneId, id);
    await props.store.open(id);
    await props.store.prompt(id, text);
  };
  const splitSession = async (): Promise<void> => {
    const id = await props.store.create();
    act(tiler.openConversation(id, screen()));
    void props.store.open(id);
  };

  const answerFocusedAsk = (verdict: AskVerdict): void => {
    const spec = tiler.focusedSpec();
    const projection = projectionOf(spec?.kind === "conversation" ? spec.sessionId : undefined);
    const asking = projection.entries.find(
      (entry) => entry.kind === "tool" && entry.run.phase === "asking",
    );
    if (asking?.kind !== "tool") {
      say("nothing is waiting for an answer here");
      return;
    }
    void props.store.answerAsk(asking.run.callId, verdict);
  };

  const target: ActionTarget = {
    splitPane: () => void splitSession(),
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
    summonSessions: () => act(tiler.summonSessions(screen())),
    cycleMode: () => say("modes arrive with the server's mode route"),
    approveAsk: () => answerFocusedAsk("granted"),
    denyAsk: () => answerFocusedAsk("denied"),
    toggleHelp: () =>
      setOverlay((current) => (current?.kind === "help" ? undefined : { kind: "help" })),
    openPalette: (query) => setOverlay({ kind: "palette", query }),
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
    tiler.slots(screen()).map((slot) => ({
      name: `go-${slot.id}`,
      label: paneName(slot, summaryOf, projectionOf),
      description: "jump to this pane",
      jump: true as const,
      run: () => act(tiler.focus(slot.id)),
    })),
  );

  const onKeyDown = (event: KeyboardEvent): void => {
    if (overlay() !== undefined) return;
    const chord = chordOfKey(event);
    if (chord === undefined) return;
    const result = keymap.press(chord, performance.now());
    setLeaderArmed(result.type === "leader-pending");
    if (result.type === "pass") return;
    event.preventDefault();
    event.stopPropagation();
    if (result.type === "action") appActions[result.action]?.invoke(target);
  };

  onMount(() => {
    document.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
    if (stage === undefined) return;
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
    if (tiler.panes().length === 0) {
      tiler.summonSessions(screen());
      const first = props.store.state.summaries[0]?.id;
      act(tiler.openConversation(first, screen()));
      if (first !== undefined) void props.store.open(first);
    } else {
      for (const id of tiler.panes()) {
        const spec = tiler.spec(id);
        if (spec?.kind === "conversation" && spec.sessionId !== undefined)
          void props.store.open(spec.sessionId);
      }
    }
  });

  createEffect(() => {
    tiler.version();
    storage?.setItem(storageKey, JSON.stringify(tiler.snapshot()));
  });

  const slots = createMemo(() => tiler.slots(screen()));
  const paneIds = createMemo(() => slots().map((slot) => slot.id));
  const slotOf = (id: PaneId): PaneSlot | undefined => slots().find((slot) => slot.id === id);
  const lifecycleOf = (slot: PaneSlot): LifecycleState => {
    if (slot.spec.kind !== "conversation") return "idle";
    const projection = projectionOf(slot.spec.sessionId);
    const turns = projection.usage.turns;
    if (projection.turn !== undefined) return "working";
    if (projection.entries.some((entry) => entry.kind === "tool" && entry.run.phase === "asking")) {
      return "needs-you";
    }
    const last = projection.entries.at(-1);
    if (last?.kind === "notice" && last.level === "error") return "failed";
    const unseen = (seen()[slot.id] ?? 0) < turns;
    if (slot.focused) {
      if (unseen) setSeen((current) => ({ ...current, [slot.id]: turns }));
      return "idle";
    }
    return unseen && turns > 0 ? "finished-unseen" : "idle";
  };

  const focusedProjection = () => {
    const spec = tiler.focusedSpec();
    return spec?.kind === "conversation" ? projectionOf(spec.sessionId) : emptyProjection;
  };

  const PaneSlotView = (view: { slot: PaneSlot }) => {
    const slot = () => view.slot;
    return (
      <div
        class="kw-slot"
        style={{
          left: `${slot().rect.x}px`,
          top: `${slot().rect.y}px`,
          width: `${slot().rect.width}px`,
          height: `${slot().rect.height}px`,
        }}
      >
        <PaneFrame
          name={paneName(slot(), summaryOf, projectionOf)}
          state={lifecycleOf(slot())}
          focused={slot().focused}
          spawnRank={slot().spawnRank}
          telemetry={
            slot().spec.kind === "conversation"
              ? telemetry(projectionOf(sessionIdOf(slot())))
              : undefined
          }
          modeWord={modeWordOf(slot(), projectionOf)}
          onFocus={() => act(tiler.focus(slot().id))}
        >
          <Switch>
            <Match when={slot().spec.kind === "sessions"}>
              <SessionsPane
                store={props.store}
                current={currentSession(tiler)}
                onSelect={(id) => openSession(id)}
                onCreate={() => void newSession()}
              />
            </Match>
            <Match when={slot().spec.kind === "conversation"}>
              <ConversationSlot
                slot={slot()}
                store={props.store}
                projection={projectionOf(sessionIdOf(slot()))}
                onStart={(text) => startSession(slot().id, text)}
              />
            </Match>
          </Switch>
        </PaneFrame>
      </div>
    );
  };

  return (
    <div class="kw-workspace">
      <div class="kw-stage" ref={stage}>
        <For each={paneIds()}>
          {(id) => <Show when={slotOf(id)}>{(slotNow) => <PaneSlotView slot={slotNow()} />}</Show>}
        </For>
        <Show when={tiler.emptyMain(screen())}>
          {(rect) => (
            <div
              class="kw-slot kw-empty-main"
              style={{
                left: `${rect().x}px`,
                top: `${rect().y}px`,
                width: `${rect().width}px`,
                height: `${rect().height}px`,
              }}
            >
              <p class="kw-empty">{keymap.describe("pane.split")} opens a session here</p>
            </div>
          )}
        </Show>
      </div>
      <StatusLine
        serverLabel={props.serverLabel}
        projection={focusedProjection()}
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

interface ConversationSlotProps {
  slot: PaneSlot;
  store: SessionStore;
  projection: SessionProjection;
  onStart: (text: string) => Promise<void>;
}

function ConversationSlot(props: ConversationSlotProps) {
  const sessionId = () => sessionIdOf(props.slot);
  const send = (text: string): void => {
    const id = sessionId();
    if (id === undefined) void props.onStart(text);
    else void props.store.prompt(id, text);
  };
  const interrupt = (): void => {
    const id = sessionId();
    if (id !== undefined) void props.store.abort(id);
  };
  return (
    <>
      <div class="kw-page">
        <Show
          when={sessionId() !== undefined}
          fallback={<p class="kw-empty">pick a session, or send a prompt to start one</p>}
        >
          <ConversationPane
            projection={props.projection}
            onAnswerAsk={(callId, verdict) => void props.store.answerAsk(callId, verdict)}
          />
        </Show>
      </div>
      <Composer
        queue={props.projection.queue}
        busy={props.projection.turn !== undefined}
        onSteer={send}
        onQueue={send}
        onInterrupt={interrupt}
      />
    </>
  );
}

interface SessionsPaneProps {
  store: SessionStore;
  current: string | undefined;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function SessionsPane(props: SessionsPaneProps) {
  return (
    <aside class="kw-sessions" aria-label="sessions">
      <div class="kw-sessions-head">
        <button type="button" class="kw-sessions-new" onClick={() => props.onCreate()}>
          + new session
        </button>
      </div>
      <Show
        when={props.store.state.summaries.length > 0}
        fallback={<p class="kw-empty">no sessions yet · new starts one</p>}
      >
        <ol class="kw-session-list">
          <For each={props.store.state.summaries}>
            {(item) => (
              <li class="kw-session-row" data-current={item.id === props.current ? "" : undefined}>
                <button
                  type="button"
                  class="kw-session-button"
                  onClick={() => props.onSelect(item.id)}
                >
                  <span class="kw-session-mark" aria-hidden="true">
                    {props.store.state.projections[item.id]?.turn !== undefined ? "▓" : "░"}
                  </span>
                  <span class="kw-session-name">
                    {sessionName(item, props.store.state.projections[item.id])}
                  </span>
                  <span class="kw-session-age">{relativeAge(item.lastActivityAt)}</span>
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </aside>
  );
}

interface StatusLineProps {
  serverLabel: string;
  projection: SessionProjection;
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
      props.projection.preset,
      props.projection.mode,
      telemetry(props.projection),
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

function sessionIdOf(slot: PaneSlot): string | undefined {
  return slot.spec.kind === "conversation" ? slot.spec.sessionId : undefined;
}

function currentSession(tiler: Tiler): string | undefined {
  const spec = tiler.focusedSpec();
  return spec?.kind === "conversation" ? spec.sessionId : undefined;
}

function paneName(
  slot: PaneSlot,
  summaryOf: (sessionId: string | undefined) => SessionSummary | undefined,
  projectionOf: (sessionId: string | undefined) => SessionProjection,
): string {
  if (slot.spec.kind === "sessions") return "sessions";
  const sessionId = slot.spec.sessionId;
  return sessionId === undefined
    ? "new session"
    : sessionName(summaryOf(sessionId), projectionOf(sessionId));
}

function modeWordOf(
  slot: PaneSlot,
  projectionOf: (sessionId: string | undefined) => SessionProjection,
): string | undefined {
  if (slot.spec.kind !== "conversation") return undefined;
  const mode = projectionOf(slot.spec.sessionId).mode;
  return mode === undefined || mode === "agent" ? undefined : mode;
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

export { sessionsPaneId };
