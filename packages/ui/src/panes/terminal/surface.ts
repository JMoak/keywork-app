import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal } from "@xterm/xterm";
import { terminalKeeps } from "./keys.ts";
import { chooseRenderer, probeWebgl2, type RendererChoice } from "./renderer.ts";
import type { TerminalSize, TerminalSurface } from "./session.ts";

export interface SurfaceOptions {
  leader: string;
  theme: ITheme;
  fontFamily: string;
  fontSize: number;
  windows: boolean;
}

export interface XtermSurface extends TerminalSurface {
  setTheme(theme: ITheme): void;
  fit(): void;
  renderer(): RendererChoice;
}

export function xtermSurface(container: HTMLElement, options: SurfaceOptions): XtermSurface {
  const terminal = new Terminal({
    cursorBlink: true,
    scrollback: scrollbackLines,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    allowProposedApi: true,
    ...(options.windows && { windowsPty: { backend: "conpty" } }),
  });
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.attachCustomKeyEventHandler((event) => terminalKeeps(event, options.leader));
  terminal.open(container);
  let renderer = installRenderer(terminal, (lost) => {
    renderer = lost;
  });
  const observer = observeSize(container, () => fit.fit());
  fit.fit();
  return {
    write: (data) => terminal.write(data),
    clear: () => terminal.clear(),
    reset: () => terminal.reset(),
    size: () => ({ cols: terminal.cols, rows: terminal.rows }),
    selection: () => terminal.getSelection(),
    focus: () => terminal.focus(),
    blur: () => terminal.blur(),
    onInput: (listener) => terminal.onData(listener).dispose,
    onResize: (listener) =>
      terminal.onResize((size: TerminalSize) => listener({ cols: size.cols, rows: size.rows }))
        .dispose,
    setTheme: (theme) => {
      terminal.options.theme = theme;
    },
    fit: () => fit.fit(),
    renderer: () => renderer,
    dispose: () => {
      observer();
      terminal.dispose();
    },
  };
}

function installRenderer(
  terminal: Terminal,
  onFallback: (choice: RendererChoice) => void,
): RendererChoice {
  const choice = chooseRenderer({ webgl2: probeWebgl2() });
  if (choice === "dom") return choice;
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      onFallback(chooseRenderer({ webgl2: true, contextLost: true }));
    });
    terminal.loadAddon(webgl);
    return "webgl";
  } catch {
    return "dom";
  }
}

function observeSize(container: HTMLElement, onChange: () => void): () => void {
  const measured = () => `${container.clientWidth}x${container.clientHeight}`;
  let last = measured();
  const settle = (): void => {
    const now = measured();
    if (now === last || container.clientWidth === 0 || container.clientHeight === 0) return;
    last = now;
    onChange();
  };
  const backstop = setInterval(settle, sizeBackstopMs);
  if (typeof ResizeObserver !== "function") return () => clearInterval(backstop);
  const observer = new ResizeObserver(settle);
  observer.observe(container);
  return () => {
    observer.disconnect();
    clearInterval(backstop);
  };
}

// Chromium stops delivering ResizeObserver callbacks while the window is hidden or
// occluded, so a timer backstop keeps the pty's size honest, as frameTick does for the feed.
const sizeBackstopMs = 200;

const scrollbackLines = 5000;
