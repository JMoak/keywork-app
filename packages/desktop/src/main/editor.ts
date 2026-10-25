import { spawn } from "node:child_process";
import { basename, delimiter, extname, join } from "node:path";
import type { EditorOpened } from "../shared/channels.ts";

export interface EditorRequest {
  readonly path: string;
  readonly line: number | undefined;
}

export interface EditorEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  exists(path: string): boolean;
}

export interface EditorSeams extends EditorEnvironment {
  start(launch: Launch): Promise<void>;
  reveal(path: string): void;
}

export type EditorPlan =
  | {
      kind: "editor";
      editor: string;
      program: string;
      args: readonly string[];
      terminal: boolean;
    }
  | { kind: "system" };

export interface Launch {
  readonly file: string;
  readonly args: readonly string[];
  readonly verbatim: boolean;
  readonly newConsole: boolean;
}

export async function openInEditor(
  request: EditorRequest,
  seams: EditorSeams,
): Promise<EditorOpened> {
  const plan = editorPlan(request, seams.env, discoveredEditor(seams));
  if (plan.kind === "system") return revealed(request, seams, noEditorReason);
  if (!reachable(plan.program, seams)) {
    return revealed(request, seams, `${plan.editor} isn't on PATH`);
  }
  const launch = launchFor(plan, seams);
  if ("refused" in launch) return revealed(request, seams, launch.refused);
  try {
    await seams.start(launch);
    return { via: "editor", editor: plan.editor };
  } catch (cause) {
    return revealed(request, seams, `${plan.editor} did not start · ${messageOf(cause)}`);
  }
}

export const noEditorReason = "no editor is set · VISUAL or EDITOR names one";

export function editorPlan(
  request: EditorRequest,
  env: Readonly<Record<string, string | undefined>>,
  fallback?: string | undefined,
): EditorPlan {
  const [program, ...chosenArgs] = shellWords(configuredEditor(env) ?? fallback ?? "");
  if (program === undefined) return { kind: "system" };
  const editor = editorName(program);
  return {
    kind: "editor",
    editor,
    program,
    args: [...chosenArgs, ...lineArguments(lineStyles[editor] ?? "none", request)],
    terminal: runsInTerminal(editor, chosenArgs),
  };
}

export function launchFor(
  plan: Extract<EditorPlan, { kind: "editor" }>,
  environment: EditorEnvironment,
): Launch | { refused: string } {
  const program = resolvedProgram(plan.program, environment);
  if (!plan.terminal) return direct(program, plan.args, environment, false);
  if (environment.platform === "win32") return direct(program, plan.args, environment, true);
  if (environment.platform === "darwin") {
    return { refused: `${plan.editor} runs in a terminal · set VISUAL to a windowed editor` };
  }
  const [terminal, ...terminalArgs] = terminalEmulator(environment);
  if (terminal === undefined) {
    return { refused: `${plan.editor} runs in a terminal and none was found · set TERMINAL` };
  }
  return direct(terminal, [...terminalArgs, "-e", program, ...plan.args], environment, false);
}

export function shellWords(command: string): string[] {
  return Array.from(
    command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g),
    (match) => match[1] ?? match[2] ?? match[3] ?? "",
  );
}

