import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { z } from "zod";
import { sessionName } from "../../chrome/telemetry.ts";
import type { PtyExit } from "../../host/port.ts";
import { EmptyState } from "../empty-state.tsx";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import { bridgeArgs, connectPty, mirrorPainter, type TerminalSurface } from "./session.ts";
import { xtermSurface } from "./surface.ts";
import { monoFontOf, themeOfElement, watchFlavor } from "./theme.ts";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

export const terminalModes = ["shell", "mirror", "bridge"] as const;

const terminalSpec = z.object({
  kind: z.literal("terminal"),
  mode: z.enum(terminalModes).default("shell"),
  sessionId: z.string().optional(),
  verb: z.enum(["attach", "connect"]).optional(),
});

export type TerminalSpec = z.output<typeof terminalSpec>;
export type TerminalMode = TerminalSpec["mode"];

export const terminalPane = definePane<TerminalSpec>({
  kind: "terminal",
  spec: terminalSpec,
  home: "main",
  keyboard: "owned",
  title: titleOf,
  emptyState: (keys) =>
    `a shell in the workspace root · ${keys.chord("terminal.summon")} opens one · inside it every key goes to the shell except ${keys.leader()}`,
  component: TerminalSlot,
  summon: {
    action: "terminal.summon",
    chords: "leader shift+t",
    help: "terminal pane",
    command: { name: "terminal", description: "open a shell in the workspace", aliases: ["sh"] },
    variants: {
      mirror: {
        help: "mirror the agent's bash calls",
        command: { name: "mirror", description: "tail the current session's bash calls" },
      },
      bridge: {
        help: "the keywork TUI in a pane",
        command: { name: "bridge", description: "run the keywork TUI attached to this server" },
      },
    },
    spec: (shell, variant) => specFor(shell, variant),
  },
  localActions: {
    "terminal.clear": {
      chords: "leader e",
      help: "clear the terminal",
      command: { name: "clear", description: "clear this terminal's screen" },
    },
    "terminal.copy": {
      chords: ["leader y", "ctrl+shift+c"],
      help: "copy the selection",
      command: { name: "copy", description: "copy this terminal's selection" },
    },
    "terminal.paste": {
      chords: ["leader p", "ctrl+shift+v"],
      help: "paste into the terminal",
      command: { name: "paste", description: "paste the clipboard into this terminal" },
    },
    "terminal.mode.cycle": {
      chords: "leader m",
      help: "cycle shell → mirror → bridge",
      command: { name: "terminal-mode", description: "cycle this terminal's mode" },
    },
  },
  adornments: (spec) => ({ modeWord: spec.mode }),
});

export function nextMode(mode: TerminalMode): TerminalMode {
  const index = terminalModes.indexOf(mode);
  return terminalModes[(index + 1) % terminalModes.length] ?? "shell";
}

function titleOf(spec: TerminalSpec, shell: ShellSeams): string {
  switch (spec.mode) {
    case "shell":
      return "shell";
    case "mirror":
      return spec.sessionId === undefined
        ? "mirror"
        : `mirror · ${sessionName(shell.store.summary(spec.sessionId), shell.store.projection(spec.sessionId))}`;
    case "bridge":
      return spec.verb === "connect" ? "keywork connect" : "keywork";
  }
}

function specFor(shell: ShellSeams, variant: string | undefined): TerminalSpec {
  switch (variant) {
    case "mirror":
      return { kind: "terminal", mode: "mirror", sessionId: shell.currentSession() };
    case "bridge":
      return { kind: "terminal", mode: "bridge", sessionId: shell.currentSession() };
    default:
      return { kind: "terminal", mode: "shell" };
  }
}

function TerminalSlot(props: PaneProps<TerminalSpec>) {
  const [exit, setExit] = createSignal<PtyExit>();
  const [failure, setFailure] = createSignal<string>();
  const [surface, setSurface] = createSignal<TerminalSurface>();
  let holder: HTMLDivElement | undefined;
  let write: (data: string) => void = () => {};

  const needsSession = () => props.spec.mode === "mirror" && props.spec.sessionId === undefined;
  const attachment = createMemo(() =>
    JSON.stringify({
      mode: props.spec.mode,
      sessionId: props.spec.sessionId,
      verb: props.spec.verb,
    }),
  );

  onMount(() => {
    if (holder === undefined) return;
    const root = document.documentElement;
    const font = monoFontOf(holder);
    try {
      const live = xtermSurface(holder, {
        leader: props.shell.keys.leader(),
        theme: themeOfElement(holder),
        fontFamily: font.family,
        fontSize: font.size,
        windows: /win/i.test(navigator.platform),
      });
      onCleanup(watchFlavor(root, () => live.setTheme(themeOfElement(holder as HTMLElement))));
      onCleanup(() => live.dispose());
      setSurface(live);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  });

  createEffect(() => {
    const live = surface();
    if (live === undefined) return;
    const spec = JSON.parse(attachment()) as Pick<TerminalSpec, "mode" | "sessionId" | "verb">;
    setExit(undefined);
    live.reset();
    write = () => {};
    if (spec.mode === "mirror") {
      const painter = mirrorPainter(live);
      createEffect(() => painter.paint(props.shell.store.projection(spec.sessionId)));
      return;
    }
    const link =
      spec.mode === "bridge"
        ? { workspace: props.shell.workspace, program: "keywork" as const, args: bridgeArgs(spec) }
        : { workspace: props.shell.workspace, program: "shell" as const, args: [] };
    const connection = connectPty(live, props.shell.host.pty, link, (event) => {
      if (event.kind === "exit") setExit(event.exit);
    });
    write = connection.write;
    onCleanup(() => connection.dispose());
  });

  createEffect(() => {
    const live = surface();
    if (live === undefined) return;
    if (props.focused) live.focus();
    else live.blur();
  });

  props.onAction((action) => {
    const live = surface();
    if (live === undefined) return;
    switch (action) {
      case "terminal.clear":
        live.clear();
        return;
      case "terminal.copy":
        void navigator.clipboard?.writeText(live.selection());
        return;
      case "terminal.paste":
        void navigator.clipboard?.readText().then((text) => write(text));
        return;
      case "terminal.mode.cycle":
        props.shell.rebind(props.id, { ...props.spec, mode: nextMode(props.spec.mode) });
        return;
    }
  });

  return (
    <div class="kw-terminal" data-mode={props.spec.mode}>
      <div class="kw-terminal-host" ref={holder} hidden={needsSession()} />
      <Show when={needsSession()}>
        <EmptyState
          line={`mirror needs a session · ${props.shell.keys.chord("tree.summon")} picks one`}
        />
      </Show>
      <Show when={failure()}>
        {(text) => <p class="kw-terminal-exit">the terminal could not start: {text()}</p>}
      </Show>
      <Show when={exit()}>
        {(ended) => (
          <p class="kw-terminal-exit">
            exited with code {ended().exitCode} · {props.shell.keys.chord("terminal.summon")} opens
            another
          </p>
        )}
      </Show>
    </div>
  );
}
