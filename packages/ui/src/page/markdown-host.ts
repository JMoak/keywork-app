import { createContext, useContext } from "solid-js";
import { type HostPort, hostFromWindow } from "../host/port.ts";

export type MarkdownHost = Pick<HostPort, "openExternal" | "writeClipboard">;

const MarkdownHostContext = createContext<MarkdownHost>();

export const MarkdownHostProvider = MarkdownHostContext.Provider;

export function useMarkdownHost(): MarkdownHost | undefined {
  return useContext(MarkdownHostContext) ?? hostFromWindow();
}
