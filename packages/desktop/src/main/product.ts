import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { HostAbout } from "./host.ts";
import { expectedServerVersion } from "./serve-process.ts";

export interface AboutBox {
  title: string;
  message: string;
  detail: string;
}

export function windowTitle(needsYou: number, profile: ProductProfile = keyworkProfile): string {
  return needsYou === 0 ? profile.name : `(${needsYou}) ${profile.name}`;
}

export function aboutBox(about: HostAbout, profile: ProductProfile = keyworkProfile): AboutBox {
  return {
    title: `About ${profile.name}`,
    message: `${profile.name} ${about.version}`,
    detail: `keywork ${expectedServerVersion} inside · ${about.shell} on ${about.platform}`,
  };
}
