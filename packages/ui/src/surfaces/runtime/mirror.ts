import { swapAtOnce, swappingAttribute } from "../../theme/variables.ts";
import { type Detach, isElement, nothing } from "./realm.ts";

export interface Mirror {
  readonly settled: Promise<void>;
  dispose(): void;
}

export function mirrorDocument(source: Document, target: Document): Mirror {
  const styles = mirrorStyles(source, target);
  const fonts = () => loadSameFonts(source, target);
  const stops = [
    mirrorAttributes(source.documentElement, target.documentElement),
    mirrorAttributes(source.body, target.body),
    styles.dispose,
    whenFontsLoad(source, fonts),
  ];
  return {
    settled: styles.settled.then(fonts),
    dispose: () => {
      for (const stop of stops) stop();
    },
  };
}

export class StylesheetRefused extends Error {
  override readonly name = "StylesheetRefused";
}

const styleSources = 'style, link[rel~="stylesheet"]';

function mirrorAttributes(source: Element, target: HTMLElement): Detach {
  matchAttributes(source, target);
  const observer = new MutationObserver((records) => {
    if (records.some(swapsTheme)) {
      swapAtOnce(target, () => matchAttributes(source, target, swappingAttribute));
    } else matchAttributes(source, target);
  });
  observer.observe(source, { attributes: true });
  return () => observer.disconnect();
}

function swapsTheme(record: MutationRecord): boolean {
  return record.attributeName === swappingAttribute;
}

function matchAttributes(source: Element, target: Element, kept?: string): void {
  for (const name of source.getAttributeNames()) {
    const value = mirroredValue(source, name);
    if (target.getAttribute(name) !== value) target.setAttribute(name, value);
  }
  for (const name of target.getAttributeNames()) {
    if (name !== kept && !source.hasAttribute(name)) target.removeAttribute(name);
  }
}

function mirroredValue(source: Element, name: string): string {
  if (name === "href" && isStylesheetLink(source)) return source.href;
  return source.getAttribute(name) ?? "";
}

function mirrorStyles(source: Document, target: Document): Mirror {
  const clones = new Map<Node, Element>();
  const place = (original: Element): Promise<void> => {
    const clone = target.createElement(original.localName);
    matchStyle(original, clone);
    clones.set(original, clone);
    const loaded = stylesheetLoaded(clone);
    target.head.insertBefore(clone, cloneFollowing(original, clones));
    return loaded;
  };
  const refresh = (original: Element): void => {
    const clone = clones.get(original);
    if (clone === undefined) void place(original).catch(nothing);
    else matchStyle(original, clone);
  };
  const drop = (original: Node): void => {
    clones.get(original)?.remove();
    clones.delete(original);
  };
  const settled = Promise.all(styleSourcesIn(source.head).map(place)).then(nothing);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const removed of record.removedNodes) drop(removed);
      for (const touched of sourcesTouchedBy(record)) refresh(touched);
    }
  });
  observer.observe(source.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  return {
    settled,
    dispose: () => {
      observer.disconnect();
      for (const clone of clones.values()) clone.remove();
      clones.clear();
    },
  };
}

function styleSourcesIn(head: Element): Element[] {
  return [...head.children].filter(isStyleSource);
}

function sourcesTouchedBy(record: MutationRecord): Element[] {
  const holder = isElement(record.target) ? record.target : record.target.parentElement;
  const within = holder?.closest(styleSources) ?? undefined;
  const added = [...record.addedNodes].filter(isStyleSource);
  return within === undefined ? added : [within, ...added];
}

function isStyleSource(node: Node): node is Element {
  return isElement(node) && node.matches(styleSources) && node.parentElement?.localName === "head";
}

function isStylesheetLink(element: Element): element is HTMLLinkElement {
  return element.localName === "link";
}

function matchStyle(original: Element, clone: Element): void {
  matchAttributes(original, clone);
  if (isStylesheetLink(original)) return;
  if (clone.textContent !== original.textContent) clone.textContent = original.textContent;
}

function cloneFollowing(original: Element, clones: ReadonlyMap<Node, Element>): Element | null {
  for (let next = original.nextElementSibling; next !== null; next = next.nextElementSibling) {
    const clone = clones.get(next);
    if (clone !== undefined) return clone;
  }
  return null;
}

function stylesheetLoaded(clone: Element): Promise<void> {
  if (!isStylesheetLink(clone)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    clone.addEventListener("load", () => resolve(), { once: true });
    clone.addEventListener(
      "error",
      () => reject(new StylesheetRefused(`${clone.href} did not load in a pane's window`)),
      { once: true },
    );
  });
}

function loadSameFonts(source: Document, target: Document): Promise<void> {
  if (!hasFonts(source) || !hasFonts(target)) return Promise.resolve();
  const wanted = new Set([...source.fonts].filter(isLoaded).map(faceKey));
  const loads = [...target.fonts].filter((face) => wanted.has(faceKey(face)));
  return Promise.allSettled(loads.map((face) => face.load())).then(nothing);
}

function whenFontsLoad(source: Document, react: () => void): Detach {
  if (!hasFonts(source)) return nothing;
  const fonts = source.fonts;
  fonts.addEventListener("loadingdone", react);
  return () => fonts.removeEventListener("loadingdone", react);
}

function hasFonts(document: Document): boolean {
  return "fonts" in document;
}

function isLoaded(face: FontFace): boolean {
  return face.status === "loaded";
}

function faceKey(face: FontFace): string {
  return [face.family, face.style, face.weight, face.stretch, face.unicodeRange].join("|");
}
