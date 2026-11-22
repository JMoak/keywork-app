import type { Desk, SurfaceEvent, SurfacesPort } from "../port.ts";
import type { Realm } from "./realm.ts";

export interface FakeDesktop {
  readonly port: SurfacesPort;
  readonly calls: string[];
  readonly opened: Realm[];
  open(url: string, frame: string): Window | null;
  emit(event: SurfaceEvent): void;
  announce(frame: string): void;
  closeEverything(): void;
}

export interface FakeDesktopOptions {
  readonly refusesToOpen?: boolean;
  readonly announces?: boolean;
}

export function fakeDesktop(options: FakeDesktopOptions = {}): FakeDesktop {
  const listeners = new Set<(event: SurfaceEvent) => void>();
  const calls: string[] = [];
  const opened: Realm[] = [];
  const byFrame = new Map<string, Realm>();
  const emit = (event: SurfaceEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };
  const announce = (frame: string): void => emit({ kind: "ready", id: frame });
  const record = async (call: string): Promise<void> => {
    calls.push(call);
  };
  return {
    port: {
      desk: async () => emptyDesk,
      onDeskChanged: () => () => undefined,
      show: (request) => record(`show ${request.id}`),
      hide: (id) => record(`hide ${id}`),
      close: async (id) => {
        calls.push(`close ${id}`);
        byFrame.get(id)?.close();
      },
      glide: () => record("glide"),
      focus: (id) => record(`focus ${id}`),
      focusConsole: () => record("focus console"),
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    calls,
    opened,
    open: (url, frame) => {
      calls.push(`open ${url} ${frame}`);
      if (options.refusesToOpen === true) return null;
      const child = openChild(frame);
      opened.push(child);
      byFrame.set(frame, child);
      if (options.announces !== false) queueMicrotask(() => announce(frame));
      return child;
    },
    emit,
    announce,
    closeEverything: () => {
      for (const child of opened) if (!child.closed) child.close();
    },
  };
}

export function openChild(frame = "kw-surface:test"): Realm {
  const child = window.open("about:blank", frame);
  if (child === null) throw new Error("the test page could not open a second window");
  defineLeavingElements(child as Realm);
  return child as Realm;
}

export function serveStylesheets(serve: (url: string) => Promise<string | undefined>): () => void {
  const fetching = browserSettings().fetch;
  const before = fetching.interceptor;
  fetching.interceptor = {
    beforeAsyncRequest: async ({ request }) => {
      const css = await serve(request.url);
      return css === undefined
        ? new Response("", { status: 404 })
        : new Response(css, { headers: { "content-type": "text/css" } });
    },
  };
  return () => {
    fetching.interceptor = before;
  };
}

export function lossyScroller(): HTMLElement {
  defineLeavingElements(window);
  return document.createElement(lossyScrollerName);
}

export function leavingWitness(left: () => void): HTMLElement {
  defineLeavingElements(window);
  const witness = document.createElement(leavingWitnessName) as LeavingWitness;
  witness.left = left;
  return witness;
}

export function turn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const lossyScrollerName = "lossy-scroller";

// Chromium drops an element's scroll offsets when it leaves the tree; happy-dom keeps them.
class LossyScroller extends HTMLElement {
  disconnectedCallback(): void {
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
}

const leavingWitnessName = "leaving-witness";

class LeavingWitness extends HTMLElement {
  left: () => void = () => undefined;

  disconnectedCallback(): void {
    this.left();
  }
}

const leavingElements: ReadonlyArray<[string, CustomElementConstructor]> = [
  [lossyScrollerName, LossyScroller],
  [leavingWitnessName, LeavingWitness],
];

// happy-dom finds a custom element in the registry of the window it stands in; Chromium keeps
// the definition the element was made with, so the test defines these in every window.
function defineLeavingElements(realm: Realm): void {
  for (const [name, element] of leavingElements) {
    if (realm.customElements.get(name) === undefined) realm.customElements.define(name, element);
  }
}

interface StylesheetFetching {
  interceptor: {
    beforeAsyncRequest(context: { request: Request }): Promise<Response>;
  } | null;
}

function browserSettings(): { fetch: StylesheetFetching } {
  return (window as unknown as { happyDOM: { settings: { fetch: StylesheetFetching } } }).happyDOM
    .settings;
}

const emptyRect = { x: 0, y: 0, width: 0, height: 0 };

const emptyDesk: Desk = {
  console: emptyRect,
  consoleMaximized: false,
  workArea: emptyRect,
  displays: [],
  cursor: { x: 0, y: 0 },
};
