import { listenInEveryDocument } from "../surfaces/runtime/windows.ts";

export function listenForKeys(pressed: (event: KeyboardEvent) => void): () => void {
  return listenInEveryDocument("keydown", pressed, true);
}
