import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createDraftLedger, type DraftStorage } from "./drafts.ts";

const key = "keywork.drafts:C:/work/app";

describe("drafts kept across a relaunch", () => {
  it("brings a session's unsent draft back in the next ledger over the same storage", () => {
    const storage = memoryStorage();
    const first = ledger(storage);
    first.memory("pane-1", "s1").keep({ text: "a carefully written draft", pastes: [[1, "x\ny"]] });
    first.memory("pane-2", "s2").keep({ text: "another session's thought", pastes: [] });

    const relaunched = ledger(storage);
    expect(relaunched.memory("pane-9", "s1").recall()).toEqual({
      text: "a carefully written draft",
      pastes: [[1, "x\ny"]],
    });
    expect(relaunched.memory("pane-9", "s2").recall()?.text).toBe("another session's thought");
  });

  it("follows the session rather than the pane, and keeps a new session's draft by its pane", () => {
    const drafts = ledger(memoryStorage());
    drafts.memory("pane-1", "s1").keep({ text: "for s1", pastes: [] });
    expect(drafts.memory("pane-2", "s1").recall()?.text).toBe("for s1");
    drafts.memory("pane-3", undefined).keep({ text: "not started yet", pastes: [] });
    expect(drafts.memory("pane-3", undefined).recall()?.text).toBe("not started yet");
    expect(drafts.memory("pane-4", undefined).recall()).toBeUndefined();
  });

  it("forgets a draft once it is sent, and clears the key when nothing is left", () => {
    const storage = memoryStorage();
    const drafts = ledger(storage);
    const memory = drafts.memory("pane-1", "s1");
    memory.keep({ text: "send me", pastes: [] });
    expect(storage.getItem(key)).not.toBeNull();
    memory.keep({ text: "", pastes: [] });
    expect(memory.recall()).toBeUndefined();
    expect(storage.getItem(key)).toBeNull();
  });

  it("starts empty over storage it cannot read, and keeps drafts in memory when storage refuses", () => {
    const garbled = memoryStorage();
    garbled.setItem(key, "{not json");
    expect(ledger(garbled).memory("pane-1", "s1").recall()).toBeUndefined();
    const refusing: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const drafts = ledger(refusing);
    drafts.memory("pane-1", "s1").keep({ text: "still here", pastes: [] });
    expect(drafts.memory("pane-1", "s1").recall()?.text).toBe("still here");
  });

  it("hands one memory per place, so a composer sees the same keeper on every read", () => {
    const drafts = ledger(memoryStorage());
    expect(drafts.memory("pane-1", "s1")).toBe(drafts.memory("pane-2", "s1"));
  });
});

function ledger(storage: DraftStorage) {
  return createRoot(() => createDraftLedger({ storage, key }));
}

function memoryStorage(): DraftStorage {
  const items = new Map<string, string>();
  return {
    getItem: (name) => items.get(name) ?? null,
    setItem: (name, value) => {
      items.set(name, value);
    },
    removeItem: (name) => {
      items.delete(name);
    },
  };
}
