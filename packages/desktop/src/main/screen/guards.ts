import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import {
  type AskConsent,
  type DisplayTarget,
  disabledChromiumFeatures,
  forcedFieldTrials,
  logLine,
  mergeFeatureList,
  mergeFieldTrials,
  parseLog,
  type SessionLogRow,
} from "@keywork-app/screen";
import { senderOrigin, senderScheme } from "./channels.ts";
import type { KillSwitch, SessionLogStore } from "./sharer.ts";

export const defaultKillChord = keyworkProfile.screenKillChord;

export interface CaptureRequest {
  readonly videoRequested: boolean;
  readonly audioRequested: boolean;
}

export interface GrantedVideo {
  readonly video: { readonly id: string; readonly name: string };
}

export function captureStreams(
  target: DisplayTarget | undefined,
  request: CaptureRequest,
): GrantedVideo | null {
  if (target === undefined || !request.videoRequested) return null;
  return { video: { id: target.sourceId, name: target.label } };
}

export function permitsCapture(permission: string, liveSender: boolean, origin: string): boolean {
  return permission === "display-capture" && liveSender && isSenderOrigin(origin);
}

// Chromium gathers candidates on every interface, the tailnet one included, only for frames
// whose camera or microphone permission check passes; otherwise it offers the default route.
export function answersCheck(permission: string, liveSender: boolean, origin: string): boolean {
  return (
    (permission === "display-capture" || permission === "media") &&
    liveSender &&
    isSenderOrigin(origin)
  );
}

export function isSenderOrigin(origin: string): boolean {
  return origin === senderOrigin || origin.startsWith(`${senderOrigin}/`);
}

export const senderPage =
  '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>screen sender</title></head><body></body></html>';

export const screenSchemePrivileges = {
  scheme: senderScheme,
  privileges: { standard: true, secure: true },
} as const;

export interface BeforeReadySeams {
  readonly commandLine: CommandLineSeam;
  readonly protocol: {
    registerSchemesAsPrivileged(schemes: Array<typeof screenSchemePrivileges>): void;
  };
}

export function prepareScreenBeforeReady(seams: BeforeReadySeams): void {
  applyScreenSwitches(seams.commandLine);
  seams.protocol.registerSchemesAsPrivileged([screenSchemePrivileges]);
}

export interface CommandLineSeam {
  getSwitchValue(name: string): string;
  appendSwitch(name: string, value?: string): void;
}

export function applyScreenSwitches(commandLine: CommandLineSeam): string {
  const merged = mergeFeatureList(
    commandLine.getSwitchValue("disable-features"),
    disabledChromiumFeatures,
  );
  commandLine.appendSwitch("disable-features", merged);
  commandLine.appendSwitch(
    "force-fieldtrials",
    mergeFieldTrials(commandLine.getSwitchValue("force-fieldtrials"), forcedFieldTrials),
  );
  return merged;
}

export interface ShortcutSeam {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export function killSwitch(shortcuts: ShortcutSeam, chord: string = defaultKillChord): KillSwitch {
  let registered = false;
  return {
    arm: (kill) => {
      if (!registered) registered = shortcuts.register(chord, kill);
      return { chord, registered };
    },
    disarm: () => {
      if (registered) shortcuts.unregister(chord);
      registered = false;
    },
  };
}

export interface MessageBoxSeam {
  showMessageBox(options: {
    type: "question";
    title: string;
    message: string;
    detail: string;
    buttons: string[];
    defaultId: number;
    cancelId: number;
    noLink: boolean;
    signal: AbortSignal;
  }): Promise<{ response: number }>;
}

export function nativeConsent(dialog: MessageBoxSeam): AskConsent {
  return async (card, signal) => {
    const result = await dialog.showMessageBox({
      type: "question",
      title: card.title,
      message: card.message,
      detail: card.detail,
      buttons: [...card.buttons],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      signal,
    });
    return result.response;
  };
}

export interface AppendSeam {
  appendFile(path: string, text: string): Promise<void>;
  readFile(path: string): Promise<string | undefined>;
}

export function fileSessionLog(path: string, files: AppendSeam): SessionLogStore {
  let queue = Promise.resolve();
  return {
    append: (row: SessionLogRow) => {
      const line = logLine(row);
      queue = queue.then(() => files.appendFile(path, line));
      return queue;
    },
    read: async () => parseLog((await files.readFile(path)) ?? ""),
  };
}

export type ScreenAccess = "granted" | "needs-onboarding";

export function screenAccess(
  platform: NodeJS.Platform,
  mediaAccessStatus: () => string,
): ScreenAccess {
  if (platform !== "darwin") return "granted";
  return mediaAccessStatus() === "granted" ? "granted" : "needs-onboarding";
}

export function screenOnboardingFor(profile: ProductProfile) {
  return {
    settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    steps: [
      "Open System Settings › Privacy & Security › Screen & System Audio Recording.",
      `Turn on ${profile.name}.`,
      `Quit and reopen ${profile.name}: macOS applies the permission only after a restart.`,
    ],
  } as const;
}

export const macScreenOnboarding = screenOnboardingFor(keyworkProfile);
