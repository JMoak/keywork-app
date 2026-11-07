import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { aboutBox, windowTitle } from "./product.ts";
import { expectedServerVersion } from "./serve-process.ts";

const builder = readFileSync(
  join(import.meta.dirname, "../../electron-builder.yml"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("the product name", () => {
  it("titles a console window keywork, with the needs-you count in front when something waits", () => {
    expect(windowTitle(0)).toBe("keywork");
    expect(windowTitle(3)).toBe("(3) keywork");
  });

  it("says keywork in the about box and names the keywork engine inside", () => {
    const box = aboutBox({ shell: "electron", platform: "win32", version: "0.1.0" });
    expect(box.title).toBe("About keywork");
    expect(box.message).toBe("keywork 0.1.0");
    expect(box.detail).toBe(`keywork ${expectedServerVersion} inside · electron on win32`);
  });

  it("uses an explicitly selected Stead name in native titles and dialogs", () => {
    expect(windowTitle(2, steadProfile)).toBe("(2) stead");
    expect(
      aboutBox({ shell: "electron", platform: "linux", version: "0.1.0" }, steadProfile).title,
    ).toBe("About stead");
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

  it("builds the canonical targets for Windows, macOS and Linux", () => {
    expect(builder).toMatch(/^win:\n {2}target: nsis$/m);
    expect(builder).toMatch(/^mac:\n {2}target: dmg$/m);
    expect(builder).toMatch(/^linux:\n {2}target:\n {4}- AppImage\n {4}- deb$/m);
  });

  it("carries the keywork sidecar as a resource, never inside the asar", () => {
    expect(builder).toMatch(/^extraResources:\n {2}- from: sidecar\n {4}to: sidecar$/m);
  });
});
