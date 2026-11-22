import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { shareDelegatedEvents } from "./delegation.ts";
import type { Realm } from "./realm.ts";
import { openChild } from "./testing.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

describe("Solid's delegated events in a second document", () => {
  it("fires a transplanted component's click handler in the child document", () => {
    const child = secondWindow();
    cleanups.push(shareDelegatedEvents(child.document));
    const clicks = clickCounter();
    clicks.button().click();
    child.document.body.append(clicks.host);
    clicks.button().click();
    document.body.append(clicks.host);
    clicks.button().click();
    expect(clicks.count()).toBe(3);
  });

  it("reaches the child for an event a lazily loaded pane module delegates later", async () => {
    const child = secondWindow();
    cleanups.push(shareDelegatedEvents(child.document));
    const host = document.createElement("div");
    child.document.body.append(host);
    const { LazyPane } = await import("./lazy-pane-testing.tsx");
    let picked = 0;
    cleanups.push(render(() => <LazyPane onPicked={() => (picked += 1)} />, host));
    host.querySelector(".lazy")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(picked).toBe(1);
  });

  it("shares with every child document, and stops sharing with one that is let go", () => {
    const first = secondWindow();
    const second = secondWindow();
    const stopFirst = shareDelegatedEvents(first.document);
    cleanups.push(shareDelegatedEvents(second.document));
    const clicks = clickCounter();
    first.document.body.append(clicks.host);
    clicks.button().click();
    second.document.body.append(clicks.host);
    clicks.button().click();
    stopFirst();
    first.document.body.append(clicks.host);
    clicks.button().click();
    expect(clicks.count()).toBe(2);
  });
});

function secondWindow(): Realm {
  const child = openChild();
  cleanups.push(() => child.close());
  return child;
}

function clickCounter() {
  let count = 0;
  const host = document.createElement("div");
  document.body.append(host);
  cleanups.push(
    render(
      () => (
        <button type="button" onClick={() => (count += 1)}>
          go
        </button>
      ),
      host,
    ),
  );
  return {
    host,
    count: () => count,
    button: () => host.querySelector("button") as HTMLButtonElement,
  };
}
