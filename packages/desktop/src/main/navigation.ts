export type NavigationVerdict =
  | { kind: "follow" }
  | { kind: "refuse" }
  | { kind: "hand-off"; url: string };

export function navigationVerdict(
  target: string,
  from: string,
  isAppPage: (url: string) => boolean,
): NavigationVerdict {
  if (!isAppPage(from)) return refuse;
  if (isAppPage(target)) return follow;
  return isWebLink(target) ? { kind: "hand-off", url: target } : refuse;
}

export function windowOpenVerdict(
  target: string,
  opener: string,
  isAppPage: (url: string) => boolean,
): NavigationVerdict {
  return isAppPage(opener) && isWebLink(target) ? { kind: "hand-off", url: target } : refuse;
}

export function redirectVerdict(
  target: string,
  isAppPage: (url: string) => boolean,
): NavigationVerdict {
  return isAppPage(target) ? follow : refuse;
}

const follow: NavigationVerdict = { kind: "follow" };

const refuse: NavigationVerdict = { kind: "refuse" };

function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
