import { describe, expect, it } from "vitest";
import { sdkManifest } from "./pack-sdk.ts";

describe("the distributable desktop SDK", () => {
  it("keeps external runtime dependencies while removing source workspace links", () => {
    const manifest = sdkManifest({
      version: "0.2.0",
      dependencies: { "@keywork-app/ui": "workspace:*", "node-pty": "1.1.0" },
      devDependencies: { electron: "45.2.3" },
    });
    expect(manifest).toMatchObject({
      name: "@jmoak/keywork-desktop",
      version: "0.2.0",
      exports: { ".": { types: "./index.d.ts", import: "./out/main/runtime.js" } },
      dependencies: { "node-pty": "1.1.0" },
      peerDependencies: { electron: "45.2.3" },
    });
    expect(JSON.stringify(manifest)).not.toContain("workspace:");
  });
});
