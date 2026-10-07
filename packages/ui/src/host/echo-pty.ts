import type { PtyExit, PtyOpenRequest, PtyPort } from "./port.ts";

export function echoPty(): PtyPort {
  const shells = new Map<number, EchoShell>();
  let nextId = 1;
  return {
    open: async (request) => {
      const id = nextId++;
      const shell = echoShell(id, request);
      shells.set(id, shell);
      shell.say(`${banner(request)}\r\n${shell.prompt()}`);
      return { id, title: request.program === "keywork" ? "keywork" : "echo" };
    },
    write: (id, data) => shells.get(id)?.type(data),
    resize: (id, cols, rows) => shells.get(id)?.resize(cols, rows),
    close: (id) => {
      shells.get(id)?.exit(0);
      shells.delete(id);
    },
    onData: (id, listener) => shells.get(id)?.onData(listener) ?? (() => {}),
    onExit: (id, listener) => shells.get(id)?.onExit(listener) ?? (() => {}),
  };
}

interface EchoShell {
  say(text: string): void;
  type(data: string): void;
  resize(cols: number, rows: number): void;
  exit(code: number): void;
  prompt(): string;
  onData(listener: (bytes: Uint8Array) => void): () => void;
  onExit(listener: (exit: PtyExit) => void): () => void;
}

function echoShell(id: number, request: PtyOpenRequest): EchoShell {
  const encoder = new TextEncoder();
  const backlog: Uint8Array[] = [];
  const dataListeners = new Set<(bytes: Uint8Array) => void>();
  const exitListeners = new Set<(exit: PtyExit) => void>();
  let line = "";
  let exited: PtyExit | undefined;
  const prompt = (): string => `${request.workspace}> `;
  const say = (text: string): void => {
    if (exited !== undefined) return;
    const bytes = encoder.encode(text);
    if (dataListeners.size === 0) backlog.push(bytes);
    for (const listener of dataListeners) listener(bytes);
  };
  const exit = (code: number): void => {
    if (exited !== undefined) return;
    exited = { id, exitCode: code, signal: undefined };
    for (const listener of exitListeners) listener(exited);
  };
  const run = (command: string): void => {
    if (command === "exit") {
      exit(0);
      return;
    }
    if (command !== "") say(`${command}\r\n`);
    say(prompt());
  };
  const type = (data: string): void => {
    for (const char of data) {
      if (char === "\r") {
        say("\r\n");
        const command = line;
        line = "";
        run(command);
      } else if (char === "\x7f") {
        if (line === "") continue;
        line = line.slice(0, -1);
        say("\b \b");
      } else if (char === "\x03") {
        line = "";
        say(`^C\r\n${prompt()}`);
      } else if (char === "\x04") {
        exit(0);
      } else {
        line += char;
        say(char);
      }
    }
  };
  return {
    say,
    type,
    exit,
    prompt,
    resize: (cols, rows) => say(`\r\n[${cols}x${rows}]\r\n${prompt()}${line}`),
    onData: (listener) => {
      dataListeners.add(listener);
      for (const bytes of backlog.splice(0)) listener(bytes);
      return () => dataListeners.delete(listener);
    },
    onExit: (listener) => {
      if (exited !== undefined) listener(exited);
      else exitListeners.add(listener);
      return () => exitListeners.delete(listener);
    },
  };
}

function banner(request: PtyOpenRequest): string {
  return request.program === "keywork"
    ? `keywork ${(request.args ?? []).join(" ")} · the browser build has no keywork binary, this echoes`
    : "echo shell · the browser build has no pty, this echoes what you type";
}
