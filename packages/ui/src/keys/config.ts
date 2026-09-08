import { z } from "zod";
import { appBindings } from "./actions.ts";
import { defaultLeader, defaultLeaderTimeoutMs, Keymap, KeymapError } from "./keymap.ts";

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

export function keymapFromConfig(config: Partial<KeybindingsConfig> = {}): Keymap {
  const parsed = keybindingsSchema.parse(config);
  for (const action of Object.keys(parsed.bindings)) {
    if (!(action in appBindings)) throw new KeymapError(`no action named "${action}"`);
  }
  return new Keymap({
    leader: parsed.leader,
    timeoutMs: parsed.timeoutMs,
    bindings: { ...appBindings, ...parsed.bindings },
  });
}
