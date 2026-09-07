import type { HostPort } from "./port.ts";

export function browserHost(): HostPort {
  return {
    about: async () => ({ shell: "browser", platform: navigator.platform, version: "dev" }),
  };
}
