import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITerminalAddon, type ITerminalOptions, type ITheme, Terminal } from "@xterm/xterm";
import { terminalKeeps } from "./keys.ts";
import { chooseRenderer, probeRenderer, type RendererChoice } from "./renderer.ts";
import type { TerminalSize, TerminalSurface } from "./session.ts";

export interface SurfaceOptions {
  leader?: string;
  theme: ITheme;
  fontFamily: string;
  fontSize: number;
  windows: boolean;
}

export interface XtermSurface extends TerminalSurface {
  setTheme(theme: ITheme): void;
  remeasure(): void;
  fit(): void;
  renderer(): RendererChoice;
}

export const readableContrast = 4.5;

export function xtermSurface(container: HTMLElement, options: SurfaceOptions): XtermSurface {
  const terminal = new Terminal(terminalOptions(options));
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  const leader = options.leader;
  if (leader !== undefined) {
    terminal.attachCustomKeyEventHandler((event) => terminalKeeps(event, leader));
  }
  terminal.open(container);
  const remeasure = (): void => {
    const size = terminal.options.fontSize ?? options.fontSize;
    terminal.options.fontSize = size + 1;
    terminal.options.fontSize = size;
    terminal.clearTextureAtlas();
    fit.fit();
  };
  let renderer = installRenderer(terminal, chooseRenderer(probeRenderer()), () => {
    renderer = "dom";
    remeasure();
  });
  const stopObservingSize = observeSize(container, () => fit.fit());
  const stopWatchingRatio = watchPixelRatio(container.ownerDocument.defaultView, remeasure);
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
    remeasure,
    fit: () => fit.fit(),
    renderer: () => renderer,
    dispose: () => {
      stopWatchingRatio();
      stopObservingSize();
      terminal.dispose();
    },
  };
}

export function terminalOptions(options: SurfaceOptions): ITerminalOptions {
  return {
    cursorBlink: true,
    scrollback: scrollbackLines,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    minimumContrastRatio: readableContrast,
    allowProposedApi: true,
    ...(options.windows && { windowsPty: { backend: "conpty" } }),
  };
}

export interface WebglRenderer extends ITerminalAddon {
  onContextLoss(listener: () => void): unknown;
}

export function installRenderer(
  terminal: { loadAddon(addon: ITerminalAddon): void },
  choice: RendererChoice,
  onContextLost: () => void,
  makeWebgl: () => WebglRenderer = () => new WebglAddon(),
): RendererChoice {
  if (choice === "dom") return choice;
  try {
    const webgl = makeWebgl();
    webgl.onContextLoss(() => {
      webgl.dispose();
      onContextLost();
    });
    terminal.loadAddon(webgl);
    return "webgl";
  } catch {
    return "dom";
  }
}

export function watchPixelRatio(view: Window | null, onChange: () => void): () => void {
  if (view === null || typeof view.matchMedia !== "function") return () => {};
  let current: MediaQueryList | undefined;
  const listen = (): void => {
    current = view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
    current.addEventListener("change", changed, { once: true });
  };
  const changed = (): void => {
    listen();
    onChange();
  };
  listen();
  return () => current?.removeEventListener("change", changed);
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
