import { type Chord, ChordError, chordsEqual, formatChord, parseChord } from "./chord.ts";

export type Binding = { kind: "chord"; chord: Chord } | { kind: "leader"; key: string };

export type KeymapResult =
  | { type: "action"; action: string }
  | { type: "leader-pending" }
  | { type: "cancelled" }
  | { type: "pass" };

export type BindingSpec = string | readonly string[];

export interface KeymapOptions {
  leader?: string | undefined;
  timeoutMs?: number | undefined;
  bindings: Record<string, BindingSpec>;
  scopes?: Record<string, string> | undefined;
  exclusiveScopes?: readonly string[] | undefined;
}

export class KeymapError extends Error {
  override readonly name = "KeymapError";
}

export const defaultLeader = "ctrl+k";
export const defaultLeaderTimeoutMs = 2000;

export class Keymap {
  private table: BindingTable;
  private pendingSince: number | undefined;

  constructor(options: KeymapOptions) {
    this.table = compile(options);
  }

  get leader(): string {
    return formatChord(this.table.leader);
  }

  get timeoutMs(): number {
    return this.table.timeoutMs;
  }

  rebind(options: KeymapOptions): void {
    this.table = compile(options);
    this.disarm();
  }

  press(chord: Chord, nowMs: number, activeScope?: string): KeymapResult {
    if (this.isPending(nowMs)) {
      if (!chordsEqual(chord, this.table.leader)) return this.resolveLeaderKey(chord, activeScope);
      this.disarm();
      return cancelled;
    }
    if (chordsEqual(chord, this.table.leader)) {
      this.pendingSince = nowMs;
      return { type: "leader-pending" };
    }
    const action = this.findByChord(chord, activeScope, this.ownsKeyboard(activeScope));
    return action === undefined ? { type: "pass" } : { type: "action", action };
  }

  ownsKeyboard(scope: string | undefined): boolean {
    return scope !== undefined && this.table.exclusiveScopes.has(scope);
  }

  armed(nowMs: number): boolean {
    return this.isPending(nowMs);
  }

  disarm(): void {
    this.pendingSince = undefined;
  }

  describe(action: string): string | undefined {
    const binding = this.table.bindings.get(action)?.[0];
    if (binding === undefined) return undefined;
    return binding.kind === "chord" ? formatChord(binding.chord) : `${this.leader} ${binding.key}`;
  }

  describeAll(action: string): string[] {
    return (this.table.bindings.get(action) ?? []).map((binding) =>
      binding.kind === "chord" ? formatChord(binding.chord) : `${this.leader} ${binding.key}`,
    );
  }

  isLeaderless(action: string): boolean {
    return (this.table.bindings.get(action) ?? []).some((binding) => binding.kind === "chord");
  }

  actions(): readonly string[] {
    return [...this.table.bindings.keys()];
  }

  scopeOf(action: string): string | undefined {
    return this.table.scopes.get(action);
  }

  private isPending(nowMs: number): boolean {
    if (this.pendingSince === undefined) return false;
    if (nowMs - this.pendingSince <= this.table.timeoutMs) return true;
    this.disarm();
    return false;
  }

  private resolveLeaderKey(chord: Chord, activeScope: string | undefined): KeymapResult {
    this.disarm();
    if (chord.name === "escape" || chord.ctrl || chord.alt) return cancelled;
    const action = this.findByLeaderKey(chord, activeScope);
    return action === undefined ? cancelled : { type: "action", action };
  }

  private findByChord(
    chord: Chord,
    activeScope: string | undefined,
    scopedOnly = false,
  ): string | undefined {
    return this.find(
      (binding) => binding.kind === "chord" && chordsEqual(binding.chord, chord),
      activeScope,
      scopedOnly,
    );
  }

  private findByLeaderKey(chord: Chord, activeScope: string | undefined): string | undefined {
    const pressed = leaderKeyOf(chord);
    return this.find(
      (binding) => binding.kind === "leader" && binding.key === pressed,
      activeScope,
    );
  }

  private find(
    matches: (binding: Binding) => boolean,
    activeScope: string | undefined,
    scopedOnly = false,
  ): string | undefined {
    for (const [action, bindings] of this.table.bindings) {
      const scope = this.table.scopes.get(action);
      if (scope !== undefined && scope !== activeScope) continue;
      if (scope === undefined && scopedOnly) continue;
      if (bindings.some(matches)) return action;
    }
    return undefined;
  }
}

const cancelled: KeymapResult = { type: "cancelled" };

interface BindingTable {
  readonly leader: Chord;
  readonly timeoutMs: number;
  readonly bindings: ReadonlyMap<string, readonly Binding[]>;
  readonly scopes: ReadonlyMap<string, string>;
  readonly exclusiveScopes: ReadonlySet<string>;
}

interface Claim {
  readonly action: string;
  readonly scope: string | undefined;
}

function compile(options: KeymapOptions): BindingTable {
  const leader = parseChord(options.leader ?? defaultLeader);
  const scopes = new Map(Object.entries(options.scopes ?? {}));
  const bindings = new Map<string, Binding[]>();
  const claims = new Map<string, Claim[]>();
  for (const [action, spec] of Object.entries(options.bindings)) {
    const specs = typeof spec === "string" ? [spec] : spec;
    const parsed = specs.filter((entry) => entry !== "none").map((entry) => parseBinding(entry));
    for (const binding of parsed) {
      claim(claims, leader, binding, { action, scope: scopes.get(action) });
    }
    if (parsed.length > 0) bindings.set(action, parsed);
  }
  return {
    leader,
    timeoutMs: options.timeoutMs ?? defaultLeaderTimeoutMs,
    bindings,
    scopes,
    exclusiveScopes: new Set(options.exclusiveScopes ?? []),
  };
}

function claim(
  claims: Map<string, Claim[]>,
  leader: Chord,
  binding: Binding,
  claimant: Claim,
): void {
  const spec =
    binding.kind === "chord" ? formatChord(binding.chord) : `${formatChord(leader)} ${binding.key}`;
  if (binding.kind === "chord" && chordsEqual(binding.chord, leader)) {
    throw new KeymapError(`"${spec}" is the leader and cannot also run "${claimant.action}"`);
  }
  const holders = claims.get(spec) ?? [];
  const rival = holders.find((holder) => contends(holder, claimant));
  if (rival?.action === claimant.action) {
    throw new KeymapError(`"${spec}" is listed twice for "${claimant.action}"`);
  }
  if (rival !== undefined) {
    throw new KeymapError(`"${spec}" is bound to both "${rival.action}" and "${claimant.action}"`);
  }
  claims.set(spec, [...holders, claimant]);
}

function contends(holder: Claim, claimant: Claim): boolean {
  return (
    holder.scope === undefined || claimant.scope === undefined || holder.scope === claimant.scope
  );
}

function parseBinding(spec: string): Binding {
  const leaderMatch = spec.match(/^leader\s+(\S+)$/i);
  if (leaderMatch === null) {
    try {
      return { kind: "chord", chord: parseChord(spec) };
    } catch (cause) {
      throw new KeymapError(cause instanceof ChordError ? cause.message : String(cause));
    }
  }
  const key = parseChord(leaderMatch[1] as string);
  if (key.ctrl || key.alt) {
    throw new KeymapError(
      `"${spec}" can never fire: leader keys take at most shift, since ctrl and alt end the leader`,
    );
  }
  return { kind: "leader", key: leaderKeyOf(key) };
}

function leaderKeyOf(chord: Chord): string {
  return chord.shift ? `shift+${chord.name}` : chord.name;
}
