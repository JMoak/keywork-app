import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import { loadCompanionPage, transparentRootCss } from "./electron.ts";

vi.mock("electron", () => ({
  app: {},
  BrowserWindow: class {},
  desktopCapturer: {},
  globalShortcut: {},
  ipcMain: {},
  Menu: {},
  nativeTheme: {},
  powerMonitor: {},
  screen: {},
}));

describe("the companion page", () => {
  it("clears the console's root background before the window can be shown or tested", async () => {
    const page = companionPage();
    await loadCompanionPage(page.native);
    page.steps.push("ready to show and test");
    expect(page.inserted).toEqual([{ css: transparentRootCss, origin: "user" }]);
    expect(page.steps).toEqual([
      "dom-ready",
      "first paint",
      "transparent root applied",
      "ready to show and test",
    ]);
  });

  it("overrides the root, html and body backgrounds whatever the console's stylesheet says", () => {
    for (const selector of [":root", "html", "body"])
      expect(transparentRootCss).toContain(selector);
    expect(transparentRootCss).toContain("background: transparent !important");
  });
});

function companionPage() {
  const steps: string[] = [];
  const inserted: Array<{ css: string; origin: string | undefined }> = [];
  const domReady: Array<() => void> = [];
  let firstPaint: (() => void) | undefined;
  const webContents = {
    on: (event: string, listener: () => void) => {
      if (event === "dom-ready") domReady.push(listener);
    },
    insertCSS: (css: string, options?: { cssOrigin?: string }) => {
      inserted.push({ css, origin: options?.cssOrigin });
      return new Promise<string>((resolve) =>
        setTimeout(() => {
          steps.push("transparent root applied");
          resolve("key");
        }, 0),
      );
    },
  };
  const native = {
    webContents,
    once: (event: string, listener: () => void) => {
      if (event === "ready-to-show") firstPaint = listener;
    },
    loadFile: async () => {
      steps.push("dom-ready");
      for (const listener of domReady) listener();
      steps.push("first paint");
      firstPaint?.();
    },
  };
  return { native: native as unknown as BrowserWindow, steps, inserted };
}
