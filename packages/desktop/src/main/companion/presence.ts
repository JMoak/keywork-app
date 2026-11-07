import type { Presence, PresenceMode } from "./channels.ts";
import { waylandFallbackReason } from "./session.ts";

export type TransparencyVerdict = "clear" | "opaque" | "unknown";

export interface PresenceInputs {
  enabled: boolean;
  preferred: PresenceMode;
  hidden: boolean;
  onlyWhileBusy: boolean;
  busyNow: boolean;
  wayland: boolean;
  transparency: TransparencyVerdict;
  locked: boolean;
  foregroundBusy: boolean;
}

export const restingInputs: PresenceInputs = {
  enabled: false,
  preferred: "floating",
  hidden: false,
  onlyWhileBusy: false,
  busyNow: false,
  wayland: false,
  transparency: "unknown",
  locked: false,
  foregroundBusy: false,
};

export function derivePresence(inputs: PresenceInputs): Presence {
  if (!inputs.enabled) return { mode: "off", window: "none", reason: "companions are off" };
  if (inputs.preferred !== "floating") {
    return { mode: inputs.preferred, window: "none", reason: `${inputs.preferred} is preferred` };
  }
  if (inputs.wayland) {
    return { mode: "pane", window: "none", reason: waylandFallbackReason };
  }
  if (inputs.transparency === "opaque") {
    return {
      mode: "pane",
      window: "none",
      reason: "transparent windows paint black on this machine; the creature lives in the pane",
    };
  }
  if (inputs.hidden) return { mode: "floating", window: "none", reason: "hidden until shown" };
  if (inputs.locked) return { mode: "floating", window: "tucked", reason: "the screen is locked" };
  if (inputs.foregroundBusy) {
    return {
      mode: "floating",
      window: "tucked",
      reason: "a fullscreen or presenting app is in front",
    };
  }
  if (inputs.onlyWhileBusy && !inputs.busyNow) {
    return {
      mode: "floating",
      window: "tucked",
      reason: "shows while something works or needs you",
    };
  }
  return { mode: "floating", window: "shown", reason: "floating" };
}

export interface PresenceController {
  inputs(): PresenceInputs;
  presence(): Presence;
  update(patch: Partial<PresenceInputs>): Presence;
  onChange(listener: (presence: Presence, previous: Presence) => void): () => void;
}

export function presenceController(initial: PresenceInputs = restingInputs): PresenceController {
  let inputs = initial;
  let presence = derivePresence(inputs);
  const listeners = new Set<(presence: Presence, previous: Presence) => void>();
  return {
    inputs: () => inputs,
    presence: () => presence,
    update: (patch) => {
      inputs = { ...inputs, ...patch };
      const next = derivePresence(inputs);
      if (samePresence(next, presence)) return presence;
      const previous = presence;
      presence = next;
      for (const listener of [...listeners]) listener(next, previous);
      return next;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function samePresence(a: Presence, b: Presence): boolean {
  return a.mode === b.mode && a.window === b.window && a.reason === b.reason;
}
