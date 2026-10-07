export const launchCheckDelayMs = 30_000;
export const checkIntervalMs = 6 * 60 * 60 * 1000;
export const updateFeed = { provider: "github", owner: "JMoak", repo: "keywork-app" } as const;

export interface UpdateReady {
  version: string;
}

export interface UpdateSource {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  onDownloaded(listener: (update: UpdateReady) => void): void;
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
  source.autoDownload = true;
  source.autoInstallOnAppQuit = false;
  source.onDownloaded((update) => seams.announce(update));
  source.onError((error) => seams.log(`update check failed: ${error.message}`));
  seams.onAccept(() => {
    source.autoInstallOnAppQuit = true;
  });

  let lastCheckedAt: number | undefined;
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
    void source.checkForUpdates().catch(() => undefined);
    arm();
  };
  arm();

  return {
    stop: () => cancel(),
    get lastCheckedAt() {
      return lastCheckedAt;
    },
  };
}
