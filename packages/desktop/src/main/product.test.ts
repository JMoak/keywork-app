import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { windowTitle } from "./product.ts";

const builder = readFileSync(
  join(import.meta.dirname, "../../electron-builder.yml"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("the product name", () => {
  it("names the workspace folder a window shows ahead of the product", () => {
    expect(windowTitle(0, keyworkProfile, "C:\\work\\rig-sample")).toBe("rig-sample · keywork");
    expect(windowTitle(2, steadProfile, "/home/me/garden/")).toBe("(2) garden · stead");
    expect(windowTitle(0, keyworkProfile, "C:\\")).toBe("C: · keywork");
  });

  it("keeps two immutable product profiles with separate OS identities and feeds", () => {
    expect(keyworkProfile.startup).toBe("ide");
    expect(steadProfile.startup).toBe("creature");
    for (const profile of [keyworkProfile, steadProfile]) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.updateFeed)).toBe(true);
    }
    for (const field of ["appId", "userDataName", "protocolScheme", "screenKillChord"] as const) {
      expect(keyworkProfile[field]).not.toBe(steadProfile[field]);
    }
    expect(keyworkProfile.updateFeed.repo).toBe("keywork-app");
    expect(steadProfile.updateFeed.repo).toBe("stead");
  });

  it("keeps the canonical packaged identity and artifact name", () => {
    expect(builder).toMatch(new RegExp(`^productName: ${keyworkProfile.name}$`, "m"));
    expect(builder).toMatch(new RegExp(`^appId: ${keyworkProfile.appId}$`, "m"));
    expect(builder).toMatch(
      /^artifactName: \$\{productName\}-app-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}$/m,
    );
  });

  it("carries the keywork sidecar as a resource, never inside the asar", () => {
    expect(builder).toMatch(/^extraResources:\n {2}- from: sidecar\n {4}to: sidecar$/m);
  });
});
