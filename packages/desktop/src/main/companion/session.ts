export type DisplaySession = "wayland" | "xwayland" | "x11" | "desktop";

export interface SessionSignals {
  platform: NodeJS.Platform;
  sessionType: string | undefined;
  waylandDisplay?: string | undefined;
  ozonePlatform?: string | undefined;
}

export const waylandFallbackReason =
  "Wayland cannot float a window above other apps; the creature lives in the pane with the tray";

export const waylandNotice = `companion: ${waylandFallbackReason} (start the console with --ozone-platform=x11 to float it through XWayland)`;

export function displaySessionOf(signals: SessionSignals): DisplaySession {
  if (signals.platform !== "linux") return "desktop";
  if (!waylandSession(signals)) return "x11";
  return signals.ozonePlatform === "x11" ? "xwayland" : "wayland";
}

export function floatsNatively(session: DisplaySession): boolean {
  return session !== "wayland";
}

function waylandSession(signals: SessionSignals): boolean {
  const type = signals.sessionType?.trim().toLowerCase();
  if (type === "wayland") return true;
  if (type === "x11") return false;
  return (signals.waylandDisplay ?? "") !== "";
}
