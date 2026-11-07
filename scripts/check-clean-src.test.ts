import { describe, expect, it } from "vitest";
import { strayDeclaration } from "./check-clean-src.ts";

describe("check:clean-src", () => {
  it("flags declaration files and their maps under a package's src and nothing else", () => {
    expect(strayDeclaration("packages/ui/src/panes/stead/copy.d.ts")).toBe(true);
    expect(strayDeclaration("packages/habitat/src/index.d.ts.map")).toBe(true);
    expect(strayDeclaration("packages/ui/dist/src/panes/stead/copy.d.ts")).toBe(false);
    expect(strayDeclaration("packages/ui/src/panes/stead/copy.ts")).toBe(false);
    expect(strayDeclaration("packages/protocol/src/global.d.ts")).toBe(true);
  });
});
