import { vi } from "vitest";
import { rendererPageArgument } from "../shared/renderer-page.ts";

export const appPage = "file:///C:/keywork/out/renderer/index.html";

export async function loadedOn<Loaded>(href: string, load: () => Promise<Loaded>): Promise<Loaded> {
  const switchAt = process.argv.push(rendererPageArgument(appPage)) - 1;
  vi.stubGlobal("location", { href });
  try {
    return await load();
  } finally {
    process.argv.splice(switchAt, 1);
    vi.unstubAllGlobals();
  }
}
