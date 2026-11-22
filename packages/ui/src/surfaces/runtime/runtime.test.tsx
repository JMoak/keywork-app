import { createSignal, onCleanup, Show } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { paneIdOf } from "../../shell/keyboard-claim.ts";
import { keyworkNight } from "../../theme/themes.ts";
import { applyTheme } from "../../theme/variables.ts";
import { WindowRefused } from "./pool.ts";
import { observeSize, type Realm } from "./realm.ts";
import {
  anchorOf,
  createSurfaceRuntime,
  type OutsidePane,
  outsideClass,
  type SurfaceRuntime,
} from "./runtime.ts";
import {
  type FakeDesktop,
  type FakeDesktopOptions,
  fakeDesktop,
  leavingWitness,
  lossyScroller,
  turn,
} from "./testing.ts";
import { listenInEveryDocument, openWindows } from "./windows.ts";

const cleanups: Array<() => void> = [];
const consoleObserver = window.ResizeObserver;

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.replaceChildren();
  document.body.replaceChildren();
  window.ResizeObserver = consoleObserver;
});

describe("sending a pane outside the window", () => {
  it("moves the live body into a prepared window and names it", async () => {
    applyTheme(keyworkNight);
    const style = document.createElement("style");
    style.textContent = ".kw-frame { color: var(--kw-text); }";
    document.head.append(style);
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const outside = await sent(runtime, pane.body);
    const child = desktop.opened[0] as Realm;
    expect(outside.id).toBe("kw-surface:1");
    expect(outside.window).toBe(child);
    expect(outside.body).toBe(pane.body);
    expect(pane.body.ownerDocument).toBe(child.document);
    expect(pane.body.parentElement).toBe(outside.mount);
    expect(outside.mount.className).toBe(outsideClass);
    expect(outside.mount.parentElement).toBe(child.document.body);
    expect(child.document.documentElement.dataset.theme).toBe(keyworkNight.name);
    expect(child.document.head.querySelector("style")?.textContent).toBe(style.textContent);
  });

  it("leaves the slot where it is as the anchor, and still answers which pane a node is in", async () => {
    const { runtime } = bench();
    const pane = mountPane("thread-7");
    const outside = await sent(runtime, pane.body);
    expect(pane.slot.isConnected).toBe(true);
    expect(pane.slot.contains(pane.body)).toBe(false);
    expect(paneIdOf(pane.field())).toBe("thread-7");
    expect(anchorOf(pane.field())).toBe(pane.slot);
    expect(pane.slot.contains(anchorOf(pane.field()))).toBe(true);
    expect(anchorOf(pane.slot)).toBe(pane.slot);
    expect(runtime.outsidePaneOf(pane.field())).toBe(outside);
    expect(runtime.outsidePaneOf(pane.slot)).toBeUndefined();
  });

  it("keeps the component alive: no remount, state kept, delegated clicks still land", async () => {
    const { runtime } = bench();
    const pane = mountPane("thread-7");
    pane.button().click();
    await sent(runtime, pane.body);
    pane.button().click();
    runtime.bringInside(pane.body);
    pane.button().click();
    expect(pane.button().textContent).toBe("pressed 3");
    expect(pane.unmounts()).toBe(0);
  });

  it("answers a second send of the same body with the same pane, on one window", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const [first, second] = await Promise.all([
      runtime.sendOutside(pane.body),
      runtime.sendOutside(pane.body),
    ]);
    expect(second).toBe(first);
    expect(await runtime.sendOutside(pane.body)).toBe(first);
    expect(desktop.calls.filter((call) => call.startsWith("show"))).toEqual([]);
  });

  it("lets the integrator frame the pane, and takes the frame down when it returns", async () => {
    const { runtime } = bench();
    const pane = mountPane("thread-7");
    let taken = 0;
    const outside = await sent(runtime, pane.body, {
      frame: (mount) => {
        const holder = document.createElement("div");
        holder.className = "kw-surface-body";
        mount.append(holder);
        return { holder, dispose: () => (taken += 1) };
      },
    });
    expect(pane.body.parentElement?.className).toBe("kw-surface-body");
    expect(pane.body.closest(`.${outsideClass}`)).toBe(outside.mount);
    runtime.bringInside(outside);
    expect(taken).toBe(1);
  });

  it("leaves the pane inside and frees the window when its frame cannot be built", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const sending = runtime.sendOutside(pane.body, {
      frame: () => {
        throw new Error("the strip could not render");
      },
    });
    await expect(sending).rejects.toThrow("the strip could not render");
    expect(pane.slot.contains(pane.body)).toBe(true);
    expect(desktop.opened[0]?.document.body.children).toHaveLength(0);
    const outside = await sent(runtime, pane.body);
    expect(outside.window).toBe(desktop.opened[0]);
  });

  it("refuses when the desktop will not open a window, and the pane stays inside", async () => {
    const { runtime } = bench({ refusesToOpen: true });
    const pane = mountPane("thread-7");
    await expect(runtime.sendOutside(pane.body)).rejects.toBeInstanceOf(WindowRefused);
    expect(pane.slot.contains(pane.body)).toBe(true);
  });

  it("keeps a pane inside when it is called back before its window is ready", async () => {
    const { desktop, runtime } = bench({ announces: false });
    const pane = mountPane("thread-7");
    const sending = runtime.sendOutside(pane.body);
    runtime.bringInside(pane.body);
    desktop.announce("kw-surface:1");
    expect(await sending).toBeUndefined();
    expect(pane.slot.contains(pane.body)).toBe(true);
    expect(desktop.calls).toContain("hide kw-surface:1");
  });
});

