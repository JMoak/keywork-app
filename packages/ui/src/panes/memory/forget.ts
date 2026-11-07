import type { Fetch } from "@keywork-app/client";
import {
  craftSection,
  type ForgetCounts,
  type ForgetSourceApplied,
  type ForgetSourcePlan,
  type ForgetSourcePreview,
  type ForgetSourceReport,
  type MemoryNote,
  type StagedItem,
} from "@keywork-app/protocol";
import { z } from "zod";

export type ForgetAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string };

export interface ForgetClient {
  preview(source: string): Promise<ForgetAnswer<ForgetSourcePlan>>;
  apply(source: string, digest: string): Promise<ForgetAnswer<ForgetSourceReport>>;
}

export interface ForgetCardView {
  readonly title: string;
  readonly tally: string;
  readonly sections: readonly ForgetCardSection[];
  readonly kept: readonly string[];
  readonly empty: boolean;
}

export interface ForgetCardSection {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly more: number;
}

export const forgetPreviewPath = "/memory/forget/preview";
export const forgetApplyPath = "/memory/forget/apply";
export const linesShown = 3;
export const botLayerPrefix = "bot:";
export const forgetKeysLine = "y forgets them · any other key keeps everything";
export const undoLine = "the ledger keeps it: u on this write in the ledger brings it all back";
export const nothingToForgetLine = "nothing in memory came from there";

export function forgetClient(fetch: Fetch): ForgetClient {
  return {
    preview: (source) =>
      post(fetch, forgetPreviewPath, { source }, previewSchema).then((reading) =>
        reading.ok ? { ok: true, value: reading.value.plan } : reading,
      ),
    apply: (source, digest) =>
      post(fetch, forgetApplyPath, { source, digest }, appliedSchema).then((reading) =>
        reading.ok ? { ok: true, value: reading.value.forgot } : reading,
      ),
  };
}

export function sourceOfNote(note: MemoryNote): string | undefined {
  const craftOwner = craftOwnerOf(note);
  if (craftOwner !== undefined) return `craft:${craftOwner}/${note.name}`;
  const origin = stringField(note.frontmatter.origin_source);
  if (origin !== undefined) return origin;
  const session = stringField(note.frontmatter.origin_session);
  return session === undefined ? undefined : `session:${session}`;
}

export function sourceOfStaged(item: StagedItem): string | undefined {
  return item.kind === "note" || item.kind === "daily" || item.kind === "moc"
    ? item.source
    : undefined;
}

export function isCraftNote(note: Pick<MemoryNote, "frontmatter">): boolean {
  return sectionOf(note.frontmatter) === craftSection;
}

export function craftOwnerOf(note: Pick<MemoryNote, "frontmatter" | "layer">): string | undefined {
  if (!isCraftNote(note) || !note.layer.startsWith(botLayerPrefix)) return undefined;
  return note.layer.slice(botLayerPrefix.length);
}

export function forgetCard(plan: ForgetSourcePlan): ForgetCardView {
  return {
    title: `Forget what came from ${plan.source}`,
    tally: tallyLine(plan.counts),
    sections: [
      section("notes", plan.notes, (note) => `${note.name} · ${note.firstLine}`),
      section("anchors", plan.anchors, (anchor) => `${anchor.note} · anchored ${anchor.at}`),
      section("edges", plan.edges, (edge) => `${edge.subject} ${edge.predicate} ${edge.object}`),
      section(
        "citations",
        plan.citations,
        (line) => `${line.kind} ${line.note} · ${line.timestamp}`,
      ),
      section("entries", plan.entries, (entry) => `${entry.date} ${entry.time} · ${entry.text}`),
      section("staged", plan.staged ?? [], (item) => `${item.target} · ${item.firstLine}`),
    ].filter((part) => part.lines.length > 0),
    kept: plan.kept.map((kept) => `${kept.note} stays · ${kept.reason}`),
    empty: plan.notes.length === 0 && plan.entries.length === 0 && (plan.staged ?? []).length === 0,
  };
}

export function tallyLine(counts: ForgetCounts): string {
  return [
    counted(counts.notes, "note"),
    counted(counts.anchors, "anchor"),
    counted(counts.edges, "edge"),
    counted(counts.citations, "citation"),
    counted(counts.entries, "entry", "entries"),
    ...((counts.staged ?? 0) > 0 ? [counted(counts.staged ?? 0, "staged item")] : []),
  ].join(", ");
}

export function forgotLine(report: ForgetSourceReport): string {
  return report.ledgerId === undefined
    ? nothingToForgetLine
    : `forgot ${report.source} · ${tallyLine(report.counts)}`;
}

export function refusedLine(reading: { status: number; detail: string }): string {
  if (reading.status === 409) return "memory moved since the dry run · run it again";
  if (noRouteStatuses.has(reading.status))
    return "Blocked: this node cannot forget by source yet. Next step: restart the server on a build with the forget routes.";
  return reading.detail;
}

const noRouteStatuses: ReadonlySet<number> = new Set([404, 405, 501]);

const countsSchema = z.object({
  notes: z.number(),
  anchors: z.number(),
  edges: z.number(),
  citations: z.number(),
  entries: z.number(),
  staged: z.number().optional(),
}) satisfies z.ZodType<ForgetCounts>;

const planSchema = z.object({
  source: z.string(),
  digest: z.string(),
  counts: countsSchema,
  notes: z.array(z.object({ name: z.string(), path: z.string(), firstLine: z.string() })),
  anchors: z.array(
    z.object({
      note: z.string(),
      at: z.string(),
      sha: z.string().optional(),
      checkpoint: z.string().optional(),
    }),
  ),
  edges: z.array(z.object({ subject: z.string(), predicate: z.string(), object: z.string() })),
  citations: z.array(
    z.object({
      note: z.string(),
      kind: z.enum(["recall", "citation"]),
      timestamp: z.string(),
      session: z.string().optional(),
    }),
  ),
  entries: z.array(
    z.object({ id: z.string(), date: z.string(), time: z.string(), text: z.string() }),
  ),
  staged: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["note", "daily", "moc"]),
        target: z.string(),
        for: z.string(),
        firstLine: z.string(),
      }),
    )
    .optional(),
  kept: z.array(z.object({ note: z.string(), reason: z.string() })),
}) satisfies z.ZodType<ForgetSourcePlan>;

const previewSchema = z.object({ plan: planSchema }) satisfies z.ZodType<ForgetSourcePreview>;

const appliedSchema = z.object({
  forgot: z.object({ source: z.string(), counts: countsSchema, ledgerId: z.string().optional() }),
}) satisfies z.ZodType<ForgetSourceApplied>;

async function post<T>(
  fetch: Fetch,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<ForgetAnswer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return { ok: false, status: 0, detail: cause instanceof Error ? cause.message : String(cause) };
  }
  const payload = parseJson(await response.text());
  if (!response.ok) {
    return { ok: false, status: response.status, detail: errorOf(payload) ?? response.statusText };
  }
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        status: response.status,
        detail: `POST ${path} answered a shape this pane cannot read`,
      };
}

function section<T>(
  heading: string,
  items: readonly T[],
  line: (item: T) => string,
): ForgetCardSection {
  return {
    heading,
    lines: items.slice(0, linesShown).map(line),
    more: Math.max(0, items.length - linesShown),
  };
}

function counted(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorOf(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return undefined;
  const error = (payload as { error: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

function sectionOf(frontmatter: unknown): unknown {
  if (typeof frontmatter !== "object" || frontmatter === null) return undefined;
  return (frontmatter as { section?: unknown }).section;
}
