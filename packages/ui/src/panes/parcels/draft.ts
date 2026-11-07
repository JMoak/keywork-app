import { type Cap, type CapKind, capKinds, type GrantDraft } from "./wire.ts";

export const dayMs = 86_400_000;

export interface DraftFields {
  readonly creature: string;
  readonly caps: string;
  readonly expiry: string;
}

export interface DraftContext {
  readonly target: string;
  readonly selfId: string | undefined;
  readonly parcels: ReadonlyMap<string, string>;
  readonly now: number;
  readonly offsetMinutes: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

export const creatureSlug = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function grantDraftOf(fields: DraftFields, context: DraftContext): Parsed<GrantDraft> {
  const subject = subjectOf(fields.creature, context);
  if (!subject.ok) return subject;
  const caps = capsOf(fields.caps);
  if (!caps.ok) return caps;
  const expiresAt = expiryOf(fields.expiry, context.now, context.offsetMinutes);
  if (!expiresAt.ok) return expiresAt;
  return {
    ok: true,
    value: {
      subject: subject.value,
      target: context.target,
      caps: caps.value,
      expiresAt: expiresAt.value,
    },
  };
}

export function subjectOf(
  text: string,
  context: Pick<DraftContext, "selfId" | "parcels">,
): Parsed<GrantDraft["subject"]> {
  const [creature = "", machine] = text.trim().split("@");
  if (!creatureSlug.test(creature)) {
    return refused("creature: a slug such as wren, lowercase letters, digits and dashes");
  }
  if (machine === undefined) {
    return context.selfId === undefined
      ? refused(
          `creature: this machine is not listed yet; name its parcel as ${creature}@<machine>`,
        )
      : { ok: true, value: { creature, node: context.selfId } };
  }
  const node = context.parcels.get(machine);
  return node === undefined
    ? refused(`creature: no parcel is named ${machine}`)
    : { ok: true, value: { creature, node } };
}

export function capsOf(text: string): Parsed<Cap[]> {
  const clauses = text
    .split(";")
    .map((clause) => clause.trim())
    .filter((clause) => clause !== "");
  if (clauses.length === 0) return refused("caps: name at least one, such as exec bun");
  const caps: Cap[] = [];
  for (const clause of clauses) {
    const cap = capOf(clause);
    if (!cap.ok) return cap;
    caps.push(cap.value);
  }
  return { ok: true, value: caps };
}

export function expiryOf(text: string, now: number, offsetMinutes: number): Parsed<string> {
  const said = text.trim();
  const at = spanFrom(said, now) ?? clockTimeFrom(said, now, offsetMinutes) ?? Date.parse(said);
  if (Number.isNaN(at)) return refused("until: say 30m, 2h, 1d or a time such as 18:00");
  if (at <= now) return refused(`until: ${said} has already passed`);
  return { ok: true, value: new Date(at).toISOString() };
}

function capOf(clause: string): Parsed<Cap> {
  const [kind = "", ...rest] = clause.split(/\s+/);
  if (!isCapKind(kind)) {
    return refused(`caps: ${kind} is not a cap; use ${capKinds.join(", ")}`);
  }
  const items = listOf(rest.join(" "));
  switch (kind) {
    case "files:read":
    case "files:write":
      return items.length === 0
        ? refused(`caps: ${kind} needs at least one path`)
        : accepted({ kind, paths: items });
    case "exec":
      return items.length === 0
        ? refused("caps: exec needs at least one command")
        : accepted({ kind, commands: items });
    default:
      return items.length === 0 ? accepted({ kind }) : refused(`caps: ${kind} takes no list`);
  }
}

function listOf(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

function spanFrom(text: string, now: number): number | undefined {
  const match = text.match(/^(\d+)\s*([mhd])$/);
  const unit = match?.[2];
  if (unit !== "m" && unit !== "h" && unit !== "d") return undefined;
  return now + Number(match?.[1]) * unitMs[unit];
}

function clockTimeFrom(text: string, now: number, offsetMinutes: number): number | undefined {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match === null) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  const offsetMs = offsetMinutes * 60_000;
  const local = new Date(now + offsetMs);
  const today =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours, minutes) -
    offsetMs;
  return today > now ? today : today + dayMs;
}

function isCapKind(kind: string): kind is CapKind {
  return (capKinds as readonly string[]).includes(kind);
}

function accepted<T>(value: T): Parsed<T> {
  return { ok: true, value };
}

function refused<T>(problem: string): Parsed<T> {
  return { ok: false, problem };
}
