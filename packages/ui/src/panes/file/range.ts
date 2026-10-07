import { type FileRange, type FileSlice, maxFileSliceBytes } from "@keywork-app/protocol";

export interface FileOpening {
  readonly from?: number | undefined;
  readonly to?: number | undefined;
  readonly atEnd?: boolean | undefined;
}

export function openingRange(opening: FileOpening): FileRange | "tail" {
  if (opening.atEnd) return "tail";
  if (opening.from === undefined && opening.to === undefined) return {};
  return {
    ...(opening.from !== undefined && { from: opening.from }),
    ...(opening.to !== undefined && { to: opening.to }),
  };
}

export function tailRange(bytes: number): FileRange {
  return { from: Math.max(0, bytes - maxFileSliceBytes), to: bytes };
}

export function rangeAfter(slice: Pick<FileSlice, "to" | "bytes">): FileRange | undefined {
  if (slice.to >= slice.bytes) return undefined;
  return { from: slice.to, to: Math.min(slice.bytes, slice.to + maxFileSliceBytes) };
}

export function rangeBefore(slice: Pick<FileSlice, "from">): FileRange | undefined {
  if (slice.from <= 0) return undefined;
  return { from: Math.max(0, slice.from - maxFileSliceBytes), to: slice.from };
}

export function isWholeFile(slice: Pick<FileSlice, "from" | "to" | "bytes">): boolean {
  return slice.from === 0 && slice.to >= slice.bytes;
}

export function sliceFacts(slice: Pick<FileSlice, "from" | "to" | "bytes" | "truncated">): string {
  if (isWholeFile(slice)) return `${sizeText(slice.bytes)}`;
  const span = `bytes ${slice.from}..${slice.to} of ${sizeText(slice.bytes)}`;
  return slice.truncated ? `${span} · cut to fit` : span;
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function lineLabel(slice: Pick<FileSlice, "from">, index: number): string {
  return slice.from === 0 ? String(index + 1) : `+${index + 1}`;
}

export function fileUrlOf(workspaceRoot: string, path: string, line?: number): string {
  const absolute = `${workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/${path}`;
  const withScheme = absolute.startsWith("/") ? `file://${absolute}` : `file:///${absolute}`;
  const encoded = encodeURI(withScheme);
  return line === undefined ? encoded : `${encoded}#L${line}`;
}
