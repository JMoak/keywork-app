import { createSignal } from "solid-js";
import type { z } from "zod";
import type { HostPort, KeybindingsReading, KeybindingsScope } from "../host/port.ts";
import { appBindings } from "./actions.ts";
import { type KeybindingsSection, keybindingsSection, keymapOptionsFrom } from "./config.ts";
import type { Keymap } from "./keymap.ts";

export interface LiveKeys {
  describe(action: string): string | undefined;
  describeAll(action: string): string[];
  actions(): readonly string[];
  leader(): string;
  foreignActions(): readonly string[];
}

export interface LiveKeymap {
  readonly keys: LiveKeys;
  apply(reading: KeybindingsReading, reloaded: boolean): string | undefined;
}

export const reloadedNotice = "keybindings reloaded";

export function createLiveKeymap(keymap: Keymap): LiveKeymap {
  const [revision, setRevision] = createSignal(0);
  const [foreignActions, setForeignActions] = createSignal<readonly string[]>([]);
  const tracked = <Value>(read: () => Value): Value => {
    revision();
    return read();
  };
  const keys: LiveKeys = {
    describe: (action) => tracked(() => keymap.describe(action)),
    describeAll: (action) => tracked(() => keymap.describeAll(action)),
    actions: () => tracked(() => keymap.actions()),
    leader: () => tracked(() => keymap.leader),
    foreignActions,
  };
  const apply = (reading: KeybindingsReading, reloaded: boolean): string | undefined => {
    const resolved = resolveReading(reading);
    if ("problem" in resolved) return keptNotice(resolved.problem);
    try {
      keymap.rebind(keymapOptionsFrom({ bindings: resolved.bindings }));
    } catch (cause) {
      return keptNotice(messageOf(cause));
    }
    setForeignActions(resolved.foreignActions);
    setRevision((count) => count + 1);
    return reloaded ? reloadNotice(resolved.foreignActions) : undefined;
  };
  return { keys, apply };
}

export function followKeybindings(
  host: Pick<HostPort, "watchKeybindings">,
  scope: KeybindingsScope,
  live: LiveKeymap,
  say: (line: string) => void,
): () => void {
  let reloaded = false;
  return host.watchKeybindings(scope, (reading) => {
    const line = live.apply(reading, reloaded);
    reloaded = true;
    if (line !== undefined) say(line);
  });
}

export function foreignActionsLine(foreignActions: readonly string[]): string | undefined {
  if (foreignActions.length === 0) return undefined;
  const verb = foreignActions.length === 1 ? "is not an app action" : "are not app actions";
  return `${foreignActions.join(", ")} ${verb} · the terminal may still read them`;
}

type Resolved =
  | { bindings: KeybindingsSection; foreignActions: readonly string[] }
  | { problem: string };

function resolveReading(reading: KeybindingsReading): Resolved {
  if (reading.kind === "unreadable") return { problem: reading.problem };
  let merged: KeybindingsSection = {};
  for (const layer of reading.layers) {
    const parsed = keybindingsSection.safeParse(layer.keybindings ?? {});
    if (!parsed.success) return { problem: `${layer.file}: ${sectionProblem(parsed.error)}` };
    merged = { ...merged, ...parsed.data };
  }
  const known = (action: string): boolean => action in appBindings;
  return {
    bindings: Object.fromEntries(Object.entries(merged).filter(([action]) => known(action))),
    foreignActions: Object.keys(merged).filter((action) => !known(action)),
  };
}

function sectionProblem(error: z.ZodError): string {
  const [action] = error.issues[0]?.path ?? [];
  return action === undefined
    ? "keybindings must map action names to chords"
    : `keybindings.${String(action)} must be a chord, a list of chords, or "none"`;
}

function keptNotice(problem: string): string {
  return `keybindings kept · ${problem}`;
}

function reloadNotice(foreignActions: readonly string[]): string {
  const aside = foreignActionsLine(foreignActions);
  return aside === undefined ? reloadedNotice : `${reloadedNotice} · ${aside}`;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
