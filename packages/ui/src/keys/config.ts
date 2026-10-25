import { z } from "zod";
import { actionScopes, appBindings, exclusiveScopes } from "./actions.ts";
import {
  defaultLeader,
  defaultLeaderTimeoutMs,
  Keymap,
  KeymapError,
  type KeymapOptions,
} from "./keymap.ts";

const bindingSpec = z.union([z.string(), z.array(z.string())]);

export const keybindingsSchema = z
  .object({
    leader: z
      .string()
      .default(defaultLeader)
      .describe(
        "The one leader chord every harness verb hangs off; keywork's default is ctrl+k so muscle memory transfers between the terminal and the app.",
      ),
    timeoutMs: z
      .number()
      .int()
      .min(200)
      .max(10_000)
      .default(defaultLeaderTimeoutMs)
      .describe(
        "How long an armed leader waits for its key; exists because dictation and paste bursts must fall through as text rather than fire verbs.",
      ),
    bindings: z
      .record(z.string(), bindingSpec)
      .default({})
      .describe(
        'Per-action chord overrides keyed by action id (pane.zoom, focus.left); a value of "none" unbinds. Exists so a conflicting terminal or OS chord can be moved without forking the keymap.',
      ),
  })
  .describe(
    "The keyboard: one leader, its timeout, and overrides. One file, hot-reloadable, generated into the palette and the ? overlay so the documentation can never drift.",
  );

export type KeybindingsConfig = z.infer<typeof keybindingsSchema>;

export const keybindingsSection = z
  .record(z.string(), bindingSpec)
  .describe(
    'The keybindings section of keywork.json, read from ~/.keywork and from a trusted project\'s .keywork: action id to a chord, a list of chords, or "none" to unbind. Exists so the terminal and the app share one file and one muscle memory.',
  );

export type KeybindingsSection = z.infer<typeof keybindingsSection>;

export function keymapFromConfig(config: Partial<KeybindingsConfig> = {}): Keymap {
  return new Keymap(keymapOptionsFrom(config));
}

export function keymapOptionsFrom(config: Partial<KeybindingsConfig> = {}): KeymapOptions {
  const parsed = keybindingsSchema.parse(config);
  for (const action of Object.keys(parsed.bindings)) {
    if (!(action in appBindings)) throw new KeymapError(`no action named "${action}"`);
  }
  return {
    leader: parsed.leader,
    timeoutMs: parsed.timeoutMs,
    bindings: { ...appBindings, ...parsed.bindings },
    scopes: actionScopes,
    exclusiveScopes,
  };
}
