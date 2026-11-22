import { app, shell, type WebContents, type WindowOpenHandlerResponse } from "electron";
import { isAppPage } from "./app-page.ts";
import {
  leavingSurfaceVerdict,
  type NavigationVerdict,
  navigationVerdict,
  redirectVerdict,
  type WindowOpenVerdict,
  windowOpenVerdict,
} from "./navigation.ts";
import { externalVerdict } from "./open-external.ts";
import type { SurfaceDoor } from "./surfaces/electron.ts";

export function guardEveryNavigation(surfaces: SurfaceDoor): void {
  app.on("web-contents-created", (_event, contents) => guardNavigation(contents, surfaces));
}

function guardNavigation(contents: WebContents, surfaces: SurfaceDoor): void {
  contents.on("will-navigate", (event) => {
    if (!obeyed(navigationFrom(contents, event.url, surfaces))) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!obeyed(redirectVerdict(event.url, isAppPage))) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url, frameName }) =>
    answered(windowOpenedFrom(contents, url, frameName, surfaces), contents, surfaces),
  );
  contents.on("did-create-window", (child, { frameName }) =>
    surfaces.adopt(contents, child, frameName),
  );
}

function navigationFrom(
  contents: WebContents,
  target: string,
  surfaces: SurfaceDoor,
): NavigationVerdict {
  if (surfaces.holds(contents)) return leavingSurfaceVerdict(target);
  return navigationVerdict(target, contents.getURL(), isAppPage);
}

function windowOpenedFrom(
  contents: WebContents,
  target: string,
  frameName: string,
  surfaces: SurfaceDoor,
): WindowOpenVerdict {
  if (surfaces.holds(contents)) return leavingSurfaceVerdict(target);
  return windowOpenVerdict(target, contents.getURL(), isAppPage, frameName);
}

function answered(
  verdict: WindowOpenVerdict,
  opener: WebContents,
  surfaces: SurfaceDoor,
): WindowOpenHandlerResponse {
  if (verdict.kind !== "surface") {
    obeyed(verdict);
    return { action: "deny" };
  }
  const options = surfaces.windowOptions(opener);
  if (options === undefined) return { action: "deny" };
  return { action: "allow", overrideBrowserWindowOptions: options };
}

function obeyed(verdict: NavigationVerdict): boolean {
  if (verdict.kind === "hand-off") openInBrowser(verdict.url);
  return verdict.kind === "follow";
}

function openInBrowser(url: string): void {
  const verdict = externalVerdict(url, []);
  if (verdict.ok) void shell.openExternal(verdict.url).catch(() => undefined);
}
