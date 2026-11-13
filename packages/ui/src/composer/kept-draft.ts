import type { HeldPastes } from "./paste-vault.ts";

export interface KeptDraft {
  readonly text: string;
  readonly pastes: HeldPastes;
}

export interface DraftMemory {
  recall(): KeptDraft | undefined;
  keep(draft: KeptDraft): void;
}

export const emptyDraft: KeptDraft = { text: "", pastes: [] };
