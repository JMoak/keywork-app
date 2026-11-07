export const helperProtocolVersion = 1;

export const helperButtons = ["left", "middle", "right"] as const;

export type HelperButton = (typeof helperButtons)[number];

export const helperRefusals = [
  "no-grant",
  "wrong-grant",
  "expired",
  "version",
  "malformed",
] as const;

export type HelperRefusal = (typeof helperRefusals)[number];

export interface HelperDisplay {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
}

export interface HelperGrant {
  readonly grantId: string;
  readonly expiresAt: number;
  readonly display: HelperDisplay;
}

export type HelperInput =
  | {
      readonly kind: "ptr";
      readonly grantId: string;
      readonly seq: number;
      readonly action: "move" | "down" | "up" | "wheel";
      readonly x: number;
      readonly y: number;
      readonly button?: HelperButton | undefined;
      readonly dx?: number | undefined;
      readonly dy?: number | undefined;
    }
  | {
      readonly kind: "key";
      readonly grantId: string;
      readonly seq: number;
      readonly code: string;
      readonly down: boolean;
    };

export type HelperRequest = { readonly v: typeof helperProtocolVersion } & (
  | { readonly kind: "hello"; readonly versions: readonly number[] }
  | ({ readonly kind: "grant" } & HelperGrant)
  | HelperInput
  | { readonly kind: "release-all" }
  | { readonly kind: "bye" }
);

export interface HelperReleased {
  readonly keys: readonly string[];
  readonly buttons: readonly HelperButton[];
}

export type HelperReply = { readonly v: typeof helperProtocolVersion } & (
  | { readonly kind: "hello"; readonly version: number; readonly impl: string }
  | { readonly kind: "granted"; readonly grantId: string; readonly expiresAt: number }
  | { readonly kind: "applied"; readonly seq: number }
  | { readonly kind: "refused"; readonly seq?: number | undefined; readonly reason: HelperRefusal }
  | ({ readonly kind: "released" } & HelperReleased)
  | { readonly kind: "local-input" }
  | { readonly kind: "bye" }
);

export function helperLine(message: HelperRequest | HelperReply): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseHelperRequest(line: string): HelperRequest | undefined {
  const message = versioned(line);
  if (message === undefined) return undefined;
  switch (message.kind) {
    case "hello":
      return isNumberList(message.versions) ? (message as HelperRequest) : undefined;
    case "grant":
      return isText(message.grantId) &&
        isFiniteNumber(message.expiresAt) &&
        isDisplay(message.display)
        ? (message as HelperRequest)
        : undefined;
    case "ptr":
      return isPointer(message) ? (message as HelperRequest) : undefined;
    case "key":
      return isText(message.grantId) &&
        isSeq(message.seq) &&
        isText(message.code) &&
        typeof message.down === "boolean"
        ? (message as HelperRequest)
        : undefined;
    case "release-all":
    case "bye":
      return message as HelperRequest;
    default:
      return undefined;
  }
}

export function parseHelperReply(line: string): HelperReply | undefined {
  const message = versioned(line);
  const kinds = ["hello", "granted", "applied", "refused", "released", "local-input", "bye"];
  return message !== undefined && kinds.includes(String(message.kind))
    ? (message as HelperReply)
    : undefined;
}

export function lineReader(onLine: (line: string) => void): (chunk: string) => void {
  let pending = "";
  return (chunk) => {
    pending += chunk;
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line !== "") onLine(line);
      newline = pending.indexOf("\n");
    }
  };
}

type Fields = Record<string, unknown>;

function versioned(line: string): Fields | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null) return undefined;
    const fields = value as Fields;
    return fields.v === helperProtocolVersion && typeof fields.kind === "string"
      ? fields
      : undefined;
  } catch {
    return undefined;
  }
}

function isPointer(message: Fields): boolean {
  const actions = ["move", "down", "up", "wheel"];
  return (
    isText(message.grantId) &&
    isSeq(message.seq) &&
    actions.includes(String(message.action)) &&
    isUnit(message.x) &&
    isUnit(message.y) &&
    (message.button === undefined || (helperButtons as readonly unknown[]).includes(message.button))
  );
}

function isDisplay(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const display = value as Fields;
  return ["x", "y", "width", "height", "scaleFactor"].every((field) =>
    isFiniteNumber(display[field]),
  );
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isSeq(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isUnit(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isFiniteNumber);
}
