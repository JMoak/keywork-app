export type RunnerSession = "desktop" | "x11" | "wayland";

export interface CompanionPlatform {
  project: string;
  platform: NodeJS.Platform;
  session: RunnerSession;
  floats: boolean;
  osInput: "user32" | undefined;
  runner: string;
}

export interface Runner {
  platform: NodeJS.Platform;
  session: RunnerSession;
}

export const companionPlatforms: readonly CompanionPlatform[] = [
  {
    project: "companion-win32",
    platform: "win32",
    session: "desktop",
    floats: true,
    osInput: "user32",
    runner: "windows-latest with an interactive desktop; the OS click probes drive user32",
  },
  {
    project: "companion-darwin",
    platform: "darwin",
    session: "desktop",
    floats: true,
    osInput: undefined,
    runner:
      "macos-latest in its logged-in Aqua session, with Screen Recording pre-granted to the Electron binary in TCC for the self-test",
  },
  {
    project: "companion-linux-x11",
    platform: "linux",
    session: "x11",
    floats: true,
    osInput: undefined,
    runner:
      "ubuntu-latest under xvfb-run -a with a compositing window manager, so transparent windows have an alpha channel",
  },
  {
    project: "companion-linux-wayland",
    platform: "linux",
    session: "wayland",
    floats: false,
    osInput: undefined,
    runner:
      "ubuntu-latest under a headless Wayland compositor (weston --backend=headless) with XDG_SESSION_TYPE=wayland",
  },
];

export function runnerOf(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Runner {
  if (platform !== "linux") return { platform, session: "desktop" };
  const type = env.XDG_SESSION_TYPE?.trim().toLowerCase();
  const wayland = type === "wayland" || (type !== "x11" && (env.WAYLAND_DISPLAY ?? "") !== "");
  return { platform, session: wayland ? "wayland" : "x11" };
}

export function companionPlatform(project: string): CompanionPlatform | undefined {
  return companionPlatforms.find((candidate) => candidate.project === project);
}

export function projectSkipReason(project: string, runner: Runner): string | undefined {
  const target = companionPlatform(project);
  if (target === undefined) return undefined;
  if (target.platform === runner.platform && target.session === runner.session) return undefined;
  return `${project} runs on ${target.runner}; this machine is ${describeRunner(runner)}`;
}

export function osInputSkipReason(target: CompanionPlatform | undefined): string | undefined {
  if (target === undefined || target.osInput !== undefined) return undefined;
  return `${target.project} has no OS-level input driver yet: the click-through probes run on companion-win32 only`;
}

function describeRunner(runner: Runner): string {
  return runner.platform === "linux" ? `linux (${runner.session})` : runner.platform;
}
