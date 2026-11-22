import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ScreenPoint } from "./channels.ts";

export const helperProtocol = 1;

export interface HelperPipes {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  onClosed(listener: () => void): void;
  kill(): void;
}

export interface Journey {
  readonly window: string;
  readonly at: ScreenPoint;
  readonly to: ScreenPoint;
}

export interface HelperWatcher {
  settled(glide: number): void;
  refused(window: string, reason: string): void;
  synced(): void;
  retired(): void;
}

export interface PanesHelper {
  inUse(): boolean;
  glide(id: number, durationMs: number, journeys: readonly Journey[]): void;
  release(window: string): void;
  frame(window: string, colour: string | undefined): void;
  sync(): void;
  watch(watcher: HelperWatcher): void;
  retire(why: string): void;
  close(): void;
}

export function panesHelper(
  pipes: HelperPipes,
  parentPid: number,
  tell: (news: string) => void = () => undefined,
): PanesHelper {
  let state: "starting" | "serving" | "over" = "starting";
  let watcher: HelperWatcher | undefined;

  const close = (): void => {
    if (state === "over") return;
    state = "over";
    pipes.kill();
  };

  const retire = (why: string): void => {
    if (state === "over") return;
    close();
    tell(`the panes mover is retired for this session: ${why}`);
    watcher?.retired();
  };

  const say = (line: string): void => {
    if (state !== "serving") return;
    try {
      pipes.write(line);
    } catch {
      retire("it could not be written to");
    }
  };

  const greeted = (line: string): void => {
    if (line === `ready ${helperProtocol} ${parentPid}`) state = "serving";
    else retire(`it greeted with "${line}"`);
  };

  const refused = (window = "-", reason = ""): void => {
    if (window === "-") retire(`it could not read a command (${reason})`);
    else if (!reason.startsWith(unpaintedFrame)) watcher?.refused(window, reason);
  };

  const heard = (line: string): void => {
    const [word, ...rest] = line.split(/\s+/);
    if (word === "settled") watcher?.settled(Number(rest[0]));
    else if (word === "stats") watcher?.synced();
    else if (word === "refused") refused(rest[0], rest[1]);
  };

  pipes.onLine((line) => {
    if (state === "starting") greeted(line.trim());
    else if (state === "serving") heard(line.trim());
  });
  pipes.onClosed(() => retire("its process ended"));

  return {
    inUse: () => state === "serving",
    glide: (id, durationMs, journeys) =>
      say(`glide ${id} ${durationMs} ${journeys.map(journeyWord).join(" ")}`),
    release: (window) => say(`release ${window}`),
    frame: (window, colour) => say(`border ${window} ${colour ?? "clear"}`),
    sync: () => say(syncRequest),
    watch: (next) => {
      watcher = next;
    },
    retire,
    close,
  };
}

export function frameColour(hex: unknown): string | undefined {
  return typeof hex === "string" ? hex.match(/^#?([0-9a-f]{6})$/i)?.[1]?.toLowerCase() : undefined;
}

export function helperPipes(path: string): HelperPipes {
  const child = spawn(path, [], {
    stdio: ["pipe", "pipe", "ignore"],
    env: {},
    shell: false,
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  const closed = new Set<() => void>();
  const tellClosed = (): void => {
    for (const listener of [...closed]) listener();
  };
  for (const source of [child, child.stdin, child.stdout, lines]) source.on("error", tellClosed);
  child.on("exit", tellClosed);
  return {
    write: (line) => void child.stdin.write(`${line}\n`),
    onLine: (listener) => void lines.on("line", listener),
    onClosed: (listener) => void closed.add(listener),
    kill: () => void child.kill(),
  };
}

// The helper answers `stats` only after every command before it has taken effect, which makes
// the pair the one round trip the protocol has.
const syncRequest = "stats";

// Colouring a frame is refused where the desktop cannot do it (before Windows 11), and that
// says nothing about whether the window can be moved.
const unpaintedFrame = "border-failed";

function journeyWord({ window, at, to }: Journey): string {
  return `${window}@${Math.round(at.x)},${Math.round(at.y)}>${Math.round(to.x)},${Math.round(to.y)}`;
}
