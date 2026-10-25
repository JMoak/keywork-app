import {
  type ArcSummary,
  type BotSummary,
  isSurfaceRefusal,
  surfaceSlug,
  type WorkspaceChoice,
} from "@keywork-app/protocol";
import { describeFailure, type WorkspaceOpen } from "../host/port.ts";
import { closeOutcomeLine, unnamedArcLine } from "../panes/arcs/index.tsx";
import { botLabel } from "../panes/bots/index.tsx";
import type { KeyHints, PaneKind } from "../panes/index.ts";
import { noWorkingSession } from "../panes/overview/working-session.ts";
import { workspaceAside } from "../panes/workspaces/index.tsx";
import type { SessionStore } from "../shell/session-store.ts";
import type { ArgumentChoice, CommandSpec } from "./commands.ts";

export interface SurfaceCommandSeams {
  readonly store: SessionStore;
  readonly keys: KeyHints;
  workingSession(): string | undefined;
  summon(kind: PaneKind, action?: string, argument?: string): void;
  showBotSession(name: string): boolean;
  openSession(sessionId: string): void;
  reopen(): Promise<WorkspaceOpen>;
  say(text: string): void;
}

export function surfaceCommands(seams: SurfaceCommandSeams): CommandSpec[] {
  return [...arcCommands(seams), ...botCommands(seams), ...workspaceCommands(seams)];
}

export function botJumps(seams: SurfaceCommandSeams): CommandSpec[] {
  return seams.store.surfaces.state.bots.map((bot) => ({
    name: `bot-${bot.name}`,
    label: botLabel(bot),
    description: bot.description ?? "open a session as this bot",
    jump: true as const,
    run: () => void openBotSession(seams, bot.name),
  }));
}

