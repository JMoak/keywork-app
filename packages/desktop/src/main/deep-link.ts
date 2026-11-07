import { keyworkProfile, type ProductProfile } from "@keywork-app/product";

export const protocolScheme = keyworkProfile.protocolScheme;

export type OpenRequest =
  | { ok: true; action: "open"; path: string }
  | { ok: false; reason: RefusalReason; input: string };

export type RefusalReason =
  | "malformed-url"
  | "unknown-action"
  | "missing-path"
  | "relative-path"
  | "unsafe-path";

export type Launch = {
  defaultApp: boolean;
  appPath: string | undefined;
  switches: readonly string[];
  operands: readonly string[];
};

export type ProtocolHandler =
  | { kind: "this-executable" }
  | { kind: "dev-app"; appPath: string }
  | { kind: "untouched" };

export function requestFromUrl(
  input: string,
  profile: ProductProfile = keyworkProfile,
): OpenRequest {
  const url = parseUrl(input);
  if (url === undefined || url.protocol !== `${profile.protocolScheme}:`) {
    return { ok: false, reason: "malformed-url", input };
  }
  if (actionOf(url) !== "open") return { ok: false, reason: "unknown-action", input };
  const path = url.searchParams.get("path");
  if (path === null || path === "") return { ok: false, reason: "missing-path", input };
  return requestForPath(path, input);
}

export function requestFromArgv(
  argv: readonly string[],
  defaultApp = false,
  profile: ProductProfile = keyworkProfile,
): OpenRequest | undefined {
  return requestFromLaunch(launchFrom(argv, defaultApp), profile);
}

export function requestFromLaunch(
  launch: Launch,
  profile: ProductProfile = keyworkProfile,
): OpenRequest | undefined {
  for (const operand of launch.operands) {
    if (operand.startsWith(`${profile.protocolScheme}:`)) return requestFromUrl(operand, profile);
    if (isAbsolute(operand)) return requestForPath(operand, operand);
  }
  return undefined;
}

export function launchFrom(argv: readonly string[], defaultApp: boolean): Launch {
  const { switches, positionals } = splitSwitches(argv.slice(1));
  if (!defaultApp) return { defaultApp, appPath: undefined, switches, operands: positionals };
  const [appPath, ...operands] = positionals;
  return { defaultApp, appPath, switches, operands };
}

export function protocolHandlerFor(launch: Launch): ProtocolHandler {
  if (launch.switches.length > 0) return { kind: "untouched" };
  if (!launch.defaultApp) return { kind: "this-executable" };
  if (launch.appPath === undefined) return { kind: "untouched" };
  return { kind: "dev-app", appPath: launch.appPath };
}

export function openUrlFor(path: string, profile: ProductProfile = keyworkProfile): string {
  return `${profile.protocolScheme}://open?path=${encodeURIComponent(path)}`;
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

function splitSwitches(argv: readonly string[]): { switches: string[]; positionals: string[] } {
  const terminator = argv.indexOf("--");
  const beforeTerminator = terminator === -1 ? argv : argv.slice(0, terminator);
  const afterTerminator = terminator === -1 ? [] : argv.slice(terminator + 1);
  return {
    switches: beforeTerminator.filter(isSwitch),
    positionals: [
      ...beforeTerminator.filter((argument) => !isSwitch(argument)),
      ...afterTerminator,
    ],
  };
}

function isSwitch(argument: string): boolean {
  return argument.startsWith("-");
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
