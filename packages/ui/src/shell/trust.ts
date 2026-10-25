import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { BusEnvelope, WorkspaceView } from "@keywork-app/protocol";
import { createSignal } from "solid-js";

export type TrustState =
  | { kind: "unknown" }
  | { kind: "trusted"; root: string }
  | { kind: "undecided"; root: string }
  | { kind: "refused"; root: string; message: string }
  | { kind: "restarting"; root: string; attached?: true }
  | { kind: "stale"; root: string }
  | { kind: "failed"; root: string; message: string };

export interface TrustFlow {
  state(): TrustState;
  workspace(): WorkspaceView | undefined;
  untrusted(): boolean;
  refresh(): Promise<void>;
  accept(): Promise<void>;
  dispose(): void;
}

export interface TrustSeams {
  client: Pick<KeyworkClient, "workspace" | "trustWorkspace">;
  feed: Pick<ServerFeed, "subscribe">;
  restart(): Promise<void>;
  attached?: (() => boolean) | undefined;
  composedTrusted?: (() => Promise<boolean | undefined>) | undefined;
  say?: ((line: string) => void) | undefined;
}

export const attachedPatienceMs = 20_000;

export const inPlacePatienceMs = 2_000;

export const composedPollMs = 500;

export const trustEnables = "memory, changes, the terminal, LSP and project config";

export function trustPrompt(root: string): string {
  return `trust ${root}? keywork keeps workspace files and memory in .keywork`;
}

export const trustStaysOff = `${trustEnables} stay off until you trust it`;

export function untrustedNotice(root: string, chord: string): string {
  return `${root} isn't trusted yet · ${trustEnables} stay off until it is · ${chord} trusts it`;
}

export function reopeningNotice(root: string): string {
  return `workspace ready at ${root} · reopening with memory and arcs live`;
}

export function readyNotice(root: string): string {
  return `workspace ready at ${root} · memory and arcs are live`;
}

export function waitingOnServeNotice(root: string): string {
  return `trust is recorded for ${root} · waiting for the keywork serve this window attached to to pick it up`;
}

export function recomposedNotice(root: string): string {
  return `trusted ${root} · keywork recomposed in place · open sessions reload on their next prompt · any running turn stopped and its asks were refused`;
}

export function staleServeNotice(root: string): string {
  return `trust is recorded for ${root}, but the keywork serve this window attached to started before it · restart that serve and ${trustEnables} turn on`;
}

export function trustStateOf(view: WorkspaceView): TrustState {
  const root = view.anchor.root;
  switch (view.trust) {
    case "trusted":
      return { kind: "trusted", root };
    case "undecided":
      return { kind: "undecided", root };
    case "untrusted":
      return { kind: "refused", root, message: `${root} is marked untrusted` };
  }
}

export function createTrustFlow(seams: TrustSeams): TrustFlow {
  const [state, setState] = createSignal<TrustState>({ kind: "unknown" });
  const [view, setView] = createSignal<WorkspaceView>();

  const composedTrusted = (): Promise<boolean | undefined> =>
    seams.composedTrusted?.().catch(() => undefined) ?? Promise.resolve(undefined);

  const refresh = async (): Promise<void> => {
    const fetched = await seams.client.workspace().catch(() => undefined);
    if (fetched === undefined) return;
    setView(fetched);
    const decided = trustStateOf(fetched);
    const stale = decided.kind === "trusted" && (await composedTrusted()) === false;
    setState(stale ? { kind: "stale", root: decided.root } : decided);
  };

  const serveTakesTrust = async (patienceMs: number): Promise<boolean> => {
    if (seams.composedTrusted === undefined) return false;
    const deadline = Date.now() + patienceMs;
    while (Date.now() < deadline) {
      if ((await composedTrusted()) === true) return true;
      await pause(composedPollMs);
    }
    return false;
  };

  const accept = async (): Promise<void> => {
    const current = state();
    if (!acceptsFrom.has(current.kind) || !("root" in current)) return;
    const root = current.root;
    const outcome = await seams.client.trustWorkspace();
    if ("refused" in outcome) {
      setState(
        outcome.refused === "untrusted"
          ? { kind: "refused", root, message: outcome.message }
          : { kind: "failed", root, message: outcome.message },
      );
      return;
    }
    if (!outcome.reopens) {
      if (outcome.recomposed === true) seams.say?.(recomposedNotice(outcome.root));
      await refresh();
      return;
    }
    const attached = seams.attached?.() === true;
    setState({ kind: "restarting", root: outcome.root, ...(attached && { attached: true }) });
    const tookIt = await serveTakesTrust(attached ? attachedPatienceMs : inPlacePatienceMs);
    if (!tookIt && !attached) await seams.restart();
    await refresh();
  };

  const stop = seams.feed.subscribe((envelopes) => {
    if (envelopes.some(changesWorkspace)) void refresh();
  });
  void refresh();

  return {
    state,
    workspace: view,
    untrusted: () => isUntrusted(state()),
    refresh,
    accept,
    dispose: stop,
  };
}

export function isUntrusted(state: TrustState): boolean {
  return (
    state.kind === "undecided" ||
    state.kind === "refused" ||
    state.kind === "failed" ||
    state.kind === "stale"
  );
}

const acceptsFrom: ReadonlySet<TrustState["kind"]> = new Set(["undecided", "failed", "stale"]);

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function changesWorkspace(envelope: BusEnvelope): boolean {
  return envelope.type === "surface.changed" && envelope.payload.kind === "workspaces";
}
