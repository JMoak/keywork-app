import { app, shell, type WebContents } from "electron";
import { isAppPage } from "./app-page.ts";
import {
  type NavigationVerdict,
  navigationVerdict,
  redirectVerdict,
  windowOpenVerdict,
} from "./navigation.ts";
import { externalVerdict } from "./open-external.ts";

export function guardEveryNavigation(): void {
  app.on("web-contents-created", (_event, contents) => guardNavigation(contents));
}

function guardNavigation(contents: WebContents): void {
  contents.on("will-navigate", (event) => {
    if (!obeyed(navigationVerdict(event.url, contents.getURL(), isAppPage))) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!obeyed(redirectVerdict(event.url, isAppPage))) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    obeyed(windowOpenVerdict(url, contents.getURL(), isAppPage));
    return { action: "deny" };
  });
}

function obeyed(verdict: NavigationVerdict): boolean {
  if (verdict.kind === "hand-off") openInBrowser(verdict.url);
  return verdict.kind === "follow";
}

function openInBrowser(url: string): void {
  const verdict = externalVerdict(url, []);
  if (verdict.ok) void shell.openExternal(verdict.url).catch(() => undefined);
}
