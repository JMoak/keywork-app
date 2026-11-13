import { basename, join } from "node:path";

export type SaveOutcome =
  | { saved: true; path: string }
  | { saved: false; refused: "cancelled" }
  | { saved: false; refused: "invalid" | "failed"; detail: string };

export interface SaveRequest {
  suggestedName: string;
  text: string;
}

export interface SaveSeams {
  folder(): string | undefined;
  choosePath(defaultPath: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
}

export async function saveAs(request: unknown, seams: SaveSeams): Promise<SaveOutcome> {
  if (!isSaveRequest(request)) {
    return { saved: false, refused: "invalid", detail: "a save needs a file name and its text" };
  }
  const offered = defaultPathFor(request.suggestedName, folderIfAny(seams));
  let chosen: string | undefined;
  try {
    chosen = await seams.choosePath(offered);
  } catch (cause) {
    return {
      saved: false,
      refused: "failed",
      detail: `the save dialog failed: ${messageOf(cause)}`,
    };
  }
  if (chosen === undefined) return { saved: false, refused: "cancelled" };
  try {
    await seams.writeText(chosen, request.text);
    return { saved: true, path: chosen };
  } catch (cause) {
    return {
      saved: false,
      refused: "failed",
      detail: `could not write ${chosen}: ${messageOf(cause)}`,
    };
  }
}

export function defaultPathFor(suggestedName: string, folder: string | undefined): string {
  const name = basename(suggestedName.replaceAll("\\", "/")) || untitledPage;
  return folder === undefined ? name : join(folder, name);
}

const untitledPage = "session.html";

function folderIfAny(seams: SaveSeams): string | undefined {
  try {
    return seams.folder();
  } catch {
    return undefined;
  }
}

function isSaveRequest(request: unknown): request is SaveRequest {
  if (typeof request !== "object" || request === null) return false;
  const { suggestedName, text } = request as Record<string, unknown>;
  return typeof suggestedName === "string" && typeof text === "string";
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
