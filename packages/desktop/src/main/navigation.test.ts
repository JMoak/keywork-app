import { describe, expect, it } from "vitest";
import { isRendererPage } from "../shared/renderer-page.ts";
import {
  leavingSurfaceVerdict,
  navigationVerdict,
  redirectVerdict,
  windowOpenVerdict,
} from "./navigation.ts";
import { stopUrl } from "./screen/indicator.ts";

const app = "file:///C:/keywork/out/renderer/index.html";
const isAppPage = (url: string) => isRendererPage(url, app);
const banner = "data:text/html;charset=utf-8,<main>sharing</main>";

describe("a navigation the app window starts", () => {
  it("hands a link in a reply to the browser and keeps the window on the app", () => {
    expect(navigationVerdict("https://example.com/rig-test", app, isAppPage)).toEqual({
      kind: "hand-off",
      url: "https://example.com/rig-test",
    });
    expect(navigationVerdict("http://example.org/bare", app, isAppPage)).toEqual({
      kind: "hand-off",
      url: "http://example.org/bare",
    });
  });

  it("follows only the app's own page", () => {
    expect(navigationVerdict(`${app}?companion=1`, app, isAppPage)).toEqual({ kind: "follow" });
  });

  it("refuses every other page, scheme or local file, and hands none of them on", () => {
    for (const target of [
      "file:///C:/keywork/out/renderer/probe.html",
      "file:///C:/Users/me/workspace/notes.md",
      "javascript:alert(1)",
      "data:text/html,<script>keyworkHost</script>",
      "about:blank",
      "mailto:someone@example.com",
      "keywork://open?path=C:/work",
      "not a url",
    ]) {
      expect(navigationVerdict(target, app, isAppPage)).toEqual({ kind: "refuse" });
    }
  });
});

describe("a navigation any other page starts", () => {
  it("is refused, even back to the app, and never reaches the browser", () => {
    expect(navigationVerdict(app, "https://example.com/", isAppPage)).toEqual({ kind: "refuse" });
    expect(
      navigationVerdict("https://example.com/next", "https://example.com/", isAppPage),
    ).toEqual({ kind: "refuse" });
  });

  it("leaves the sharing banner's own stop link to the banner", () => {
    expect(navigationVerdict(stopUrl, banner, isAppPage)).toEqual({ kind: "refuse" });
  });
});

describe("a new window", () => {
  it("never opens in the app: a web link from the app goes to the browser", () => {
    expect(windowOpenVerdict("https://example.com/", app, isAppPage)).toEqual({
      kind: "hand-off",
      url: "https://example.com/",
    });
  });

  it("is refused outright for anything else or from any other page", () => {
    expect(windowOpenVerdict("about:blank", app, isAppPage)).toEqual({ kind: "refuse" });
    expect(windowOpenVerdict(app, app, isAppPage)).toEqual({ kind: "refuse" });
    expect(windowOpenVerdict("https://example.com/", banner, isAppPage)).toEqual({
      kind: "refuse",
    });
  });
});

describe("a pane leaving the window", () => {
  it("is admitted as a blank window the app page opens under a pane name", () => {
    expect(windowOpenVerdict("about:blank", app, isAppPage, "kw-surface:1")).toEqual({
      kind: "surface",
    });
    expect(
      windowOpenVerdict("about:blank", `${app}?thread=7`, isAppPage, "kw-surface:pool-12"),
    ).toEqual({ kind: "surface" });
  });

  it("is refused under any other name, and a pane name admits no other page", () => {
    for (const frameName of ["", "_blank", "surface:1", "kw-surfaces", " kw-surface:1"]) {
      expect(windowOpenVerdict("about:blank", app, isAppPage, frameName)).toEqual({
        kind: "refuse",
      });
    }
    for (const target of [app, "about:srcdoc", "about:blank#x", "data:text/html,<p>", "blob:x"]) {
      expect(windowOpenVerdict(target, app, isAppPage, "kw-surface:1")).toEqual({
        kind: "refuse",
      });
    }
  });

  it("still sends a web link to the browser whatever the window is named", () => {
    expect(windowOpenVerdict("https://example.com/", app, isAppPage, "kw-surface:1")).toEqual({
      kind: "hand-off",
      url: "https://example.com/",
    });
  });

  it("is refused to every page but the app's own", () => {
    for (const opener of [banner, "about:blank", "https://example.com/"]) {
      expect(windowOpenVerdict("about:blank", opener, isAppPage, "kw-surface:1")).toEqual({
        kind: "refuse",
      });
    }
  });
});

describe("a pane outside the window", () => {
  it("never navigates and never opens a window: a web link goes to the browser", () => {
    expect(leavingSurfaceVerdict("https://example.com/rig-test")).toEqual({
      kind: "hand-off",
      url: "https://example.com/rig-test",
    });
  });

  it("refuses everything else, the app's page and another pane included", () => {
    for (const target of [app, "about:blank", "file:///C:/notes.md", "javascript:alert(1)"]) {
      expect(leavingSurfaceVerdict(target)).toEqual({ kind: "refuse" });
    }
  });
});

describe("a server redirect", () => {
  it("may land only on the app's own page", () => {
    expect(redirectVerdict(app, isAppPage)).toEqual({ kind: "follow" });
    expect(redirectVerdict("https://example.com/", isAppPage)).toEqual({ kind: "refuse" });
  });
});
