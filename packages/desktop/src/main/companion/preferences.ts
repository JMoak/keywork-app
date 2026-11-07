import { z } from "zod";
import type { FileSeams } from "../recents.ts";

export const storedPositionSchema = z
  .object({
    layoutKey: z.string().min(1),
    displayId: z.number().int(),
    edge: z.enum(["none", "left", "right", "top", "bottom"]),
    u: z.number().min(0).max(1),
    v: z.number().min(0).max(1),
  })
  .describe(
    "Where the creature stands, as the bottom-right anchor's fraction of one display's work area plus the edge it was snapped to; exists so a position survives a monitor being unplugged, re-homes on a different layout, and is never restored partly off-screen.",
  );

export const selfTestRecordSchema = z
  .object({
    result: z.enum(["clear", "opaque", "unknown"]),
    gpu: z.string(),
    at: z.string(),
  })
  .describe(
    "The last transparency self-test and the GPU it ran on; exists because about five percent of Windows machines paint transparent windows black and the test must rerun only when the GPU changes.",
  );

export const companionPreferencesSchema = z
  .object({
    version: z.literal(1),
    enabled: z
      .boolean()
      .default(false)
      .describe(
        "The master switch. Off shows no window, registers no shortcut and never wakes anything (only while the first-run opt-in is unanswered does a hidden, non-activating window wait so turning it on paints at once); companions are opt-in on first run because an uninvited desktop pet is the most hated thing in the research.",
      ),
    optInOffered: z
      .boolean()
      .default(false)
      .describe(
        "Whether the stead has offered the first-run opt-in line; it is offered once, after the first creature is made, and never again, because an opt-in that keeps asking is the uninvited pet by another road.",
      ),
    mode: z
      .enum(["floating", "tray", "pane", "notification"])
      .default("floating")
      .describe(
        "The keeper's preferred presence; stored apart from the effective one so a temporary downgrade (fullscreen app, Wayland, a failed transparency test) never overwrites the choice.",
      ),
    hidden: z
      .boolean()
      .default(false)
      .describe(
        "Hide, durable across relaunch and update; only an explicit Show brings the creature back, because a pet that reappears after being hidden is the first complaint in every thread.",
      ),
    still: z
      .boolean()
      .default(false)
      .describe(
        "Still: frame 0 of the current pose and zero scheduled wakeups; the pause control WCAG 2.2.2 requires for moving content.",
      ),
    quiet: z
      .boolean()
      .default(false)
      .describe(
        "Quiet: no bubble and no badge color change; the creature still shows its state by pose and glyph, so meaning survives without attention chrome.",
      ),
    onlyWhileBusy: z
      .boolean()
      .default(false)
      .describe(
        "Float only while something is working or needs the keeper; the optional mode users asked for who want a signal, not a companion.",
      ),
    size: z
      .number()
      .int()
      .min(50)
      .max(200)
      .default(100)
      .describe(
        "Scale in percent, 50 to 200; the hit area, badge, bubble and controls scale with the creature so a small creature stays clickable.",
      ),
    shortcut: z
      .string()
      .min(1)
      .nullable()
      .default(null)
      .describe(
        "The global show-or-hide chord, none by default; changeable and disableable from day one, and refused when it collides with a chord an OS or launcher uses.",
      ),
    motion: z
      .enum(["system", "reduce", "full"])
      .default("system")
      .describe(
        "Motion: follow the OS, reduce, or full; an in-app override that applies live, because the OS setting alone was reported broken on Windows overlays.",
      ),
    positions: z
      .record(z.string(), storedPositionSchema)
      .default({})
      .describe(
        "One stored position per display layout, keyed by the layout; exists so each desk arrangement remembers its own corner.",
      ),
    selfTest: selfTestRecordSchema
      .optional()
      .describe("Absent until the first transparency self-test has run on this machine."),
  })
  .describe(
    "The companion window: the master switch, the preferred presence, the durable Hide and the accessibility controls, each stored once so no mode change can erase a choice the keeper made.",
  );

export type CompanionPreferences = z.infer<typeof companionPreferencesSchema>;

export type StoredPosition = z.infer<typeof storedPositionSchema>;

export type SelfTestRecord = z.infer<typeof selfTestRecordSchema>;

export type PreferencePatch = Partial<Omit<CompanionPreferences, "version">>;

export const defaultPreferences: CompanionPreferences = companionPreferencesSchema.parse({
  version: 1,
});

export interface PreferenceBook {
  read(): Promise<CompanionPreferences>;
  write(preferences: CompanionPreferences): Promise<void>;
}

export function preferenceBook(file: string, seams: FileSeams): PreferenceBook {
  return {
    read: async () => parsePreferences(await seams.readText(file)),
    write: async (preferences) => {
      const temporary = `${file}.tmp`;
      await seams.writeText(temporary, `${JSON.stringify(preferences, null, 2)}\n`);
      await seams.rename(temporary, file);
    },
  };
}

export function parsePreferences(text: string | undefined): CompanionPreferences {
  if (text === undefined) return defaultPreferences;
  const parsed = companionPreferencesSchema.safeParse(tryJson(text));
  return parsed.success ? parsed.data : defaultPreferences;
}

export function patched(
  preferences: CompanionPreferences,
  patch: PreferencePatch,
): CompanionPreferences {
  return companionPreferencesSchema.parse({ ...preferences, ...patch, version: 1 });
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
