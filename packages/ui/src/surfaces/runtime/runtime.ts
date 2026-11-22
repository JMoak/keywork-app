import { paneIdOf } from "../../shell/keyboard-claim.ts";
import type { SurfaceId, SurfacesPort } from "../port.ts";
import { shareDelegatedEvents } from "./delegation.ts";
import { mirrorDocument } from "./mirror.ts";
import { createWindowPool, type PooledWindow, type Prepared } from "./pool.ts";
import { type Detach, documentOf, isElement, type Realm, settleRealms } from "./realm.ts";
import { type Place, placeOf, resettleWhileArriving, transplant } from "./transplant.ts";
import { admitWindow, openWindows } from "./windows.ts";
import "./outside.css";

export interface OutsidePane {
  readonly id: SurfaceId;
  readonly window: Window;
  readonly body: HTMLElement;
  readonly mount: HTMLElement;
}

export interface OutsideFrame {
  readonly holder: HTMLElement;
  dispose?(): void;
}

export interface SendOutside {
  readonly frame?: ((mount: HTMLElement) => OutsideFrame) | undefined;
  readonly onClosed?: (() => void) | undefined;
}

export interface SurfaceRuntime {
  warm(size?: number): void;
  warmWindows(): number;
  sendOutside(body: HTMLElement, sending?: SendOutside): Promise<OutsidePane | undefined>;
  bringInside(pane: OutsidePane | HTMLElement): void;
  outsidePaneOf(node: Node): OutsidePane | undefined;
  dispose(): void;
}

export interface SurfaceRuntimeOptions {
  readonly open?: ((url: string, frame: string) => Window | null) | undefined;
  readonly poolSize?: number | undefined;
  readonly burst?: number | undefined;
  readonly warmWithinMs?: number | undefined;
}

export const outsideClass = "kw-outside";

export function createSurfaceRuntime(
  port: SurfacesPort,
  options: SurfaceRuntimeOptions = {},
): SurfaceRuntime {
  const outside = new Map<HTMLElement, Outside>();
  const wanted = new Set<HTMLElement>();
  const arrivals = new Map<HTMLElement, Detach>();

  const move = (body: HTMLElement, place: Place, into: Realm): void => {
    arrivals.get(body)?.();
    arrivals.set(body, resettleWhileArriving(into, transplant(body, place)));
  };

  const settleOutside = (
    body: HTMLElement,
    home: Place,
    held: PooledWindow,
    sending: SendOutside,
  ): Outside => {
    const page = held.window.document;
    const mount = mountFor(body);
    page.body.append(mount);
    const frame = framed(mount, sending);
    move(body, { parent: frame.holder, before: null }, held.window);
    const settled: Outside = {
      pane: { id: held.id, window: held.window, body, mount },
      held,
      home,
      page,
      frame,
      onClosed: sending.onClosed,
      stopSettling: settleArrivals(mount),
    };
    outside.set(body, settled);
    anchors.set(page, home.parent);
    return settled;
  };

  const comeHome = (settled: Outside): void => {
    outside.delete(settled.pane.body);
    anchors.delete(settled.page);
    settled.stopSettling();
    move(settled.pane.body, settled.home, window);
    settled.frame.dispose?.();
    settled.pane.mount.remove();
  };

  const closedUnderneath = (held: PooledWindow): void => {
    const settled = [...outside.values()].find((candidate) => candidate.held === held);
    if (settled === undefined) return;
    comeHome(settled);
    settled.onClosed?.();
  };

  const pool = createWindowPool({
    port,
    open: options.open ?? ((url, frame) => window.open(url, frame)),
    prepare: prepareWindow,
    lost: closedUnderneath,
    size: options.poolSize,
    burst: options.burst,
    warmWithinMs: options.warmWithinMs,
  });

  const bringInside = (pane: OutsidePane | HTMLElement): void => {
    const body = isElement(pane) ? pane : pane.body;
    wanted.delete(body);
    const settled = outside.get(body);
    if (settled === undefined) return;
    comeHome(settled);
    pool.give(settled.held);
  };

  const sendOutside = async (
    body: HTMLElement,
    sending: SendOutside = {},
  ): Promise<OutsidePane | undefined> => {
    const already = outside.get(body);
    if (already !== undefined) return already.pane;
    wanted.add(body);
    const held = await pool.take().catch((refusal: unknown) => {
      wanted.delete(body);
      throw refusal;
    });
    const home = placeOf(body);
    if (outside.has(body) || !wanted.delete(body) || home === undefined) {
      pool.give(held);
      return outside.get(body)?.pane;
    }
    try {
      return settleOutside(body, home, held, sending).pane;
    } catch (failure) {
      pool.give(held);
      throw failure;
    }
  };

  const dispose = (): void => {
    window.removeEventListener("pagehide", closeChildWindows);
    for (const settled of [...outside.values()]) bringInside(settled.pane);
    wanted.clear();
    for (const stop of arrivals.values()) stop();
    arrivals.clear();
    pool.dispose();
  };
  window.addEventListener("pagehide", closeChildWindows);

  return {
    warm: pool.warm,
    warmWindows: pool.warmCount,
    sendOutside,
    bringInside,
    outsidePaneOf: (node) =>
      [...outside.values()].find((settled) => settled.page === documentOf(node))?.pane,
    dispose,
  };
}

export function anchorOf(node: Node): Node {
  return anchors.get(documentOf(node)) ?? node;
}

interface Outside {
  readonly pane: OutsidePane;
  readonly held: PooledWindow;
  readonly home: Place;
  readonly page: Document;
  readonly frame: OutsideFrame;
  readonly onClosed: (() => void) | undefined;
  readonly stopSettling: Detach;
}

const anchors = new WeakMap<Document, Node>();

function prepareWindow(child: Realm): Prepared {
  const mirror = mirrorDocument(document, child.document);
  const stops = [mirror.dispose, shareDelegatedEvents(child.document), admitWindow(child)];
  return {
    settled: mirror.settled,
    dispose: () => {
      for (const stop of stops) stop();
    },
  };
}

function mountFor(body: Element): HTMLElement {
  const mount = document.createElement("div");
  mount.className = outsideClass;
  const pane = paneIdOf(body);
  if (pane !== undefined) mount.setAttribute("data-pane-id", pane);
  return mount;
}

function framed(mount: HTMLElement, sending: SendOutside): OutsideFrame {
  try {
    return sending.frame?.(mount) ?? { holder: mount };
  } catch (failure) {
    mount.remove();
    throw failure;
  }
}

function settleArrivals(mount: Node): Detach {
  const observer = new MutationObserver((records) => {
    if (records.some(addsElements)) settleRealms();
  });
  observer.observe(mount, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function addsElements(record: MutationRecord): boolean {
  return [...record.addedNodes].some(isElement);
}

function closeChildWindows(): void {
  for (const child of openWindows().slice(1)) child.close();
}
