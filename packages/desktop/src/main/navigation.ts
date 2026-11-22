import { isSurfaceFrame, surfacePageUrl } from "./surfaces/channels.ts";

export type NavigationVerdict =
  | { kind: "follow" }
  | { kind: "refuse" }
  | { kind: "hand-off"; url: string };

export type WindowOpenVerdict = NavigationVerdict | { kind: "surface" };

export function navigationVerdict(
  target: string,
  from: string,
  isAppPage: (url: string) => boolean,
): NavigationVerdict {
  if (!isAppPage(from)) return refuse;
  if (isAppPage(target)) return follow;
  return handedToTheBrowser(target);
}

export function windowOpenVerdict(
  target: string,
  opener: string,
  isAppPage: (url: string) => boolean,
  frameName = "",
): WindowOpenVerdict {
  if (!isAppPage(opener)) return refuse;
  if (target === surfacePageUrl && isSurfaceFrame(frameName)) return surface;
  return handedToTheBrowser(target);
}

export function redirectVerdict(
  target: string,
  isAppPage: (url: string) => boolean,
): NavigationVerdict {
  return isAppPage(target) ? follow : refuse;
}

export function leavingSurfaceVerdict(target: string): NavigationVerdict {
  return handedToTheBrowser(target);
}

const follow: NavigationVerdict = { kind: "follow" };

const refuse: NavigationVerdict = { kind: "refuse" };

const surface: WindowOpenVerdict = { kind: "surface" };

function handedToTheBrowser(target: string): NavigationVerdict {
  return isWebLink(target) ? { kind: "hand-off", url: target } : refuse;
}

function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
