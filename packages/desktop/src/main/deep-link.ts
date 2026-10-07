export const protocolScheme = "keywork";

export type OpenRequest =
  | { ok: true; action: "open"; path: string }
  | { ok: false; reason: RefusalReason; input: string };

export type RefusalReason =
  | "malformed-url"
  | "unknown-action"
  | "missing-path"
  | "relative-path"
  | "unsafe-path";

export function requestFromUrl(input: string): OpenRequest {
  const url = parseUrl(input);
  if (url === undefined || url.protocol !== `${protocolScheme}:`) {
    return { ok: false, reason: "malformed-url", input };
  }
  if (actionOf(url) !== "open") return { ok: false, reason: "unknown-action", input };
  const path = url.searchParams.get("path");
  if (path === null || path === "") return { ok: false, reason: "missing-path", input };
  return requestForPath(path, input);
}

export function requestFromArgv(
  argv: readonly string[],
  launcherArguments = 1,
): OpenRequest | undefined {
  for (const argument of argv.slice(launcherArguments)) {
    if (argument.startsWith(`${protocolScheme}:`)) return requestFromUrl(argument);
    if (looksLikePath(argument)) return requestForPath(argument, argument);
  }
  return undefined;
}

export function openUrlFor(path: string): string {
  return `${protocolScheme}://open?path=${encodeURIComponent(path)}`;
}

function requestForPath(path: string, input: string): OpenRequest {
  if (!isAbsolute(path)) return { ok: false, reason: "relative-path", input };
  if (isUnsafe(path)) return { ok: false, reason: "unsafe-path", input };
  return { ok: true, action: "open", path };
}

function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

function actionOf(url: URL): string {
  if (url.hostname !== "") return url.hostname;
  return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

function looksLikePath(argument: string): boolean {
  return !argument.startsWith("-") && isAbsolute(argument);
}

function isAbsolute(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

function isUnsafe(path: string): boolean {
  const segments = path.split(/[\\/]+/);
  return segments.includes("..") || [...path].some(isControlCharacter);
}

function isControlCharacter(character: string): boolean {
  return character.charCodeAt(0) < 32;
}
