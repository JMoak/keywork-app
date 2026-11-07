import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { BrowserWindowConstructorOptions } from "electron";
import type { Rect, Size } from "./placement.ts";

export const creatureCell = { width: 48, height: 52 } as const;
export const artScale = 2;
export const chromeMargin = 24;
export const controlsHeight = 28;
export const bubbleWidth = 240;
export const bubbleHeight = 56;

export interface ChromeNeeds {
  bubble: boolean;
}

export function creatureBox(sizePercent: number): Size {
  const factor = (sizePercent / 100) * artScale;
  return {
    width: Math.round(creatureCell.width * factor),
    height: Math.round(creatureCell.height * factor),
  };
}

export function windowSizeFor(sizePercent: number, needs: ChromeNeeds): Size {
  const creature = creatureBox(sizePercent);
  const factor = sizePercent / 100;
  const bubble = needs.bubble ? Math.round(bubbleHeight * factor) : 0;
  return {
    width:
      Math.max(creature.width, needs.bubble ? Math.round(bubbleWidth * factor) : 0) +
      chromeMargin * 2,
    height: creature.height + chromeMargin * 2 + Math.round(controlsHeight * factor) + bubble,
  };
}

export interface CompanionWindowSpec {
  profile?: ProductProfile;
  platform: NodeJS.Platform;
  bounds: Rect;
  preload: string;
}

export function companionWindowOptions(spec: CompanionWindowSpec): BrowserWindowConstructorOptions {
  const { platform, bounds } = spec;
  return {
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    acceptFirstMouse: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: `${(spec.profile ?? keyworkProfile).name} companion`,
    ...(platform === "darwin" ? { type: "panel", hiddenInMissionControl: true } : {}),
    ...(platform === "win32" ? { focusable: false } : {}),
    webPreferences: {
      preload: spec.preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  };
}

export interface CompanionWebContentsLike {
  id: number;
  send(channel: string, ...payload: unknown[]): void;
  getOSProcessId(): number;
  isDestroyed(): boolean;
}

export interface CompanionWindowLike {
  id: number;
  webContents: CompanionWebContentsLike;
  setAlwaysOnTop(flag: boolean, level?: "floating"): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
  setVisibleOnAllWorkspaces(
    visible: boolean,
    options?: { visibleOnFullScreen?: boolean; skipTransformProcessType?: boolean },
  ): void;
  showInactive(): void;
  hide(): void;
  isVisible(): boolean;
  getBounds(): Rect;
  setBounds(bounds: Rect): void;
  setPosition(x: number, y: number): void;
  isDestroyed(): boolean;
  destroy(): void;
  once(event: "ready-to-show" | "closed", listener: () => void): void;
  on(event: "closed", listener: () => void): void;
}

export function forwardsMouse(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "darwin";
}

export function keyboardReachable(platform: NodeJS.Platform): boolean {
  return platform !== "win32";
}

export function prepareFloating(window: CompanionWindowLike, platform: NodeJS.Platform): void {
  window.setAlwaysOnTop(true, "floating");
  window.setIgnoreMouseEvents(true, ignoreOptions(platform));
  if (platform === "darwin") {
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: false,
      skipTransformProcessType: true,
    });
  }
}

export function ignoreOptions(platform: NodeJS.Platform): { forward?: boolean } {
  return forwardsMouse(platform) ? { forward: true } : {};
}

export function placeWindow(window: CompanionWindowLike, bounds: Rect): void {
  window.setPosition(bounds.x, bounds.y);
  window.setBounds(bounds);
}
