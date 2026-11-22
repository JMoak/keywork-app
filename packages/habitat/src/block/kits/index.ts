import type { Kit } from "../kit.ts";
import { decoKit } from "./deco/index.ts";
import { lanternKit } from "./lantern/index.ts";
import { neonKit } from "./neon/index.ts";
import { terraceKit } from "./terrace/index.ts";

export { decoKit, lanternKit, neonKit, terraceKit };

export const kits: readonly Kit[] = [neonKit, lanternKit, terraceKit, decoKit];

export const firstKit: Kit = neonKit;

export function kitNamed(id: string): Kit | undefined {
  return kits.find((kit) => kit.id === id);
}
