import type { Fetch } from "@keywork-app/client";
import { z } from "zod";
import { unreadableAnswer } from "./copy.ts";
import {
  type ChoreFile,
  type ChoreNeed,
  type ChoreRow,
  type CreatureRow,
  choreNeedSchema,
  choreRowSchema,
  creatureRowSchema,
  type NotificationSettings,
  type RunRow,
  runRowSchema,
} from "./wire.ts";

export type Answer<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly status: number; readonly error: string };

export interface PutChore {
  readonly row: ChoreRow;
  readonly created: boolean;
}

export interface MintedHook {
  readonly token: string;
  readonly path: string;
}

export interface ChoresPort {
  creatures(): Promise<Answer<readonly CreatureRow[]>>;
  chores(creature: string): Promise<Answer<readonly ChoreRow[]>>;
  runs(creature: string, id: string): Promise<Answer<readonly RunRow[]>>;
  put(creature: string, file: ChoreFile): Promise<Answer<PutChore>>;
  run(creature: string, id: string): Promise<Answer<RunRow>>;
  cancel(creature: string, id: string): Promise<Answer<RunRow>>;
  accept(creature: string, id: string, digest: string): Promise<Answer<ChoreRow>>;
  remove(creature: string, id: string): Promise<Answer<ChoreRow>>;
  mintHook(creature: string, id: string): Promise<Answer<MintedHook>>;
  needsYou(): Promise<Answer<readonly ChoreNeed[]>>;
  notificationSettings(): Promise<NotificationSettings | undefined>;
}

export const runsShown = 20;

export const needsYouPath = "/routines/needs-you";

export function choresOverFetch(fetch: Fetch): ChoresPort {
  const exchange = exchangeOver(fetch);
  return {
    creatures: () => exchange("/creatures", read, creaturesBody, (body) => body.creatures),
    needsYou: () => exchange(needsYouPath, read, needsBody, (body) => body.items),
    chores: (creature) => exchange(choresPath(creature), read, choresBody, (body) => body.routines),
    runs: (creature, id) =>
      exchange(
        `${chorePath(creature, id)}/runs?limit=${runsShown}`,
        read,
        runsBody,
        (body) => body.runs,
      ),
    put: (creature, file) =>
      exchange(chorePath(creature, file.id), sending("PUT", file), putBody, (body) => ({
        row: body.routine,
        created: body.created,
      })),
    run: (creature, id) =>
      exchange(`${chorePath(creature, id)}/run`, sending("POST"), runBody, (body) => body.run),
    cancel: (creature, id) =>
      exchange(`${chorePath(creature, id)}/cancel`, sending("POST"), runBody, (body) => body.run),
    accept: (creature, id, digest) =>
      exchange(
        `${chorePath(creature, id)}/accept`,
        sending("POST", { digest }),
        choreBody,
        (body) => body.routine,
      ),
    remove: (creature, id) =>
      exchange(chorePath(creature, id), sending("DELETE"), removedBody, (body) => body.removed),
    mintHook: (creature, id) =>
      exchange(`${chorePath(creature, id)}/hook`, sending("POST"), hookBody, (body) => body),
    notificationSettings: async () => undefined,
  };
}

export function choresPath(creature: string): string {
  return `/creatures/${encodeURIComponent(creature)}/routines`;
}

export function chorePath(creature: string, id: string): string {
  return `${choresPath(creature)}/${encodeURIComponent(id)}`;
}

const creaturesBody = z.object({ creatures: z.array(creatureRowSchema) });
const choresBody = z.object({ routines: z.array(choreRowSchema) });
const choreBody = z.object({ routine: choreRowSchema });
const putBody = z.object({ routine: choreRowSchema, created: z.boolean() });
const removedBody = z.object({ removed: choreRowSchema });
const hookBody = z.object({ token: z.string(), path: z.string() });
const runBody = z.object({ run: runRowSchema });
const runsBody = z.object({ runs: z.array(runRowSchema) });
const needsBody = z.object({ items: z.array(choreNeedSchema) });
const errorBody = z.object({ error: z.string() });

const read: RequestInit = { method: "GET" };

function sending(method: "POST" | "PUT" | "DELETE", body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

type Exchange = <Body, Value>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<Body>,
  pick: (body: Body) => Value,
) => Promise<Answer<Value>>;

function exchangeOver(fetch: Fetch): Exchange {
  return async (path, init, schema, pick) => {
    let response: Response;
    try {
      response = await fetch(path, init);
    } catch (cause) {
      return { ok: false, status: 0, error: messageOf(cause) };
    }
    const body = await jsonOf(response);
    const parsed = schema.safeParse(body);
    if (parsed.success) return { ok: true, value: pick(parsed.data) };
    return { ok: false, status: response.status, error: refusalOf(response, body, path) };
  };
}

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function refusalOf(response: Response, body: unknown, path: string): string {
  const stated = errorBody.safeParse(body);
  if (stated.success) return stated.data.error;
  if (response.ok) return unreadableAnswer(path);
  return `${response.status} ${response.statusText}`.trim();
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
