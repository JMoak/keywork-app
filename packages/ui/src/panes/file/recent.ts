import { createSignal } from "solid-js";

const [lastAgentFile, setLastAgentFile] = createSignal<string>();

export { lastAgentFile };

export function rememberAgentFile(path: string): void {
  setLastAgentFile(path);
}

export const defaultFilePath = "README.md";
