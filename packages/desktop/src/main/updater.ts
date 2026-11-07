import { keyworkProfile } from "@keywork-app/product";

export const launchCheckDelayMs = 30_000;
export const checkIntervalMs = 6 * 60 * 60 * 1000;
export const updateFeed = keyworkProfile.updateFeed;

export interface UpdateReady {
  version: string;
  reviewRequired: true;
}

export interface UpdateCheck {
  isUpdateAvailable: boolean;
  updateInfo: { version: string };
}

export interface UpdateSource {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<UpdateCheck | null>;
  onError(listener: (error: Error) => void): void;
}

export interface UpdaterSeams {
  source: UpdateSource;
  announce(update: UpdateReady): void;
  onAccept(listener: () => void): void;
  schedule(run: () => void, delayMs: number): () => void;
  now(): number;
  log(line: string): void;
}

export interface Updater {
  stop(): void;
  readonly lastCheckedAt: number | undefined;
}

export function shouldCheck(now: number, lastCheckedAt: number | undefined): boolean {
  return lastCheckedAt === undefined || now - lastCheckedAt >= checkIntervalMs;
}

export function scheduleOf(now: number, lastCheckedAt: number | undefined): { dueInMs: number } {
  if (lastCheckedAt === undefined) return { dueInMs: launchCheckDelayMs };
  return { dueInMs: Math.max(0, lastCheckedAt + checkIntervalMs - now) };
}

export function runUpdater(seams: UpdaterSeams): Updater {
  const { source } = seams;
  source.autoDownload = false;
  source.autoInstallOnAppQuit = false;
  source.onError((error) => seams.log(`update check failed: ${error.message}`));
  seams.onAccept(() => {
    throw new Error("Review the release's shared engine compatibility before installing.");
  });

  let lastCheckedAt: number | undefined;
  let stopped = false;
  let cancel: () => void = () => {};
  const arm = (): void => {
    cancel = seams.schedule(check, scheduleOf(seams.now(), lastCheckedAt).dueInMs);
  };
  const check = (): void => {
    if (!shouldCheck(seams.now(), lastCheckedAt)) {
      arm();
      return;
    }
    lastCheckedAt = seams.now();
    void source
      .checkForUpdates()
      .then((result) => {
        if (!stopped && result?.isUpdateAvailable === true && result.updateInfo.version !== "") {
          seams.announce({ version: result.updateInfo.version, reviewRequired: true });
        }
      })
      .catch(() => undefined);
    arm();
  };
  arm();

  return {
    stop: () => {
      stopped = true;
      cancel();
    },
    get lastCheckedAt() {
      return lastCheckedAt;
    },
  };
}
