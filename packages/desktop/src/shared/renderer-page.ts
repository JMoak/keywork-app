export const rendererPageSwitch = "--keywork-renderer-page=";

export function rendererPageArgument(page: string): string {
  return `${rendererPageSwitch}${page}`;
}

export function rendererPageOf(argv: readonly string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(rendererPageSwitch))?.slice(rendererPageSwitch.length);
}

export function servesRendererPage(argv: readonly string[], href: string): boolean {
  const page = rendererPageOf(argv);
  return page !== undefined && isRendererPage(href, page);
}

export function isRendererPage(candidate: string, page: string): boolean {
  const here = parsedUrl(candidate);
  const home = parsedUrl(page);
  if (here === undefined || home === undefined) return false;
  if (home.protocol !== "file:") return here.origin === home.origin;
  return (
    here.protocol === "file:" &&
    here.host === home.host &&
    sameFilePath(here.pathname, home.pathname)
  );
}

function parsedUrl(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

function sameFilePath(left: string, right: string): boolean {
  const [a, b] = [decodedPath(left), decodedPath(right)];
  return onDriveLetter(a) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function decodedPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function onDriveLetter(path: string): boolean {
  return /^\/[A-Za-z]:\//.test(path);
}
