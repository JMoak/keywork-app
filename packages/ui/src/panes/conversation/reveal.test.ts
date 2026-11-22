import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reveal } from "../../shell/needs-you-jumps.ts";
import { askItem } from "../../shell/needs-you-testing.ts";
import { revealWhatWaits } from "./reveal.ts";

const disposers: Array<() => void> = [];
const nativeScroll = Element.prototype.scrollIntoView;

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  Element.prototype.scrollIntoView = nativeScroll;
  document.body.innerHTML = "";
});

describe("revealing what waits in a conversation", () => {
  it("scrolls the ask card into view and hands it the keys", async () => {
    const page = transcript();
    const harness = revealing(page);
    harness.reveal({ item: askItem("c2"), pane: "p1", seq: 1 });
    const card = page.querySelector<HTMLElement>("[data-call-id='c2']");
    expect(harness.scrolled()).toEqual([card]);
    await Promise.resolve();
    expect(document.activeElement).toBe(card);
  });

  it("waits for the card to be painted, then reveals each jump once", () => {
    const page = document.body.appendChild(document.createElement("div"));
    const harness = revealing(page);
    harness.reveal({ item: askItem("c1"), pane: "p1", seq: 1 });
    expect(harness.scrolled()).toEqual([]);
    page.append(card("c1"));
    harness.paint();
    harness.paint();
    expect(harness.scrolled()).toHaveLength(1);
    harness.reveal({ item: askItem("c1"), pane: "p1", seq: 2 });
    expect(harness.scrolled()).toHaveLength(2);
  });
});

function revealing(page: HTMLElement) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const scrolled: Element[] = [];
    const scroll = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Element.prototype.scrollIntoView = scroll;
    const [request, reveal] = createSignal<Reveal>();
    const [painted, paint] = createSignal(0);
    revealWhatWaits({ pane: () => "p1", root: () => page, revealing: request, painted });
    return {
      reveal,
      paint: () => paint((count) => count + 1),
      scrolled: () => [...scrolled],
    };
  });
}

function transcript(): HTMLElement {
  const page = document.body.appendChild(document.createElement("div"));
  page.append(card("c1"), notice("first failure"), card("c2"), notice("latest failure"));
  page.lastElementChild?.setAttribute("data-latest", "");
  return page;
}

function card(callId: string): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.callId = callId;
  fieldset.tabIndex = -1;
  return fieldset;
}

function notice(text: string): HTMLElement {
  const line = document.createElement("p");
  line.className = "kw-notice";
  line.dataset.level = "error";
  line.textContent = text;
  return line;
}
