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
    "Where the window was last; exists so the app opens where it was left instead of centered every launch.",
  );

export type WindowState = z.infer<typeof windowStateSchema>;

export const defaultWindowState: WindowState = { width: 1280, height: 800, maximized: false };

export interface WindowStateStore {
  read(): Promise<WindowState>;
  write(state: WindowState): Promise<void>;
}

export function windowStateStore(file: string, seams: FileSeams): WindowStateStore {
  return {
    read: async () => {
      const text = await seams.readText(file);
      if (text === undefined) return defaultWindowState;
      try {
        return windowStateSchema.parse(JSON.parse(text));
      } catch {
        return defaultWindowState;
      }
    },
    write: async (state) => {
      const temporary = `${file}.tmp`;
      await seams.writeText(temporary, `${JSON.stringify(state, null, 2)}\n`);
      await seams.rename(temporary, file);
    },
  };
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
