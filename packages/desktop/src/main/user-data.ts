import { join, resolve } from "node:path";
import type { ProductProfile } from "@keywork-app/product";

export const userDataDirSwitch = "user-data-dir";
export const userDataDirVariable = "KEYWORK_USER_DATA_DIR";
export const devProfileSuffix = "-dev";

export interface UserDataSources {
  appData(): string;
  switchValue: string;
  environment: NodeJS.ProcessEnv;
  packaged: boolean;
}

export interface UserDataApp {
  getPath(name: "appData"): string;
  readonly isPackaged: boolean;
  readonly commandLine: { getSwitchValue(name: string): string };
}

export function userDataDirFor(sources: UserDataSources, profile: ProductProfile): string {
  const explicit = [sources.switchValue, sources.environment[userDataDirVariable]].find(named);
  if (explicit !== undefined) return resolve(explicit);
  return join(sources.appData(), profileFolderOf(profile, sources.packaged));
}

export function userDataSourcesOf(
  app: UserDataApp,
  environment: NodeJS.ProcessEnv,
): UserDataSources {
  return {
    appData: () => app.getPath("appData"),
    switchValue: app.commandLine.getSwitchValue(userDataDirSwitch),
    environment,
    packaged: app.isPackaged,
  };
}

function profileFolderOf(profile: ProductProfile, packaged: boolean): string {
  return packaged ? profile.userDataName : `${profile.userDataName}${devProfileSuffix}`;
}

function named(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}
