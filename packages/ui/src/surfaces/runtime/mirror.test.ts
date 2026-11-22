import { afterEach, describe, expect, it } from "vitest";
import { gallery, keyworkNight } from "../../theme/themes.ts";
import { applyTheme } from "../../theme/variables.ts";
import { type Mirror, mirrorDocument, StylesheetRefused } from "./mirror.ts";
import type { Realm } from "./realm.ts";
import { openChild, serveStylesheets, turn } from "./testing.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.replaceChildren();
  document.body.replaceChildren();
  for (const name of document.documentElement.getAttributeNames()) {
    document.documentElement.removeAttribute(name);
  }
  for (const name of document.body.getAttributeNames()) document.body.removeAttribute(name);
});

describe("what the theme sets on the page", () => {
  it("copies the attributes, classes and inline style of html and body", () => {
    applyTheme(keyworkNight);
    document.documentElement.lang = "en";
    document.body.className = "kw-console quiet";
    const child = mirrored().child;
    const root = child.document.documentElement;
    expect(root.getAttribute("style")).toBe(document.documentElement.getAttribute("style"));
    expect(root.style.getPropertyValue("--kw-background")).toBe(keyworkNight.tokens.background);
    expect(root.dataset.theme).toBe(keyworkNight.name);
    expect(root.dataset.appearance).toBe(keyworkNight.appearance);
    expect(root.lang).toBe("en");
    expect(child.document.body.className).toBe("kw-console quiet");
  });

  it("follows a change of theme, and drops what the console drops", async () => {
    applyTheme(keyworkNight);
    document.documentElement.setAttribute("data-leaving", "");
    const child = mirrored().child;
    const other = otherTheme();
    applyTheme(other);
    document.documentElement.removeAttribute("data-leaving");
    document.body.classList.add("worn");
    await turn();
    const root = child.document.documentElement;
    expect(root.dataset.theme).toBe(other.name);
    expect(root.style.getPropertyValue("--kw-background")).toBe(other.tokens.background);
    expect(root.getAttribute("style")).toBe(document.documentElement.getAttribute("style"));
    expect(root.hasAttribute("data-leaving")).toBe(false);
    expect(child.document.body.classList.contains("worn")).toBe(true);
  });
});

