import { describe, expect, it } from "vitest";
import { isRendererPage } from "../shared/renderer-page.ts";
import { navigationVerdict, redirectVerdict, windowOpenVerdict } from "./navigation.ts";
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

describe("a server redirect", () => {
  it("may land only on the app's own page", () => {
    expect(redirectVerdict(app, isAppPage)).toEqual({ kind: "follow" });
    expect(redirectVerdict("https://example.com/", isAppPage)).toEqual({ kind: "refuse" });
  });
});
