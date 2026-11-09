import { join, resolve } from "node:path";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import {
  devProfileSuffix,
  type UserDataApp,
  type UserDataSources,
  userDataDirFor,
  userDataDirVariable,
  userDataSourcesOf,
} from "./user-data.ts";

const appData = resolve("roaming");
const launch = (overrides: Partial<UserDataSources> = {}): UserDataSources => ({
  appData: () => appData,
  switchValue: "",
  environment: {},
  packaged: true,
  ...overrides,
});

describe("userDataDirFor", () => {
  it("falls back to the product's folder under appData, which the installed console uses", () => {
    expect(userDataDirFor(launch(), steadProfile)).toBe(join(appData, "stead"));
    expect(userDataDirFor(launch(), keyworkProfile)).toBe(join(appData, "keywork"));
  });

  it(`gives an unpackaged build the product's ${devProfileSuffix} folder, never the installed console's`, () => {
    const unpackaged = launch({ packaged: false });
    expect(userDataDirFor(unpackaged, steadProfile)).toBe(join(appData, "stead-dev"));
    expect(userDataDirFor(unpackaged, keyworkProfile)).toBe(join(appData, "keywork-dev"));
  });

  it("lets an explicit folder win over the dev default too", () => {
    const scratch = resolve("scratch", "profile");
    expect(userDataDirFor(launch({ packaged: false, switchValue: scratch }), steadProfile)).toBe(
      scratch,
    );
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

describe("userDataSourcesOf", () => {
  const noAppData: UserDataApp = {
    getPath: () => {
      throw new Error("the roaming AppData folder does not exist on this home");
    },
    isPackaged: false,
    commandLine: { getSwitchValue: () => "" },
  };

  it("never reads the default folder when a folder is named, so a scratch home without AppData starts", () => {
    const named: UserDataApp = { ...noAppData, commandLine: { getSwitchValue: () => "scratch" } };
    expect(userDataDirFor(userDataSourcesOf(named, {}), steadProfile)).toBe(resolve("scratch"));
    expect(
      userDataDirFor(userDataSourcesOf(noAppData, { KEYWORK_USER_DATA_DIR: "env" }), steadProfile),
    ).toBe(resolve("env"));
  });

  it("reads the default folder only when nothing names one", () => {
    const reading: UserDataApp = { ...noAppData, getPath: () => appData };
    expect(userDataDirFor(userDataSourcesOf(reading, {}), keyworkProfile)).toBe(
      join(appData, `keywork${devProfileSuffix}`),
    );
    expect(() => userDataDirFor(userDataSourcesOf(noAppData, {}), keyworkProfile)).toThrow(
      "AppData",
    );
  });
});
