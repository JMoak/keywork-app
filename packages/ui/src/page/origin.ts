import type { PromptOrigin } from "@keywork-app/protocol";

export function originLabel(origin: PromptOrigin): string {
  return origin.kind === "creature" ? `from ${origin.creature}'s thread` : `via ${origin.client}`;
}