export function startDetached(launch: Launch): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.file, [...launch.args], {
      detached: true,
      stdio: "ignore",
      windowsHide: !launch.newConsole,
      windowsVerbatimArguments: launch.verbatim,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

type LineStyle = "goto" | "colon" | "plus" | "dash-n" | "dash-l" | "dash-line" | "none";

const lineStyles: Readonly<Record<string, LineStyle>> = {
  code: "goto",
  "code-insiders": "goto",
  codium: "goto",
  vscodium: "goto",
  cursor: "goto",
  windsurf: "goto",
  subl: "colon",
  sublime_text: "colon",
  zed: "colon",
  hx: "colon",
  helix: "colon",
  vim: "plus",
  nvim: "plus",
  vi: "plus",
  gvim: "plus",
  mvim: "plus",
  nano: "plus",
  micro: "plus",
  kak: "plus",
  emacs: "plus",
  emacsclient: "plus",
  runemacs: "plus",
  "notepad++": "dash-n",
  mate: "dash-l",
  idea: "dash-line",
  idea64: "dash-line",
  webstorm: "dash-line",
  webstorm64: "dash-line",
  pycharm: "dash-line",
  pycharm64: "dash-line",
  goland: "dash-line",
  goland64: "dash-line",
  clion: "dash-line",
  rider: "dash-line",
  phpstorm: "dash-line",
  rubymine: "dash-line",
};

const terminalEditors = new Set(["vim", "nvim", "vi", "nano", "micro", "kak", "hx", "helix"]);

const windowedEditorsOnPath = ["code", "cursor", "windsurf", "codium", "zed", "subl"];

const emacsTerminalFlags = new Set(["-nw", "-t", "--tty", "--no-window-system"]);

const windowsShims = new Set([".cmd", ".bat"]);

function configuredEditor(env: Readonly<Record<string, string | undefined>>): string | undefined {
  return [env.VISUAL, env.EDITOR].find((value) => value !== undefined && value.trim() !== "");
}

function editorName(program: string): string {
  const name = basename(program.replace(/\\/g, "/")).toLowerCase();
  return name.replace(/\.(exe|cmd|bat|com)$/, "");
}

function runsInTerminal(editor: string, chosenArgs: readonly string[]): boolean {
  if (editor === "emacs" || editor === "emacsclient") {
    return chosenArgs.some((arg) => emacsTerminalFlags.has(arg));
  }
  if (editor === "vim" && chosenArgs.includes("-g")) return false;
  return terminalEditors.has(editor);
}

function lineArguments(style: LineStyle, request: EditorRequest): string[] {
  const { path, line } = request;
  if (line === undefined) return [path];
  switch (style) {
    case "goto":
      return ["--goto", `${path}:${line}`];
    case "colon":
      return [`${path}:${line}`];
    case "plus":
      return [`+${line}`, path];
    case "dash-n":
      return [`-n${line}`, path];
    case "dash-l":
      return ["-l", String(line), path];
    case "dash-line":
      return ["--line", String(line), path];
    case "none":
      return [path];
  }
}

function discoveredEditor(environment: EditorEnvironment): string | undefined {
  return windowedEditorsOnPath.find((program) => onPath(program, environment) !== undefined);
}

function reachable(program: string, environment: EditorEnvironment): boolean {
  return hasDirectory(program)
    ? environment.exists(program)
    : onPath(program, environment) !== undefined;
}

function resolvedProgram(program: string, environment: EditorEnvironment): string {
  if (environment.platform !== "win32" || hasDirectory(program)) return program;
  return onPath(program, environment) ?? program;
}

function onPath(program: string, environment: EditorEnvironment): string | undefined {
  const path = environment.env.PATH ?? environment.env.Path ?? "";
  for (const dir of path.split(delimiter).filter(Boolean)) {
    for (const extension of executableExtensions(program, environment)) {
      const candidate = join(dir, `${program}${extension}`);
      if (environment.exists(candidate)) return candidate;
    }
  }
  return undefined;
}

function executableExtensions(program: string, environment: EditorEnvironment): string[] {
  if (environment.platform !== "win32" || extname(program) !== "") return [""];
  const declared = environment.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return declared
    .split(";")
    .filter(Boolean)
    .map((extension) => extension.toLowerCase());
}

function hasDirectory(program: string): boolean {
  return /[\\/]/.test(program);
}

function direct(
  program: string,
  args: readonly string[],
  environment: EditorEnvironment,
  newConsole: boolean,
): Launch {
  const shimmed =
    environment.platform === "win32" && windowsShims.has(extname(program).toLowerCase());
  if (!shimmed) return { file: program, args, verbatim: false, newConsole };
  const line = [program, ...args].map(quotedForCmd).join(" ");
  return {
    file: environment.env.COMSPEC ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
    newConsole,
  };
}

function quotedForCmd(arg: string): string {
  return `"${arg.replace(/"/g, '""')}"`;
}

function terminalEmulator(environment: EditorEnvironment): string[] {
  const chosen = environment.env.TERMINAL;
  if (chosen !== undefined && chosen.trim() !== "") return shellWords(chosen);
  const path = environment.env.PATH ?? "";
  const found = path
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, "x-terminal-emulator"))
    .find((candidate) => environment.exists(candidate));
  return found === undefined ? [] : [found];
}

function revealed(request: EditorRequest, seams: EditorSeams, because: string): EditorOpened {
  seams.reveal(request.path);
  return { via: "revealed", because, shownIn: fileManagerOf(seams.platform) };
}

function fileManagerOf(platform: NodeJS.Platform): string {
  if (platform === "win32") return "Explorer";
  if (platform === "darwin") return "Finder";
  return "the file manager";
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
