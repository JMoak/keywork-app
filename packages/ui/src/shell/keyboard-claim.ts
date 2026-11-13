import { createContext, createSignal, useContext } from "solid-js";

export interface KeyboardHome {
  readonly element: () => HTMLElement | undefined;
  readonly homeward: () => boolean;
}

export function createKeyboardScope() {
  const [claimant, setClaimant] = createSignal<HTMLElement>();
  const [homeVersion, setHomeVersion] = createSignal(0);
  const homes = new Set<KeyboardHome>();
  let paneRouter: ((owner: HTMLElement) => void) | undefined;

  const owner = (): HTMLElement | undefined => {
    const element = claimant();
    return element?.isConnected ? element : undefined;
  };
  const restore = (): boolean => {
    const element = owner();
    if (element === undefined) return false;
    if (!element.contains(element.ownerDocument.activeElement))
      element.focus({ preventScroll: true });
    paneRouter?.(element);
    return true;
  };

  return {
    claimant: owner,
    claim: (element: HTMLElement): (() => void) => {
      setClaimant(element);
      return () => setClaimant((current) => (current === element ? undefined : current));
    },
    restore,
    yieldToClaim: (element: Element): boolean => {
      const held = owner();
      return held !== undefined && !held.contains(element) && restore();
    },
    routeToPanes: (route: (element: HTMLElement) => void): (() => void) => {
      paneRouter = route;
      return () => {
        if (paneRouter === route) paneRouter = undefined;
      };
    },
    homeVersion,
    returnHome: () => setHomeVersion((count) => count + 1),
    addHome: (home: KeyboardHome): (() => void) => {
      homes.add(home);
      return () => homes.delete(home);
    },
    homeOf: (pane: string): HTMLElement | undefined => {
      for (const home of homes) {
        const element = home.element();
        if (element?.isConnected && home.homeward() && paneIdOf(element) === pane) return element;
      }
      return undefined;
    },
  };
}

export type KeyboardScope = ReturnType<typeof createKeyboardScope>;

const KeyboardContext = createContext<KeyboardScope>();

export const KeyboardScopeProvider = KeyboardContext.Provider;

export function useKeyboardScope(): KeyboardScope | undefined {
  return useContext(KeyboardContext);
}

export function markKeyboardHome(element: Element): void {
  keyboardHomes.add(element);
}

export function isKeyboardHome(element: Element): boolean {
  return keyboardHomes.has(element);
}

const keyboardHomes = new WeakSet<Element>();

export function paneIdOf(element: Element): string | undefined {
  return element.closest("[data-pane-id]")?.getAttribute("data-pane-id") ?? undefined;
}
