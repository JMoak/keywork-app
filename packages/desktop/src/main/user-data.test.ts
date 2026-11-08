import { join, resolve } from "node:path";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { type UserDataSources, userDataDirFor, userDataDirVariable } from "./user-data.ts";

const appData = resolve("roaming");
const launch = (overrides: Partial<UserDataSources> = {}): UserDataSources => ({
  appData,
  switchValue: "",
  environment: {},
  ...overrides,
});

describe("userDataDirFor", () => {
  it("falls back to the product's folder under appData, which the installed console uses", () => {
    expect(userDataDirFor(launch(), steadProfile)).toBe(join(appData, "stead"));
    expect(userDataDirFor(launch(), keyworkProfile)).toBe(join(appData, "keywork"));
  });

  it("honours --user-data-dir before the product default", () => {
    const scratch = resolve("scratch", "profile");
    expect(userDataDirFor(launch({ switchValue: scratch }), steadProfile)).toBe(scratch);
  });

  it(`honours ${userDataDirVariable} when no switch names a folder`, () => {
    const scratch = resolve("scratch", "from-env");
    const environment = { [userDataDirVariable]: scratch };
    expect(userDataDirFor(launch({ environment }), steadProfile)).toBe(scratch);
  });

  it("prefers the switch to the environment", () => {
    const fromSwitch = resolve("scratch", "switch");
    const environment = { [userDataDirVariable]: resolve("scratch", "env") };
    expect(userDataDirFor(launch({ switchValue: fromSwitch, environment }), steadProfile)).toBe(
      fromSwitch,
    );
  });

  it("treats blank values as unset", () => {
    const environment = { [userDataDirVariable]: "  " };
    expect(userDataDirFor(launch({ switchValue: " ", environment }), steadProfile)).toBe(
      join(appData, "stead"),
    );
  });

  it("makes a relative folder absolute against the working directory", () => {
    expect(userDataDirFor(launch({ switchValue: "dev-profile" }), steadProfile)).toBe(
      resolve("dev-profile"),
    );
  });
});
