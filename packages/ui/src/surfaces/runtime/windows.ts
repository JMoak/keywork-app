import type { Detach, Realm } from "./realm.ts";

export function everyWindow(attach: (realm: Realm) => Detach): Detach {
  const reach: Reach = { attach, detachers: new Map() };
  for (const realm of openWindows()) reach.detachers.set(realm, attach(realm));
  reaches.add(reach);
  return () => {
    reaches.delete(reach);
    for (const detach of reach.detachers.values()) detach();
    reach.detachers.clear();
  };
}

export function listenInEveryWindow<Type extends keyof WindowEventMap>(
  type: Type,
  listener: (event: WindowEventMap[Type]) => void,
  options?: boolean | AddEventListenerOptions,
): Detach {
  return everyWindow((realm) => listen(realm, type, listener as EventListener, options));
}

export function listenInEveryDocument<Type extends keyof DocumentEventMap>(
  type: Type,
  listener: (event: DocumentEventMap[Type]) => void,
  options?: boolean | AddEventListenerOptions,
): Detach {
  return everyWindow((realm) => listen(realm.document, type, listener as EventListener, options));
}

export function admitWindow(realm: Realm): Detach {
  if (!children.has(realm)) {
    children.add(realm);
    for (const reach of reaches) reach.detachers.set(realm, reach.attach(realm));
  }
  return () => {
    if (!children.delete(realm)) return;
    for (const reach of reaches) {
      reach.detachers.get(realm)?.();
      reach.detachers.delete(realm);
    }
  };
}

export function openWindows(): readonly Realm[] {
  return [window, ...children];
}

export function visibleWindow(): Realm {
  return openWindows().find(isShowing) ?? window;
}

export function focusedWindow(): Realm {
  return openWindows().find(holdsFocus) ?? window;
}

export function holdsFocus(realm: Realm): boolean {
  return !realm.closed && realm.document.hasFocus();
}

interface Reach {
  readonly attach: (realm: Realm) => Detach;
  readonly detachers: Map<Realm, Detach>;
}

const children = new Set<Realm>();
const reaches = new Set<Reach>();

function listen(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options: boolean | AddEventListenerOptions | undefined,
): Detach {
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

function isShowing(realm: Realm): boolean {
  return !realm.closed && realm.document.visibilityState === "visible";
}
