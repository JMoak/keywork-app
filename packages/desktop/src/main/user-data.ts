import { join, resolve } from "node:path";
import type { ProductProfile } from "@keywork-app/product";

export const userDataDirSwitch = "user-data-dir";
export const userDataDirVariable = "KEYWORK_USER_DATA_DIR";

export interface UserDataSources {
  appData: string;
  switchValue: string;
  environment: NodeJS.ProcessEnv;
}

export function userDataDirFor(sources: UserDataSources, profile: ProductProfile): string {
  const explicit = [sources.switchValue, sources.environment[userDataDirVariable]].find(named);
  return explicit === undefined ? join(sources.appData, profile.userDataName) : resolve(explicit);
}

function named(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}
