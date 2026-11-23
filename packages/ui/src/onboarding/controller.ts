import { createSignal } from "solid-js";
import type { Onboarding, Verb } from "./onboarding.ts";

export function createOnboardingController() {
  const [requested, setRequested] = createSignal(false);
  const [active, setActive] = createSignal<Onboarding>();
  const [card, setCard] = createSignal<HTMLElement>();
  return {
    requested,
    request: () => setRequested(true),
    clearRequest: () => setRequested(false),
    active,
    bind: (onboarding: Onboarding): (() => void) => {
      setActive(onboarding);
      return () => setActive((current) => (current === onboarding ? undefined : current));
    },
    card,
    bindCard: (root: HTMLElement): (() => void) => {
      setCard(root);
      return () => setCard((current) => (current === root ? undefined : current));
    },
    take: (action: string): boolean => {
      const staged = active();
      if (staged === undefined) return false;
      const verb = steadVerbs[action];
      if (verb !== undefined) staged.act(verb);
      return true;
    },
  };
}

export type OnboardingController = ReturnType<typeof createOnboardingController>;

export const steadVerbs: Readonly<Record<string, Verb>> = {
  "stead.open": "accept",
  "stead.up": "up",
  "stead.down": "down",
  "stead.turn-left": "previous",
  "stead.turn-right": "next",
};
