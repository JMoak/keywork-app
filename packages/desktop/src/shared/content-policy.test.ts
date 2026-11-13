import { describe, expect, it } from "vitest";
import { contentPolicyPlugin, rendererContentPolicy } from "./content-policy.ts";

const directives = new Map(
  rendererContentPolicy.split("; ").map((directive) => {
    const [name = "", ...sources] = directive.split(" ");
    return [name, sources];
  }),
);

describe("the renderer's content security policy", () => {
  it("runs only the app's own scripts: no inline, no eval, no remote origin", () => {
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(rendererContentPolicy).not.toContain("unsafe-eval");
    expect(rendererContentPolicy).not.toMatch(/https?:/);
  });

  it("frames, embeds, forms and base rewrites nothing", () => {
    expect(directives.get("frame-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
  });

  it("reaches the network only through the page's own origin, since main relays the server", () => {
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(directives.get("default-src")).toEqual(["'self'"]);
  });

  it("keeps what the renderer draws with: injected theme styles, inline images and fonts", () => {
    expect(directives.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(directives.get("font-src")).toEqual(["'self'", "data:"]);
  });

  it("is written into the page head ahead of every script", () => {
    const plugin = contentPolicyPlugin();
    const transform = plugin.transformIndexHtml as () => unknown;
    expect(transform()).toEqual([
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: rendererContentPolicy },
        injectTo: "head-prepend",
      },
    ]);
  });
});
