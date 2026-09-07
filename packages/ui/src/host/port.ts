export interface HostPort {
  about(): Promise<HostAbout>;
}

export interface HostAbout {
  shell: "electron" | "browser";
  platform: string;
  version: string;
}

export const hostGlobal = "keyworkHost";

export function hostFromWindow(): HostPort | undefined {
  const candidate = (globalThis as Record<string, unknown>)[hostGlobal];
  return isHostPort(candidate) ? candidate : undefined;
}

function isHostPort(candidate: unknown): candidate is HostPort {
  return typeof candidate === "object" && candidate !== null && "about" in candidate;
}