describe("bringing a pane inside", () => {
  it("returns the body to its slot exactly: place, scroll and focus", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const before = document.createElement("span");
    pane.slot.prepend(before);
    const transcript = lossyScroller();
    pane.body.append(transcript);
    transcript.scrollTop = 420;
    pane.field().focus();
    const outside = await sent(runtime, pane.body);
    expect(transcript.scrollTop).toBe(420);
    expect(outside.window.document.activeElement).toBe(pane.field());
    transcript.scrollTop = 510;
    runtime.bringInside(outside);
    expect([...pane.slot.children]).toEqual([before, pane.body]);
    expect(transcript.scrollTop).toBe(510);
    expect(document.activeElement).toBe(pane.field());
    expect(outside.mount.isConnected).toBe(false);
    expect(desktop.calls).toContain("hide kw-surface:1");
  });

  it("does nothing the second time, or for a pane that never left", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const outside = await sent(runtime, pane.body);
    runtime.bringInside(outside);
    const calls = [...desktop.calls];
    runtime.bringInside(outside);
    runtime.bringInside(pane.body);
    runtime.bringInside(mountPane("never-left").body);
    expect(desktop.calls).toEqual(calls);
    expect(pane.slot.contains(pane.body)).toBe(true);
  });
});

describe("a window that closes underneath its pane", () => {
  it("brings the pane home and says so when the desktop reports it closed", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    let closed = 0;
    const outside = await sent(runtime, pane.body, { onClosed: () => (closed += 1) });
    desktop.emit({ kind: "closed", id: outside.id });
    desktop.emit({ kind: "closed", id: outside.id });
    expect(pane.slot.contains(pane.body)).toBe(true);
    expect(pane.body.ownerDocument).toBe(document);
    expect(closed).toBe(1);
    expect(runtime.outsidePaneOf(pane.field())).toBeUndefined();
    pane.button().click();
    expect(pane.button().textContent).toBe("pressed 1");
    runtime.bringInside(outside);
    expect(desktop.calls.filter((call) => call.startsWith("hide"))).toEqual([]);
  });

  it("brings the pane home while its page is still going away, ahead of the report", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    let closed = 0;
    const outside = await sent(runtime, pane.body, { onClosed: () => (closed += 1) });
    pane.button().click();
    outside.window.dispatchEvent(new Event("pagehide"));
    outside.window.close();
    desktop.emit({ kind: "closed", id: outside.id });
    expect(pane.slot.contains(pane.body)).toBe(true);
    expect(pane.button().textContent).toBe("pressed 1");
    expect(closed).toBe(1);
  });

  it("keeps the dying page styled until the pane has left it, so its scroll can be read", async () => {
    const style = document.createElement("style");
    style.textContent = ".kw-pane { overflow: auto; }";
    document.head.append(style);
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const outside = await sent(runtime, pane.body);
    const styledOnLeaving: boolean[] = [];
    const stylesOutside = () => outside.window.document.head.querySelector("style") !== null;
    pane.body.append(leavingWitness(() => styledOnLeaving.push(stylesOutside())));
    desktop.emit({ kind: "closed", id: outside.id });
    expect(styledOnLeaving).toEqual([true]);
    expect(stylesOutside()).toBe(false);
  });
});

