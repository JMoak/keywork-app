import type { IpcRenderer } from "electron";
import { screenChannels } from "../main/screen/channels.ts";

export interface WornThemePage {
  readonly documentElement: HTMLElement | null;
  readonly readyState: DocumentReadyState;
  addEventListener(type: "DOMContentLoaded", listener: () => void): void;
}

export type AttributeWatch = (root: HTMLElement, changed: () => void) => void;

export function pushWornTheme(
  ipc: Pick<IpcRenderer, "send">,
  page: WornThemePage | undefined = globalThis.document,
  watch: AttributeWatch = watchThemeAttribute,
): void {
  if (page === undefined) return;
  const start = (): void => {
    const root = page.documentElement;
    if (root === null) return;
    followWornTheme(
      root,
      (changed) => watch(root, changed),
      (name) => ipc.send(screenChannels.wornTheme, name),
    );
  };
  if (page.readyState === "loading") page.addEventListener("DOMContentLoaded", start);
  else start();
}

export function followWornTheme(
  root: Pick<HTMLElement, "dataset">,
  watch: (changed: () => void) => void,
  push: (name: string) => void,
): void {
  let pushed: string | undefined;
  const pushIfChanged = (): void => {
    const name = root.dataset.theme;
    if (name === undefined || name === pushed) return;
    pushed = name;
    push(name);
  };
  pushIfChanged();
  watch(pushIfChanged);
}

function watchThemeAttribute(root: HTMLElement, changed: () => void): void {
  new MutationObserver(changed).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
