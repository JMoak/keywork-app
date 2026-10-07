import { z } from "zod";
import type { FileSeams } from "./recents.ts";

export const windowStateSchema = z
  .object({
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    width: z.number().int().min(400),
    height: z.number().int().min(300),
    maximized: z.boolean().default(false),
  })
  .describe(
    "Where a window was last; exists so each workspace opens where it was left instead of centered every launch.",
  );

export const windowBookSchema = z
  .object({
    version: z.literal(1),
    windows: z.record(z.string(), windowStateSchema),
  })
  .describe(
    "Window state per workspace identity, plus one entry for the front door; exists so two workspaces can remember two placements.",
  );

export type WindowState = z.infer<typeof windowStateSchema>;

export const defaultWindowState: WindowState = { width: 1280, height: 800, maximized: false };

export const frontDoorKey = "front-door";

export interface WindowStateBook {
  read(key: string): Promise<WindowState>;
  write(key: string, state: WindowState): Promise<void>;
}

export function windowStateBook(file: string, seams: FileSeams): WindowStateBook {
  const load = async (): Promise<Record<string, WindowState>> => {
    const text = await seams.readText(file);
    if (text === undefined) return {};
    const parsed = windowBookSchema.safeParse(tryJson(text));
    return parsed.success ? parsed.data.windows : {};
  };
  return {
    read: async (key) => (await load())[key] ?? defaultWindowState,
    write: async (key, state) => {
      const windows = { ...(await load()), [key]: state };
      const temporary = `${file}.tmp`;
      await seams.writeText(temporary, `${JSON.stringify({ version: 1, windows }, null, 2)}\n`);
      await seams.rename(temporary, file);
    },
  };
}

export function windowStateKey(
  workspace: string | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  if (workspace === undefined) return frontDoorKey;
  const slashed = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? slashed.toLowerCase() : slashed;
}

export interface Display {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function positionOn(
  state: WindowState,
  displays: readonly Display[],
): { x: number; y: number } | undefined {
  const { x, y } = state;
  if (x === undefined || y === undefined) return undefined;
  const centerX = x + state.width / 2;
  const centerY = y + state.height / 2;
  const onScreen = displays.some(
    (display) =>
      centerX >= display.x &&
      centerX <= display.x + display.width &&
      centerY >= display.y &&
      centerY <= display.y + display.height,
  );
  return onScreen ? { x, y } : undefined;
}

export function fitsAnyDisplay(state: WindowState, displays: readonly Display[]): boolean {
  return positionOn(state, displays) !== undefined;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
