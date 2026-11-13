import { describe, expect, it } from "vitest";
import {
  publicationDistTag,
  sdkNotification,
  sdkPackage,
  verifyRegistryIdentity,
  verifySdkContents,
} from "./publish-sdk.ts";

const publication = {
  version: "0.3.1",
  sourceSha: "a".repeat(40),
  engine: "0.2.3",
  contract: "1.27",
  electron: "45.2.3",
};
const manifest = { name: sdkPackage, version: publication.version, gitHead: publication.sourceSha };
const build = { version: "0.3.1", engine: "0.2.3", contract: "1.27", electron: "45.2.3" };
const dist = {
  tarball: "https://registry.npmjs.org/@jmoak/keywork-desktop/-/keywork-desktop-0.3.1.tgz",
  integrity: `sha512-${"a".repeat(86)}==`,
  attestations: { provenance: { predicateType: "https://slsa.dev/provenance/v1" } },
};

describe("verified npm SDK identity", () => {
  it("accepts the exact published source with SHA-512 integrity and provenance", () => {
    expect(verifyRegistryIdentity({ ...manifest, dist }, publication)).toEqual({
      tarball: dist.tarball,
      integrity: dist.integrity,
    });
    expect(() => verifySdkContents(manifest, build, publication)).not.toThrow();
  });

  it.each([
    { name: "another-package" },
    { version: "0.3.0" },
    { gitHead: "b".repeat(40) },
    { dist: { ...dist, tarball: "https://other.example/sdk.tgz" } },
    { dist: { ...dist, integrity: "sha1-invalid" } },
    { dist: { ...dist, attestations: undefined } },
  ])("rejects registry identity changes: %j", (change) => {
    expect(() => verifyRegistryIdentity({ ...manifest, dist, ...change }, publication)).toThrow();
  });

  it.each(["version", "engine", "contract", "electron"] as const)(
    "rejects a tarball with a different %s",
    (field) => {
      expect(() =>
        verifySdkContents(manifest, { ...build, [field]: "different" }, publication),
      ).toThrow(`different ${field}`);
    },
  );

  it("rejects package metadata that disagrees with the registry source", () => {
    expect(() =>
      verifySdkContents({ ...manifest, gitHead: "b".repeat(40) }, build, publication),
    ).toThrow("immutable package identity");
  });

  it("keeps an older recovery publication from replacing npm's latest", () => {
    expect(publicationDistTag("0.3.1")).toBe("latest");
    expect(publicationDistTag("0.3.1", "0.3.0")).toBe("latest");
    expect(publicationDistTag("0.3.1", "0.4.0")).toBe("release-0.3.1");
    expect(() => publicationDistTag("0.3.1", "broken")).toThrow("invalid latest");
  });

  it("notifies Stead with the verified release identity and compatibility tuple", () => {
    expect(sdkNotification(publication)).toEqual({
      event_type: "keywork-sdk-published",
      client_payload: publication,
    });
  });
});
