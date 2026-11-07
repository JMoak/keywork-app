import { z } from "zod";
import { hostLimitation, installStep, noWorkshopsServed } from "./copy.ts";

export const substrates = ["sbx", "host"] as const;

export type Substrate = (typeof substrates)[number];

export interface ServerReading {
  readonly status: number;
  readonly body: unknown;
}

export interface WorkshopSupport {
  readonly served: boolean;
  readonly substrates: readonly Substrate[];
  readonly detail: string | undefined;
}

export interface WorkshopChoice {
  readonly substrate: Substrate;
  readonly limitation: string | undefined;
  readonly installStep: string | undefined;
}

export function workshopSupportOf(reading: ServerReading): WorkshopSupport {
  if (reading.status !== 200) {
    return { served: false, substrates: [], detail: errorOf(reading.body) };
  }
  const report = reportSchema.safeParse(reading.body);
  if (report.success) return supportFromReport(report.data.substrates);
  const listing = listingSchema.safeParse(reading.body);
  if (!listing.success) return { served: false, substrates: [], detail: "unreadable listing" };
  const seen = new Set<Substrate>(["host"]);
  for (const kind of listing.data.substrates ?? []) seen.add(kind);
  for (const workshop of listing.data.workshops) seen.add(workshop.substrate);
  return {
    served: true,
    substrates: substrates.filter((kind) => seen.has(kind)),
    detail: undefined,
  };
}

export function substrateReportServed(reading: ServerReading): boolean {
  return reading.status === 200 && reportSchema.safeParse(reading.body).success;
}

function supportFromReport(rows: readonly SubstrateRow[]): WorkshopSupport {
  const supported = new Set<string>(rows.filter((row) => row.supported).map((row) => row.kind));
  return {
    served: true,
    substrates: substrates.filter((kind) => supported.has(kind)),
    detail: undefined,
  };
}

const substrateRowSchema = z.object({ kind: z.string(), supported: z.boolean() }).loose();
type SubstrateRow = z.output<typeof substrateRowSchema>;

const reportSchema = z.object({
  substrates: z.array(substrateRowSchema),
  preferred: z.string().nullable(),
});

export function workshopChoiceOf(support: WorkshopSupport): WorkshopChoice {
  if (support.substrates.includes("sbx")) {
    return { substrate: "sbx", limitation: undefined, installStep: undefined };
  }
  return {
    substrate: "host",
    limitation: support.served ? hostLimitation : noWorkshopsServed(support.detail),
    installStep,
  };
}

export function workshopChoices(support: WorkshopSupport): Substrate[] {
  return support.substrates.includes("sbx") ? ["sbx", "host"] : ["host"];
}

export function errorOf(body: unknown): string | undefined {
  const parsed = z.object({ error: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

const listingSchema = z.object({
  workshops: z.array(z.object({ substrate: z.enum(substrates) }).loose()),
  substrates: z.array(z.enum(substrates)).optional(),
});
