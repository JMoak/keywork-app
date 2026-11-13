import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./lib/repo-files.ts";
import {
  checksumLine,
  requireReleaseTag,
  sdkAssetName,
  sdkManifest,
  sdkReleasePin,
} from "./pack-sdk.ts";

describe("the distributable desktop SDK", () => {
  it("keeps external runtime dependencies while removing source workspace links", () => {
    const manifest = sdkManifest(
      {
        version: "0.2.0",
        dependencies: { "@keywork-app/ui": "workspace:*", "node-pty": "1.1.0" },
        devDependencies: { electron: "45.2.3" },
      },
      "a".repeat(40),
    );
    expect(manifest).toMatchObject({
      name: "@jmoak/keywork-desktop",
      version: "0.2.0",
      exports: { ".": { types: "./index.d.ts", import: "./out/main/runtime.js" } },
      dependencies: { "node-pty": "1.1.0" },
      peerDependencies: { electron: "45.2.3" },
      gitHead: "a".repeat(40),
      publishConfig: { access: "public", provenance: true },
    });
    expect(JSON.stringify(manifest)).not.toContain("workspace:");
  });
});

describe("the SDK release asset", () => {
  const sha256 = "5c6025a66d5b606b7b87274d2ee0b680d76437e70262416f715aee8fa29a806a";
  const asset = "sdk-5c6025a66d5b.tgz";
  const build = { version: "0.2.1", engine: "0.2.1", contract: "1.27", electron: "45.2.3" };

  it("is named by its checksum beside a sha256sum-compatible checksum file", () => {
    expect(sdkAssetName(sha256)).toBe(asset);
    expect(checksumLine(sha256, asset)).toBe(`${sha256}  ${asset}\n`);
  });

  it("prints the pin a consumer's manifest needs: repository, release tag, asset and checksum", () => {
    expect(sdkReleasePin(build, sha256)).toEqual({
      sha256,
      source: { repository: "JMoak/keywork-app", tag: "v0.2.1", asset },
      ...build,
    });
  });

  it("refuses a release tag that does not name the desktop version", () => {
    expect(() => requireReleaseTag("v0.2.1", "0.2.1")).not.toThrow();
    expect(() => requireReleaseTag("v0.2.2", "0.2.1")).toThrow(/tag v0\.2\.1 instead/);
    expect(() => requireReleaseTag("0.2.1", "0.2.1")).toThrow(/tag v0\.2\.1 instead/);
  });

  it("is packed on a tag, uploaded under the names the pack script gives it, and published", () => {
    const workflow = readFileSync(join(repoRoot, ".github", "workflows", "release.yml"), "utf8");
    const uploads = [...workflow.matchAll(/^\s+(dist\/sdk\/\S+?)\r?$/gm)].map((match) =>
      match[1]?.replace("*", sha256.slice(0, 12)),
    );
    expect(uploads).toEqual([`dist/sdk/${asset}`, `dist/sdk/${asset}.sha256`]);
    expect(workflow).toContain(
      `bun scripts/pack-sdk.ts --expect-tag '\${{ needs.plan.outputs.tag }}'`,
    );
    expect(workflow).toContain("needs: [plan, verify]");
    expect(workflow).toContain("needs: [plan, build, sdk]");
    expect(workflow).toContain("needs: [plan, sdk]");
  });
});
