import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { HostAbout } from "./host.ts";
import { bundledEngineVersion } from "./serve-process.ts";

export interface AboutBox {
  title: string;
  message: string;
  detail: string;
}

export function windowTitle(
  needsYou: number,
  profile: ProductProfile = keyworkProfile,
  workspace?: string,
): string {
  const named =
    workspace === undefined ? profile.name : `${folderName(workspace)} · ${profile.name}`;
  return needsYou === 0 ? named : `(${needsYou}) ${named}`;
}

export function folderName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? path
  );
}

export function aboutBox(about: HostAbout, profile: ProductProfile = keyworkProfile): AboutBox {
  return {
    title: `About ${profile.name}`,
    message: `${profile.name} ${about.version}`,
    detail: `keywork ${bundledEngineVersion} inside · ${about.shell} on ${about.platform}`,
  };
}
