import "./screen.css";
import { normalizedOnVideo } from "@keywork-app/screen";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { EmptyState } from "../empty-state.tsx";
import { definePane, type PaneProps } from "../registry.ts";
import { type ScreenPort, screenPortOf } from "./port.ts";
import {
  controlLine,
  controlsInput,
  failedView,
  grantOf,
  pathWord,
  type ScreenViewState,
  startingView,
  statsLine,
  statusLine,
  viewState,
} from "./view-state.ts";

const screenSpec = z.object({
  kind: z.literal("screen"),
  peer: z.string().min(1),
  label: z.string().optional(),
  control: z.boolean().optional(),
});

export type ScreenSpec = z.output<typeof screenSpec>;

export const screenPane = definePane<ScreenSpec>({
  kind: "screen",
  heading: "viewing a screen",
  spec: screenSpec,
  home: "main",
  attire: "work",
  title: (spec) => `screen · ${spec.label ?? spec.peer}`,
  emptyState: (keys) =>
    `no machine named yet · ${keys.chord("palette.commands")} then screen and a paired machine's name`,
  component: ScreenPane,
  summon: {
    action: "screen.view",
    chords: "none",
    help: "view a paired machine's screen",
    command: {
      name: "screen",
      description: "view the screen of a paired machine, view only",
      argument: { hint: "machine", required: true },
    },
    spec: (_shell, argument) => {
      const [peer = "", mode] = (argument ?? "").trim().split(/\s+/);
      return { kind: "screen", peer, ...(mode === "control" && { control: true }) };
    },
  },
  localActions: {
    "screen.stop": {
      chords: "x",
      help: "stop viewing",
      command: { name: "screen-stop", description: "stop viewing this screen" },
    },
    "screen.display": {
      chords: "d",
      help: "next display",
      command: { name: "screen-display", description: "show the next display the grant allows" },
    },
  },
});

export const desktopOnlyLine = "screen viewing runs in the desktop app · open this pane there";

function ScreenPane(props: PaneProps<ScreenSpec>) {
  const port = screenPortOf(props.shell.host);
  return (
    <Show when={port} fallback={<EmptyState line={desktopOnlyLine} />}>
      {(available) => (
        <ScreenViewer
          port={available()}
          spec={props.spec}
          label={props.spec.label ?? props.spec.peer}
          onAction={props.onAction}
        />
      )}
    </Show>
  );
}

interface ScreenViewerProps {
  readonly port: ScreenPort;
  readonly spec: ScreenSpec;
  readonly label: string;
  onAction: PaneProps<ScreenSpec>["onAction"];
}

function ScreenViewer(props: ScreenViewerProps) {
  const [state, setState] = createSignal<ScreenViewState>(startingView);
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), 1000);
  let video: HTMLVideoElement | undefined;
  let sessionId: string | undefined;
  let requested: ScreenSpec = props.spec;
  let attempt = 0;
  let unsubscribe = (): void => {};

  const open = (): boolean => {
    const phase = state().phase;
    return phase !== "ended" && phase !== "failed";
  };
  const stop = (): void => {
    if (sessionId !== undefined && open()) void props.port.stop(sessionId);
  };
  const leave = (): void => {
    stop();
    unsubscribe();
    unsubscribe = () => {};
    sessionId = undefined;
  };

  const begin = async (spec: ScreenSpec): Promise<void> => {
    leave();
    requested = spec;
    const mine = ++attempt;
    setState(startingView);
    const started = await props.port.view({
      peer: spec.peer,
      ...(spec.control === true && { control: true }),
    });
    if (mine !== attempt) {
      if (started.ok) void props.port.stop(started.sessionId);
      return;
    }
    if (!started.ok) {
      setState(failedView(started.problem));
      return;
    }
    sessionId = started.sessionId;
    if (video !== undefined) props.port.attach(started.sessionId, video);
    unsubscribe = props.port.onEvent(started.sessionId, (event) =>
      setState((prior) => viewState(prior, event)),
    );
  };

  props.onAction((action) => {
    if (action === "screen.stop") stop();
    if (action === "screen.display" && sessionId !== undefined)
      void props.port.cycleDisplay(sessionId);
  });

  onMount(() => void begin(props.spec));
  createEffect(
    on(
      () => props.spec,
      (spec) => {
        if (!open() || !sameRequest(spec, requested)) void begin(spec);
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    attempt += 1;
    clearInterval(clock);
    leave();
  });

  const send = (input: Parameters<NonNullable<ScreenPort["input"]>>[1]): void => {
    if (sessionId !== undefined && controlsInput(state())) props.port.input?.(sessionId, input);
  };
  const pointAt = (event: MouseEvent) =>
    video === undefined
      ? undefined
      : normalizedOnVideo({ x: event.clientX, y: event.clientY }, video.getBoundingClientRect(), {
          width: video.videoWidth,
          height: video.videoHeight,
        });
  const button = (event: MouseEvent, down: boolean): void => {
    const point = pointAt(event);
    const which = (["left", "middle", "right"] as const)[event.button];
    if (point !== undefined && which !== undefined)
      send({ kind: "button", ...point, button: which, down });
  };

  return (
    <section class="kw-screen" data-phase={state().phase}>
      <header class="kw-screen-rail" data-grant={grantOf(state())}>
        <span class="kw-screen-path" data-path={state().path ?? "unknown"}>
          {pathWord(state().path)}
        </span>
        <span class="kw-screen-status">{statusLine(state(), props.label)}</span>
        <span class="kw-screen-stats">{statsLine(state())}</span>
        <span class="kw-screen-control" data-control={state().control?.state ?? "none"}>
          {controlLine(state(), now())}
        </span>
      </header>
      <video
        ref={(element) => {
          video = element;
        }}
        class="kw-screen-video"
        tabindex="0"
        data-control={controlsInput(state()) ? "true" : "false"}
        onPointerMove={(event) => {
          const point = pointAt(event);
          if (point !== undefined) send({ kind: "move", ...point });
        }}
        onPointerDown={(event) => button(event, true)}
        onPointerUp={(event) => button(event, false)}
        onWheel={(event) => {
          const point = pointAt(event);
          if (point !== undefined)
            send({ kind: "wheel", ...point, dx: event.deltaX, dy: event.deltaY });
        }}
        onKeyDown={(event) => send({ kind: "key", code: event.code, down: true })}
        onKeyUp={(event) => send({ kind: "key", code: event.code, down: false })}
        onBlur={() => send({ kind: "release-all" })}
        autoplay
        muted
        playsinline
        data-live={state().phase === "live" ? "true" : "false"}
      />
    </section>
  );
}

function sameRequest(a: ScreenSpec, b: ScreenSpec): boolean {
  return a.peer === b.peer && (a.control === true) === (b.control === true);
}
