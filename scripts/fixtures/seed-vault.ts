import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { keyworkModuleUrl } from "../lib/keywork-checkout.ts";

type SeedProvenance = "user" | "agent" | "untrusted";

interface VaultStore {
  writeNote(input: {
    title: string;
    body: string;
    provenance: SeedProvenance;
    pinned?: boolean;
    confidence?: number;
  }): Promise<unknown>;
  appendDaily(text: string, provenance: SeedProvenance): Promise<unknown>;
}

interface VaultModule {
  MemoryStore: new (options: { vaultRoot: string; trusted: boolean }) => VaultStore;
}

export const seededNotes = [
  {
    title: "Layout Rects",
    body: "Rects are the single geometric truth; every verb edits the tree and rects follow.\n",
    provenance: "user",
    pinned: true,
  },
  {
    title: "Composer Enter",
    body: "Enter queues and Alt+Enter steers, as keywork's composer does.\n",
    provenance: "agent",
    confidence: 0.8,
  },
] as const;

export const seededStagedNotes = [
  { title: "Stray Claim", body: "Thirds, maybe.\n" },
  { title: "Flavor Import", body: "Any flavor file can be imported from the palette.\n" },
  { title: "Tray Mark", body: "The tray shows a mark while asks are pending.\n" },
] as const;

export async function seedVault(cwd: string): Promise<void> {
  const engine = (await import(keyworkModuleUrl("packages/engine/src/index.ts"))) as VaultModule;
  const vaultRoot = join(cwd, ".keywork", "memory");
  await mkdir(vaultRoot, { recursive: true });
  await writeFile(join(cwd, ".keywork", "workspace.json"), JSON.stringify({ name: "fixture" }));
  const vault = new engine.MemoryStore({ vaultRoot, trusted: true });
  for (const note of seededNotes) await vault.writeNote(note);
  await vault.appendDaily("Recorded the memory fixture.", "agent");
  for (const staged of seededStagedNotes) {
    await vault.writeNote({ ...staged, provenance: "untrusted" });
  }
}