describe("the stylesheets of the console", () => {
  it("clones every style element in order, with its attributes", () => {
    const first = styleOf(".a { color: var(--kw-text); }", { "data-vite-dev-id": "/src/a.css" });
    const second = styleOf(".b { color: var(--kw-accent); }", { media: "screen" });
    const child = mirrored().child;
    const clones = stylesIn(child);
    expect(clones.map((clone) => clone.textContent)).toEqual([
      first.textContent,
      second.textContent,
    ]);
    expect(clones[0]?.getAttribute("data-vite-dev-id")).toBe("/src/a.css");
    expect(clones[1]?.getAttribute("media")).toBe("screen");
  });

  it("adds a style where the console put it, and removes one the console removed", async () => {
    const first = styleOf(".first {}");
    const last = styleOf(".last {}");
    const child = mirrored().child;
    const ahead = document.createElement("style");
    ahead.textContent = ".ahead {}";
    document.head.insertBefore(ahead, first);
    const between = document.createElement("style");
    between.textContent = ".between {}";
    document.head.insertBefore(between, last);
    styleOf(".after {}");
    await turn();
    expect(textsIn(child)).toEqual([
      ".ahead {}",
      ".first {}",
      ".between {}",
      ".last {}",
      ".after {}",
    ]);
    first.remove();
    between.remove();
    await turn();
    expect(textsIn(child)).toEqual([".ahead {}", ".last {}", ".after {}"]);
  });

  it("leaves alone what the head of the child holds of its own", async () => {
    styleOf(".mirrored {}");
    const child = mirrored().child;
    const own = child.document.createElement("style");
    own.textContent = ".own {}";
    child.document.head.prepend(own);
    styleOf(".later {}");
    await turn();
    expect(textsIn(child)).toEqual([".own {}", ".mirrored {}", ".later {}"]);
  });

  it("clones a stylesheet link by its absolute address and settles once it has loaded", async () => {
    const served = stylesheetServer();
    linkTo("/assets/app.css");
    const { child, mirror } = mirrored();
    let settled = false;
    void mirror.settled.then(() => {
      settled = true;
    });
    const clone = child.document.head.querySelector("link") as HTMLLinkElement;
    expect(clone.getAttribute("href")).toBe(absolute("/assets/app.css"));
    expect(clone.rel).toBe("stylesheet");
    await turn();
    expect(settled).toBe(false);
    served.answer(absolute("/assets/app.css"), ".app {}");
    await mirror.settled;
    expect(settled).toBe(true);
  });

  it("refuses to settle when a stylesheet cannot load in the child", async () => {
    stylesheetServer();
    linkTo("/assets/missing.css");
    const { child, mirror } = mirrored();
    child.document.head.querySelector("link")?.dispatchEvent(new Event("error"));
    await expect(mirror.settled).rejects.toBeInstanceOf(StylesheetRefused);
  });

  it("stops following and takes its clones away when disposed", async () => {
    styleOf(".kept {}");
    const { child, mirror } = mirrored();
    mirror.dispose();
    styleOf(".ignored {}");
    document.documentElement.setAttribute("data-theme", "later");
    await turn();
    expect(textsIn(child)).toEqual([]);
    expect(child.document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("fonts", () => {
  it("loads in the child the faces the console has loaded, and no others", async () => {
    const loaded = face("JetBrains Mono", "loaded");
    const unused = face("Source Serif 4", "unloaded");
    setFonts(document, [loaded.face, unused.face]);
    const child = openChild();
    cleanups.push(() => child.close());
    const twinLoaded = face("JetBrains Mono", "unloaded");
    const twinUnused = face("Source Serif 4", "unloaded");
    setFonts(child.document, [twinLoaded.face, twinUnused.face]);
    const mirror = mirrorDocument(document, child.document);
    cleanups.push(mirror.dispose);
    await mirror.settled;
    expect(twinLoaded.loads()).toBe(1);
    expect(twinUnused.loads()).toBe(0);
  });
});

function mirrored(): { child: Realm; mirror: Mirror } {
  const child = openChild();
  const mirror = mirrorDocument(document, child.document);
  cleanups.push(mirror.dispose, () => child.close());
  return { child, mirror };
}

function otherTheme() {
  const other = gallery.find((theme) => theme.name !== keyworkNight.name);
  if (other === undefined) throw new Error("the gallery holds a single theme");
  return other;
}

function styleOf(text: string, attributes: Record<string, string> = {}): HTMLStyleElement {
  const style = document.createElement("style");
  for (const [name, value] of Object.entries(attributes)) style.setAttribute(name, value);
  style.textContent = text;
  document.head.append(style);
  return style;
}

function linkTo(href: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.setAttribute("href", href);
  document.head.append(link);
  return link;
}

function absolute(path: string): string {
  return new URL(path, location.href).href;
}

function stylesIn(child: Realm): HTMLStyleElement[] {
  return [...child.document.head.querySelectorAll("style")];
}

function textsIn(child: Realm): Array<string | null> {
  return stylesIn(child).map((style) => style.textContent);
}

function stylesheetServer() {
  const waiting = new Map<string, Array<(css: string | undefined) => void>>();
  cleanups.push(
    serveStylesheets(
      (url) => new Promise((resolve) => waiting.set(url, [...(waiting.get(url) ?? []), resolve])),
    ),
  );
  return {
    answer: (url: string, css: string | undefined): void => {
      for (const resolve of waiting.get(url) ?? []) resolve(css);
    },
  };
}

function face(family: string, status: FontFaceLoadStatus) {
  let loads = 0;
  const fake = {
    family,
    style: "normal",
    weight: "100 800",
    stretch: "normal",
    unicodeRange: "U+0-FF",
    status,
    load: async () => {
      loads += 1;
      return fake;
    },
  };
  return { face: fake as unknown as FontFace, loads: () => loads };
}

function setFonts(page: Document, faces: readonly FontFace[]): void {
  const fonts = Object.assign(new EventTarget(), {
    [Symbol.iterator]: () => faces[Symbol.iterator](),
  });
  Object.defineProperty(page, "fonts", { value: fonts, configurable: true });
  cleanups.push(() => Reflect.deleteProperty(page, "fonts"));
}
