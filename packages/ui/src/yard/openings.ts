import type { ConsoleClient } from "@keywork-app/client";
import { isServedRefusal, type Setting, type SettingSubject } from "@keywork-app/protocol";
import type { PaneId } from "../layout/index.ts";
import { type PaneSpec, parsePaneSpec } from "../panes/index.ts";
import type { PaneSpecBase, ShellSeams } from "../panes/registry.ts";
import { unopenedLine } from "./copy.ts";

export type OpeningClient = Pick<ConsoleClient, "openSetting">;

export interface PanelShellSeams {
  readonly paneId: PaneId;
  open(what: SettingSubject): void;
  rebind(spec: PaneSpec): void;
}

export function panelShell(shell: ShellSeams, seams: PanelShellSeams): ShellSeams {
  return overriding(shell, {
    openPane: (spec: PaneSpecBase) => {
      const what = subjectOfPane(spec);
      if (what === undefined) shell.openPane(spec);
      else seams.open(what);
    },
    rebind: (paneId: PaneId, spec: PaneSpecBase) => {
      const parsed = paneId === seams.paneId ? parsePaneSpec(spec) : undefined;
      if (parsed === undefined) shell.rebind(paneId, spec);
      else seams.rebind(parsed);
    },
    sessions: {
      ...shell.sessions,
      openSession: (sessionId: string) => seams.open({ kind: "thread", ref: sessionId }),
    },
  });
}

export function subjectOfPane(spec: PaneSpec | PaneSpecBase): SettingSubject | undefined {
  const parsed = parsePaneSpec(spec);
  if (parsed?.kind === "file" && parsed.spill === undefined)
    return { kind: "file", ref: parsed.path };
  if (parsed?.kind === "conversation" && parsed.sessionId !== undefined) {
    return { kind: "thread", ref: parsed.sessionId };
  }
  return undefined;
}

export function linkOpened(event: MouseEvent): SettingSubject | undefined {
  if (event.defaultPrevented || event.button !== 0) return undefined;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  const href = anchor?.getAttribute("href") ?? "";
  return /^https?:\/\//i.test(href) ? { kind: "url", ref: href } : undefined;
}

export type Opening = { readonly opened: Setting } | { readonly unopened: string };

export async function openFrom(
  client: OpeningClient,
  what: SettingSubject,
  from: string,
): Promise<Opening> {
  try {
    const answer = await client.openSetting({ what, from, rung: "unfold" });
    return isServedRefusal(answer) ? { unopened: unopenedLine(answer.detail) } : { opened: answer };
  } catch (cause) {
    return { unopened: unopenedLine(cause instanceof Error ? cause.message : String(cause)) };
  }
}

function overriding<Held extends object>(base: Held, own: Partial<Held>): Held {
  return Object.create(base, Object.getOwnPropertyDescriptors(own));
}
