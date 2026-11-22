export const blockWorldVariable = "VITE_STEAD_BLOCK_WORLD";

// Declared before anything reads it: `blockWorldShown` below is worked out as this module loads.
const switchedOn: ReadonlySet<string> = new Set(["1", "true", "on", "yes"]);

export function blockWorldSwitch(env: Readonly<Record<string, unknown>>): boolean {
  const value = env[blockWorldVariable];
  return typeof value === "string" && switchedOn.has(value.trim().toLowerCase());
}

export const blockWorldShown: boolean = blockWorldSwitch(import.meta.env);
