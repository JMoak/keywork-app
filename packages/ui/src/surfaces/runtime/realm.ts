export type Realm = Window & typeof globalThis;

export type Detach = () => void;

export function windowOf(node: Node): Realm {
  return documentOf(node).defaultView ?? window;
}

export function documentOf(node: Node): Document {
  return isDocument(node) ? node : (node.ownerDocument ?? document);
}

export function focusedIn(node: Node): Element | null {
  return documentOf(node).activeElement;
}

export function restsOnPage(node: Node): boolean {
  const focused = focusedIn(node);
  return focused === null || isPageBody(focused);
}

export function isPageBody(target: unknown): target is HTMLElement {
  return isElement(target) && target === documentOf(target).body;
}

export function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === elementNode;
}

export function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

export function inWindowOf(node: Node, attach: (realm: Realm) => Detach): Detach {
  let home = windowOf(node);
  let detach = attach(home);
  const settle = (): void => {
    const now = windowOf(node);
    if (now === home) return;
    detach();
    home = now;
    detach = attach(now);
  };
  followers.add(settle);
  return () => {
    followers.delete(settle);
    detach();
  };
}

export function whenWindowChanges(node: Node, changed: (realm: Realm) => void): Detach {
  let arrived = false;
  return inWindowOf(node, (realm) => {
    if (arrived) changed(realm);
    arrived = true;
    return nothing;
  });
}

export function settleRealms(): void {
  for (const settle of [...followers]) settle();
}

export function observeSize(element: Element, resized: ResizeObserverCallback): Detach {
  return inWindowOf(element, (realm) => {
    if (typeof realm.ResizeObserver !== "function") return nothing;
    const observer = new realm.ResizeObserver(resized);
    observer.observe(element);
    return () => observer.disconnect();
  });
}

export function requestFrame(node: Node, paint: FrameRequestCallback): Detach {
  const realm = windowOf(node);
  const frame = realm.requestAnimationFrame(paint);
  return () => realm.cancelAnimationFrame(frame);
}

export function mediaMatches(node: Node, query: string): boolean {
  const realm = windowOf(node);
  return typeof realm.matchMedia === "function" && realm.matchMedia(query).matches;
}

export function followMedia(node: Node, query: string, changed: () => void): Detach {
  return inWindowOf(node, (realm) => {
    if (typeof realm.matchMedia !== "function") return nothing;
    const list = realm.matchMedia(query);
    if (typeof list.addEventListener !== "function") return nothing;
    list.addEventListener("change", changed);
    return () => list.removeEventListener("change", changed);
  });
}

export function styleOf(element: Element): CSSStyleDeclaration {
  return windowOf(element).getComputedStyle(element);
}

export function pixelRatioOf(node: Node): number {
  const ratio = windowOf(node).devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export const nothing: Detach = () => undefined;

const elementNode = 1;
const documentNode = 9;

const followers = new Set<() => void>();

function isDocument(node: Node): node is Document {
  return node.nodeType === documentNode;
}
