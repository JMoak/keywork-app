import type { Fetch } from "@keywork-app/client";
import { z } from "zod";
import type { HostPort } from "../host/port.ts";
import { hostFetch } from "../host/transport.ts";
import type { ModelChoice, ModelClass } from "./models.ts";
import { errorOf, type ServerReading, type Substrate } from "./workshop.ts";

export interface CreatureRequest {
  readonly name: string;
  readonly skin: string;
  readonly substrate?: Substrate;
  readonly models?: Partial<Readonly<Record<ModelClass, ModelChoice>>>;
}

export interface WorkshopRequest {
  readonly creature: string;
  readonly substrate: Substrate;
}

export interface CreatureMade {
  readonly slug: string;
  readonly name: string;
}

export interface CoatPatch {
  readonly body: { readonly seed: number };
}

export interface OnboardingClient {
  workshops(): Promise<ServerReading>;
  substrates?(): Promise<ServerReading>;
  creatures?(): Promise<ServerReading>;
  models(): Promise<ServerReading>;
  createCreature(request: CreatureRequest): Promise<ServerReading>;
  patchCreature?(slug: string, patch: CoatPatch): Promise<ServerReading>;
  createWorkshop(request: WorkshopRequest): Promise<ServerReading>;
  readCreature(slug: string): Promise<ServerReading>;
}

export interface CreatureOnTheStead {
  readonly slug: string;
  readonly name: string;
  readonly seed: number | undefined;
}

export const onboardingPaths = {
  workshops: "/workshops",
  substrates: "/workshops/substrates",
  models: "/models",
  creatures: "/creatures",
  creature: (slug: string): string => `/creatures/${encodeURIComponent(slug)}`,
} as const;

export function onboardingClientFor(host: HostPort, workspace: string): OnboardingClient {
  return onboardingClientOver(hostFetch(host, workspace));
}

export function onboardingClientOver(transport: Fetch): OnboardingClient {
  const get = (path: string): Promise<ServerReading> => transport(path).then(readingOf);
  const send = (method: string, path: string, body: unknown): Promise<ServerReading> =>
    transport(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(readingOf);
  const post = (path: string, body: unknown): Promise<ServerReading> => send("POST", path, body);
  return {
    workshops: () => get(onboardingPaths.workshops),
    substrates: () => get(onboardingPaths.substrates),
    creatures: () => get(onboardingPaths.creatures),
    models: () => get(onboardingPaths.models),
    createCreature: (request) => post(onboardingPaths.creatures, request),
    patchCreature: (slug, patch) => send("PATCH", onboardingPaths.creature(slug), patch),
    createWorkshop: (request) => post(onboardingPaths.workshops, request),
    readCreature: (slug) => get(onboardingPaths.creature(slug)),
  };
}

export function creaturesOnTheStead(reading: ServerReading): CreatureOnTheStead[] {
  if (reading.status !== 200) return [];
  const parsed = creatureListing.safeParse(reading.body);
  if (!parsed.success) return [];
  const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.creatures;
  return rows.map((row) => ({ slug: row.slug, name: row.name, seed: row.seed }));
}

const creatureRow = z
  .object({ slug: z.string(), name: z.string(), seed: z.number().optional() })
  .loose();

const creatureListing = z.union([
  z.object({ creatures: z.array(creatureRow) }).loose(),
  z.array(creatureRow),
]);

export function workshopOwnersOnTheNode(reading: ServerReading): string[] {
  if (reading.status !== 200) return [];
  const parsed = workshopListing.safeParse(reading.body);
  if (!parsed.success) return [];
  return parsed.data.workshops.map((row) => row.creature ?? slugBeforeTheHash(row.id));
}

const workshopListing = z
  .object({
    workshops: z.array(z.object({ id: z.string(), creature: z.string().optional() }).loose()),
  })
  .loose();

function slugBeforeTheHash(workshopId: string): string {
  const cut = workshopId.lastIndexOf("-");
  return cut <= 0 ? workshopId : workshopId.slice(0, cut);
}

export function creatureMadeOf(reading: ServerReading): CreatureMade | undefined {
  if (reading.status !== 201) return undefined;
  const parsed = z.object({ slug: z.string(), name: z.string() }).loose().safeParse(reading.body);
  return parsed.success ? { slug: parsed.data.slug, name: parsed.data.name } : undefined;
}

export function conversationOf(reading: ServerReading): string | undefined {
  if (reading.status !== 200) return undefined;
  const parsed = z.object({ conversation: z.string() }).loose().safeParse(reading.body);
  return parsed.success ? parsed.data.conversation : undefined;
}

export function refusalOf(reading: ServerReading): string {
  return errorOf(reading.body) ?? `the server answered ${reading.status}`;
}

async function readingOf(response: Response): Promise<ServerReading> {
  const text = await response.text();
  return { status: response.status, body: parseBody(text) };
}

function parseBody(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
