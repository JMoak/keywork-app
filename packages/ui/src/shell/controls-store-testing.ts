import type { ControlsClient } from "./controls-store.ts";

export function idleControlsClient(): ControlsClient {
  return {
    setModel: async () => "missing",
    setThinking: async () => "missing",
    setEffort: async () => "missing",
    compact: async () => "missing",
    undo: async () => "missing",
    redo: async () => "missing",
    restoreTurn: async () => "missing",
    context: async () => "missing",
    cost: async () => "missing",
    exportSession: async () => "missing",
    rename: async () => "missing",
    flush: async () => "missing",
    forget: async () => "missing",
    applyPreset: async () => ({
      refused: "unavailable",
      detail: "this process has no preset switch",
    }),
  };
}
