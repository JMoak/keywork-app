import { describe, expect, it } from "vitest";
import {
  isRendererPage,
  rendererPageArgument,
  rendererPageOf,
  servesRendererPage,
} from "./renderer-page.ts";

const built = "file:///C:/Program%20Files/keywork/resources/app.asar/out/renderer/index.html";
const devServer = "http://localhost:5173";

describe("the app's own renderer page", () => {
  it("is the built index.html whatever its query, fragment or percent-encoding", () => {
    expect(isRendererPage(built, built)).toBe(true);
    expect(isRendererPage(`${built}?companion=1`, built)).toBe(true);
    expect(isRendererPage(`${built}#pane`, built)).toBe(true);
    expect(
      isRendererPage(
        "file:///c:/Program Files/keywork/resources/app.asar/out/renderer/index.html",
        built,
      ),
    ).toBe(true);
  });

  it("is never another file, another scheme or a remote origin", () => {
    expect(isRendererPage(built.replace("index.html", "probe.html"), built)).toBe(false);
    expect(isRendererPage("file:///C:/Users/me/Downloads/index.html", built)).toBe(false);
    expect(isRendererPage("https://example.com/out/renderer/index.html", built)).toBe(false);
    expect(isRendererPage("data:text/html,<p>hi</p>", built)).toBe(false);
    expect(isRendererPage("about:blank", built)).toBe(false);
    expect(isRendererPage("", built)).toBe(false);
  });

  it("keeps drive letters case-sensitive nowhere but on a Windows drive path", () => {
    const posix = "file:///opt/keywork/out/renderer/index.html";
    expect(isRendererPage("file:///opt/keywork/out/renderer/index.html", posix)).toBe(true);
    expect(isRendererPage("file:///OPT/keywork/out/renderer/index.html", posix)).toBe(false);
  });

  it("is any page of the dev server's origin while developing, and nothing else", () => {
    expect(isRendererPage("http://localhost:5173/", devServer)).toBe(true);
    expect(isRendererPage("http://localhost:5173/?companion", devServer)).toBe(true);
    expect(isRendererPage("http://localhost:5174/", devServer)).toBe(false);
    expect(isRendererPage("https://localhost:5173/", devServer)).toBe(false);
    expect(isRendererPage(built, devServer)).toBe(false);
  });

  it("refuses everything when the page itself is not a url", () => {
    expect(isRendererPage(built, "not a url")).toBe(false);
  });
});

describe("handing the page to a preload", () => {
  it("round-trips through one command-line switch", () => {
    const argv = ["electron", "--type=renderer", rendererPageArgument(built)];
    expect(rendererPageOf(argv)).toBe(built);
    expect(rendererPageOf(["electron"])).toBeUndefined();
  });

  it("serves the page only when the switch names it and the location matches", () => {
    const argv = [rendererPageArgument(built)];
    expect(servesRendererPage(argv, `${built}?companion=1`)).toBe(true);
    expect(servesRendererPage(argv, "https://example.com/rig-test")).toBe(false);
    expect(servesRendererPage([], built)).toBe(false);
  });
});