export function suggestedArcSlug(title: string | undefined, taken: readonly string[]): string {
  const fromTitle = title === undefined || isPlaceholderTitle(title) ? "" : slugOf(title);
  if (surfaceSlug.test(fromTitle) && !taken.includes(fromTitle)) return fromTitle;
  for (let ordinal = taken.length + 1; ; ordinal += 1) {
    const candidate = `arc-${ordinal}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

function arcCommands(seams: SurfaceCommandSeams): CommandSpec[] {
  const arcs = () => seams.store.surfaces.state.arcs;
  const bound = () => seams.store.summary(seams.workingSession())?.arc;
  const described = (arc: ArcSummary): ArgumentChoice => ({
    value: arc.slug,
    description: arcLine(arc, bound()),
  });
  const active = () =>
    arcs()
      .filter((arc) => arc.status === "active")
      .map(described);
  const unbound = (): ArgumentChoice => ({
    value: "none",
    description: seams.store.surfaces.state.notices.arcs ?? noArcLine(bound(), active().length),
  });
  return [
    {
      name: "arc",
      aliases: ["workstream"],
      description: "bind this session to an arc, or open the arcs pane",
      argument: { hint: "[slug|none]", choices: () => [...active(), unbound()] },
      run: (slug) => {
        if (slug === undefined) seams.summon("arcs");
        else void switchArc(seams, slug === "none" ? null : slug);
      },
    },
    {
      name: "arc-new",
      aliases: ["workstream-new", "ws-new"],
      description: "start an arc and bind this session to it",
      argument: { hint: "[slug]" },
      run: (slug) => void createArc(seams, slug),
    },
    {
      name: "arc-close",
      aliases: ["workstream-close", "ws-close"],
      description: "close this session's arc, with direction for the distiller",
      argument: { hint: "[direction]" },
      run: (direction) => void closeArc(seams, direction),
    },
    {
      name: "arc-abandon",
      aliases: ["workstream-abandon", "ws-abandon"],
      description: "archive an arc without distilling, nothing deleted",
      argument: { hint: "<slug>", required: true, choices: active },
      run: (slug) => void abandonArc(seams, slug),
    },
    {
      name: "arc-release",
      aliases: ["workstream-release", "ws-release"],
      description: "unbind this session from its arc",
      run: () => void bindWorkingArc(seams, null),
    },
    {
      name: "arc-open",
      aliases: ["workstream-open", "ws-open"],
      description: "show an arc in the arcs pane, this session's by default",
      argument: { hint: "[slug]", choices: () => arcs().map(described) },
      run: (slug) => openArc(seams, slug),
    },
  ];
}

function botCommands(seams: SurfaceCommandSeams): CommandSpec[] {
  const bots = () => seams.store.surfaces.state.bots;
  const bound = () => seams.store.summary(seams.workingSession())?.bot;
  const opening = () =>
    bots().map((bot) => ({
      value: bot.name,
      description: bot.description ?? "open a session as this bot",
    }));
  const switching = () =>
    bots().map((bot) => ({ value: bot.name, description: botSwitchLine(bot, bound()) }));
  const released = (): ArgumentChoice => ({ value: "none", description: noBotLine(bound()) });
  return [
    {
      name: "bot",
      description: "open a session with a bot, or open the bots pane",
      argument: { hint: "[slug|none]", choices: () => [...opening(), released()] },
      run: (name) => {
        if (name === undefined) seams.summon("bots");
        else if (name === "none" || name === "release") void switchBot(seams, null);
        else void openBotSession(seams, name);
      },
    },
    {
      name: "bot-new",
      description: "define a bot: purpose, slug, and where it lives",
      argument: { hint: "[slug]" },
      run: (slug) => seams.summon("bots", "bots.new", slug),
    },
    {
      name: "bot-switch",
      description: "run this session as another bot between turns",
      argument: { hint: "<slug>", required: true, choices: switching },
      run: (name) => void switchBot(seams, name ?? null),
    },
    {
      name: "bot-release",
      description: "run this session as no bot again",
      run: () => void switchBot(seams, null),
    },
  ];
}

function workspaceCommands(seams: SurfaceCommandSeams): CommandSpec[] {
  const declared = () =>
    seams.store.surfaces.state.workspaces.flatMap((choice) =>
      choice.slug === undefined ? [] : [{ value: choice.slug, description: workspaceLine(choice) }],
    );
  const fallback: ArgumentChoice = {
    value: "default",
    description: "the plain root, no declared workspace",
  };
  return [
    {
      name: "workspace",
      description: "reopen keywork on a named workspace, or open the workspaces pane",
      argument: { hint: "[slug|default]", choices: () => [...declared(), fallback] },
      run: (slug) => {
        if (slug === undefined) seams.summon("workspaces");
        else void reopenOn(seams, slug === "default" ? null : slug);
      },
    },
    {
      name: "workspace-new",
      description: "declare a workspace over this root and reopen on it",
      argument: { hint: "<slug>", required: true },
      run: (slug) => void createWorkspace(seams, slug),
    },
    {
      name: "workspace-default",
      description: "reopen keywork on the default workspace",
      run: () => void reopenOn(seams, null),
    },
  ];
}

async function switchArc(seams: SurfaceCommandSeams, slug: string | null): Promise<void> {
  if (slug !== null) {
    const arc = seams.store.surfaces.state.arcs.find((candidate) => candidate.slug === slug);
    if (arc === undefined) return seams.say(`no arc named ${slug} · /arc-new ${slug} creates it`);
    if (arc.status === "archived") {
      return seams.say(`arc ${slug} is archived · /arc-new starts another`);
    }
  }
  await bindWorkingArc(seams, slug);
}

async function bindWorkingArc(seams: SurfaceCommandSeams, slug: string | null): Promise<void> {
  const sessionId = seams.workingSession();
  if (sessionId === undefined) return seams.say(noWorkingSession);
  if (slug === null && seams.store.summary(sessionId)?.arc === undefined) {
    return seams.say("this session is bound to no arc");
  }
  const outcome = await seams.store.surfaces.verbs.bindSessionArc(sessionId, slug);
  if (isSurfaceRefusal(outcome)) return seams.say(outcome.detail);
  seams.say(slug === null ? "arc released" : `arc → ${slug}`);
  await settleSurface(seams, "arcs");
}

async function createArc(seams: SurfaceCommandSeams, requested: string | undefined): Promise<void> {
  const taken = seams.store.surfaces.state.arcs.map((arc) => arc.slug);
  const sessionId = seams.workingSession();
  const slug = requested ?? suggestedArcSlug(seams.store.summary(sessionId)?.title, taken);
  if (!surfaceSlug.test(slug)) return seams.say(unnamedArcLine);
  if (taken.includes(slug)) {
    return seams.say(`an arc named ${slug} already exists · /arc ${slug} switches to it`);
  }
  const created = await seams.store.surfaces.verbs.createArc(slug);
  if (isSurfaceRefusal(created)) return seams.say(created.detail);
  if (sessionId === undefined) {
    seams.say(`arc ${slug} created`);
    return settleSurface(seams, "arcs");
  }
  const bound = await seams.store.surfaces.verbs.bindSessionArc(sessionId, slug);
  seams.say(
    isSurfaceRefusal(bound) ? `arc ${slug} created · ${bound.detail}` : `arc → ${slug} · new`,
  );
  await settleSurface(seams, "arcs");
}

async function closeArc(seams: SurfaceCommandSeams, direction: string | undefined): Promise<void> {
  const slug = seams.store.summary(seams.workingSession())?.arc;
  if (slug === undefined) {
    return seams.say("no arc to close · this session is unbound · /arc <slug> binds one first");
  }
  const outcome = await seams.store.surfaces.verbs.closeArc(slug, direction);
  seams.say(
    isSurfaceRefusal(outcome) ? outcome.detail : closeOutcomeLine(slug, outcome, seams.keys),
  );
  await settleSurface(seams, "arcs");
}

async function abandonArc(seams: SurfaceCommandSeams, slug: string | undefined): Promise<void> {
  if (slug === undefined) return seams.say("abandon needs a name · /arc-abandon <slug>");
  const outcome = await seams.store.surfaces.verbs.abandonArc(slug);
  seams.say(
    isSurfaceRefusal(outcome)
      ? outcome.detail
      : `arc ${slug} abandoned · archived without distilling, nothing deleted`,
  );
  await settleSurface(seams, "arcs");
}

function openArc(seams: SurfaceCommandSeams, requested: string | undefined): void {
  const slug = requested ?? seams.store.summary(seams.workingSession())?.arc;
  if (slug === undefined) seams.say("no arc here · /arc-open <slug> names one");
  else if (!seams.store.surfaces.state.arcs.some((arc) => arc.slug === slug)) {
    seams.say(`no arc named ${slug} · /arc-new ${slug} creates it`);
  } else seams.summon("arcs", "arcs.open", slug);
}

async function openBotSession(seams: SurfaceCommandSeams, name: string): Promise<void> {
  const bot = knownBot(seams, name);
  if (bot === undefined || seams.showBotSession(bot.name)) return;
  const arc = seams.store.summary(seams.workingSession())?.arc;
  const sessionId = await seams.store.create();
  const verbs = seams.store.surfaces.verbs;
  const bound = await verbs.bindSessionBot(sessionId, bot.name);
  if (isSurfaceRefusal(bound)) seams.say(bound.detail);
  else if (arc !== undefined) await verbs.bindSessionArc(sessionId, arc);
  await seams.store.refresh();
  seams.openSession(sessionId);
  if (!isSurfaceRefusal(bound)) seams.say(`${botLabel(bot)} · new session`);
}

async function switchBot(seams: SurfaceCommandSeams, name: string | null): Promise<void> {
  const sessionId = seams.workingSession();
  if (sessionId === undefined) return seams.say(noWorkingSession);
  const bot = name === null ? undefined : knownBot(seams, name);
  if (name !== null && bot === undefined) return;
  if (bot === undefined && seams.store.summary(sessionId)?.bot === undefined) {
    return seams.say("no bot bound here");
  }
  const outcome = await seams.store.surfaces.verbs.bindSessionBot(sessionId, bot?.name ?? null);
  if (isSurfaceRefusal(outcome)) return seams.say(outcome.detail);
  seams.say(bot === undefined ? "bot released" : `bot → ${botLabel(bot)}`);
  await settleSurface(seams, "bots");
}

function knownBot(seams: SurfaceCommandSeams, name: string): BotSummary | undefined {
  const bots = seams.store.surfaces.state.bots;
  const found = bots.find((bot) => bot.name === name);
  if (found !== undefined) return found;
  seams.say(
    bots.length === 0
      ? `no bots yet · /bot-new ${name} defines one`
      : `no bot named ${name} · bots here: ${bots.map((bot) => bot.name).join(", ")}`,
  );
  return undefined;
}

async function createWorkspace(
  seams: SurfaceCommandSeams,
  slug: string | undefined,
): Promise<void> {
  if (slug === undefined) return seams.say("new needs a name · /workspace-new <slug>");
  const created = await seams.store.surfaces.verbs.createWorkspace(slug);
  if (isSurfaceRefusal(created)) return seams.say(created.detail);
  await reopenOn(seams, slug);
}

async function reopenOn(seams: SurfaceCommandSeams, slug: string | null): Promise<void> {
  const name = slug ?? "default";
  const outcome = await seams.store.surfaces.verbs.useWorkspace(slug);
  if (isSurfaceRefusal(outcome)) return seams.say(outcome.detail);
  if (!outcome.reopens) return seams.say(`${name} is remembered for the next launch`);
  seams.say(`workspace → ${name} · reopening`);
  const reopened = await seams.reopen();
  if (!reopened.ok) return seams.say(describeFailure(reopened.failure));
  seams.say(`keywork reopened on ${name}`);
  await seams.store.refresh();
  await seams.store.surfaces.load();
}

async function settleSurface(seams: SurfaceCommandSeams, kind: "arcs" | "bots"): Promise<void> {
  await seams.store.refresh();
  await seams.store.surfaces.refetch(kind);
}

function arcLine(arc: ArcSummary, bound: string | undefined): string {
  if (arc.slug === bound) return "this session's arc";
  const sessions = counted(arc.sessions, "session");
  return arc.status === "archived" ? `archived · ${sessions}` : sessions;
}

function noArcLine(bound: string | undefined, active: number): string {
  if (bound !== undefined) return `unbind this session from ${bound}`;
  return active === 0 ? "no arcs yet · /arc-new starts one" : "this session has no arc";
}

function botSwitchLine(bot: BotSummary, bound: string | undefined): string {
  return bot.name === bound ? "this session's bot" : (bot.description ?? "run this session as it");
}

function noBotLine(bound: string | undefined): string {
  return bound === undefined ? "this session runs as no bot" : `release ${bound} from this session`;
}

function workspaceLine(choice: WorkspaceChoice): string {
  const aside = workspaceAside(choice);
  return choice.current ? `open now · ${aside}` : aside;
}

function counted(count: number, noun: string): string {
  if (count === 0) return `no ${noun}s yet`;
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function isPlaceholderTitle(title: string): boolean {
  return /^\(.*\)$/.test(title.trim());
}

function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}