describe("what a pane outside still shares with the console", () => {
  it("hears keys through the listeners that reach every window, until its window goes", async () => {
    const { desktop, runtime } = bench();
    const pane = mountPane("thread-7");
    const heard: string[] = [];
    cleanups.push(listenInEveryDocument("keydown", (event) => void heard.push(event.key), true));
    const outside = await sent(runtime, pane.body);
    press(pane.field(), "o");
    expect(openWindows()).toContain(outside.window);
    desktop.emit({ kind: "closed", id: outside.id });
    press(outside.window.document.body, "gone");
    press(pane.field(), "i");
    expect(heard).toEqual(["o", "i"]);
    expect(openWindows()).not.toContain(outside.window);
  });

  it("measures with the observer of the window it stands in, both ways and for late arrivals", async () => {
    const { runtime } = bench();
    const pane = mountPane("thread-7");
    const made: string[] = [];
    window.ResizeObserver = namedObserver("console", made);
    cleanups.push(observeSize(pane.body, () => undefined));
    const outside = await sent(runtime, pane.body);
    (outside.window as Realm).ResizeObserver = namedObserver("outside", made);
    runtime.bringInside(outside);
    await sent(runtime, pane.body);
    const late = document.createElement("div");
    cleanups.push(observeSize(late, () => undefined));
    pane.body.append(late);
    await turn();
    expect(made).toEqual(["console", "console", "outside", "console", "outside"]);
  });

  it("brings every pane home and closes its windows when disposed", async () => {
    const { desktop, runtime } = bench();
    const first = mountPane("thread-7");
    const second = mountPane("file-2");
    await sent(runtime, first.body);
    await sent(runtime, second.body);
    runtime.dispose();
    expect(first.slot.contains(first.body)).toBe(true);
    expect(second.slot.contains(second.body)).toBe(true);
    expect(desktop.opened.every((child) => child.closed)).toBe(true);
    await expect(runtime.sendOutside(first.body)).rejects.toBeInstanceOf(WindowRefused);
  });
});

function bench(options: FakeDesktopOptions = {}): {
  desktop: FakeDesktop;
  runtime: SurfaceRuntime;
} {
  const desktop = fakeDesktop(options);
  const runtime = createSurfaceRuntime(desktop.port, { open: desktop.open });
  cleanups.push(runtime.dispose, desktop.closeEverything);
  return { desktop, runtime };
}

async function sent(
  runtime: SurfaceRuntime,
  body: HTMLElement,
  sending?: Parameters<SurfaceRuntime["sendOutside"]>[1],
): Promise<OutsidePane> {
  const outside = await runtime.sendOutside(body, sending);
  if (outside === undefined) throw new Error("the pane stayed inside");
  return outside;
}

function mountPane(paneId: string) {
  let unmounts = 0;
  const slot = document.createElement("div");
  slot.className = "kw-slot";
  slot.setAttribute("data-pane-id", paneId);
  const body = document.createElement("div");
  slot.append(body);
  document.body.append(slot);
  cleanups.push(
    render(() => {
      const [presses, setPresses] = createSignal(0);
      onCleanup(() => (unmounts += 1));
      return (
        <section class="kw-frame">
          <button type="button" onClick={() => setPresses((count) => count + 1)}>
            <Show when={presses() > 0} fallback="rest">
              pressed {presses()}
            </Show>
          </button>
          <textarea />
        </section>
      );
    }, body),
  );
  return {
    slot,
    body,
    unmounts: () => unmounts,
    button: () => body.querySelector("button") as HTMLButtonElement,
    field: () => body.querySelector("textarea") as HTMLTextAreaElement,
  };
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function namedObserver(name: string, made: string[]): typeof ResizeObserver {
  class Named {
    constructor() {
      made.push(name);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  return Named as unknown as typeof ResizeObserver;
}
