import { draftProblems } from "./copy.ts";
import type {
  ChoreDestination,
  ChoreFile,
  ChoreGrant,
  ChoreTrigger,
  DestinationKind,
  NotifyChoice,
  ToolPosture,
  TriggerKind,
} from "./wire.ts";

export interface ChoreDraft {
  id: string;
  title: string;
  instructions: string;
  trigger: TriggerKind;
  cron: string;
  tz: string;
  until: string;
  every: string;
  at: string;
  paths: string;
  eventName: string;
  where: string;
  destination: DestinationKind;
  thread: string;
  path: string;
  notify: NotifyChoice;
  tools: ToolPosture;
  grants: string;
  usd: string;
  minutes: string;
  enabled: boolean;
}

export type DraftReading =
  | { readonly ok: true; readonly file: ChoreFile }
  | { readonly ok: false; readonly problem: string };

export const choreIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const longestInterval = 7 * 24 * 60;

export function blankDraft(zone: string): ChoreDraft {
  return {
    id: "",
    title: "",
    instructions: "",
    trigger: "cron",
    cron: "0 9 * * 1-5",
    tz: zone,
    until: "",
    every: "60",
    at: "",
    paths: "",
    eventName: "",
    where: "",
    destination: "conversation",
    thread: "",
    path: "",
    notify: "only-when-needs-me",
    tools: "read-only",
    grants: "",
    usd: "0.50",
    minutes: "10",
    enabled: true,
  };
}

export function draftOf(file: ChoreFile, zone: string): ChoreDraft {
  const { trigger, destination } = file;
  return {
    ...blankDraft(zone),
    id: file.id,
    title: file.title,
    instructions: file.instructions,
    trigger: trigger.kind,
    ...(trigger.kind === "cron" && {
      cron: trigger.expr,
      tz: trigger.tz,
      until: trigger.until ?? "",
    }),
    ...(trigger.kind === "interval" && {
      every: String(trigger.minutes),
      until: trigger.until ?? "",
    }),
    ...(trigger.kind === "at" && { at: trigger.at }),
    ...(trigger.kind === "file-watch" && { paths: trigger.paths.join("\n") }),
    ...(trigger.kind === "event" && {
      eventName: trigger.name,
      where: Object.entries(trigger.where)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("\n"),
    }),
    destination: destination.kind,
    ...(destination.kind === "thread" && { thread: destination.name }),
    ...(destination.kind === "file" && { path: destination.path }),
    notify: file.notify,
    tools: file.tools,
    grants: file.grants.map((grant) => `${grant.action} ${grant.resource}`).join("\n"),
    usd: String(file.budget.usd),
    minutes: String(file.budget.minutes),
    enabled: file.enabled,
  };
}

export function idFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

export function choreFileOf(draft: ChoreDraft): DraftReading {
  const title = draft.title.trim();
  const instructions = draft.instructions.trim();
  const id = draft.id.trim() === "" ? idFromTitle(title) : draft.id.trim();
  const trigger = triggerOf(draft);
  const destination = destinationOf(draft);
  const grants = draft.tools === "read-only" ? [] : grantsOf(draft.grants);
  const usd = Number(draft.usd);
  const minutes = Number(draft.minutes);
  if (title === "") return refused("title");
  if (instructions === "") return refused("instructions");
  if (!choreIdPattern.test(id)) return refused("id");
  if (trigger === undefined) return refused(triggerProblems[draft.trigger]);
  if (destination === undefined) return refused(draft.destination === "thread" ? "thread" : "path");
  if (grants === undefined) return refused("grant");
  if (!(usd > 0)) return refused("usd");
  if (!Number.isInteger(minutes) || minutes < 1) return refused("minutes");
  return {
    ok: true,
    file: {
      id,
      title,
      instructions,
      trigger,
      destination,
      notify: draft.notify,
      tools: draft.tools,
      grants,
      budget: { usd, minutes },
      enabled: draft.enabled,
    },
  };
}

function refused(problem: keyof typeof draftProblems): DraftReading {
  return { ok: false, problem: draftProblems[problem] };
}

const triggerProblems: Readonly<Record<TriggerKind, keyof typeof draftProblems>> = {
  cron: "cron",
  interval: "every",
  manual: "cron",
  at: "at",
  "file-watch": "paths",
  webhook: "cron",
  event: "event",
};

export const defaultDebounceMs = 2_000;
export const defaultHookBytes = 64 * 1024;

function triggerOf(draft: ChoreDraft): ChoreTrigger | undefined {
  switch (draft.trigger) {
    case "cron": {
      const [expr, tz, until] = [draft.cron.trim(), draft.tz.trim(), draft.until.trim()];
      if (expr === "" || tz === "") return undefined;
      return { kind: "cron", expr, tz, ...(until !== "" && { until }) };
    }
    case "interval": {
      const minutes = Number(draft.every);
      const until = draft.until.trim();
      const whole = Number.isInteger(minutes) && minutes >= 1 && minutes <= longestInterval;
      return whole ? { kind: "interval", minutes, ...(until !== "" && { until }) } : undefined;
    }
    case "manual":
      return { kind: "manual" };
    case "at": {
      const at = draft.at.trim();
      return at === "" || Number.isNaN(Date.parse(at)) ? undefined : { kind: "at", at };
    }
    case "file-watch": {
      const paths = lines(draft.paths);
      return paths.length === 0
        ? undefined
        : { kind: "file-watch", paths, debounceMs: defaultDebounceMs };
    }
    case "webhook":
      return { kind: "webhook", maxBytes: defaultHookBytes };
    case "event": {
      const name = draft.eventName.trim();
      if (name === "") return undefined;
      return { kind: "event", name, where: whereOf(draft.where), debounceMs: 0 };
    }
  }
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function whereOf(text: string): Record<string, string | number | boolean | null> {
  const where: Record<string, string | number | boolean | null> = {};
  for (const line of lines(text)) {
    const at = line.indexOf("=");
    if (at <= 0) continue;
    where[line.slice(0, at).trim()] = literalOf(line.slice(at + 1).trim());
  }
  return where;
}

function literalOf(text: string): string | number | boolean | null {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return text !== "" && !Number.isNaN(Number(text)) ? Number(text) : text;
}

function destinationOf(draft: ChoreDraft): ChoreDestination | undefined {
  switch (draft.destination) {
    case "conversation":
      return { kind: "conversation" };
    case "thread": {
      const name = draft.thread.trim();
      return name === "" ? undefined : { kind: "thread", name };
    }
    case "file": {
      const path = draft.path.trim();
      return path === "" ? undefined : { kind: "file", path };
    }
  }
}

function grantsOf(text: string): ChoreGrant[] | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const grants: ChoreGrant[] = [];
  for (const line of lines) {
    const [, action, resource] = line.match(/^(\S+)\s+(.+)$/) ?? [];
    if (action === undefined || resource === undefined) return undefined;
    grants.push({ action, resource: resource.trim() });
  }
  return grants;
}
