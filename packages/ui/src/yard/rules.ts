import type { YardRule } from "@keywork-app/habitat";
import { rungs, settingKinds } from "@keywork-app/protocol";
import { type Accessor, createSignal, onCleanup } from "solid-js";
import { z } from "zod";

export const yardRulesKey = "keywork.yard-rules";

export type RuleStorage = Pick<Storage, "getItem" | "setItem">;

export interface YardRuleBook {
  readonly rules: Accessor<readonly YardRule[]>;
  record(rule: YardRule): void;
}

export function createYardRuleBook(storage: RuleStorage | undefined): YardRuleBook {
  const [rules, setRules] = createSignal<readonly YardRule[]>(storedRules(storage));
  followOtherWindows(() => setRules(storedRules(storage)));
  return {
    rules,
    record: (rule) => {
      const next = withRule(rules(), rule);
      setRules(next);
      storeRules(storage, next);
    },
  };
}

export function withRule(rules: readonly YardRule[], rule: YardRule): readonly YardRule[] {
  return [...rules.filter((held) => !sameKey(held, rule)), rule];
}

export function storedRules(storage: Pick<Storage, "getItem"> | undefined): readonly YardRule[] {
  try {
    const stored = storage?.getItem(yardRulesKey);
    if (stored == null) return [];
    const parsed = storedRulesSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function storeRules(storage: Pick<Storage, "setItem"> | undefined, rules: readonly YardRule[]) {
  try {
    storage?.setItem(yardRulesKey, JSON.stringify(rules));
  } catch {}
}

function followOtherWindows(reread: () => void): void {
  if (typeof window === "undefined") return;
  const onStorage = (event: StorageEvent): void => {
    if (event.key === yardRulesKey) reread();
  };
  window.addEventListener("storage", onStorage);
  onCleanup(() => window.removeEventListener("storage", onStorage));
}

function sameKey(a: YardRule, b: YardRule): boolean {
  return (
    a.creature === b.creature && a.thread === b.thread && a.kind === b.kind && a.lasts === b.lasts
  );
}

const storedRulesSchema = z.array(
  z.object({
    creature: z.string().nullable(),
    kind: z.enum(settingKinds),
    rung: z.enum(rungs),
    lasts: z.enum(["while-present", "always"]),
    thread: z.string().optional(),
  }),
);
