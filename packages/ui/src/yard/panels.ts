import type { YardSetting } from "@keywork-app/habitat";
import { type Accessor, createSignal } from "solid-js";
import type { PaneKind } from "../panes/index.ts";
import type { PaneActionHandler } from "../panes/registry.ts";

export type DrawnAs = "panel" | "card";

export type DrawnYard = ReadonlyMap<string, DrawnAs>;

export interface YardPanels {
  readonly inside: Accessor<string | undefined>;
  report(drawn: DrawnYard): void;
  whenDrawn(id: string, landed: (as: DrawnAs) => void): void;
  mount(id: string, panel: MountedPanel): () => void;
  handle(id: string, handler: PaneActionHandler): () => void;
  focusWithin(id: string, within: boolean, target?: EventTarget | null): void;
  kindAt(target: EventTarget | null): PaneKind | undefined;
  settingOf(id: string | undefined): YardSetting | undefined;
  deliver(action: string, argument?: string): boolean;
  focus(id: string): boolean;
  focusWhenMounted(id: string): void;
}

export interface MountedPanel {
  readonly element: HTMLElement;
  kind(): PaneKind | undefined;
  setting(): YardSetting;
}

export const panelSelector = ".kw-yard-satellite[data-setting]";

export const overlaySelector = ".kw-overlay";

export function createYardPanels(): YardPanels {
  const [inside, setInside] = createSignal<string>();
  const mounted = new Map<string, MountedPanel>();
  const handlers = new Map<string, PaneActionHandler>();
  const lastFocused = new Map<string, HTMLElement>();
  const landings = new Map<string, (as: DrawnAs) => void>();
  let drawn: DrawnYard = new Map();
  let awaited: string | undefined;
  const land = (id: string): void => {
    const as = drawn.get(id);
    const landed = landings.get(id);
    if (as === undefined || landed === undefined) return;
    landings.delete(id);
    landed(as);
  };
  const focus = (id: string): boolean => {
    const panel = mounted.get(id);
    if (panel === undefined) return false;
    const target = focusTargetIn(panel.element, lastFocused.get(id));
    target?.focus({ preventScroll: true });
    return target !== undefined;
  };
  const release =
    <Value>(held: Map<string, Value>, id: string, value: Value) =>
    (): void => {
      if (held.get(id) === value) held.delete(id);
    };

  return {
    inside,
    report: (next) => {
      drawn = next;
      for (const id of [...landings.keys()]) land(id);
    },
    whenDrawn: (id, landed) => {
      landings.set(id, landed);
      land(id);
    },
    mount: (id, panel) => {
      mounted.set(id, panel);
      if (awaited === id) {
        awaited = undefined;
        focus(id);
      }
      const forget = release(mounted, id, panel);
      return () => {
        forget();
        lastFocused.delete(id);
        setInside((held) => (held === id ? undefined : held));
      };
    },
    handle: (id, handler) => {
      handlers.set(id, handler);
      return release(handlers, id, handler);
    },
    focusWithin: (id, within, target) => {
      if (within && id !== awaited) awaited = undefined;
      if (within && target instanceof HTMLElement) lastFocused.set(id, target);
      setInside((held) => (within ? id : held === id ? undefined : held));
    },
    kindAt: (target) => {
      const id = panelIdAt(target);
      return id === undefined ? undefined : mounted.get(id)?.kind();
    },
    settingOf: (id) => (id === undefined ? undefined : mounted.get(id)?.setting()),
    deliver: (action, argument) => {
      const id = inside();
      const handler = id === undefined ? undefined : handlers.get(id);
      handler?.(action, argument);
      return handler !== undefined;
    },
    focus: (id) => {
      awaited = undefined;
      return focus(id);
    },
    focusWhenMounted: (id) => {
      awaited = focus(id) ? undefined : id;
    },
  };
}

export function keptByThePanel(panel: Element, next: EventTarget | null): boolean {
  if (!(next instanceof Element)) return false;
  return panel.contains(next) || next.closest(overlaySelector) !== null;
}

export interface FocusLeaving {
  refocus(): boolean;
  leave(): void;
}

export function followFocusOut(panel: HTMLElement, event: FocusEvent, seams: FocusLeaving): void {
  if (keptByThePanel(panel, event.relatedTarget)) return;
  if (event.relatedTarget === null) afterRemovalSettles(panel, event.target, seams);
  else seams.leave();
}

function afterRemovalSettles(panel: HTMLElement, lost: EventTarget | null, seams: FocusLeaving) {
  queueMicrotask(() => {
    const page = panel.ownerDocument;
    if (panel.contains(page.activeElement)) return;
    const removedUnderFocus = lost instanceof Node && !lost.isConnected;
    const nowhere = page.activeElement === null || page.activeElement === page.body;
    if (removedUnderFocus && nowhere && panel.isConnected && seams.refocus()) return;
    seams.leave();
  });
}

export function panelIdAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined;
  return target.closest<HTMLElement>(panelSelector)?.dataset.setting;
}

const focusTargets = [".kw-frame-body [tabindex]", ".kw-frame-body textarea"] as const;

function focusTargetIn(panel: HTMLElement, last: HTMLElement | undefined): HTMLElement | undefined {
  if (last?.isConnected && panel.contains(last)) return last;
  for (const selector of focusTargets) {
    const target = panel.querySelector<HTMLElement>(selector);
    if (target !== null) return target;
  }
  return undefined;
}
