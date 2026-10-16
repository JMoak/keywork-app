import type { PermissionRule, RememberedScope } from "@keywork-app/protocol";
import { z } from "zod";
import type { Fingerprint } from "./fingerprint.ts";

export interface AcceptedRule {
  readonly rule: PermissionRule;
  readonly scope: RememberedScope;
}

export interface PostureRecord {
  readonly version: 1;
  readonly settled?: Fingerprint | undefined;
  readonly noticed?: Fingerprint | undefined;
  readonly accepted: readonly AcceptedRule[];
}

export type PostureStorage = Pick<Storage, "getItem" | "setItem">;

export const postureStorageKey = (workspace: string): string => `keywork.posture:${workspace}`;

export const blankRecord: PostureRecord = { version: 1, accepted: [] };

export function rememberedPosture(storage: PostureStorage | undefined, key: string): PostureRecord {
  try {
    const stored = storage?.getItem(key);
    const parsed = recordSchema.safeParse(stored == null ? undefined : JSON.parse(stored));
    return parsed.success ? parsed.data : blankRecord;
  } catch {
    return blankRecord;
  }
}

export function rememberPosture(
  storage: PostureStorage | undefined,
  key: string,
  record: PostureRecord,
): void {
  try {
    storage?.setItem(key, JSON.stringify(record));
  } catch {}
}

const fingerprintSchema = z.object({
  version: z.string(),
  manifests: z.array(z.string()),
  mcp: z.array(z.string()),
  bots: z.array(z.string()),
});

const recordSchema = z.object({
  version: z.literal(1),
  settled: fingerprintSchema.optional(),
  noticed: fingerprintSchema.optional(),
  accepted: z.array(
    z.object({
      rule: z.object({
        action: z.string().min(1),
        resource: z.string().min(1),
        effect: z.literal("allow"),
      }),
      scope: z.enum(["session", "workspace"]),
    }),
  ),
});
