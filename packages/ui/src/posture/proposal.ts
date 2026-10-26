import {
  exactOnlyCommands,
  onceOnlyTools,
  type PermissionRule,
  type PermissionsView,
  type RememberedScope,
  unrememberedCommands,
} from "@keywork-app/protocol";
import { ruleText } from "../page/ask-card.tsx";
import type { PostureFacts } from "./facts.ts";
import { counted, type Fact, sameFact } from "./fingerprint.ts";
import { commandFamilies } from "./toolchains.ts";

export interface Offer {
  readonly rule: PermissionRule;
  readonly scope: RememberedScope;
  readonly reason: string;
  readonly fact: Fact;
}

export interface Proposal {
  readonly reads: string;
  readonly granted: readonly PermissionRule[];
  readonly offers: readonly Offer[];
  readonly stillAsks: readonly string[];
}

export function proposalOf(
  facts: PostureFacts,
  recordedHere: readonly PermissionRule[] = [],
): Proposal {
  const held = (rule: PermissionRule): boolean =>
    recordedHere.some((recorded) => sameRule(recorded, rule));
  const granted = facts.permissions.workspace.filter((rule) => !held(rule));
  const ungranted = (offer: Offer): boolean => !granted.some((rule) => sameRule(rule, offer.rule));
  return {
    reads: readsLine(facts.permissions),
    granted,
    offers: [...commandOffers(facts), ...mcpOffers(facts)].filter(ungranted),
    stillAsks: stillAsks(facts.permissions),
  };
}

export function offersFrom(offers: readonly Offer[], facts: readonly Fact[]): Offer[] {
  return offers.filter((offer) => facts.some((fact) => sameFact(fact, offer.fact)));
}

export function sameRule(left: PermissionRule, right: PermissionRule): boolean {
  return (
    left.action === right.action && left.resource === right.resource && left.effect === right.effect
  );
}

export function coversServerOf(rule: PermissionRule, tool: string): boolean {
  const server = mcpServerOf(rule);
  return server !== undefined && tool.startsWith(`${server}${mcpToolSeparator}`);
}

export function mcpServerOf(rule: PermissionRule): string | undefined {
  if (rule.action !== mcpAction || !rule.resource.endsWith(wholeServer)) return undefined;
  return rule.resource.slice(0, -wholeServer.length);
}

export function offerKey(offer: Offer): string {
  return `${offer.scope}:${offer.rule.action}:${offer.rule.resource}`;
}

const mcpAction = "mcp";
const mcpToolSeparator = "__";
const wholeServer = `${mcpToolSeparator}*`;
const carveOutsNamed = 2;

function commandOffers(facts: PostureFacts): Offer[] {
  return commandFamilies(facts.manifests ?? [], facts.scripts, facts.runners).map((family) => ({
    rule: allow("bash", family.command),
    scope: "workspace",
    reason: family.reason,
    fact: { kind: "manifest", name: family.manifest },
  }));
}

function mcpOffers(facts: PostureFacts): Offer[] {
  return (facts.mcp ?? []).map((server) => ({
    rule: allow(mcpAction, `${server.name}${wholeServer}`),
    scope: "session",
    reason: `mcp server ${server.name} · ${server.state} · ${counted(server.toolCount, "tool")}`,
    fact: { kind: "mcp", name: server.name },
  }));
}

function readsLine(view: PermissionsView): string {
  if (!view.trusted) return "trusted reads · off until the workspace is trusted";
  const allowed = view.bundle.filter((rule) => rule.effect === "allow").length;
  return `trusted reads · ${counted(allowed, "command")} without an ask · fixed in keywork`;
}

function stillAsks(view: PermissionsView): string[] {
  const carveOuts = view.bundle.filter((rule) => rule.effect === "ask").map(ruleText);
  return [
    `${[...onceOnlyTools].join(" and ")} · approved once at a time, never remembered`,
    `${exactOnlyCommands.join(", ")} · a grant covers only the exact command`,
    `${unrememberedCommands.join(", ")} · never remembered by a grant`,
    ...(carveOuts.length === 0
      ? []
      : [`${namedFirst(carveOuts)} · forms the trusted reads still ask for`]),
    "any other command or mcp tool · asks until a rule covers it",
  ];
}

function namedFirst(names: readonly string[]): string {
  const shown = names.slice(0, carveOutsNamed).join(", ");
  const rest = names.length - carveOutsNamed;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

function allow(action: string, resource: string): PermissionRule {
  return { action, resource, effect: "allow" };
}
