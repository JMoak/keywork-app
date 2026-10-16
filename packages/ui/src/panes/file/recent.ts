import { createSignal } from "solid-js";
import { rootPath } from "../browser/tree.ts";

const [lastAgentFile, setLastAgentFile] = createSignal<string>();

export { lastAgentFile };

export function rememberAgentFile(path: string): void {
  setLastAgentFile(path);
}

export function pathToOpen(): string {
  return lastAgentFile() ?? rootPath;
}
